import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { gtsQueryTrack, iuopCreateOrder } from "../../../../../lib/sf-express/iuop-client"
import { mapGtsTrackToRoutes } from "../../../../../lib/sf-express/gts-track-mapper"
import {
  buildIuopCreateOrderPayload,
  phoneLast4,
} from "../../../../../lib/sf-express/iuop-order-mapper"
import { updateOrderSfMetadata } from "../../../../../lib/sf-express/order-service"

async function loadOrder(scope: MedusaRequest["scope"], orderId: string) {
  const query = scope.resolve("query") as any
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "metadata",
      "shipping_address.*",
      "items.*",
    ],
    filters: { id: orderId },
  })
  return data?.[0]
}

/** POST — 向順豐 IUOP 建立運單 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params as { id: string }

  try {
    const order = await loadOrder(req.scope, id)
    if (!order) {
      return res.status(404).json({ message: "找不到訂單" })
    }

    if (order.metadata?.sf_waybill_no) {
      return res.status(409).json({
        message: "此訂單已有順豐運單",
        waybill_no: order.metadata.sf_waybill_no,
      })
    }

    const payload = buildIuopCreateOrderPayload(order)
    console.log("[SF Shipment] IUOP 建單 payload:", JSON.stringify(payload, null, 2))

    const result = await iuopCreateOrder(payload)

    const metadata = await updateOrderSfMetadata(req.scope, id, {
      sf_waybill_no: result.sfWaybillNo,
      sf_order_id: result.customerOrderNo,
      sf_status: "已建立運單",
      sf_created_at: new Date().toISOString(),
      sf_routes: [],
      sf_label_url: result.labelUrl ?? "",
    })

    return res.status(200).json({
      success: true,
      waybill_no: result.sfWaybillNo,
      sf_order_id: result.customerOrderNo,
      label_url: result.labelUrl,
      metadata,
    })
  } catch (error: any) {
    console.error("❌ [SF Shipment] IUOP 建單失敗:", error)
    return res.status(400).json({
      success: false,
      message: error.message || "順豐建單失敗",
    })
  }
}

/** GET — GTS_QUERY_TRACK 查路由並寫回訂單 metadata */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params as { id: string }

  try {
    const order = await loadOrder(req.scope, id)
    if (!order) {
      return res.status(404).json({ message: "找不到訂單" })
    }

    const waybill = order.metadata?.sf_waybill_no as string | undefined
    if (!waybill) {
      return res.status(404).json({ message: "此訂單尚未建立順豐運單" })
    }

    const phone4 = phoneLast4(order.shipping_address?.phone)
    if (!phone4) {
      return res.status(400).json({
        message: "收件人電話格式無法取得後四碼，請確認訂單地址",
      })
    }

    const trackResult = await gtsQueryTrack({
      sfWaybillNoList: [waybill],
      phoneNo: phone4,
    })
    const routes = mapGtsTrackToRoutes(trackResult, waybill)

    const metadata = await updateOrderSfMetadata(req.scope, id, {
      sf_routes: routes,
      sf_query_raw: trackResult as unknown as Record<string, unknown>,
    })

    return res.status(200).json({
      success: true,
      waybill_no: waybill,
      routes,
      track_result: trackResult,
      metadata,
    })
  } catch (error: any) {
    console.error("❌ [SF Shipment] GTS 路由查詢失敗:", error)
    return res.status(400).json({
      success: false,
      message: error.message || "順豐路由查詢失敗",
    })
  }
}
