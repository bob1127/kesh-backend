import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import nodemailer from "nodemailer";
import { Resend } from 'resend';
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const tappayData = req.body as any;
  
  console.log("\n========================================");
  console.log("🔔 [Webhook] 收到 TapPay 通知:", tappayData.order_number);
  console.log("========================================\n");

  if (tappayData.status !== 0) return res.status(200).send("OK");

  const cartId = tappayData.order_number;
  try {
    const backendUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";
    const pubKey = process.env.MEDUSA_PUBLISHABLE_KEY || "";

    console.log("⏳ 等待 4 秒確保 Medusa 狀態同步...");
    await new Promise(resolve => setTimeout(resolve, 4000));

    const query = (req as any).scope.resolve("query") as any;
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: ["id", "order.id", "order.total", "order.email", "order.payment_status", "order.shipping_address.*", "order.items.*", "order.payment_collections.payment_sessions.id"],
      filters: { id: [cartId] } as any
    });

    const order = carts?.[0]?.order;
    if (!order) return res.status(200).send("No Order Found");

    // 🛡️ 冪等性檢查：如果訂單已經是 Captured (已付款)，代表之前已經處理過了
    if (order.payment_status === "captured") {
      console.log(`✅ 訂單 ${order.id} 先前已處理完成，跳過後續動作 (防重複機制啟動)。`);
      return res.status(200).send("Already Processed");
    }

    // A. 執行授權與 Capture
    let sessionId = order.payment_collections?.[0]?.payment_sessions?.[0]?.id;
    if (sessionId) {
      const paymentModule = (req as any).scope.resolve("payment");
      const payment = await paymentModule.authorizePaymentSession(sessionId, {});
      if (payment?.id) {
        await paymentModule.capturePayment({ payment_id: payment.id, amount: order.total });
        console.log(`💰 訂單 ${order.id} 已完成 Capture。`);
      }
    }

    // B. 開立發票 (只有在 Capture 成功後執行一次)
    const invoiceRes = await fetch(`${backendUrl}/store/custom/invoice`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json", "x-publishable-api-key": pubKey },
      body: JSON.stringify({
        orderId: order.id, amount: order.total, email: order.email,
        buyerName: order.shipping_address?.first_name || "客人",
        items: order.items?.map((i: any) => ({ name: i.title, price: i.unit_price, quantity: i.quantity })) || []
      })
    });
    
    if (invoiceRes.ok) {
      const invData = await invoiceRes.json();
      console.log(`✅ 發票開立成功: ${invData?.data?.invoice_number}`);
    }
// C. 寄送郵件 (使用 Resend API，無視防火牆)
    if (order.email) {
      console.log(`📧 準備透過 Resend 寄送訂單確認信給: ${order.email}...`);
      
      const resend = new Resend(process.env.RESEND_API_KEY);

      try {
        await resend.emails.send({
          // ⚠️ 注意：在還沒綁定你的正式網域前，請先用 Resend 提供的測試信箱發送
          from: 'KESH <onboarding@resend.dev>', 
          to: order.email, // 這裡填客人的信箱 (目前就是你測試的 Gmail)
          subject: '訂單確認通知',
          html: `<div style="padding:20px; font-family: sans-serif;">
                   <h2>KESH 訂單確認</h2>
                   <p>感謝您的訂購！您的訂單已成功付款。</p>
                   <p style="color: #ef4444; font-weight: bold;">總計：NT$ ${order.total}</p>
                 </div>`
        });
        console.log("✅ [信件系統] Resend 郵件寄送大成功！");
      } catch (mailError) {
        console.error("❌ [信件系統] Resend 寄信失敗:", mailError);
      }
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("🔥 Webhook 異常:", error);
    return res.status(200).send("Error logged");
  }
}