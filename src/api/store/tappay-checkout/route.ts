import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { cart_id, prime, payment_method = "CREDIT_CARD", customer_info } = req.body as any;

  const pubKey = req.headers["x-publishable-api-key"] as string;
  if (!pubKey) return res.status(400).json({ message: "缺少 x-publishable-api-key" });

  const internalHeaders = { "Content-Type": "application/json", "x-publishable-api-key": pubKey };

  try {
    console.log(`\n========================================`);
    console.log(`🛒 [後端結帳 API] 啟動！Cart ID: ${cart_id} | Method: ${payment_method}`);
    
    const backendUrl = process.env.MEDUSA_BACKEND_URL || "https://kesh-backend-production.up.railway.app";
    const frontendUrl = process.env.STORE_URL || "https://www.kesh-de1.com"; 

    const cartRes = await fetch(`${backendUrl}/store/carts/${cart_id}`, { headers: internalHeaders });
    const cartData = await cartRes.json();
    if (!cartData.cart) throw new Error("找不到購物車資訊");
    
    const amount = cartData.cart.total;
    const phone = customer_info?.phone || cartData.cart.shipping_address?.phone || "0900000000";
    const firstName = customer_info?.name?.split(' ')[0] || cartData.cart.shipping_address?.first_name || "Customer";
    const lastName = customer_info?.name?.split(' ').slice(1).join(' ') || cartData.cart.shipping_address?.last_name || "";
    const email = customer_info?.email || cartData.cart.email || "customer@example.com";

    let isAtm = false;
    let tappayResult: any = {};

    // ==========================================
    // 1. 金流分流：TapPay (完全還原昨日正確版)
    // ==========================================
    if (payment_method === "CREDIT_CARD" || payment_method === "ATM") {
      console.log(`💳 [TapPay] 啟動 TapPay 處理流程...`);
      const partnerKey = process.env.TAPPAY_PARTNER_KEY;
      const env = process.env.TAPPAY_ENV || "sandbox"; 
      if (!partnerKey) throw new Error("伺服器遺失 TapPay Partner Key");

      let merchantId = process.env.TAPPAY_MERCHANT_ID; 
      if (payment_method === "ATM") merchantId = process.env.TAPPAY_ATM_MERCHANT_ID || "tppf_keshde1_5984001"; 

      const tappayApiUrl = env === "production"
        ? "https://prod.tappaysdk.com/tpc/payment/pay-by-prime"
        : "https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime";

      let safeNotifyUrl = `${backendUrl}/tappay/notify`;
      if (safeNotifyUrl.includes("localhost") || safeNotifyUrl.includes("127.0.0.1")) {
        safeNotifyUrl = "https://www.google.com/dummy-webhook";
      }

      let payload: any = {
        prime: prime, partner_key: partnerKey, merchant_id: merchantId,
        details: "KÉSH de¹ Online Order", amount: amount, order_number: cart_id,
        cardholder: { phone_number: "+886" + phone.replace(/^0/, ''), name: `${firstName} ${lastName}`.trim(), email: email }
      };

      if (payment_method === "CREDIT_CARD") {
        payload.remember = false; payload.three_domain_secure = true;
        payload.result_url = { frontend_redirect_url: `${frontendUrl}/success`, backend_notify_url: safeNotifyUrl };
      } else if (payment_method === "ATM") {
        isAtm = true; payload.result_url = { backend_notify_url: safeNotifyUrl };
      }

      const tappayRes = await fetch(tappayApiUrl, {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": partnerKey as string },
        body: JSON.stringify(payload),
      });

      tappayResult = await tappayRes.json();
      if (tappayResult.status !== 0 && tappayResult.status !== 3) throw new Error(`TapPay 交易失敗: ${tappayResult.msg}`);
      console.log(`✅ [TapPay] 扣款/虛擬帳號取得成功！`);

      if (isAtm && tappayResult.payee_info) {
        await fetch(`${backendUrl}/store/carts/${cart_id}`, {
            method: "POST", headers: internalHeaders,
            body: JSON.stringify({ metadata: { payment_method: "ATM", atm_bank_code: tappayResult.payee_info.vacc_bank_code, atm_vaccount: tappayResult.payee_info.vacc_no, atm_expire_date: tappayResult.payee_info.expire_time } })
        });
      }
    } 
    // ==========================================
    // 1. 金流分流：PayPal
    // ==========================================
    else if (payment_method === "PAYPAL") {
      console.log(`🌍 [PayPal] 啟動 S2S 安全扣款... 授權碼: ${prime}`);
      const paypalClientId = process.env.PAYPAL_CLIENT_ID;
      const paypalSecret = process.env.PAYPAL_SECRET;
      const paypalApiBase = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

      if (!paypalClientId || !paypalSecret) throw new Error("伺服器遺失 PayPal 金鑰");

      const auth = Buffer.from(`${paypalClientId}:${paypalSecret}`).toString("base64");
      const tokenRes = await fetch(`${paypalApiBase}/v1/oauth2/token`, {
        method: "POST", body: "grant_type=client_credentials",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      });
      const tokenData = await tokenRes.json();
      
      const captureRes = await fetch(`${paypalApiBase}/v2/checkout/orders/${prime}/capture`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenData.access_token}` },
      });
      const captureData = await captureRes.json();
      if (captureData.status !== "COMPLETED") throw new Error(`PayPal 扣款失敗: ${captureData.status}`);
      
      const paypalCaptureId = captureData.purchase_units[0].payments.captures[0].id;
      console.log(`✅ [PayPal] 扣款成功！交易序號: ${paypalCaptureId}`);

      await fetch(`${backendUrl}/store/carts/${cart_id}`, {
        method: "POST", headers: internalHeaders,
        body: JSON.stringify({ metadata: { payment_method: "PAYPAL", paypal_id: paypalCaptureId } })
      });
    } else {
        throw new Error("不支援的付款方式");
    }

    // ==========================================
    // 2. Medusa 轉單流程
    // ==========================================
    
    console.log("👉 [Medusa] Step A: Creating Payment Collection...");
    const payColRes = await fetch(`${backendUrl}/store/payment-collections`, { method: "POST", headers: internalHeaders, body: JSON.stringify({ cart_id }) });
    const payColData = await payColRes.json();
    if (!payColData.payment_collection) throw new Error("建立 Payment Collection 失敗");
    const payColId = payColData.payment_collection.id;

    console.log("👉 [Medusa] Step B: Creating Payment Session...");
    const providerId = payment_method === "PAYPAL" ? "system" : "pp_tappay_tappay";
    const sessionRes = await fetch(`${backendUrl}/store/payment-collections/${payColId}/payment-sessions`, {
      method: "POST", headers: internalHeaders, body: JSON.stringify({ provider_id: providerId }) 
    });
    const sessionData = await sessionRes.json();
    const sessionId = sessionData.payment_collection.payment_sessions[0].id;

    // 🔥 物理隔離護盾：只針對 PayPal 進行授權！TapPay 維持昨天的原樣！
    if (payment_method === "PAYPAL") {
        console.log(`👉 [Medusa] Step C: Authorizing PayPal Session...`);
        const authRes = await fetch(`${backendUrl}/store/payment-collections/${payColId}/sessions/${sessionId}/authorize`, {
            method: "POST", headers: internalHeaders, body: JSON.stringify({})
        });
        if (!authRes.ok) {
            let errMsg = "未知錯誤";
            try { const errObj = await authRes.json(); errMsg = errObj.message; } catch(e) { errMsg = "系統回傳非預期格式"; }
            throw new Error(`授權失敗: ${errMsg}`);
        }
    } else {
        console.log(`👉 [Medusa] Step C: TapPay 略過手動授權，保持原始運作邏輯...`);
    }

    console.log("👉 [Medusa] Step D: Completing Cart...");
    const completeRes = await fetch(`${backendUrl}/store/carts/${cart_id}/complete`, {
      method: "POST", headers: { ...internalHeaders, "Idempotency-Key": `complete_${cart_id}` }
    });

    let completeData: any = {};
    try {
        completeData = await completeRes.json();
    } catch(e) {
        throw new Error("轉單系統發生異常，請聯絡客服 (Complete 解析失敗)");
    }

    if (!completeRes.ok) {
      console.error("❌ [Medusa] 轉單失敗:", completeData);
      if (completeRes.status === 409) completeData = { type: "order", order: { id: "pending" } };
      else return res.status(completeRes.status).json({ message: completeData.message || "Medusa 訂單建立失敗" });
    }

    console.log("🎉 [Medusa] 訂單建立成功！");

    if (payment_method === "PAYPAL") {
        completeData.type = "order"; 
    } else if (isAtm) {
        completeData.bank_code = tappayResult.payee_info?.vacc_bank_code || "未知銀行代碼";
        completeData.vaccount = tappayResult.payee_info?.vacc_no || "未知帳號";
        completeData.expire_date = tappayResult.payee_info?.expire_time || "未提供期限";
    } else if (tappayResult.payment_url) {
      completeData.type = "order";
      if (!completeData.order) completeData.order = {};
      completeData.order.payment_status = "requires_action";
      completeData.order.payments = [{ data: { payment_url: tappayResult.payment_url } }];
    }

    return res.status(200).json(completeData);

  } catch (error: any) {
    console.error("\n❌ [後端 API 捕捉到致命錯誤]:", error.message);
    return res.status(500).json({ message: error.message });
  }
}