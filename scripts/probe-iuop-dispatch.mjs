import crypto from "crypto"
import fs from "fs"

const env = fs.readFileSync(".env", "utf8")
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, "m"))
  return m ? m[1].trim() : ""
}

const appSecret = get("SF_IUOP_APP_SECRET")
const aesKey = get("SF_IUOP_AES_KEY")
const customerCode = get("SF_IUOP_CUSTOMER_CODE")
const appId = get("SF_IUOP_APP_ID")
const url = get("SF_IUOP_API_URL")

const business = { customerCode, sfWaybillNo: "SF3150003182274" }
const msgType = "IUOP_QUERY_ORDER"
const timestamp = String(Date.now())
const requestId = crypto.randomUUID().replace(/-/g, "")

function aesEncrypt(plain, keyStr, mode) {
  const keyBuf = Buffer.from(keyStr, "utf8")
  const k =
    keyBuf.length >= 32
      ? keyBuf.subarray(0, 32)
      : Buffer.concat([keyBuf, Buffer.alloc(32 - keyBuf.length)])
  const iv = Buffer.alloc(16, 0)
  const cipher = crypto.createCipheriv(mode, k, iv)
  return Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString(
    "base64"
  )
}

async function tryBody(body, label) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const t = await res.text()
  console.log("---", label, "status", res.status)
  console.log(t.slice(0, 500))
}

const plain = JSON.stringify(business)
const enc = aesEncrypt(plain, aesKey, "aes-256-cbc")

await tryBody({ msgType, ...business }, "raw business")
await tryBody(
  { appId, requestId, timestamp, msgType, msgData: plain },
  "wrapper plain"
)
await tryBody(
  { appId, requestId, timestamp, msgType, msgData: enc },
  "wrapper enc"
)
