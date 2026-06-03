/**
 * 將 Medusa 訂單資料轉換為 IUOP_CREATE_ORDER 請求 Body
 *
 * 沙盒測試用 interProductCode: INT0014
 * 台灣宅配產品碼待向順豐確認後，更新 SF_IUOP_INTER_PRODUCT_CODE
 */

import { assertSfIuopConfigured } from "./config"

type MedusaOrderLike = {
  id: string
  display_id?: number | string
  currency_code?: string
  items?: Array<{
    title?: string
    quantity?: number
    unit_price?: number
  }>
  shipping_address?: {
    first_name?: string
    last_name?: string
    phone?: string
    province?: string
    city?: string
    address_1?: string
    address_2?: string
    postal_code?: string
    company?: string
    country_code?: string
  }
}

export function buildIuopOrderId(order: MedusaOrderLike): string {
  const display = order.display_id ?? order.id.slice(-8)
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "")
  return `KESH-${date}-${display}`
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 32)
}

export function buildIuopCreateOrderPayload(
  order: MedusaOrderLike
): Record<string, unknown> {
  const cfg = assertSfIuopConfigured()
  const sAddr = order.shipping_address ?? {}

  const receiverName =
    `${sAddr.first_name ?? ""} ${sAddr.last_name ?? ""}`.trim() || "收件人"
  const receiverAddress = [sAddr.address_1, sAddr.address_2]
    .filter(Boolean)
    .join(" ")

  // 台灣手機號：去除非數字、去掉國碼 886，保留 09XXXXXXXX
  const rawPhone = (sAddr.phone ?? "").replace(/\D/g, "")
  const receiverPhone =
    rawPhone.startsWith("886") ? rawPhone.slice(3) : rawPhone || "0900000000"

  // 寄件人電話（去 0 前綴供 phoneAreaCode 分離）
  const senderRawPhone = cfg.sender.tel.replace(/\D/g, "")
  const senderPhone = senderRawPhone.startsWith("886")
    ? senderRawPhone.slice(3)
    : senderRawPhone.startsWith("0")
    ? senderRawPhone.slice(1)
    : senderRawPhone

  // 貨物描述
  const goodsName =
    order.items?.map((i) => i.title).filter(Boolean).join("、") ?? "精品商品"

  // 申報價值（單位：元，最小 1）
  const totalValue = Math.max(
    1,
    Math.round(
      (order.items ?? []).reduce(
        (sum, i) => sum + (i.unit_price ?? 0) * (i.quantity ?? 1),
        0
      ) / 100
    )
  )
  const currency = (order.currency_code ?? "TWD").toUpperCase()

  // 收件人國碼：預設 TW，可由 country_code 欄位覆蓋
  const receiverCountry = (sAddr.country_code ?? "TW").toUpperCase()

  return {
    customerCode: cfg.customerCode,
    orderOperateType: "1",         // 1 = 建立
    sfWaybillNo: "",
    version: "",
    customerOrderNo: buildIuopOrderId(order),

    interProductCode: cfg.interProductCode,

    paymentInfo: {
      payMethod: "1",              // 1 = 月結
      payMonthCard: cfg.monthlyCard,
      taxPayMethod: "2",           // 2 = 收件方付稅
      taxPayMonthCard: "",
    },

    // ── 包裹資訊 ──────────────────────────────────────────
    parcelQuantity: 1,
    parcelTotalWeight: 0.5,        // 預設 0.5 KG，後台可調整
    parcelWeightUnit: "KG",
    parcelVolumeUnit: "CM",
    parcelTotalLength: "20",
    parcelTotalWidth: "15",
    parcelTotalHeight: "10",

    pickupType: "0",               // 0 = 上門取件
    pickupAppointTime: "",
    pickupAppointTimeZone: "",
    remark: `Medusa #${order.display_id ?? order.id}`,

    // ── 寄件人 ─────────────────────────────────────────
    senderInfo: {
      country: "TW",
      cargoType: 1,
      company: cfg.sender.company,
      contact: cfg.sender.contact,
      phoneAreaCode: "886",
      phoneNo: senderPhone,
      address: cfg.sender.address,
      postCode: cfg.sender.postCode,
      regionFirst: cfg.sender.city || cfg.sender.province,
      regionSecond: "",
      regionThird: "",
      email: "",
      certType: "001",
      certCardNo: "",
      eori: "",
      vat: "",
    },

    // ── 收件人 ─────────────────────────────────────────
    receiverInfo: {
      country: receiverCountry,
      cargoType: 1,
      company: sAddr.company ?? "",
      contact: receiverName,
      phoneAreaCode: receiverCountry === "TW" ? "886" : "886",
      phoneNo: receiverPhone,
      address: receiverAddress || sAddr.address_1 || "",
      postCode: sAddr.postal_code ?? "",
      regionFirst: sAddr.province ?? "",
      regionSecond: sAddr.city ?? "",
      regionThird: "",
      email: "",
      certType: "001",
      certCardNo: "",
      eori: "",
      vat: "",
    },

    // ── 貨品清單 ──────────────────────────────────────
    parcelInfoList: [
      {
        name: goodsName.slice(0, 50),
        quantity: order.items?.reduce((s, i) => s + (i.quantity ?? 1), 0) ?? 1,
        amount: totalValue,
        currency,
        unit: "個",
        originCountry: "TW",
        brand: "",
        goodsCode: "",
        goodsDesc: "",
        goodsUrl: "",
        hsCode: "",
        productCustomsNo: "",
        productRecordNo: "",
        stateBarCode: "",
      },
    ],

    declaredCurrency: currency,
    declaredValue: totalValue,

    // 清關（預留空白，可依需要填）
    customsInfo: {
      aesNo: "",
      businessRemark: "",
      customsBatch: "",
      harmonizedCode: "",
      senderReasonContent: "",
      tradeCondition: "",
    },
    orderExtendInfo: {
      isSelfPick: "",
      isSignBack: "",
      signBackWaybillNo: "",
    },
  }
}

export function phoneLast4(phone?: string): string | undefined {
  if (!phone) return undefined
  const digits = phone.replace(/\D/g, "")
  return digits.length >= 4 ? digits.slice(-4) : undefined
}
