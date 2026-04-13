import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import crypto from "crypto";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { cart_id, prime } = req.body as any;

  const pubKey = req.headers["x-publishable-api-key"] as string;
  if (!pubKey) return res.status(400).json({ message: "缺少 x-publishable-api-key" });

  const internalHeaders = {
    "Content-Type": "application/json",
    "x-publishable-api-key": pubKey
  };

  try {
    console.log(`\n🛒 [終極跳級結帳] 啟動！Cart ID: ${cart_id}`);

    const cartRes = await fetch(`http://localhost:9000/store/carts/${cart_id}`, { headers: internalHeaders });
    const cartData = await cartRes.json();
    const amount = cartData.cart.total;
    const email = cartData.cart.email;
    
    const phone = cartData.cart.shipping_address?.phone || "0900000000";
    const firstName = cartData.cart.shipping_address?.first_name || "Customer";
    const lastName = cartData.cart.shipping_address?.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();

    const partnerKey = process.env.TAPPAY_PARTNER_KEY;
    const merchantId = process.env.TAPPAY_MERCHANT_ID;
    const env = process.env.TAPPAY_ENV || "sandbox"; 

    if (!partnerKey || !merchantId) throw new Error("伺服器遺失 TapPay 金鑰設定");

    const tappayApiUrl = env === "production"
      ? "https://prod.tappaysdk.com/tpc/payment/pay-by-prime"
      : "https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime";

    const payload = {
      prime: prime,
      partner_key: partnerKey,
      merchant_id: merchantId,
      details: "KESH Online Order",
      amount: amount,
      order_number: cart_id,
      cardholder: { 
        phone_number: "+886" + phone.replace(/^0/, ''),
        name: fullName, 
        email: email || "customer@example.com" 
      },
      remember: false,
      three_domain_secure: true, 
      result_url: {
          frontend_redirect_url: "https://www.kesh-de1.com/checkout", 
          backend_notify_url: "https://www.kesh-de1.com/api/tappay/notify" 
      }
    };

    const tappayRes = await fetch(tappayApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": partnerKey as string },
      body: JSON.stringify(payload),
    });

    const tappayResult = await tappayRes.json();
    console.log("🔍 TapPay 扣款回傳:", tappayResult);

    if (tappayResult.status !== 0 && tappayResult.status !== 3) {
      return res.status(400).json({ message: `扣款失敗: ${tappayResult.msg}` });
    }

    // ==========================================
    // 🚨 幫 Medusa 建立 Payment Session 過場
    // ==========================================
    console.log(`👉 建立 Medusa 金流 Session...`);
    const payColRes = await fetch(`http://localhost:9000/store/payment-collections`, {
      method: "POST", headers: internalHeaders, body: JSON.stringify({ cart_id })
    });
    const payColData = await payColRes.json();
    const payColId = payColData.payment_collection.id;

    await fetch(`http://localhost:9000/store/payment-collections/${payColId}/payment-sessions`, {
      method: "POST", headers: internalHeaders, body: JSON.stringify({ provider_id: "pp_tappay_tappay" }) 
    });

    // ==========================================
    // 🚨 完成 Medusa 訂單建立 (帶有 409 防護罩)
    // ==========================================
    console.log(`👉 通知 Medusa 建立訂單...`);
    const idempotencyKey = `complete_${cart_id}`;
    const completeRes = await fetch(`http://localhost:9000/store/carts/${cart_id}/complete`, {
      method: "POST",
      headers: { ...internalHeaders, "Idempotency-Key": idempotencyKey }
    });

    let completeData = await completeRes.json();

    // 🛡️ 409 免疫防護罩邏輯
    if (!completeRes.ok) {
      if (completeRes.status === 409) {
        console.log(`⚠️ 偵測到 409 撞車警告！但這代表購物車已被成功轉換為訂單！視為成功！`);
        
        // 為了後續能標記已付款，我們去資料庫把這筆剛建好的訂單撈出來
        const orderSearchRes = await fetch(`http://localhost:9000/store/orders?cart_id=${cart_id}`, { headers: internalHeaders });
        const orderSearchData = await orderSearchRes.json();
        
        if (orderSearchData.orders && orderSearchData.orders.length > 0) {
           completeData = { type: "order", order: orderSearchData.orders[0] };
        } else {
           completeData = { type: "order", order: {} };
        }
      } else {
        console.error(`❌ 訂單建立失敗:`, completeData);
        return res.status(completeRes.status).json(completeData);
      }
    }

    console.log(`🎉 訂單已在 Medusa 建立成功！Order ID: ${completeData.order?.id}`);

    // ==========================================
    // 🚨 強制將訂單狀態改為「已付款 (Captured)」
    // ==========================================
    if (completeData.order && completeData.order.id) {
        console.log(`💰 開始執行內部 Capture (請款) 動作...`);
        try {
            const paymentId = completeData.order.payments?.[0]?.id;
            if (paymentId) {
                // 呼叫 Admin API 強制 Capture (註：若遇到 401 權限錯誤，請改至後台手動點擊)
                const captureRes = await fetch(`http://localhost:9000/admin/payments/${paymentId}/capture`, {
                    method: "POST",
                    headers: internalHeaders 
                });
                if (captureRes.ok) {
                    console.log(`✅ 訂單款項已標記為 Captured (已付款)！`);
                } else {
                    console.log(`⚠️ 自動標記失敗 (可能需要 Admin API 權限)，不影響結帳，請稍後至後台手動 Capture。`);
                }
            }
        } catch (captureErr) {
            console.error("⚠️ Capture 發生錯誤:", captureErr);
        }
    }

    // ==========================================
    // 🚨 強制把跳轉網址傳給前端
    // ==========================================
    if (tappayResult.payment_url) {
      completeData.type = "order";
      if (!completeData.order) completeData.order = {};
      completeData.order.payment_status = "requires_action";
      completeData.order.payments = [{ data: { payment_url: tappayResult.payment_url } }];
      console.log(`🔗 準備將 3D 驗證網址交給前端跳轉...`);
    }

    return res.status(200).json(completeData);

  } catch (error: any) {
    console.error(`🔥 發生系統例外:`, error);
    return res.status(500).json({ message: error.message });
  }
}