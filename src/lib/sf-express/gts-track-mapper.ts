import type { GtsQueryTrackResult } from "./iuop-client"
import type { SfRouteNode } from "./types"

function trackAddress(item: {
  trackAddr?: string
  trackRegionFirst?: string
  trackRegionSecond?: string
}): string | undefined {
  const parts = [item.trackRegionFirst, item.trackRegionSecond, item.trackAddr]
    .filter(Boolean)
    .join(" ")
  return parts || item.trackAddr || undefined
}

/** 將 GTS_QUERY_TRACK 回應轉成與 Webhook 共用的 sf_routes 格式 */
export function mapGtsTrackToRoutes(
  result: GtsQueryTrackResult,
  waybillNo: string
): SfRouteNode[] {
  const bucket =
    result.data?.find((d) => d.sfWaybillNo === waybillNo) ?? result.data?.[0]

  if (!bucket?.trackDetailItems?.length) return []

  return bucket.trackDetailItems
    .map((item) => ({
      acceptTime: item.localTm || "",
      acceptAddress: trackAddress(item),
      remark: item.trackOutRemark || "",
      opCode: item.opCode,
    }))
    .filter((r) => r.acceptTime || r.remark)
    .sort((a, b) => a.acceptTime.localeCompare(b.acceptTime))
}
