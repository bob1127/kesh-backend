import { ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3"
import { MedusaError } from "@medusajs/framework/utils"

export type R2StorageLimits = {
  freeGb: number
  extraGb: number
  warnGb: number
  hardLimitGb: number
  warnBytes: number
  hardLimitBytes: number
  cacheTtlMs: number
  maxSingleUploadBytes: number
}

export type R2BucketUsage = {
  totalBytes: number
  objectCount: number
  fetchedAt: number
}

let usageCache: R2BucketUsage | null = null

export function getR2StorageLimits(): R2StorageLimits {
  const freeGb = parseFloat(process.env.R2_FREE_TIER_GB || "10")
  const extraGb = parseFloat(process.env.R2_EXTRA_ALLOWANCE_GB || "5")
  const hardLimitGb = parseFloat(
    process.env.R2_STORAGE_HARD_LIMIT_GB || String(freeGb + extraGb)
  )
  const warnGb = parseFloat(process.env.R2_STORAGE_WARN_GB || String(freeGb))
  const cacheTtlSec = parseInt(process.env.R2_USAGE_CACHE_TTL_SEC || "300", 10)
  const maxSingleUploadMb = parseInt(process.env.R2_MAX_SINGLE_UPLOAD_MB || "25", 10)

  return {
    freeGb,
    extraGb,
    warnGb,
    hardLimitGb,
    warnBytes: warnGb * 1024 * 1024 * 1024,
    hardLimitBytes: hardLimitGb * 1024 * 1024 * 1024,
    cacheTtlMs: cacheTtlSec * 1000,
    maxSingleUploadBytes: maxSingleUploadMb * 1024 * 1024,
  }
}

export function formatR2Bytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${(bytes / 1024).toFixed(0)} KB`
}

export function invalidateR2UsageCache(): void {
  usageCache = null
}

export function recordR2Upload(bytes: number): void {
  if (!usageCache) return
  usageCache.totalBytes += bytes
  usageCache.objectCount += 1
}

export async function getR2BucketUsage(
  client: S3Client,
  bucket: string,
  force = false
): Promise<R2BucketUsage> {
  const { cacheTtlMs } = getR2StorageLimits()

  if (!force && usageCache && Date.now() - usageCache.fetchedAt < cacheTtlMs) {
    return usageCache
  }

  let token: string | undefined
  let totalBytes = 0
  let objectCount = 0

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 1000,
        ContinuationToken: token,
      })
    )
    for (const obj of res.Contents || []) {
      objectCount++
      totalBytes += obj.Size || 0
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)

  usageCache = {
    totalBytes,
    objectCount,
    fetchedAt: Date.now(),
  }

  return usageCache
}

/**
 * 上傳前檢查。incomingBytes 未知時（presigned）用單檔上限做保守估算。
 */
export async function assertR2UploadAllowed(
  client: S3Client,
  bucket: string,
  incomingBytes?: number
): Promise<R2BucketUsage> {
  const limits = getR2StorageLimits()
  const usage = await getR2BucketUsage(client, bucket)
  const projected =
    usage.totalBytes + (incomingBytes ?? limits.maxSingleUploadBytes)

  const pct = ((usage.totalBytes / limits.hardLimitBytes) * 100).toFixed(1)

  if (usage.totalBytes >= limits.warnBytes && usage.totalBytes < limits.hardLimitBytes) {
    console.warn(
      `[R2 Guard] ⚠️ 儲存已超過免費額度 ${limits.warnGb} GB：` +
        `${formatR2Bytes(usage.totalBytes)} / 上限 ${limits.hardLimitGb} GB（${pct}%）`
    )
  }

  if (projected > limits.hardLimitBytes) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `R2 儲存已達上限（${limits.hardLimitGb} GB = 免費 ${limits.freeGb} GB + 緩衝 ${limits.extraGb} GB）。` +
        `目前 ${formatR2Bytes(usage.totalBytes)}，${objectCountLabel(usage.objectCount)}。` +
        `請先刪除不需要的圖片，或聯絡管理員調整 R2_STORAGE_HARD_LIMIT_GB。新上傳已阻擋。`
    )
  }

  return usage
}

function objectCountLabel(n: number): string {
  return `共 ${n.toLocaleString()} 個檔案`
}

export function getR2UsageReport(usage: R2BucketUsage) {
  const limits = getR2StorageLimits()
  const usedPct = ((usage.totalBytes / limits.hardLimitBytes) * 100).toFixed(1)
  const status =
    usage.totalBytes >= limits.hardLimitBytes
      ? "blocked"
      : usage.totalBytes >= limits.warnBytes
        ? "warning"
        : "ok"

  return {
    status,
    objectCount: usage.objectCount,
    totalBytes: usage.totalBytes,
    totalFormatted: formatR2Bytes(usage.totalBytes),
    usedPercent: usedPct,
    limits: {
      freeGb: limits.freeGb,
      extraGb: limits.extraGb,
      warnGb: limits.warnGb,
      hardLimitGb: limits.hardLimitGb,
    },
    uploadsBlocked: usage.totalBytes >= limits.hardLimitBytes,
    checkedAt: new Date(usage.fetchedAt).toISOString(),
  }
}
