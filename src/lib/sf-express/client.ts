import { randomUUID } from "crypto"
import { assertSfApiConfigured } from "./config"
import { buildMsgDigest } from "./crypto"
import type {
  SfCreateOrderResult,
  SfRouteNode,
  SfRouteQueryResult,
} from "./types"

type SfApiEnvelope = {
  apiResultCode: string
  apiErrorMsg?: string
  apiResultData?: string
}

async function callSfService(
  serviceCode: string,
  msgData: Record<string, unknown>
): Promise<SfApiEnvelope> {
  const cfg = assertSfApiConfigured()
  const msgDataStr = JSON.stringify(msgData)
  const timestamp = String(Date.now())
  const msgDigest = buildMsgDigest(msgDataStr, timestamp, cfg.checkWord)

  const form = new URLSearchParams({
    partnerID: cfg.partnerId,
    requestID: randomUUID().replace(/-/g, ""),
    serviceCode,
    timestamp,
    msgData: msgDataStr,
    msgDigest,
  })

  const res = await fetch(cfg.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: form.toString(),
  })

  const text = await res.text()
  let envelope: SfApiEnvelope
  try {
    envelope = JSON.parse(text)
  } catch {
    throw new Error(`順豐 API 回應非 JSON：${text.slice(0, 200)}`)
  }

  if (envelope.apiResultCode !== "A1000") {
    throw new Error(
      envelope.apiErrorMsg ||
        `順豐 API 錯誤 (${envelope.apiResultCode || "unknown"})`
    )
  }

  return envelope
}

function parseResultData<T>(envelope: SfApiEnvelope): T {
  if (!envelope.apiResultData) {
    throw new Error("順豐 API 未回傳 apiResultData")
  }
  return JSON.parse(envelope.apiResultData) as T
}

export async function createSfOrder(
  payload: Record<string, unknown>
): Promise<SfCreateOrderResult> {
  const envelope = await callSfService("EXP_RECE_CREATE_ORDER", payload)
  const data = parseResultData<{
    orderId?: string
    filterResult?: string
    destCode?: string
    waybillNoInfoList?: Array<{ waybillNo?: string; waybillType?: number }>
  }>(envelope)

  const waybillNo = data.waybillNoInfoList?.[0]?.waybillNo
  if (!waybillNo) {
    throw new Error("順豐下單成功但未回傳運單號，請至 IUOP 後台確認訂單狀態")
  }

  return {
    orderId: data.orderId || String(payload.orderId || ""),
    waybillNo,
    filterResult: data.filterResult,
    destCode: data.destCode,
    raw: data,
  }
}

export async function searchSfRoutes(input: {
  trackingNumber: string
  trackingType?: 1 | 2
  checkPhoneNo?: string
}): Promise<SfRouteQueryResult> {
  const envelope = await callSfService("EXP_RECE_SEARCH_ROUTES", {
    language: "zh-TW",
    trackingType: input.trackingType ?? 1,
    trackingNumber: [input.trackingNumber],
    methodType: 1,
    ...(input.checkPhoneNo ? { checkPhoneNo: input.checkPhoneNo } : {}),
  })

  const data = parseResultData<{
    routeResps?: Array<{
      mailNo?: string
      routes?: SfRouteNode[]
    }>
  }>(envelope)

  const first = data.routeResps?.[0]
  return {
    mailNo: first?.mailNo || input.trackingNumber,
    routes: first?.routes || [],
    raw: data,
  }
}

export function summarizeSfStatus(routes: SfRouteNode[]): string {
  if (!routes.length) return "已建立運單"
  const latest = routes[routes.length - 1]
  const remark = latest.remark || ""
  if (/签收|簽收|已取件|delivered/i.test(remark)) return "已送達"
  if (/派送|派件|out for delivery/i.test(remark)) return "配送中"
  if (/揽收|攬收|已收件|pickup/i.test(remark)) return "已取件"
  return remark.slice(0, 40) || "運送中"
}
