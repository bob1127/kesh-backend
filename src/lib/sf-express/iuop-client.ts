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

  if (_tokenCache && _tokenCache.expiresAt > now + 5 * 60 * 1000) {
    console.log("[IUOP] Token 快取有效，到期:", new Date(_tokenCache.expiresAt).toISOString())
    return _tokenCache.accessToken
  }

  const url = `${cfg.tokenUrl}?appKey=${encodeURIComponent(cfg.appKey)}&appSecret=${encodeURIComponent(cfg.appSecret)}`
  console.log("[IUOP] 取得 Token →", cfg.tokenUrl)
  console.log("[IUOP] appKey 長度:", cfg.appKey.length, "appKey 前8碼:", cfg.appKey.slice(0, 8))

  let res: Response
  try {
    res = await fetch(url, { method: "GET", headers: { lang: "zh-HK" } })
  } catch (err: any) {
    console.error("[IUOP] Token 請求網路錯誤:", err.message)
    throw new Error(`[IUOP] Token 請求網路錯誤：${err.message}`)
  }

  const rawText = await res.text()
  console.log("[IUOP] Token 原始響應 (HTTP", res.status, "):", rawText.slice(0, 300))

  let body: { apiResultCode: number; apiErrorMsg?: string; apiResultData?: { expireIn?: number; accessToken?: string } }
  try {
    body = JSON.parse(rawText)
  } catch {
    throw new Error(`[IUOP] Token 響應非 JSON：${rawText.slice(0, 200)}`)
  }

  if (body.apiResultCode !== 0 || !body.apiResultData?.accessToken) {
    console.error("[IUOP] Token 失敗完整響應:", JSON.stringify(body))
    throw new Error(
      `[IUOP] 取得 Token 失敗 (${body.apiResultCode})：${body.apiErrorMsg || "未知錯誤"}`
    )
  }

  const { accessToken, expireIn = 7200 } = body.apiResultData
  _tokenCache = { accessToken, expiresAt: now + expireIn * 1000 }
  console.log("[IUOP] ✅ Token 刷新成功，有效至", new Date(_tokenCache.expiresAt).toISOString())
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

  console.log(`[IUOP] → ${msgType} | ts=${timestamp} nonce=${nonce}`)
  console.log(`[IUOP]   plaintext 長度: ${plaintext.length}`)
  console.log(`[IUOP]   encrypted 長度: ${encryptedBody.length}`)
  console.log(`[IUOP]   signature 前16: ${signature.slice(0, 16)}`)
  console.log(`[IUOP]   dispatchUrl: ${cfg.dispatchUrl}`)

  let res: Response
  try {
    res = await fetch(cfg.dispatchUrl, {
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
  } catch (err: any) {
    console.error(`[IUOP] ${msgType} 網路錯誤:`, err.message)
    throw new Error(`[IUOP] ${msgType} 網路錯誤：${err.message}`)
  }

  const text = await res.text()
  console.log(`[IUOP] ← ${msgType} HTTP ${res.status}:`, text.slice(0, 500))

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
    console.error(`[IUOP] ${msgType} 失敗完整響應:`, JSON.stringify(envelope))
    throw new Error(
      `[IUOP] ${msgType} 失敗 (${envelope.apiResultCode})：${envelope.apiErrorMsg || "未知錯誤"}`
    )
  }

  const raw = envelope.apiResultData
  if (typeof raw === "string" && raw.length > 0) {
    console.log(`[IUOP] ${msgType} 解密響應中...`)
    try {
      const decrypted = sfDecrypt(raw, cfg.aesKey, cfg.appKey)
      console.log(`[IUOP] ${msgType} 解密結果:`, decrypted.slice(0, 300))
      return JSON.parse(decrypted) as T
    } catch (err: any) {
      console.error(`[IUOP] ${msgType} 解密失敗:`, err.message)
      throw new Error(`[IUOP] ${msgType} 解密失敗：${err.message}`)
    }
  }
  console.log(`[IUOP] ${msgType} ✅ 成功（明文響應）`)
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
