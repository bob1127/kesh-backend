/**
 * SF Express IUOP Open API client
 *
 * 流程：
 *  1. GET /openapi/api/token  → accessToken（快取 2 小時）
 *  2. 加密 body → Base64 ciphertext
 *  3. 計算 SHA256 簽名
 *  4. POST /openapi/api/dispatch + public headers
 *  5. 解密響應 apiResultData（若為字串則解密，物件直接使用）
 */

import { getSfIuopConfig, assertSfIuopConfigured } from "./config"
import { sfEncrypt, sfDecrypt, sfBuildSignature } from "./iuop-crypto"

// ── Token 快取（process 範圍，2 h - 5 min 緩衝）──────────────

interface TokenCache {
  accessToken: string
  expiresAt: number // epoch ms
}
let _tokenCache: TokenCache | null = null

async function getAccessToken(): Promise<string> {
  const cfg = getSfIuopConfig()
  const now = Date.now()
  // 提前 5 min 刷新
  if (_tokenCache && _tokenCache.expiresAt > now + 5 * 60 * 1000) {
    return _tokenCache.accessToken
  }

  const url = `${cfg.tokenUrl}?appKey=${encodeURIComponent(cfg.appKey)}&appSecret=${encodeURIComponent(cfg.appSecret)}`
  const res = await fetch(url, {
    method: "GET",
    headers: { lang: "zh-HK" },
  })

  const body = await res.json() as {
    apiResultCode: number
    apiErrorMsg?: string
    apiResultData?: { expireIn?: number; accessToken?: string }
  }

  if (body.apiResultCode !== 0 || !body.apiResultData?.accessToken) {
    throw new Error(
      `[IUOP] 取得 Token 失敗 (${body.apiResultCode})：${body.apiErrorMsg || "未知錯誤"}`
    )
  }

  const { accessToken, expireIn = 7200 } = body.apiResultData
  _tokenCache = {
    accessToken,
    expiresAt: now + expireIn * 1000,
  }
  console.log("[IUOP] Token 刷新成功，有效至", new Date(_tokenCache.expiresAt).toISOString())
  return accessToken
}

// ── 底層 dispatch 呼叫 ─────────────────────────────────────

export async function callIuopDispatch<T = unknown>(
  msgType: string,
  payload: Record<string, unknown>
): Promise<T> {
  const cfg = assertSfIuopConfigured()
  const token = await getAccessToken()

  const timestamp = String(Date.now())
  const nonce = String(Math.floor(Math.random() * 999999) + 1)
  const plaintext = JSON.stringify(payload)

  const encryptedBody = sfEncrypt(plaintext, cfg.aesKey, cfg.appKey)
  const signature = sfBuildSignature(token, timestamp, nonce, encryptedBody)

  console.log(`[IUOP] → ${msgType}`, { timestamp, nonce })

  const res = await fetch(cfg.dispatchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      msgType,
      appKey: cfg.appKey,
      token,
      timestamp,
      nonce,
      signature,
      lang: "zh-HK",
    },
    body: encryptedBody,
  })

  const text = await res.text()
  let envelope: {
    apiResultCode: number
    apiErrorMsg?: string
    apiResultData?: unknown
  }

  try {
    envelope = JSON.parse(text)
  } catch {
    throw new Error(`[IUOP] 非 JSON 響應：${text.slice(0, 300)}`)
  }

  if (envelope.apiResultCode !== 0) {
    throw new Error(
      `[IUOP] ${msgType} 失敗 (${envelope.apiResultCode})：${envelope.apiErrorMsg || "未知錯誤"}`
    )
  }

  // 響應 body 可能是加密字串，也可能已解密為物件（調試工具）
  const raw = envelope.apiResultData
  if (typeof raw === "string" && raw.length > 0) {
    const decrypted = sfDecrypt(raw, cfg.aesKey, cfg.appKey)
    return JSON.parse(decrypted) as T
  }
  return raw as T
}

// ── 建立運單 IUOP_CREATE_ORDER ──────────────────────────────

export interface IuopCreateOrderResult {
  sfWaybillNo: string
  customerOrderNo: string
  childWaybillNoList?: string[]
  labelUrl?: string
  invoiceUrl?: string
  success: boolean
  msg?: string
  code?: string
}

export async function iuopCreateOrder(
  payload: Record<string, unknown>
): Promise<IuopCreateOrderResult> {
  const inner = await callIuopDispatch<{
    success: boolean
    code?: string
    msg?: string
    data?: IuopCreateOrderResult
  }>("IUOP_CREATE_ORDER", payload)

  if (!inner.success) {
    throw new Error(
      `[IUOP] 建單失敗 (${inner.code})：${inner.msg || "未知錯誤"}`
    )
  }
  if (!inner.data?.sfWaybillNo) {
    throw new Error("[IUOP] 建單成功但未回傳運單號，請至開放平台確認")
  }
  return inner.data
}

// ── 查詢運單 IUOP_QUERY_ORDER ──────────────────────────────

export async function iuopQueryOrder(
  customerCode: string,
  sfWaybillNo: string
): Promise<Record<string, unknown>> {
  const inner = await callIuopDispatch<{
    success: boolean
    code?: string
    msg?: string
    data?: Record<string, unknown>
  }>("IUOP_QUERY_ORDER", { customerCode, sfWaybillNo, version: null })

  if (!inner.success) {
    throw new Error(
      `[IUOP] 查詢運單失敗 (${inner.code})：${inner.msg || "未知錯誤"}`
    )
  }
  return inner.data ?? {}
}
