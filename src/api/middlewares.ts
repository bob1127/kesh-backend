import { defineMiddlewares } from "@medusajs/medusa"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"

// ─── 可調整的常數 ────────────────────────────────────────────────────────────
const UPLOAD_RATE_WINDOW_MS   = 60_000   // 1 分鐘滑動視窗
const UPLOAD_RATE_LIMIT       = 20       // 每 IP 每分鐘最多 20 次上傳請求
const PRESIGNED_RATE_LIMIT    = 10       // 每 IP 每分鐘最多 10 次 presigned 請求
const BLOCK_DURATION_MS       = 15 * 60_000  // 違規後封鎖 15 分鐘
const MAX_UPLOAD_BYTES        = (parseInt(process.env.R2_MAX_SINGLE_UPLOAD_MB || "25", 10)) * 1024 * 1024
const HERO_SLIDE_LOCK_MS      = 5_000

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
])

// ─── 狀態儲存（process 內存，重啟清空） ──────────────────────────────────────
interface RateBucket { timestamps: number[]; blockedUntil?: number }
const uploadRateMap    = new Map<string, RateBucket>()
const presignedRateMap = new Map<string, RateBucket>()

function getClientIp(req: MedusaRequest): string {
  const xff = req.headers["x-forwarded-for"]
  if (xff) return (Array.isArray(xff) ? xff[0] : xff).split(",")[0].trim()
  return req.socket?.remoteAddress || "unknown"
}

function isRateLimited(
  map: Map<string, RateBucket>,
  ip: string,
  limit: number,
  windowMs: number,
  blockMs: number
): { blocked: boolean; retryAfter?: number } {
  const now = Date.now()
  const bucket = map.get(ip) ?? { timestamps: [] }

  if (bucket.blockedUntil && now < bucket.blockedUntil) {
    return { blocked: true, retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000) }
  }

  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs)
  bucket.timestamps.push(now)
  map.set(ip, bucket)

  if (bucket.timestamps.length > limit) {
    bucket.blockedUntil = now + blockMs
    console.warn(`[Security] 🚨 IP ${ip} 觸發上傳頻率限制，封鎖至 ${new Date(bucket.blockedUntil).toISOString()}`)
    return { blocked: true, retryAfter: Math.ceil(blockMs / 1000) }
  }

  return { blocked: false }
}

// ─── Middleware 工廠 ──────────────────────────────────────────────────────────

function uploadRateLimiter(
  rateMap: Map<string, RateBucket>,
  limit: number
): (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => void {
  return (req, res, next) => {
    const ip = getClientIp(req)
    const { blocked, retryAfter } = isRateLimited(
      rateMap, ip, limit, UPLOAD_RATE_WINDOW_MS, BLOCK_DURATION_MS
    )
    if (blocked) {
      res.setHeader("Retry-After", String(retryAfter ?? 900))
      return res.status(429).json({
        message: `上傳請求過於頻繁，請在 ${retryAfter ?? 900} 秒後重試。`,
        code: "UPLOAD_RATE_LIMITED",
      })
    }
    next()
  }
}

function contentLengthGuard(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const cl = parseInt(req.headers["content-length"] || "0", 10)
  if (cl > MAX_UPLOAD_BYTES) {
    console.warn(`[Security] 🚨 檔案過大 ${cl} bytes，已拒絕（上限 ${MAX_UPLOAD_BYTES} bytes）`)
    return res.status(413).json({
      message: `檔案超過單次上傳上限（${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB）。`,
      code: "FILE_TOO_LARGE",
    })
  }
  next()
}

function mimeTypeGuard(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const ct = (req.headers["content-type"] || "").toLowerCase().split(";")[0].trim()
  if (!ct) return next()
  if (
    ct !== "application/json" &&
    ct !== "multipart/form-data" &&
    ct !== "application/octet-stream" &&
    !ALLOWED_MIME_TYPES.has(ct)
  ) {
    console.warn(`[Security] 🚨 不允許的 Content-Type: ${ct}`)
    return res.status(415).json({
      message: `不支援的檔案類型（${ct}）。僅接受圖片格式。`,
      code: "UNSUPPORTED_MEDIA_TYPE",
    })
  }
  next()
}

function logUpload(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const ip = getClientIp(req)
  const start = Date.now()
  console.log(`[R2 Upload] → ${req.method} ${req.originalUrl} IP=${ip}`)
  res.on("finish", () => {
    const ms = Date.now() - start
    const icon = res.statusCode < 400 ? "✅" : "❌"
    console.log(`[R2 Upload] ${icon} ← HTTP ${res.statusCode} (${ms}ms) IP=${ip}`)
  })
  next()
}

// ─── Hero Slides 防重複提交鎖 ─────────────────────────────────────────────────
const heroSlideLock = new Set<string>()

// ─── 輸出 ─────────────────────────────────────────────────────────────────────
export default defineMiddlewares({
  routes: [
    {
      matcher: "/sf-webhook",
      method: ["POST"],
      bodyParser: { preserveRawBody: true },
    },
    {
      matcher: "/store/sf-webhook",
      method: ["POST"],
      bodyParser: { preserveRawBody: true },
    },
    {
      matcher: "/admin/uploads",
      middlewares: [
        uploadRateLimiter(uploadRateMap, UPLOAD_RATE_LIMIT),
        contentLengthGuard,
        mimeTypeGuard,
        logUpload,
      ],
    },
    {
      matcher: "/admin/uploads/presigned-urls",
      middlewares: [
        uploadRateLimiter(presignedRateMap, PRESIGNED_RATE_LIMIT),
        logUpload,
      ],
    },
    {
      matcher: "/admin/custom/hero-slides",
      bodyParser: { sizeLimit: "50mb" },
      middlewares: [
        (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
          if (req.method !== "POST" && req.method !== "PUT") return next()
          const lockKey = "saving-hero-slide"
          if (heroSlideLock.has(lockKey)) {
            return res.status(429).json({ message: "系統正在處理中，請勿在 5 秒內重複點擊儲存。" })
          }
          heroSlideLock.add(lockKey)
          setTimeout(() => heroSlideLock.delete(lockKey), HERO_SLIDE_LOCK_MS)
          next()
        },
      ],
    },
  ],
})
