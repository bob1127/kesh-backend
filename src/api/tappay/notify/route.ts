import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import nodemailer from "nodemailer";

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
// C. 寄送郵件 (強制 IPv4)
    if (order.email) {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          type: "OAuth2",
          user: process.env.SMTP_USER,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        },
        // 🚀 終極解決方案：強制優先使用 IPv4
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
        family: 4 
      } as any); // 👈 就是這裡！加上 "as any" 讓 TypeScript 閉嘴

      await transporter.sendMail({
        from: `"KESH" <${process.env.SMTP_USER}>`,
        to: order.email,
        subject: "訂單確認通知",
        html: `<div style="padding:20px;"><h1>KESH 訂單確認</h1><p>感謝您的訂購！總計：NT$ ${order.total}</p></div>`
      });
      console.log("📧 郵件寄送成功！");
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("🔥 Webhook 異常:", error);
    return res.status(200).send("Error logged");
  }
}