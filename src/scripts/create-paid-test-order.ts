import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  addShippingMethodToCartWorkflow,
  addToCartWorkflow,
  completeCartWorkflow,
  createCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  listShippingOptionsForCartWithPricingWorkflow,
} from "@medusajs/medusa/core-flows"
import { markPaymentCollectionAsPaid } from "@medusajs/core-flows"

export default async function createPaidTestOrder({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "countries.iso_2", "payment_providers.id"],
  })

  const twRegion =
    regions.find((r: any) =>
      r.countries?.some((c: any) => c.iso_2 === "tw")
    ) || regions[0]

  if (!twRegion) throw new Error("找不到 region")

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "product.title", "product.status"],
    filters: { product: { status: "published" } } as any,
  })

  const variant = variants[0]
  if (!variant) throw new Error("找不到已上架商品 variant")

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

  const email = `sf-test+${Date.now()}@kesh-de1.com`

  const { result: cart } = await createCartWorkflow(container).run({
    input: {
      region_id: twRegion.id,
      email,
      metadata: {
        payment_method: "TEST",
        remark: "SF 順豐物流測試訂單（可刪除）",
      },
      shipping_address: shippingAddress,
    },
  })

  await addToCartWorkflow(container).run({
    input: {
      cart_id: cart.id,
      items: [{ variant_id: variant.id, quantity: 1 }],
    },
  })

  const { result: shippingOptions } =
    await listShippingOptionsForCartWithPricingWorkflow(container).run({
      input: { cart_id: cart.id },
    })

  if (!shippingOptions?.length) {
    throw new Error("找不到 shipping option")
  }

  await addShippingMethodToCartWorkflow(container).run({
    input: {
      cart_id: cart.id,
      options: [{ id: shippingOptions[0].id }],
    },
  })

  const { result: paymentCollection } =
    await createPaymentCollectionForCartWorkflow(container).run({
      input: { cart_id: cart.id },
    })

  const providerId =
    twRegion.payment_providers?.[0]?.id || "pp_system_default"

  await createPaymentSessionsWorkflow(container).run({
    input: {
      payment_collection_id: paymentCollection.id,
      provider_id: providerId,
    },
  })

  const { result: orderId } = await completeCartWorkflow(container).run({
    input: { id: cart.id },
  })

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "payment_status",
      "payment_collections.id",
    ],
    filters: { id: orderId },
  })

  const order = orders[0]
  const payColId = order?.payment_collections?.[0]?.id

  if (order?.payment_status !== "captured" && payColId) {
    await markPaymentCollectionAsPaid(container).run({
      input: {
        order_id: order.id,
        payment_collection_id: payColId,
      },
    })
  }

  logger.info("========================================")
  logger.info("✅ 測試訂單建立成功")
  logger.info(`訂單 ID:  ${order.id}`)
  logger.info(`訂單編號: #${order.display_id}`)
  logger.info(`商品:    ${(variant as any).product?.title || variant.title}`)
  logger.info(`收件人:  ${shippingAddress.first_name}${shippingAddress.last_name}`)
  logger.info(`電話:    ${shippingAddress.phone}`)
  logger.info(
    `地址:    ${shippingAddress.province}${shippingAddress.city}${shippingAddress.address_1}`
  )
  logger.info(
    `👉 Admin → 訂單 #${order.display_id} → 順豐速運 → 建立運單`
  )
  logger.info("========================================")
}
