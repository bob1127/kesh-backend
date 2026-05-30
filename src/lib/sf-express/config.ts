export type SfExpressEnv = "sandbox" | "production"

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
    sender: {
      company: process.env.SF_SENDER_COMPANY || "KÉSH de¹",
      contact: process.env.SF_SENDER_NAME || "",
      tel: process.env.SF_SENDER_PHONE || "",
      province: process.env.SF_SENDER_PROVINCE || "台灣",
      city: process.env.SF_SENDER_CITY || "",
      address: process.env.SF_SENDER_ADDRESS || "",
      postCode: process.env.SF_SENDER_POSTAL_CODE || "",
    },
    expressTypeId: Number(process.env.SF_EXPRESS_TYPE_ID || "1"),
    webhookResponseMode:
      (process.env.SF_WEBHOOK_RESPONSE_MODE as "json" | "xml" | "text") ||
      "json",
  }
}

export function assertSfApiConfigured() {
  const cfg = getSfConfig()
  if (!cfg.partnerId || !cfg.checkWord) {
    throw new Error(
      "順豐 API 尚未設定：請在後端環境變數加入 SF_API_PARTNER_ID 與 SF_API_CHECKWORD（IUOP 後台 API 授權取得）"
    )
  }
  if (!cfg.sender.contact || !cfg.sender.tel || !cfg.sender.address) {
    throw new Error(
      "順豐寄件人資訊尚未設定：請設定 SF_SENDER_NAME、SF_SENDER_PHONE、SF_SENDER_ADDRESS"
    )
  }
  return cfg
}
