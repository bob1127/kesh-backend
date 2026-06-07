import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { summarizeSfStatus } from "../../../../../lib/sf-express/client"
import { mapGtsTrackToRoutes } from "../../../../../lib/sf-express/gts-track-mapper"
import { gtsQueryTrack } from "../../../../../lib/sf-express/iuop-client"
import { phoneLast4 } from "../../../../../lib/sf-express/iuop-order-mapper"
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
      if (!phone4) {
        return res.status(400).json({
          success: false,
          message: "無法取得收件人電話後四碼，無法查詢物流",
        })
      }

      const trackResult = await gtsQueryTrack({
        sfWaybillNoList: [waybill],
        phoneNo: phone4,
      })
      routes = mapGtsTrackToRoutes(trackResult, waybill)
      status = summarizeSfStatus(routes)
      await updateOrderSfMetadata(req.scope, id, {
        sf_routes: routes,
        sf_status: status,
        sf_query_raw: trackResult as unknown as Record<string, unknown>,
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
