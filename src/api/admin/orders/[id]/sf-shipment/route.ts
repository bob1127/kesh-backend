import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createSfOrder, searchSfRoutes, summarizeSfStatus } from "../../../../../lib/sf-express/client"
import {
  buildSfCreateOrderPayload,
  phoneLast4,
} from "../../../../../lib/sf-express/order-mapper"
import { updateOrderSfMetadata } from "../../../../../lib/sf-express/order-service"

async function loadOrder(scope: MedusaRequest["scope"], orderId: string) {
  const query = scope.resolve("query") as any
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "metadata",
      "shipping_address.*",
      "items.*",
    ],
    filters: { id: orderId },
  })
  return data?.[0]
}

/** POST — 向順豐建立運單 */
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

    const payload = buildSfCreateOrderPayload(order)
    const result = await createSfOrder(payload)

    const metadata = await updateOrderSfMetadata(req.scope, id, {
      sf_waybill_no: result.waybillNo,
      sf_order_id: result.orderId,
      sf_status: "已建立運單",
      sf_created_at: new Date().toISOString(),
      sf_routes: [],
    })

    return res.status(200).json({
      success: true,
      waybill_no: result.waybillNo,
      sf_order_id: result.orderId,
      filter_result: result.filterResult,
      metadata,
    })
  } catch (error: any) {
    console.error("❌ [SF Shipment] 建單失敗:", error)
    return res.status(400).json({
      success: false,
      message: error.message || "順豐建單失敗",
    })
  }
}

/** GET — 向順豐查詢最新路由並寫回訂單 metadata */
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
    const routes = await searchSfRoutes({
      trackingNumber: waybill,
      trackingType: 1,
      checkPhoneNo: phone4,
    })

    const metadata = await updateOrderSfMetadata(req.scope, id, {
      sf_routes: routes.routes,
      sf_status: summarizeSfStatus(routes.routes),
    })

    return res.status(200).json({
      success: true,
      waybill_no: waybill,
      routes: routes.routes,
      status: metadata.sf_status,
      metadata,
    })
  } catch (error: any) {
    console.error("❌ [SF Shipment] 查詢失敗:", error)
    return res.status(400).json({
      success: false,
      message: error.message || "順豐路由查詢失敗",
    })
  }
}
