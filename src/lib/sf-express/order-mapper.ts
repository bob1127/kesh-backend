import { assertSfApiConfigured } from "./config"

type MedusaOrderLike = {
  id: string
  display_id?: number | string
  items?: Array<{ title?: string; quantity?: number }>
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
  }
  metadata?: Record<string, unknown>
}

export function buildSfOrderId(order: MedusaOrderLike): string {
  const display = order.display_id ?? order.id.slice(-8)
  const date = new Date()
    .toISOString()
    .slice(2, 10)
    .replace(/-/g, "")
  return `KESH${date}${display}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)
}

export function buildSfCreateOrderPayload(order: MedusaOrderLike) {
  const cfg = assertSfApiConfigured()
  const sAddr = order.shipping_address || {}
  const receiverName =
    `${sAddr.first_name || ""} ${sAddr.last_name || ""}`.trim() || "收件人"
  const receiverAddress = [sAddr.address_1, sAddr.address_2]
    .filter(Boolean)
    .join(" ")
  const cargoName =
    order.items?.map((i) => i.title).filter(Boolean).join("、") || "精品商品"

  return {
    language: "zh-TW",
    orderId: buildSfOrderId(order),
    cargoDetails: [{ name: cargoName.slice(0, 100) }],
    cargoDesc: "精品",
    contactInfoList: [
      {
        contactType: 1,
        company: cfg.sender.company,
        contact: cfg.sender.contact,
        tel: cfg.sender.tel,
        province: cfg.sender.province,
        city: cfg.sender.city,
        address: cfg.sender.address,
        postCode: cfg.sender.postCode,
      },
      {
        contactType: 2,
        company: sAddr.company || "",
        contact: receiverName,
        tel: (sAddr.phone || "").replace(/\D/g, "").slice(-10) || "0900000000",
        province: sAddr.province || "台灣",
        city: sAddr.city || "",
        address: receiverAddress || sAddr.address_1 || "",
        postCode: sAddr.postal_code || "",
      },
    ],
    monthlyCard: cfg.monthlyCard,
    payMethod: 1,
    expressTypeId: cfg.expressTypeId,
    parcelQty: 1,
    isDocall: 1,
    remark: `Medusa #${order.display_id ?? order.id}`,
  }
}

export function phoneLast4(phone?: string): string | undefined {
  if (!phone) return undefined
  const digits = phone.replace(/\D/g, "")
  return digits.length >= 4 ? digits.slice(-4) : undefined
}
