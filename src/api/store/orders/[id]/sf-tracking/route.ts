import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { searchSfRoutes, summarizeSfStatus } from "../../../../../lib/sf-express/client"
import { phoneLast4 } from "../../../../../lib/sf-express/order-mapper"
import {
  routesFromMetadata,
  updateOrderSfMetadata,
} from "../../../../../lib/sf-express/order-service"

async function loadCustomerOrder(
  scope: MedusaRequest["scope"],
  orderId: string,
  customerId?: string
) {
  const query = scope.resolve("query") as any
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "customer_id",
      "metadata",
      "shipping_address.phone",
    ],
    filters: { id: orderId },
  })

  const order = data?.[0]
  if (!order) return null
  if (customerId && order.customer_id && order.customer_id !== customerId) {
    return null
  }
  return order
}

/** GET /store/orders/:id/sf-tracking — 會員查詢包裹進度 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params as { id: string }
  const refresh = req.query.refresh === "true"

  try {
    const authContext = (req as any).auth_context
    const customerId = authContext?.actor_id

    const order = await loadCustomerOrder(req.scope, id, customerId)
    if (!order) {
      return res.status(404).json({ message: "找不到訂單或無權限" })
    }

    const waybill = order.metadata?.sf_waybill_no as string | undefined
    if (!waybill) {
      return res.status(200).json({
        has_shipment: false,
        message: "訂單尚未出貨",
      })
    }

    let routes = routesFromMetadata(order.metadata)
    let status = order.metadata?.sf_status || "已建立運單"

    if (refresh || !routes.length) {
      const phone4 = phoneLast4(order.shipping_address?.phone)
      const live = await searchSfRoutes({
        trackingNumber: waybill,
        trackingType: 1,
        checkPhoneNo: phone4,
      })
      routes = live.routes
      status = summarizeSfStatus(routes)
      await updateOrderSfMetadata(req.scope, id, {
        sf_routes: routes,
        sf_status: status,
      })
    }

    return res.status(200).json({
      has_shipment: true,
      waybill_no: waybill,
      status,
      routes,
      tracking_url: `https://www.sf-express.com/tw/tc/dynamic_function/waybill/#search/bill-number/${waybill}`,
    })
  } catch (error: any) {
    console.error("❌ [SF Tracking] 查詢失敗:", error)
    return res.status(400).json({
      success: false,
      message: error.message || "物流查詢失敗",
    })
  }
}
