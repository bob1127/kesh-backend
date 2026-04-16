import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

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
    
    // 👇 這個變數非常重要，它是你動態網址的來源 👇
    const backendUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";

    // 取得購物車資訊...
    const cartRes = await fetch(`${backendUrl}/store/carts/${cart_id}`, { headers: internalHeaders });
    const cartData = await cartRes.json();
    const amount = cartData.cart.total;
    
    // ==========================================
    // 🧪 【本地開發專用：假金流測試開關】 🧪
    // ==========================================
    const isMockTesting = false; 

    let tappayResult: any = {};

    if (isMockTesting) {
      console.log("🧪 啟動 TapPay 模擬測試模式 (不真實扣款)...");
      tappayResult = {
        status: 0,
        msg: "Success",
        payment_url: "https://www.google.com" 
      };
    } else {
      // --- 真實打 TapPay 邏輯 ---
      const phone = cartData.cart.shipping_address?.phone || "0900000000";
      const firstName = cartData.cart.shipping_address?.first_name || "Customer";
      const lastName = cartData.cart.shipping_address?.last_name || "";
      const email = cartData.cart.email;

      const partnerKey = process.env.TAPPAY_PARTNER_KEY;
      const merchantId = process.env.TAPPAY_MERCHANT_ID;
      const env = process.env.TAPPAY_ENV || "sandbox"; 

      if (!partnerKey || !merchantId) throw new Error("伺服器遺失 TapPay 金鑰");

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
          name: `${firstName} ${lastName}`.trim(), 
          email: email || "customer@example.com" 
        },
        remember: false,
        three_domain_secure: true, 
        result_url: {
            frontend_redirect_url: "https://www.google.com", 
            // 🚀 【關鍵修改】不再寫死 ngrok，而是用環境變數 backendUrl 組合網址！ 🚀
            backend_notify_url: `${backendUrl}/tappay/notify` 
        }
      };

      const tappayRes = await fetch(tappayApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": partnerKey as string },
        body: JSON.stringify(payload),
      });

      tappayResult = await tappayRes.json();
      console.log("🔍 TapPay 真實扣款回傳:", tappayResult);

      if (tappayResult.status !== 0 && tappayResult.status !== 3) {
        return res.status(400).json({ message: `扣款失敗: ${tappayResult.msg}` });
      }
    }

    // ==========================================
    // 🚨 幫 Medusa 建立 Payment Session 過場
    // ==========================================
    console.log(`👉 建立 Medusa 金流 Session...`);
    const payColRes = await fetch(`${backendUrl}/store/payment-collections`, {
      method: "POST", headers: internalHeaders, body: JSON.stringify({ cart_id })
    });
    const payColData = await payColRes.json();
    
    await fetch(`${backendUrl}/store/payment-collections/${payColData.payment_collection.id}/payment-sessions`, {
      method: "POST", headers: internalHeaders, body: JSON.stringify({ provider_id: "pp_tappay_tappay" }) 
    });

    // ==========================================
    // 🚨 完成 Medusa 訂單建立 (極簡 409 防護)
    // ==========================================
    console.log(`👉 通知 Medusa 建立訂單...`);
    const completeRes = await fetch(`${backendUrl}/store/carts/${cart_id}/complete`, {
      method: "POST",
      headers: { ...internalHeaders, "Idempotency-Key": `complete_${cart_id}` }
    });

    let completeData: any = await completeRes.json();

    if (!completeRes.ok) {
      if (completeRes.status === 409) {
        console.log(`⚠️ 409 撞車警告！訂單建立中，不在此處硬撈訂單，交給 Webhook 收尾！`);
        completeData = { type: "order", order: { id: "pending" } };
      } else {
        console.error(`❌ 訂單建立失敗:`, completeData);
        return res.status(completeRes.status).json(completeData);
      }
    }

    // ==========================================
    // 🚨 組合前端跳轉所需的網址
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