#!/usr/bin/env node
/**
 * R2 儲存用量檢查 + 防爆量告警
 *
 * 用法：
 *   node scripts/check-r2-usage.mjs          # 顯示報告，超過 warn 回 exit 1
 *   node scripts/check-r2-usage.mjs --json   # JSON 輸出（給 cron / CI）
 *   node scripts/check-r2-usage.mjs --strict # 超過 hard limit 才 exit 1
 */
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3"

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const JSON_OUT = args.includes("--json")
const STRICT = args.includes("--strict")

function loadEnv() {
  const text = readFileSync(resolve(__dirname, "../.env"), "utf8")
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

function getLimits() {
  const freeGb = parseFloat(process.env.R2_FREE_TIER_GB || "10")
  const extraGb = parseFloat(process.env.R2_EXTRA_ALLOWANCE_GB || "5")
  const hardLimitGb = parseFloat(
    process.env.R2_STORAGE_HARD_LIMIT_GB || String(freeGb + extraGb)
  )
  const warnGb = parseFloat(process.env.R2_STORAGE_WARN_GB || String(freeGb))
  return {
    freeGb,
    extraGb,
    warnGb,
    hardLimitGb,
    warnBytes: warnGb * 1024 ** 3,
    hardLimitBytes: hardLimitGb * 1024 ** 3,
  }
}

function fmt(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

loadEnv()

const limits = getLimits()
const client = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
})

let token
let totalBytes = 0
let objectCount = 0

do {
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET,
      MaxKeys: 1000,
      ContinuationToken: token,
    })
  )
  for (const o of res.Contents || []) {
    objectCount++
    totalBytes += o.Size || 0
  }
  token = res.IsTruncated ? res.NextContinuationToken : undefined
} while (token)

const usedPct = ((totalBytes / limits.hardLimitBytes) * 100).toFixed(1)
const status =
  totalBytes >= limits.hardLimitBytes
    ? "blocked"
    : totalBytes >= limits.warnBytes
      ? "warning"
      : "ok"

const report = {
  status,
  bucket: process.env.S3_BUCKET,
  objectCount,
  totalBytes,
  totalFormatted: fmt(totalBytes),
  usedPercent: usedPct,
  limits,
  uploadsBlocked: totalBytes >= limits.hardLimitBytes,
  message:
    status === "blocked"
      ? `已達硬上限 ${limits.hardLimitGb} GB，新上傳會被後端阻擋`
      : status === "warning"
        ? `已超過免費額度 ${limits.warnGb} GB，進入付費緩衝區（上限 ${limits.hardLimitGb} GB）`
        : `用量正常，距離上限還有 ${fmt(limits.hardLimitBytes - totalBytes)}`,
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log("=== R2 儲存用量報告 ===")
  console.log(`Bucket:     ${report.bucket}`)
  console.log(`物件數:     ${objectCount.toLocaleString()}`)
  console.log(`已使用:     ${report.totalFormatted}（${usedPct}% of ${limits.hardLimitGb} GB 上限）`)
  console.log(`免費額度:   ${limits.freeGb} GB`)
  console.log(`付費緩衝:   +${limits.extraGb} GB`)
  console.log(`硬上限:     ${limits.hardLimitGb} GB`)
  console.log(`狀態:       ${status.toUpperCase()}`)
  console.log(`上傳阻擋:   ${report.uploadsBlocked ? "是（已達上限）" : "否"}`)
  console.log(`\n${report.message}`)
}

const shouldFail = STRICT
  ? totalBytes >= limits.hardLimitBytes
  : totalBytes >= limits.warnBytes

process.exit(shouldFail ? 1 : 0)
