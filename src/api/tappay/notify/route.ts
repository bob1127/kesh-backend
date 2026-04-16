import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import nodemailer from "nodemailer";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const tappayData = req.body as any;
  
  console.log("\n========================================");
  console.log("🔔 [Webhook] 收到 TapPay 通知:", JSON.stringify(tappayData, null, 2));
  console.log("========================================\n");

  if (tappayData.status !== 0) {
    console.log(`❌ 交易未成功 (狀態: ${tappayData.status})，不執行任何動作。`);
    return res.status(200).send("OK");
  }

  const cartId = tappayData.order_number;
  if (!cartId) {
      console.log("❌ 找不到 Cart ID (order_number)");
      return res.status(200).send("No Cart ID");
  }

  console.log(`✅ 交易大成功！準備處理 Cart: ${cartId} 的後續動作...`);

  try {
    const backendUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";
    // 💡 確保讀取到 Publishable Key
    const pubKey = process.env.MEDUSA_PUBLISHABLE_KEY || "";

    if (!pubKey) {
        console.warn("⚠️ 警告：環境變數缺少 MEDUSA_PUBLISHABLE_KEY，這會導致發票 API (400 錯誤) 被擋下！");
    }

    // ==========================================
    // ⏳ 等待 Medusa 背景完成訂單與 Session 建立
    // ==========================================
    console.log("⏳ 系統冷卻中... 等待 4 秒鐘，確保 Medusa 已經完整建立訂單...");
    await new Promise(resolve => setTimeout(resolve, 4000));

    // ==========================================
    // 動作 A：使用底層 Query 尋找訂單與 Payment Session
    // ==========================================
    console.log("🔍 正在使用底層 Query 引擎從 Cart 尋找關聯的 Order...");
    
    const query = (req as any).scope.resolve("query") as any;
    
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: [
        "id", 
        "order.id", 
        "order.total", 
        "order.email", 
        "order.display_id",
        "order.payment_status",
        "order.shipping_address.*", 
        "order.metadata", 
        "order.items.*", 
        "order.payment_collections.id",
        "order.payment_collections.payment_sessions.id" 
      ],
      filters: { id: [cartId] } as any
    });

    const order = (carts && carts.length > 0 && carts[0].order) ? carts[0].order : null;

    if (order) {
      console.log(`📦 成功找到關聯訂單: ${order.id}`);
      
      // 🕵️‍♂️ 挖出 Payment Session ID
      let sessionId = null;
      if (order.payment_collections && order.payment_collections.length > 0) {
          const collection = order.payment_collections[0];
          if (collection.payment_sessions && collection.payment_sessions.length > 0) {
              sessionId = collection.payment_sessions[0].id;
          }
      }
      
      if (sessionId) {
        // ==========================================
        // 動作 B：內部授權 Session 並執行 Capture
        // ==========================================
        try {
           const paymentModuleService = (req as any).scope.resolve("payment") as any;
           console.log(`💳 正在授權 Payment Session (${sessionId})...`);
           const payment = await paymentModuleService.authorizePaymentSession(sessionId, {});
           
           if (payment && payment.id) {
               console.log(`✅ 授權成功，產生 Payment ID: ${payment.id}，準備 Capture...`);
               await paymentModuleService.capturePayment({
                   payment_id: payment.id,
                   amount: order.total
               });
               console.log(`💰 成功將 Order ${order.id} 標記為 Captured (已付款)！後台狀態已同步更新。`);
           }
        } catch (capErr) {
           console.error(`❌ 授權/Capture 失敗 (底層錯誤):`, capErr);
        }
      } 
      
      // ==========================================
      // 動作 C：開立電子發票
      // ==========================================
      const invoicePayload = {
        orderId: order.id,
        amount: order.total,
        email: order.email,
        buyerName: order.shipping_address?.first_name || "客人",
        phone: order.shipping_address?.phone || "",
        taxId: order.metadata?.tax_id || "", 
        items: order.items?.map((item: any) => ({
          name: item.title,
          price: item.unit_price,
          quantity: item.quantity
        })) || []
      };

      console.log("🧾 準備打發票 API...");
      const invoiceRes = await fetch(`${backendUrl}/store/custom/invoice`, { 
        method: "POST", 
        headers: { 
            "Content-Type": "application/json",
            "x-publishable-api-key": pubKey // 👈 這裡會帶上 Key
        },
        body: JSON.stringify(invoicePayload)
      });

      if (!invoiceRes.ok) {
          console.error(`❌ 發票 API 失敗 (Status: ${invoiceRes.status})`);
      } else {
          const invoiceResultData = await invoiceRes.json();
          console.log(`✅ 發票開立指令已送出！發票號碼:`, invoiceResultData?.data?.invoice_number);
      }

      // ==========================================
      // 動作 D：發送訂單確認信 (Webhook 保底版)
      // ==========================================
      if (order.email) {
        console.log(`📧 準備寄送訂單確認信給: ${order.email}...`);
        
        const statusColor = "#10B981"; 
        const statusText = "已付款 (準備出貨)";
        const statusMessage = "感謝您的訂購! 我們已成功收到您的款項。我們將盡快為您安排出貨。";

        const itemsList: string[] = [];
        if (order.items && order.items.length > 0) {
          for (const item of order.items) {
            itemsList.push("<tr>");
            itemsList.push("<td style='padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: left;'>");
            itemsList.push("<b style='color: #374151;'>" + (item.title || "商品") + "</b><br>");
            itemsList.push("<span style='font-size: 12px; color: #6B7280;'>數量: " + (item.quantity || 1) + "</span>");
            itemsList.push("</td>");
            itemsList.push("<td style='padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: right; color: #374151;'>");
            itemsList.push("NT$ " + (item.unit_price || 0));
            itemsList.push("</td>");
            itemsList.push("</tr>");
          }
        }
        const itemsHtml = itemsList.join("");

        const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px;">
        <div style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
          <div style="background-color: #111827; padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">KESH</h1>
          </div>
          <div style="background-color: ${statusColor}; color: #ffffff; padding: 12px; text-align: center; font-weight: bold;">
            ${statusText}
          </div>
          <div style="padding: 30px;">
            <p>親愛的顧客您好,</p>
            <p style="line-height: 1.6; color: #4b5563;">${statusMessage}</p>
            <div style="margin-top: 30px; border-top: 2px solid #f3f4f6; padding-top: 20px;">
              <table style="width: 100%; border-collapse: collapse;">
                ${itemsHtml}
                <tr>
                  <td style="padding: 15px 12px; text-align: right; font-weight: bold;">總計金額</td>
                  <td style="padding: 15px 12px; text-align: right; font-weight: bold; color: #ef4444; font-size: 18px;">
                    NT$ ${order.total || 0}
                  </td>
                </tr>
              </table>
            </div>
          </div>
        </div>
      </div>`;

        try {
          const transporter = nodemailer.createTransport({
            // 🚀 關鍵修改：強制走 IPv4 避開雲端主機的 IPv6 阻擋問題
            host: "smtp.gmail.com",
            port: 465,
            secure: true, 
            auth: {
              type: "OAuth2",
              user: process.env.SMTP_USER as string,
              clientId: process.env.GOOGLE_CLIENT_ID as string,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
              refreshToken: process.env.GOOGLE_REFRESH_TOKEN as string,
            },
            tls: {
              rejectUnauthorized: false
            }
          });

          await transporter.sendMail({
            from: `"KESH" <${process.env.SMTP_USER}>`,
            to: order.email,
            subject: "訂單確認通知",
            html: htmlContent,
          });
          console.log("✅ [信件系統] 訂單確認信已成功寄出！");
        } catch (mailError) {
          console.error("❌ [信件系統] 寄信失敗:", mailError);
        }
      }

    } else {
       console.log("❌ 沒有找到對應的訂單！可能 Medusa 尚未將 Cart 轉換完成。");
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("🔥 Webhook 處理發生 Catch 錯誤:", error);
    return res.status(200).send("Error but received");
  }
}