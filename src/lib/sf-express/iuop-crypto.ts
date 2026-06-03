/**
 * SF Express IUOP Open API — 加解密 & 簽名
 *
 * 對應官方 JS 樣例：aesFunc.js / BizMsgCrypt
 *
 * 格式：
 *   明文 = random(16 bytes) + pack4(msgLen) + msg + appKey
 *   padding = PKCS7，對齊至 32 bytes 倍數
 *   AES-256-CBC，key = Base64(aesKey+"=")，iv = key[0:16]
 *   輸出 = Base64(ciphertext)
 *
 * 簽名：
 *   SHA256([token, timestamp, nonce, encryptedBody].sort().join(""))
 */

import crypto from "crypto"

// ── helpers ──────────────────────────────────────────────

function aesKeyBuf(aesKey43: string): Buffer {
  // 43 chars + "=" → valid base64 → 32 bytes (AES-256)
  return Buffer.from(aesKey43 + "=", "base64")
}

function pkcs7Pad(data: Buffer, blockSize = 32): Buffer {
  const pad = blockSize - (data.length % blockSize)
  return Buffer.concat([data, Buffer.alloc(pad, pad)])
}

function pkcs7Unpad(data: Buffer): Buffer {
  const pad = data[data.length - 1]
  if (pad < 1 || pad > 32) return data
  return data.subarray(0, data.length - pad)
}

function pack4(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}

function randomStr(len = 16): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  return Array.from(
    { length: len },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("")
}

// ── public API ────────────────────────────────────────────

/**
 * 加密請求 body（plaintext JSON string → base64 ciphertext）
 * @param plaintext  JSON 字串
 * @param aesKey43   43 字元 AES Key（環境變數 SF_IUOP_AES_KEY）
 * @param appKey     APP Key（用作 appId 填充）
 */
export function sfEncrypt(
  plaintext: string,
  aesKey43: string,
  appKey: string
): string {
  const key = aesKeyBuf(aesKey43)
  const iv = key.subarray(0, 16)

  const random = Buffer.from(randomStr(16), "utf8")
  const text = Buffer.from(plaintext, "utf8")
  const appKeyBuf = Buffer.from(appKey, "utf8")

  // format: random16 + pack4(textLen) + text + appKey
  const assembled = Buffer.concat([random, pack4(text.length), text, appKeyBuf])
  const padded = pkcs7Pad(assembled, 32)

  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv)
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString(
    "base64"
  )
}

/**
 * 解密響應 body（base64 ciphertext → JSON 字串）
 * @param encrypted  Base64 密文
 * @param aesKey43   43 字元 AES Key
 * @param appKey     APP Key（用於校驗尾部）
 */
export function sfDecrypt(
  encrypted: string,
  aesKey43: string,
  appKey: string
): string {
  const key = aesKeyBuf(aesKey43)
  const iv = key.subarray(0, 16)

  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv)
  decipher.setAutoPadding(false)
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ])

  const unpadded = pkcs7Unpad(dec)
  // strip random(16) + pack4(4)
  const textLen = unpadded.readUInt32BE(16)
  const content = unpadded.subarray(20, 20 + textLen).toString("utf8")

  // strip trailing appKey if present
  return content.endsWith(appKey) ? content.slice(0, -appKey.length) : content
}

/**
 * 計算請求簽名
 * SHA256([token, timestamp, nonce, encryptedBody].sort().join(""))
 */
export function sfBuildSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encryptedBody: string
): string {
  const parts = [token, timestamp, nonce, encryptedBody].sort()
  return crypto.createHash("sha256").update(parts.join("")).digest("hex")
}
