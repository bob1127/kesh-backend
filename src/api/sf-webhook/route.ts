import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  buildSfWebhookResponse,
  parseSfWebhookPayload,
  verifySfWebhookRequest,
} from "../../lib/sf-express/webhook"
import { applySfWebhookToOrder } from "../../lib/sf-express/order-service"

/** 順豐伺服器推送，不需 Medusa publishable key（不可放在 /store/ 下） */
export const AUTHENTICATE = false

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const rawBody =
      (req as any).rawBody ||
      (typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body ?? {}))

    const contentType = String(req.headers["content-type"] || "")
    const headers = req.headers as Record<string, string | string[] | undefined>

    console.log("📦 [SF Webhook] 收到推送")
    console.log("   Content-Type:", contentType)
    console.log("   Body preview:", rawBody.slice(0, 500))

    if (!verifySfWebhookRequest(rawBody, headers)) {
      console.warn("❌ [SF Webhook] 簽名驗證失敗")
      const fail = buildSfWebhookResponse(false)
      res.setHeader("Content-Type", fail.contentType)
      return res.status(fail.statusCode).send(fail.body)
    }

    const parsed = parseSfWebhookPayload(req.body, contentType)
    await applySfWebhookToOrder(req.scope, parsed)

    const ok = buildSfWebhookResponse(true)
    res.setHeader("Content-Type", ok.contentType)
    return res.status(ok.statusCode).send(ok.body)
  } catch (error) {
    console.error("❌ [SF Webhook] 處理失敗:", error)
    const fail = buildSfWebhookResponse(false)
    res.setHeader("Content-Type", fail.contentType)
    return res.status(fail.statusCode).send(fail.body)
  }
}
