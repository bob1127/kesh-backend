import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { S3Client } from "@aws-sdk/client-s3"
import {
  getR2BucketUsage,
  getR2UsageReport,
  invalidateR2UsageCache,
} from "../../../../lib/r2-storage-guard"

function getS3Client() {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  })
}

/** GET /admin/custom/r2-usage — Admin 查看 R2 用量與上限狀態 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const force = req.query.force === "1"
  if (force) invalidateR2UsageCache()

  const bucket = process.env.S3_BUCKET
  if (!bucket || !process.env.S3_ENDPOINT) {
    return res.status(500).json({ message: "S3/R2 環境變數未設定" })
  }

  try {
    const usage = await getR2BucketUsage(getS3Client(), bucket, force)
    return res.json(getR2UsageReport(usage))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ message: `無法取得 R2 用量：${msg}` })
  }
}
