import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { cart_id, prime, payment_method = "CREDIT_CARD", customer_info } = req.body as any;

  const pubKey = req.headers["x-publishable-api-key"] as string;
  if (!pubKey) return res.status(400).json({ message: "缺少 x-publishable-api-key" });

  const internalHeaders = {
    "Content-Type": "application/json",
    "x-publishable-api-key": pubKey
  };

  try {
    console.log(`\n🛒 [結帳後端] 啟動！Cart ID: ${cart_id} | Method: ${payment_method}`);
    
    const backendUrl = process.env.MEDUSA_BACKEND_URL || "https://kesh-backend-production.up.railway.app";
    const frontendUrl = process.env.STORE_URL || "https://www.kesh-de1.com"; 

    let safeNotifyUrl = `${backendUrl}/tappay/notify`;
    if (safeNotifyUrl.includes("localhost") || safeNotifyUrl.includes("127.0.0.1")) {
       safeNotifyUrl = "https://www.google.com/dummy-webhook";
    }

    const cartRes = await fetch(`${backendUrl}/store/carts/${cart_id}`, { headers: internalHeaders });
    const cartData = await cartRes.json();
    if (!cartData.cart) throw new Error("找不到購物車資訊");

    // 🔥 防呆：確保金額絕對不是 0 或 null，避免 TapPay 報錯
    let rawAmount = cartData.cart.total;
    if (!rawAmount || rawAmount === 0) {
      rawAmount = cartData.cart.items?.reduce((sum: number, item: any) => sum + (item.unit_price * item.quantity || item.total || 0), 0) || 1;
    }
    const amount = Math.max(1, Math.round(Number(rawAmount)));
    
    const phone = customer_info?.phone || cartData.cart.shipping_address?.phone || "0900000000";
    const firstName = customer_info?.name?.split(' ')[0] || cartData.cart.shipping_address?.first_name || "Customer";
    const lastName = customer_info?.name?.split(' ').slice(1).join(' ') || cartData.cart.shipping_address?.last_name || "";
    const email = customer_info?.email || cartData.cart.email || "customer@example.com";

    let tappayResult: any = {};
    let isAtm = false;

    // ==========================================
    // 1. 金流分流
    // ==========================================
    if (payment_method === "CREDIT_CARD" || payment_method === "ATM") {
      // 💳 【TapPay 專區】完全還原你的原始正確版本
      const partnerKey = process.env.TAPPAY_PARTNER_KEY;
      const env = process.env.TAPPAY_ENV || "sandbox"; 
      if (!partnerKey) throw new Error("伺服器遺失 TapPay Partner Key");

      let merchantId = process.env.TAPPAY_MERCHANT_ID; 
      if (payment_method === "ATM") {
        merchantId = process.env.TAPPAY_ATM_MERCHANT_ID || "tppf_keshde1_5984001"; 
      }

      const tappayApiUrl = env === "production"
        ? "https://prod.tappaysdk.com/tpc/payment/pay-by-prime"
        : "https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime";

      let payload: any = {
        prime: prime, 
        partner_key: partnerKey,
        merchant_id: merchantId,
        details: "KÉSH de¹ Online Order",
        amount: amount,
        order_number: cart_id,
        cardholder: { 
          phone_number: "+886" + phone.replace(/^0/, ''),
          name: `${firstName} ${lastName}`.trim(), 
          email: email 
        }
      };

      if (payment_method === "CREDIT_CARD") {
        payload.remember = false;
        payload.three_domain_secure = true;
        payload.result_url = { frontend_redirect_url: `${frontendUrl}/success`, backend_notify_url: safeNotifyUrl };
      } else if (payment_method === "ATM") {
        isAtm = true;
        payload.result_url = { backend_notify_url: safeNotifyUrl };
      }

      const tappayRes = await fetch(tappayApiUrl, {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": partnerKey as string },
        body: JSON.stringify(payload),
      });

      tappayResult = await tappayRes.json();
      if (tappayResult.status !== 0 && tappayResult.status !== 3) {
        return res.status(400).json({ message: `TapPay 交易失敗: ${tappayResult.msg}` });
      }

      // 提早存入 ATM 資訊
      if (isAtm && tappayResult.payee_info) {
          await fetch(`${backendUrl}/store/carts/${cart_id}`, {
              method: "POST",
              headers: internalHeaders,
              body: JSON.stringify({
                  metadata: {
                      payment_method: "ATM",
                      atm_bank_code: tappayResult.payee_info.vacc_bank_code,
                      atm_vaccount: tappayResult.payee_info.vacc_no,
                      atm_expire_date: tappayResult.payee_info.expire_time
                  }
              })
          });
      }

    } else if (payment_method === "PAYPAL") {
      // 🌍 【PayPal 專區】物理隔離，不干擾 TapPay
      console.log(`🌍 [PayPal] 啟動 S2S 安全扣款...`);
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
      
      await fetch(`${backendUrl}/store/carts/${cart_id}`, {
        method: "POST", headers: internalHeaders,
        body: JSON.stringify({ metadata: { payment_method: "PAYPAL", paypal_id: paypalCaptureId } })
      });

    } else {
      return res.status(400).json({ message: "不支援的付款方式" });
    }

    // ==========================================
    // 2. 建立訂單與 Payment Session
    // ==========================================
    const payColRes = await fetch(`${backendUrl}/store/payment-collections`, {
      method: "POST", headers: internalHeaders, body: JSON.stringify({ cart_id })
    });
    const payColData = await payColRes.json();
    const payColId = payColData.payment_collection.id;
    
    // 🔥 隔離 Provider：TapPay 走舊版邏輯，PayPal 走 system
    const providerId = payment_method === "PAYPAL" ? "system" : "pp_tappay_tappay";
    const sessionRes = await fetch(`${backendUrl}/store/payment-collections/${payColId}/payment-sessions`, {
      method: "POST", headers: internalHeaders, body: JSON.stringify({ provider_id: providerId }) 
    });
    const sessionData = await sessionRes.json();
    const sessionId = sessionData.payment_collection.payment_sessions[0].id;

    // 🔥 隔離授權：只有 PayPal 需要手動授權，TapPay 完全不碰！
    if (payment_method === "PAYPAL") {
      const authRes = await fetch(`${backendUrl}/store/payment-collections/${payColId}/sessions/${sessionId}/authorize`, {
          method: "POST", headers: internalHeaders, body: JSON.stringify({})
      });
      if (!authRes.ok) throw new Error("PayPal 授權失敗");
    }

    // 完成訂單
    const completeRes = await fetch(`${backendUrl}/store/carts/${cart_id}/complete`, {
      method: "POST", headers: { ...internalHeaders, "Idempotency-Key": `complete_${cart_id}` }
    });

    let completeData: any = await completeRes.json();

    // 容錯防護罩
    if (!completeRes.ok) {
      if (completeRes.status === 409 || completeData?.type === "not_allowed") {
         completeData = { type: "order", order: { id: "pending" } };
      } else {
         return res.status(completeRes.status).json(completeData);
      }
    }

    // ==========================================
    // 3. 回傳給前端
    // ==========================================
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
    return res.status(500).json({ message: error.message });
  }
}