/**
 * 建立一筆「已付款」測試訂單（台灣收件地址），供 Admin 手動建立順豐運單測試。
 *
 * 用法：
 *   node scripts/create-paid-test-order.mjs
 *   BACKEND_URL=https://kesh-backend-production.up.railway.app node scripts/create-paid-test-order.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, "..", ".env")

function loadEnv() {
  if (!fs.existsSync(envPath)) return {}
  const text = fs.readFileSync(envPath, "utf8")
  const out = {}
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

const env = loadEnv()
const BACKEND =
  process.env.BACKEND_URL ||
  "https://kesh-backend-production.up.railway.app"
const PUB_KEY = process.env.MEDUSA_PUBLISHABLE_KEY || env.MEDUSA_PUBLISHABLE_KEY
const ADMIN_KEY = process.env.MEDUSA_ADMIN_API_KEY || env.MEDUSA_ADMIN_API_KEY

if (!PUB_KEY || !ADMIN_KEY) {
  console.error("缺少 MEDUSA_PUBLISHABLE_KEY 或 MEDUSA_ADMIN_API_KEY（.env）")
  process.exit(1)
}

const storeHeaders = {
  "Content-Type": "application/json",
  "x-publishable-api-key": PUB_KEY,
}

const adminHeaders = {
  "Content-Type": "application/json",
  Authorization: `Basic ${Buffer.from(`${ADMIN_KEY}:`).toString("base64")}`,
}

async function store(pathname, { method = "GET", body, extraHeaders = {} } = {}) {
  const res = await fetch(`${BACKEND}${pathname}`, {
    method,
    headers: { ...storeHeaders, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      `[store] ${method} ${pathname} → ${res.status}: ${JSON.stringify(data)}`
    )
  }
  return data
}

async function admin(pathname, { method = "GET", body } = {}) {
  const res = await fetch(`${BACKEND}${pathname}`, {
    method,
    headers: adminHeaders,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      `[admin] ${method} ${pathname} → ${res.status}: ${JSON.stringify(data)}`
    )
  }
  return data
}

async function main() {
  console.log(`\n🛒 建立測試訂單 → ${BACKEND}\n`)

  const { regions } = await store("/store/regions")
  const twRegion =
    regions.find((r) => r.countries?.some((c) => c.iso_2 === "tw")) ||
    regions[0]
  if (!twRegion) throw new Error("找不到 region")

  const { products } = await store(
    "/store/products?limit=20&fields=id,title,*variants"
  )
  const product = products.find((p) => p.variants?.length)
  if (!product) throw new Error("找不到可售商品")
  const variant = product.variants[0]

  const testEmail = `sf-test+${Date.now()}@kesh-de1.com`
  const shippingAddress = {
    first_name: "測試",
    last_name: "收件人",
    phone: "0912345678",
    province: "台北市",
    city: "大安區",
    address_1: "忠孝東路四段1號",
    postal_code: "106",
    country_code: "tw",
  }

  const { cart } = await store("/store/carts", {
    method: "POST",
    body: {
      region_id: twRegion.id,
      email: testEmail,
      metadata: {
        payment_method: "TEST",
        remark: "SF 順豐物流測試訂單（可刪除）",
      },
      shipping_address: shippingAddress,
    },
  })

  await store(`/store/carts/${cart.id}/line-items`, {
    method: "POST",
    body: { variant_id: variant.id, quantity: 1 },
  })

  const { shipping_options } = await store(
    `/store/shipping-options?cart_id=${cart.id}`
  )
  if (!shipping_options?.length) {
    throw new Error("此購物車沒有可用的 shipping option")
  }
  await store(`/store/carts/${cart.id}/shipping-methods`, {
    method: "POST",
    body: { option_id: shipping_options[0].id },
  })

  const { payment_collection } = await store("/store/payment-collections", {
    method: "POST",
    body: { cart_id: cart.id },
  })

  const providerId =
    twRegion.payment_providers?.[0] ||
    "pp_system_default"

  await store(
    `/store/payment-collections/${payment_collection.id}/payment-sessions`,
    {
      method: "POST",
      body: { provider_id: providerId },
    }
  )

  let complete
  try {
    complete = await store(`/store/carts/${cart.id}/complete`, {
      method: "POST",
      extraHeaders: { "Idempotency-Key": `test_${cart.id}_${Date.now()}` },
    })
  } catch (err) {
    if (!String(err.message).includes("409")) throw err
    const found = await store(`/store/orders?cart_id=${cart.id}`)
    if (!found.orders?.length) throw err
    complete = { type: "order", order: found.orders[0] }
  }

  if (complete.type !== "order" || !complete.order?.id) {
    throw new Error(`complete 未回傳 order: ${JSON.stringify(complete)}`)
  }

  const order = complete.order
  let paymentStatus = order.payment_status

  if (paymentStatus !== "captured") {
    const payColId =
      order.payment_collections?.[0]?.id || payment_collection.id
    try {
      await admin(
        `/admin/payment-collections/${payColId}/mark-as-paid`,
        {
          method: "POST",
          body: { order_id: order.id },
        }
      )
      paymentStatus = "captured"
    } catch (err) {
      const paymentId = order.payments?.[0]?.id
      if (paymentId) {
        await admin(`/admin/payments/${paymentId}/capture`, {
          method: "POST",
        })
        paymentStatus = "captured"
      } else {
        throw err
      }
    }
  }

  const adminOrder = await admin(`/admin/orders/${order.id}?fields=*shipping_address,*metadata,display_id,payment_status`)

  console.log("✅ 測試訂單建立成功\n")
  console.log(`  訂單 ID:     ${order.id}`)
  console.log(`  訂單編號:    #${adminOrder.order?.display_id ?? order.display_id}`)
  console.log(`  付款狀態:    ${paymentStatus}`)
  console.log(`  商品:        ${product.title}`)
  console.log(`  收件人:      ${shippingAddress.first_name}${shippingAddress.last_name}`)
  console.log(`  電話:        ${shippingAddress.phone}`)
  console.log(`  地址:        ${shippingAddress.province}${shippingAddress.city}${shippingAddress.address_1}`)
  console.log(`\n👉 Admin 後台 → 訂單 #${adminOrder.order?.display_id ?? order.display_id} → 順豐速運 → 建立運單\n`)
}

main().catch((err) => {
  console.error("\n❌ 失敗:", err.message)
  process.exit(1)
})
