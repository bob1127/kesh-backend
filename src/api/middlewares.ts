import { defineMiddlewares } from "@medusajs/medusa"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"

const heroSlideLock = new Set<string>()

function logUpload(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const start = Date.now()
  console.log(`[R2 Upload Debug] → ${req.method} ${req.originalUrl}`)

  res.on("finish", () => {
    console.log(
      `[R2 Upload Debug] ← ${req.method} ${req.originalUrl} HTTP ${res.statusCode} (${Date.now() - start}ms)`
    )
  })

  next()
}

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
      middlewares: [logUpload],
    },
    {
      matcher: "/admin/uploads/presigned-urls",
      middlewares: [logUpload],
    },
    {
      matcher: "/admin/custom/hero-slides",
      bodyParser: {
        sizeLimit: "50mb",
      },
      middlewares: [
        (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
          if (req.method !== "POST" && req.method !== "PUT") {
            return next()
          }

          const lockKey = "saving-hero-slide"

          if (heroSlideLock.has(lockKey)) {
            console.warn(`🛡️ [防護盾觸發] 攔截到 5 秒內的重複點擊儲存 Hero Slides！`)
            return res.status(429).json({
              message: "系統正在處理大量圖片中，請勿在 5 秒內重複點擊儲存！",
            })
          }

          heroSlideLock.add(lockKey)

          setTimeout(() => {
            heroSlideLock.delete(lockKey)
          }, 5000)

          next()
        },
      ],
    },
  ],
})
