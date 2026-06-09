#!/usr/bin/env node
/**
 * 測試 Cloudflare R2 連線與上傳
 * 用法：node scripts/test-r2-upload.mjs
 */
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, "../.env")

function loadEnv() {
  const text = readFileSync(envPath, "utf8")
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    const val = m[2].replace(/^["']|["']$/g, "")
    process.env[m[1]] = val
  }
}

loadEnv()

const cfg = {
  bucket: process.env.S3_BUCKET,
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  fileUrl: process.env.S3_FILE_URL,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
}

console.log("=== R2 連線測試 ===")
console.log({
  bucket: cfg.bucket,
  region: cfg.region,
  endpoint: cfg.endpoint,
  fileUrl: cfg.fileUrl,
  accessKeyId: cfg.accessKeyId ? `${cfg.accessKeyId.slice(0, 8)}...` : "(空)",
  secret: cfg.secretAccessKey ? "(已設定)" : "(空)",
})

for (const [k, v] of Object.entries(cfg)) {
  if (!v && k !== "region") {
    console.error(`❌ 缺少 ${k.toUpperCase()}`)
    process.exit(1)
  }
}

const client = new S3Client({
  region: cfg.region,
  endpoint: cfg.endpoint,
  credentials: {
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
  },
  forcePathStyle: true,
})

const testKey = `test/r2-smoke-${Date.now()}.txt`

try {
  console.log("\n1. ListObjects...")
  const list = await client.send(
    new ListObjectsV2Command({ Bucket: cfg.bucket, MaxKeys: 3 })
  )
  console.log("   ✅ 可連線，現有物件數:", list.KeyCount ?? 0)

  console.log("\n2. PutObject (無 ACL)...")
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: testKey,
      Body: "R2 smoke test from kesh-backend",
      ContentType: "text/plain",
    })
  )
  const publicUrl = `${cfg.fileUrl.replace(/\/$/, "")}/${testKey}`
  console.log("   ✅ 上傳成功")
  console.log("   公開 URL:", publicUrl)

  console.log("\n=== 全部通過 ===")
} catch (err) {
  console.error("\n❌ 失敗:", err.message || err)
  if (String(err.message).includes("ENOTFOUND")) {
    console.error("   → S3_ENDPOINT 可能打錯，請對照 Cloudflare Token 頁面")
  }
  process.exit(1)
}
