/**
 * 將 Medusa 訂單資料轉換為 IUOP_CREATE_ORDER 請求 Body
 *
 * 台灣國內宅配：interProductCode INT0005（順豐確認）
 */

import { assertSfIuopConfigured } from "./config"
import { resolveTwPostalCode } from "../tw-postal-code"

function isDomesticTwShipment(
  interProductCode: string,
  receiverCountry: string
): boolean {
  return interProductCode === "INT0005" && receiverCountry === "TW"
}

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

  if (cfg.interProductCode === "INT0005" && receiverCountry !== "TW") {
    throw new Error(
      `INT0005 僅適用台灣國內件 (TW→TW)，此訂單收件國家為 ${receiverCountry}`
    )
  }

  const domesticTw = isDomesticTwShipment(cfg.interProductCode, receiverCountry)

  const receiverPostCode = resolveTwPostalCode({
    postal_code: sAddr.postal_code,
    province: sAddr.province,
    city: sAddr.city,
    country_code: sAddr.country_code,
  })

  if (domesticTw && !receiverPostCode) {
    throw new Error(
      `收件地址缺少郵遞區號（順豐錯誤 124039）。請確認訂單有「縣市 + 區域」，或補上 postal_code。` +
        ` 目前：${sAddr.province ?? "—"} / ${sAddr.city ?? "—"}`
    )
  }

  const paymentInfo: Record<string, string> = {
    payMethod: "1",
    payMonthCard: cfg.monthlyCard,
  }
  if (!domesticTw) {
    paymentInfo.taxPayMethod = "1"
    paymentInfo.taxPayMonthCard = cfg.monthlyCard
  }

  const payload: Record<string, unknown> = {
    customerCode: cfg.customerCode,
    orderOperateType: "1",
    sfWaybillNo: "",
    version: "",
    customerOrderNo: buildIuopOrderId(order),

    interProductCode: cfg.interProductCode,

    paymentInfo,

    // ── 包裹資訊 ──────────────────────────────────────────
    parcelQuantity: 1,
    parcelTotalWeight: 0.5,        // 預設 0.5 KG，後台可調整
    parcelWeightUnit: "KG",
    parcelVolumeUnit: "CM",
    parcelTotalLength: "20",
    parcelTotalWidth: "15",
    parcelTotalHeight: "10",

    pickupType: "1",               // 1 = 上門收件；0 = 自行前往服務點寄遞
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
      certType: cfg.sender.certType,
      certCardNo: cfg.sender.certCardNo,
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
      postCode: receiverPostCode ?? sAddr.postal_code ?? "",
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

    orderExtendInfo: {
      isSelfPick: "",
      isSignBack: "",
      signBackWaybillNo: "",
    },
  }

  if (!domesticTw) {
    payload.customsInfo = {
      aesNo: "",
      businessRemark: "",
      customsBatch: "",
      harmonizedCode: "",
      senderReasonContent: "",
      tradeCondition: "",
    }
  }

  return payload
}

export function phoneLast4(phone?: string): string | undefined {
  if (!phone) return undefined
  const digits = phone.replace(/\D/g, "")
  return digits.length >= 4 ? digits.slice(-4) : undefined
}
