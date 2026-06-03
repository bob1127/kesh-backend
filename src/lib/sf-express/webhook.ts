import { getSfConfig } from "./config"
import {
  signRouteWebhookResponse,
  verifyFengqiaoPushCode,
  verifyRouteWebhookSignature,
} from "./crypto"
import type { SfRouteNode } from "./types"

export type ParsedSfWebhook = {
  waybillNo?: string
  orderId?: string
  routes: SfRouteNode[]
  raw: unknown
}

function parseXmlRoutes(xml: string): ParsedSfWebhook {
  const waybillMatch =
    xml.match(/mailno=['"]([^'"]+)['"]/i) ||
    xml.match(/<WaybillNo>([^<]+)<\/WaybillNo>/i)
  const orderMatch =
    xml.match(/orderid=['"]([^'"]+)['"]/i) ||
    xml.match(/<OrderId>([^<]+)<\/OrderId>/i)

  const routes: SfRouteNode[] = []
  const routeRegex =
    /<Route[^>]*remark=['"]([^'"]*)['"][^>]*accept_time=['"]([^'"]*)['"][^>]*(?:accept_address=['"]([^'"]*)['"])?[^>]*(?:opcode=['"]([^'"]*)['"])?[^>]*\/?>/gi

  let m: RegExpExecArray | null
  while ((m = routeRegex.exec(xml)) !== null) {
    routes.push({
      remark: m[1] || "",
      acceptTime: m[2] || "",
      acceptAddress: m[3] || "",
      opCode: m[4] || "",
    })
  }

  // 丰桥 Body 内嵌 Route 节点（另一种格式）
  if (!routes.length) {
    const altRegex =
      /<Route>\s*<acceptTime>([^<]*)<\/acceptTime>\s*<acceptAddress>([^<]*)<\/acceptAddress>\s*<remark>([^<]*)<\/remark>\s*<opCode>([^<]*)<\/opCode>\s*<\/Route>/gi
    while ((m = altRegex.exec(xml)) !== null) {
      routes.push({
        acceptTime: m[1] || "",
        acceptAddress: m[2] || "",
        remark: m[3] || "",
        opCode: m[4] || "",
      })
    }
  }

  return {
    waybillNo: waybillMatch?.[1],
    orderId: orderMatch?.[1],
    routes,
    raw: xml,
  }
}

function parseJsonWebhook(body: unknown): ParsedSfWebhook {
  const data = body as Record<string, unknown>
  const bodyNode = data.Body as Record<string, unknown> | undefined
  const waybillRoutes = bodyNode?.WaybillRoute

  if (Array.isArray(waybillRoutes) && waybillRoutes.length) {
    const routes = waybillRoutes.map((r: Record<string, unknown>) => ({
      acceptTime: String(r.acceptTime || r.accept_time || ""),
      acceptAddress: String(r.acceptAddress || r.accept_address || ""),
      remark: String(r.remark || ""),
      opCode: String(r.opCode || r.opcode || ""),
    }))
    const first = waybillRoutes[0] as Record<string, unknown>
    return {
      waybillNo: String(first.mailno || first.mailNo || ""),
      orderId: String(first.orderid || first.orderId || ""),
      routes,
      raw: body,
    }
  }

  const payload =
    (data.body as Record<string, unknown>) ||
    (data.msgData as Record<string, unknown>) ||
    data

  const waybillNo =
    (payload.waybillNo as string) ||
    (payload.mailNo as string) ||
    (payload.mailno as string) ||
    (payload.trackingNumber as string)

  const orderId =
    (payload.orderId as string) ||
    (payload.orderid as string) ||
    (payload.customerOrderNo as string)

  let routes: SfRouteNode[] = []
  const routeList =
    payload.routes ||
    payload.routeList ||
    payload.routeNodes ||
    payload.trackDetailList

  if (Array.isArray(routeList)) {
    routes = routeList.map((r: Record<string, unknown>) => ({
      acceptTime: String(r.acceptTime || r.accept_time || r.time || ""),
      acceptAddress: String(r.acceptAddress || r.accept_address || r.location || ""),
      remark: String(r.remark || r.desc || r.description || r.status || ""),
      opCode: String(r.opCode || r.opcode || r.code || ""),
    }))
  } else if (payload.remark || payload.acceptTime) {
    routes = [
      {
        acceptTime: String(payload.acceptTime || payload.accept_time || ""),
        acceptAddress: String(payload.acceptAddress || ""),
        remark: String(payload.remark || payload.status || ""),
        opCode: String(payload.opCode || ""),
      },
    ]
  }

  return { waybillNo, orderId, routes, raw: body }
}

export function parseSfWebhookPayload(
  body: unknown,
  contentType?: string
): ParsedSfWebhook {
  if (typeof body === "string") {
    if (body.trim().startsWith("<")) return parseXmlRoutes(body)
    try {
      return parseJsonWebhook(JSON.parse(body))
    } catch {
      return { routes: [], raw: body }
    }
  }

  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>
    const xml =
      (obj.content as string) ||
      (obj.xml as string) ||
      (obj.msgData as string)

    if (typeof xml === "string" && xml.trim().startsWith("<")) {
      return parseXmlRoutes(decodeURIComponent(xml))
    }

    if (contentType?.includes("xml")) {
      return parseXmlRoutes(JSON.stringify(body))
    }

    return parseJsonWebhook(body)
  }

  return { routes: [], raw: body }
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const v = headers[name]
  if (Array.isArray(v)) return v[0]
  return v
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`
  }
  const keys = Object.keys(value as object).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(",")}}`
}

function payloadWithoutSign(body: Record<string, unknown>): string {
  const { sign: _s, signature: _sig, ...rest } = body
  return stableStringify(rest)
}

export function getWebhookRawBody(req: {
  rawBody?: Buffer | string
  body?: unknown
}): string {
  if (req.rawBody) {
    return Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString("utf8")
      : String(req.rawBody)
  }
  if (typeof req.body === "string") return req.body
  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body)
  }
  return ""
}

export type SfWebhookVerifyResult = {
  ok: boolean
  method?: string
  reason?: string
}

export function verifySfWebhookRequest(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  parsedBody?: unknown
): SfWebhookVerifyResult {
  const cfg = getSfConfig()

  const headerSig =
    headerValue(headers, "x-sf-signature") ||
    headerValue(headers, "sign") ||
    headerValue(headers, "signature") ||
    headerValue(headers, "x-sign")

  if (cfg.routeSignKey && headerSig) {
    if (verifyRouteWebhookSignature(rawBody, headerSig, cfg.routeSignKey)) {
      return { ok: true, method: "header-hmac-raw" }
    }
  }

  if (cfg.routeSignKey && parsedBody && typeof parsedBody === "object") {
    const body = parsedBody as Record<string, unknown>
    const bodySig = (body.sign || body.signature) as string | undefined
    if (bodySig) {
      const canonical = payloadWithoutSign(body)
      if (verifyRouteWebhookSignature(canonical, bodySig, cfg.routeSignKey)) {
        return { ok: true, method: "body-sign-canonical" }
      }
      if (verifyRouteWebhookSignature(rawBody, bodySig, cfg.routeSignKey)) {
        return { ok: true, method: "body-sign-raw" }
      }
    }
  }

  let verifyCode: string | undefined = headerValue(headers, "verifycode")
  if (!verifyCode && parsedBody && typeof parsedBody === "object") {
    const v = (parsedBody as Record<string, unknown>).verifyCode
    if (typeof v === "string") verifyCode = v
  }

  let xmlContent: string | undefined
  if (parsedBody && typeof parsedBody === "object") {
    const body = parsedBody as Record<string, unknown>
    const content = body.content ?? body.xml
    if (typeof content === "string") xmlContent = content
  }
  if (!xmlContent && rawBody.includes("<") && rawBody.trim().startsWith("<")) {
    xmlContent = rawBody
  }

  if (cfg.checkWord && verifyCode && xmlContent) {
    const xml = decodeURIComponent(xmlContent)
    if (verifyFengqiaoPushCode(xml, verifyCode, cfg.checkWord)) {
      return { ok: true, method: "fengqiao-verifyCode" }
    }
  }

  if (!cfg.routeSignKey && !cfg.checkWord) {
    return { ok: true, method: "no-keys-configured" }
  }

  const allowUnsigned =
    cfg.isSandbox && process.env.SF_WEBHOOK_ALLOW_UNSIGNED !== "false"
  if (allowUnsigned && !headerSig) {
    return { ok: true, method: "sandbox-unsigned" }
  }

  if (!cfg.routeSignKey) {
    return { ok: true, method: "no-route-sign-key" }
  }

  return {
    ok: false,
    reason: headerSig ? "hmac-mismatch" : "missing-signature",
  }
}

/** 依順豐路由訂閱文件回傳響應（官方測試推送失敗的主因：格式不符） */
export function buildSfWebhookResponse(success: boolean): {
  statusCode: number
  contentType: string
  body: string
} {
  const cfg = getSfConfig()

  if (cfg.webhookResponseMode === "text") {
    return {
      statusCode: 200,
      contentType: "text/plain; charset=UTF-8",
      body: success ? "OK" : "ERR",
    }
  }

  if (cfg.webhookResponseMode === "xml") {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response service="RoutePushService"><Head>${success ? "OK" : "ERR"}</Head></Response>`
    return {
      statusCode: 200,
      contentType: "application/xml; charset=UTF-8",
      body: xml,
    }
  }

  // SF Global 路由訂閱常見 JSON 格式（含 sign 欄位）
  const payload: Record<string, string> = {
    code: success ? "0" : "1",
    msg: success ? "success" : "error",
  }

  if (cfg.routeSignKey) {
    const bodyStr = JSON.stringify(payload)
    payload.sign = signRouteWebhookResponse(bodyStr, cfg.routeSignKey)
  }

  return {
    statusCode: 200,
    contentType: "application/json; charset=UTF-8",
    body: JSON.stringify(payload),
  }
}

export function mergeRoutes(
  existing: SfRouteNode[] = [],
  incoming: SfRouteNode[] = []
): SfRouteNode[] {
  const map = new Map<string, SfRouteNode>()
  for (const r of [...existing, ...incoming]) {
    const key = `${r.acceptTime}|${r.remark}|${r.opCode || ""}`
    map.set(key, r)
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.acceptTime || "").localeCompare(b.acceptTime || "")
  )
}
