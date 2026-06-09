import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text, Badge, toast } from "@medusajs/ui"
import { useState, useEffect, useCallback } from "react"

type SfRoute = {
  acceptTime?: string
  acceptAddress?: string
  remark?: string
  opCode?: string
}

const OrderSfShipmentWidget = ({ data }: { data: any }) => {
  const order = data
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [meta, setMeta] = useState<any>(order?.metadata || {})

  useEffect(() => {
    setMeta(order?.metadata || {})
  }, [order])

  const waybill = meta?.sf_waybill_no as string | undefined
  const routes = (meta?.sf_routes || []) as SfRoute[]
  const status = meta?.sf_status || (waybill ? "已建立運單" : "尚未建單")

  const createShipment = async () => {
    if (!order?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/admin/orders/${order.id}/sf-shipment`, {
        method: "POST",
        credentials: "include",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || "建單失敗")
      setMeta(json.metadata || {})
      toast.success(`順豐運單已建立：${json.waybill_no}`)
    } catch (e: any) {
      toast.error(e.message || "順豐建單失敗")
    } finally {
      setLoading(false)
    }
  }

  const refreshTracking = useCallback(async () => {
    if (!order?.id || !waybill) return
    setRefreshing(true)
    try {
      const res = await fetch(`/admin/orders/${order.id}/sf-shipment`, {
        credentials: "include",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || "查詢失敗")
      setMeta(json.metadata || {})
      const count = (json.routes || json.metadata?.sf_routes || []).length
      if (count > 0) {
        toast.success(`物流狀態已更新（${count} 筆軌跡）`)
      } else {
        toast.warning(
          "查詢成功，但尚無路由資料。沙盒新單通常需等 Webhook 推送，或至順豐官網查詢。"
        )
      }
    } catch (e: any) {
      toast.error(e.message || "查詢失敗")
    } finally {
      setRefreshing(false)
    }
  }, [order?.id, waybill])

  if (!order?.id) return null

  const isTw =
    order.shipping_address?.country_code?.toLowerCase() === "tw" ||
    !order.shipping_address?.country_code

  return (
    <Container className="p-0">
      <div className="px-6 py-4 border-b border-ui-border-base flex items-center justify-between gap-4">
        <div>
          <Heading level="h2">順豐速運</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            一鍵建立台灣宅配運單，並同步路由至訂單
          </Text>
        </div>
        <Badge color={waybill ? "green" : "grey"}>{status}</Badge>
      </div>

      <div className="px-6 py-4 space-y-4">
        {!isTw && (
          <Text size="small" className="text-ui-fg-subtle">
            此訂單收件國家非 TW，順豐台灣宅配 API 可能不適用。
          </Text>
        )}

        {waybill ? (
          <div className="space-y-2">
            <Text size="small">
              <span className="text-ui-fg-subtle">運單號：</span>
              <span className="font-mono font-medium">{waybill}</span>
            </Text>
            {meta?.sf_order_id && (
              <Text size="small">
                <span className="text-ui-fg-subtle">順豐訂單號：</span>
                {meta.sf_order_id}
              </Text>
            )}
          </div>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            付款完成後，點擊下方按鈕向順豐建立運單。建立成功後會自動訂閱路由推送。
          </Text>
        )}

        <div className="flex flex-wrap gap-2">
          {!waybill && (
            <Button
              variant="primary"
              onClick={createShipment}
              isLoading={loading}
            >
              建立順豐運單
            </Button>
          )}
          {waybill && (
            <>
              <Button
                variant="secondary"
                onClick={refreshTracking}
                isLoading={refreshing}
              >
                刷新物流狀態
              </Button>
              <Button
                variant="transparent"
                onClick={() =>
                  window.open(
                    `https://www.sf-express.com/tw/tc/dynamic_function/waybill/#search/bill-number/${waybill}`,
                    "_blank"
                  )
                }
              >
                順豐官網查詢
              </Button>
            </>
          )}
        </div>

        {routes.length > 0 ? (
          <div className="border border-ui-border-base rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-ui-bg-subtle border-b border-ui-border-base">
              <Text size="small" weight="plus">
                物流軌跡 ({routes.length})
              </Text>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-ui-border-base">
              {[...routes].reverse().map((r, i) => (
                <div key={`${r.acceptTime}-${i}`} className="px-4 py-3">
                  <Text size="small" weight="plus">
                    {r.remark || "—"}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle mt-1">
                    {[r.acceptTime, r.acceptAddress].filter(Boolean).join(" · ")}
                  </Text>
                </div>
              ))}
            </div>
          </div>
        ) : waybill ? (
          <Text size="small" className="text-ui-fg-subtle">
            尚無物流軌跡。剛建立的沙盒運單通常查不到 GTS 路由；正式出貨後以 Webhook
            推送為主，亦可點「順豐官網查詢」。
          </Text>
        ) : null}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderSfShipmentWidget
