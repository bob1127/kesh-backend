export type SfExpressEnv = "sandbox" | "production"

function senderFromEnv() {
  return {
    company: process.env.SF_SENDER_COMPANY || "KÉSH de¹",
    contact: process.env.SF_SENDER_NAME || "",
    tel: process.env.SF_SENDER_PHONE || "",
    province: process.env.SF_SENDER_PROVINCE || "台灣",
    city: process.env.SF_SENDER_CITY || "",
    address: process.env.SF_SENDER_ADDRESS || "",
    postCode: process.env.SF_SENDER_POSTAL_CODE || "",
    certType: process.env.SF_SENDER_CERT_TYPE || "001",
    certCardNo: process.env.SF_SENDER_CERT_CARD_NO || "",
  }
}

// ── 舊版丰橋 API（EXP_RECE_*）────────────────────────────────
export function getSfConfig() {
  const env = (process.env.SF_API_ENV || "sandbox") as SfExpressEnv
  const isSandbox = env !== "production"

  return {
    env,
    isSandbox,
    partnerId: process.env.SF_API_PARTNER_ID || "",
    checkWord: process.env.SF_API_CHECKWORD || "",
    monthlyCard: process.env.SF_API_MONTHLY_CARD || "",
    routeSignKey: process.env.SF_ROUTE_SIGN_KEY || "",
    apiUrl: isSandbox
      ? "https://sfapi-sbox.sf-express.com/std/service"
      : "https://sfapi.sf-express.com/std/service",
    sender: senderFromEnv(),
    expressTypeId: Number(process.env.SF_EXPRESS_TYPE_ID || "1"),
    webhookResponseMode:
      (process.env.SF_WEBHOOK_RESPONSE_MODE as "json" | "xml" | "text") ||
      "json",
  }
}

// ── IUOP Open API（下單 / 查單）────────────────────────────────
export function getSfIuopConfig() {
  const env = (process.env.SF_API_ENV || "sandbox") as SfExpressEnv
  const isSandbox = env !== "production"

  const dispatchUrl =
    process.env.SF_IUOP_API_URL ||
    (isSandbox
      ? "http://api-ifsp-sit.sf.global/openapi/api/dispatch"
      : "https://api-ifsp.sf.global/openapi/api/dispatch")

  // token endpoint: replace /dispatch with /token
  const tokenUrl = dispatchUrl.replace(/\/dispatch$/, "/token")

  return {
    isSandbox,
    dispatchUrl,
    tokenUrl,
    appKey: process.env.SF_IUOP_APP_KEY || "",
    appSecret: process.env.SF_IUOP_APP_SECRET || "",
    aesKey: process.env.SF_IUOP_AES_KEY || "",
    customerCode: process.env.SF_IUOP_CUSTOMER_CODE || "",
    monthlyCard: process.env.SF_API_MONTHLY_CARD || "",
    interProductCode: process.env.SF_IUOP_INTER_PRODUCT_CODE || "INT0005",
    sender: senderFromEnv(),
  }
}

export function assertSfApiConfigured() {
  const cfg = getSfConfig()
  if (!cfg.partnerId || !cfg.checkWord) {
    throw new Error(
      "順豐丰橋 API 尚未設定：請設定 SF_API_PARTNER_ID 與 SF_API_CHECKWORD"
    )
  }
  if (!cfg.sender.contact || !cfg.sender.tel || !cfg.sender.address) {
    throw new Error(
      "順豐寄件人資訊尚未設定：請設定 SF_SENDER_NAME、SF_SENDER_PHONE、SF_SENDER_ADDRESS"
    )
  }
  return cfg
}

export function assertSfIuopConfigured() {
  const cfg = getSfIuopConfig()
  if (!cfg.appKey || !cfg.appSecret || !cfg.aesKey) {
    throw new Error(
      "順豐 IUOP 憑證尚未設定：請設定 SF_IUOP_APP_KEY、SF_IUOP_APP_SECRET、SF_IUOP_AES_KEY"
    )
  }
  if (!cfg.customerCode) {
    throw new Error("SF_IUOP_CUSTOMER_CODE 尚未設定")
  }
  if (!cfg.sender.contact || !cfg.sender.tel || !cfg.sender.address) {
    throw new Error(
      "順豐寄件人資訊尚未設定：請設定 SF_SENDER_NAME、SF_SENDER_PHONE、SF_SENDER_ADDRESS"
    )
  }
  if (cfg.interProductCode === "INT0005" && !cfg.sender.certCardNo) {
    throw new Error(
      "台灣國內件 (INT0005) 需填寄件方證件：請設定 SF_SENDER_CERT_CARD_NO（身份證／護照／居留證號碼）"
    )
  }
  return cfg
}
