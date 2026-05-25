import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  try {
    // 1. 將順豐推過來的資料印在終端機 (Railway Logs) 裡
    console.log("📦 [SF Express Webhook] 收到物流狀態更新:", req.body)

    // 2. 務必回傳 HTTP 200 與成功訊息，告訴順豐「伺服器有收到」
    res.status(200).json({ success: true })
  } catch (error) {
    console.error("❌ [SF Express Webhook] 處理失敗:", error)
    res.status(400).json({ success: false, message: "Webhook 接收失敗" })
  }
}