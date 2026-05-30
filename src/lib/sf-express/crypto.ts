import crypto from "crypto"

/** 丰桥 std/service 接口 msgDigest 签名 */
export function buildMsgDigest(
  msgData: string,
  timestamp: string,
  checkWord: string
): string {
  const toSign = encodeURIComponent(msgData) + timestamp + checkWord
  const md5 = crypto.createHash("md5").update(toSign, "utf8").digest()
  return Buffer.from(md5).toString("base64")
}

/** 路由订阅 webhook 签名校验（Sign Key，HMAC-SHA256 hex） */
export function verifyRouteWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  signKey: string
): boolean {
  if (!signKey || !signature) return !signKey
  const expected = crypto
    .createHmac("sha256", signKey)
    .update(rawBody, "utf8")
    .digest("hex")
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature.toLowerCase(), "hex")
    )
  } catch {
    return expected.toLowerCase() === signature.toLowerCase()
  }
}

/** 路由订阅 webhook 响应签名 */
export function signRouteWebhookResponse(
  responseBody: string,
  signKey: string
): string {
  return crypto
    .createHmac("sha256", signKey)
    .update(responseBody, "utf8")
    .digest("hex")
}
