import { Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { summarizeSfStatus } from "./client"
import { mergeRoutes, type ParsedSfWebhook } from "./webhook"
import type { SfOrderMetadata, SfRouteNode } from "./types"

export async function findOrderBySfIdentifiers(
  scope: MedusaContainer,
  identifiers: Pick<ParsedSfWebhook, "waybillNo" | "orderId">
) {
  const query = scope.resolve("query") as any
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "metadata"],
    pagination: { take: 300, order: { created_at: "DESC" } },
  })

  const list = (orders || []) as Array<{
    id: string
    display_id?: number
    metadata?: SfOrderMetadata
  }>

  if (identifiers.waybillNo) {
    const byWaybill = list.find(
      (o) => o.metadata?.sf_waybill_no === identifiers.waybillNo
    )
    if (byWaybill) return byWaybill
  }

  if (identifiers.orderId) {
    const bySfOrder = list.find(
      (o) => o.metadata?.sf_order_id === identifiers.orderId
    )
    if (bySfOrder) return bySfOrder

    const byDisplay = list.find((o) => {
      const display = String(o.display_id ?? "")
      return identifiers.orderId?.includes(display)
    })
    if (byDisplay) return byDisplay
  }

  return null
}

export async function updateOrderSfMetadata(
  scope: MedusaContainer,
  orderId: string,
  patch: Partial<SfOrderMetadata>
) {
  const query = scope.resolve("query") as any
  const orderModule = scope.resolve(Modules.ORDER) as any

  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "metadata"],
    filters: { id: orderId },
  })

  const current = (data?.[0]?.metadata || {}) as SfOrderMetadata
  const mergedRoutes = patch.sf_routes
    ? mergeRoutes(current.sf_routes, patch.sf_routes)
    : current.sf_routes

  const nextMetadata: SfOrderMetadata = {
    ...current,
    ...patch,
    ...(mergedRoutes ? { sf_routes: mergedRoutes } : {}),
  }

  if (nextMetadata.sf_routes?.length) {
    nextMetadata.sf_status = summarizeSfStatus(nextMetadata.sf_routes)
    nextMetadata.sf_last_route_at =
      nextMetadata.sf_routes[nextMetadata.sf_routes.length - 1]?.acceptTime
  }

  await orderModule.updateOrders([
    {
      id: orderId,
      metadata: nextMetadata,
    },
  ])

  return nextMetadata
}

export async function applySfWebhookToOrder(
  scope: MedusaContainer,
  parsed: ParsedSfWebhook
) {
  const order = await findOrderBySfIdentifiers(scope, parsed)
  if (!order) {
    console.warn("⚠️ [SF Webhook] 找不到對應訂單:", parsed)
    return null
  }

  return updateOrderSfMetadata(scope, order.id, {
    sf_routes: parsed.routes,
    ...(parsed.waybillNo ? { sf_waybill_no: parsed.waybillNo } : {}),
    ...(parsed.orderId ? { sf_order_id: parsed.orderId } : {}),
  })
}

export function routesFromMetadata(
  metadata?: SfOrderMetadata | null
): SfRouteNode[] {
  return metadata?.sf_routes || []
}
