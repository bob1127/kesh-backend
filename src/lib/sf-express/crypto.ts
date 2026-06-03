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

function timingSafeCompare(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase()
  const left = norm(a)
  const right = norm(b)
  if (left.length !== right.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right))
  } catch {
    return left === right
  }
}

/** HMAC-SHA256，比對 hex 或 base64 簽名 */
export function verifyRouteWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  signKey: string
): boolean {
  if (!signKey || !signature) return !signKey

  const sig = signature.replace(/^sha256=/i, "").trim()
  const digest = crypto
    .createHmac("sha256", signKey)
    .update(rawBody, "utf8")
    .digest()
  const hex = digest.toString("hex")
  const b64 = digest.toString("base64")

  return (
    timingSafeCompare(hex, sig) ||
    timingSafeCompare(b64, sig) ||
    timingSafeCompare(hex, Buffer.from(sig, "base64").toString("hex"))
  )
}

/** 丰桥路由推送 verifyCode = Base64(MD5(xml + checkWord)) */
export function verifyFengqiaoPushCode(
  xml: string,
  verifyCode: string | undefined,
  checkWord: string
): boolean {
  if (!checkWord || !verifyCode) return false
  const md5 = crypto
    .createHash("md5")
    .update(xml + checkWord, "utf8")
    .digest()
  const expected = Buffer.from(md5).toString("base64")
  return timingSafeCompare(expected, verifyCode)
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
