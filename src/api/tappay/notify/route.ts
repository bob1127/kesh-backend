import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Resend } from 'resend';

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const tappayData = req.body as any;
  
  console.log("\n========================================");
  console.log("🔔 [Webhook] 收到 TapPay 通知:", tappayData.order_number);
  console.log("========================================\n");

  if (tappayData.status !== 0) {
      console.log(`⚠️ 交易狀態非 0 (目前狀態: ${tappayData.status})，略過處理。`);
      return res.status(200).send("OK");
  }

  const cartId = tappayData.order_number;
  try {
    const backendUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";
    const pubKey = process.env.MEDUSA_PUBLISHABLE_KEY || "";

    console.log("⏳ 等待 4 秒確保 Medusa 狀態同步...");
    await new Promise(resolve => setTimeout(resolve, 4000));

    const query = (req as any).scope.resolve("query") as any;
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: ["id", "order.id", "order.display_id", "order.total", "order.email", "order.payment_status", "order.created_at", "order.shipping_address.*", "order.items.*", "order.metadata", "order.payment_collections.payment_sessions.id"],
      filters: { id: [cartId] } as any
    });

    const order = carts?.[0]?.order;
    if (!order) return res.status(200).send("No Order Found");

    // 🛡️ 冪等性檢查
    if (order.payment_status === "captured") {
      console.log(`✅ 訂單 ${order.id} 先前已處理完成，跳過後續動作。`);
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

    // B. 開立發票
    const sAddr = order.shipping_address || {};
    const buyerName = `${sAddr.first_name || ""} ${sAddr.last_name === "Customer" ? "" : (sAddr.last_name || "")}`.trim() || "顧客";
    
    let invoiceNumber = "";
    const invoiceRes = await fetch(`${backendUrl}/store/custom/invoice`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json", "x-publishable-api-key": pubKey },
      body: JSON.stringify({
        orderId: order.id, amount: order.total, email: order.email, buyerName: buyerName,
        items: order.items?.map((i: any) => ({ name: i.title, price: i.unit_price, quantity: i.quantity })) || []
      })
    });
    
    if (invoiceRes.ok) {
      const invData = await invoiceRes.json();
      invoiceNumber = invData?.data?.invoice_number || "";
      console.log(`✅ 發票開立成功: ${invoiceNumber}`);
    }

    // C. 寄送升級版精品郵件
    if (order.email) {
      console.log(`📧 準備寄送完整訂單確認信給: ${order.email}...`);
      
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const resend = new Resend(resendKey);
        const senderEmail = process.env.SENDER_EMAIL || 'onboarding@resend.dev'; 
        
        // 🔥 修正金額：Medusa V2 台幣直接存準確數字，不需除以 100
        const realTotal = Math.round(order.total || 0).toLocaleString();
        const orderDisplayId = order.display_id || order.id;
        const orderDate = new Date().toLocaleDateString("zh-TW", { year: 'numeric', month: 'long', day: 'numeric' });
        
        // 萃取物流與付款資訊
        const addressStr = [sAddr.postal_code, sAddr.province, sAddr.city, sAddr.address_1].filter(Boolean).join(" ") || "—";
        const storeName = sAddr.company ? `(${sAddr.company})` : "";
        const paymentMethod = order.metadata?.payment_method === "ATM" ? "ATM 轉帳 (已付清)" : "線上刷卡";

        const emailHtml = `
          <div style="max-width: 600px; margin: 0 auto; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; padding: 40px 20px;">
            
            <div style="text-align: center; margin-bottom: 40px;">
              <img src="https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=60&fit=crop&q=80" alt="KÉSH de¹" style="max-width: 120px; height: auto; margin-bottom: 10px;" />
              <h1 style="font-size: 20px; font-weight: 300; letter-spacing: 4px; text-transform: uppercase; margin: 0;">KÉSH de¹</h1>
            </div>
            
            <p style="font-size: 15px; margin-bottom: 20px;">親愛的 ${buyerName}，您好：</p>
            <p style="font-size: 14px; color: #4b5563; margin-bottom: 40px; line-height: 1.8;">
              感謝您的訂購！我們已成功收到您的款項。我們將盡快為您安排出貨。<br>
              ${invoiceNumber ? `您的電子發票已開立 (發票號碼: <strong>${invoiceNumber}</strong>)。` : ""}
            </p>
            
            <div style="margin-bottom: 40px; font-size: 13px; line-height: 2; color: #374151;">
              <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 15px; margin-bottom: 15px;">
                <p style="margin: 0;"><strong>訂單編號：</strong> #${orderDisplayId}</p>
                <p style="margin: 0;"><strong>訂購日期：</strong> ${orderDate}</p>
                <p style="margin: 0;"><strong>付款方式：</strong> ${paymentMethod}</p>
              </div>
              <div>
                <p style="margin: 0;"><strong>收件人：</strong> ${buyerName}</p>
                <p style="margin: 0;"><strong>聯絡電話：</strong> ${sAddr.phone || "—"}</p>
                <p style="margin: 0;"><strong>收件地址：</strong> ${addressStr} ${storeName}</p>
              </div>
            </div>

            <div style="background-color: #f9fafb; padding: 30px; border: 1px solid #f3f4f6; margin-bottom: 40px;">
              <h2 style="font-size: 11px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; color: #9ca3af; margin-bottom: 20px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px;">Order Summary</h2>
              
              ${order.items.map((item: any) => `
                <div style="margin-bottom: 12px; display: flex; justify-content: space-between; font-size: 13px; color: #374151;">
                  <span style="padding-right: 20px;">${item.title} x ${item.quantity}</span>
                  <span style="white-space: nowrap;">NT$ ${Math.round(item.total).toLocaleString()}</span>
                </div>
              `).join("")}
              
              <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; color: #111827;">
                <span style="letter-spacing: 1px; text-transform: uppercase;">Total</span>
                <span>NT$ ${realTotal}</span>
              </div>
            </div>
            
            <div style="text-align: center;">
              <a href="${process.env.NEXT_PUBLIC_STORE_URL || 'http://localhost:3000'}/member" style="display: inline-block; background-color: #000; color: #fff; text-decoration: none; padding: 14px 32px; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: bold;">查看訂單詳情</a>
            </div>
            
            <p style="font-size: 11px; color: #9ca3af; letter-spacing: 1px; text-align: center; margin-top: 40px;">此為系統自動發送的郵件，請勿直接回覆。<br/>© ${new Date().getFullYear()} KÉSH de¹</p>
          </div>
        `;

        try {
          await resend.emails.send({
            from: `KÉSH de¹ <${senderEmail}>`,
            to: order.email, 
            subject: `KÉSH de¹ 訂單付款成功確認 (#${orderDisplayId})`,
            html: emailHtml
          });
          console.log("✅ [信件系統] 完整訂單通知信寄送成功！");
        } catch (mailError) {
          console.error("❌ [信件系統] Resend 寄信失敗:", mailError);
        }
      }
    }

    return res.status(200).send("OK");
  } catch (error: any) {
    console.error("🔥 Webhook 異常:", error);
    return res.status(200).send("Error logged");
  }
}