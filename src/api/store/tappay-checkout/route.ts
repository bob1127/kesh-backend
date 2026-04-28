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

    let safeNotifyUrl = `${backendUrl}/tappay/notify`;
    if (safeNotifyUrl.includes("localhost") || safeNotifyUrl.includes("127.0.0.1")) {
       safeNotifyUrl = "https://www.google.com/dummy-webhook";
    }

    const cartRes = await fetch(`${backendUrl}/store/carts/${cart_id}`, { headers: internalHeaders });
    const cartData = await cartRes.json();
    const amount = cartData.cart.total;
    
    const phone = customer_info?.phone || cartData.cart.shipping_address?.phone || "0900000000";
    const firstName = customer_info?.name?.split(' ')[0] || cartData.cart.shipping_address?.first_name || "Customer";
    const lastName = customer_info?.name?.split(' ').slice(1).join(' ') || cartData.cart.shipping_address?.last_name || "";
    const email = customer_info?.email || cartData.cart.email || "customer@example.com";

    let tappayResult: any = {};
    let isAtm = false;

    // ==========================================
    // 金流分流：TapPay (信用卡 / ATM)
    // ==========================================
    if (payment_method === "CREDIT_CARD" || payment_method === "ATM") {
      console.log(`💳 [TapPay] 放行 TapPay 處理流程...`);
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

      // 儲存 ATM 資訊
      if (isAtm && tappayResult.payee_info) {
        await fetch(`${backendUrl}/store/carts/${cart_id}`, {
            method: "POST", headers: internalHeaders,
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

    } 
    // ==========================================
    // 金流分流：PayPal (S2S 伺服器扣款)
    // ==========================================
    else if (payment_method === "PAYPAL") {
      console.log(`🌍 [PayPal X-Ray] 啟動 S2S 伺服器安全扣款... 授權碼: ${prime}`);

      const paypalClientId = process.env.PAYPAL_CLIENT_ID;
      const paypalSecret = process.env.PAYPAL_SECRET;
      const paypalApiBase = process.env.PAYPAL_ENV === "live" 
        ? "https://api-m.paypal.com" 
        : "https://api-m.sandbox.paypal.com";

      if (!paypalClientId || !paypalSecret) {
        console.error("❌ [PayPal X-Ray] 缺少環境變數 PAYPAL_CLIENT_ID 或 PAYPAL_SECRET");
        throw new Error("伺服器遺失 PayPal 金鑰，無法進行安全驗證");
      }

      // 1. 向 PayPal 獲取 Access Token
      console.log("👉 [PayPal X-Ray] 正在向 PayPal 獲取 Access Token...");
      const auth = Buffer.from(`${paypalClientId}:${paypalSecret}`).toString("base64");
      const tokenRes = await fetch(`${paypalApiBase}/v1/oauth2/token`, {
        method: "POST", body: "grant_type=client_credentials",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      });
      const tokenData = await tokenRes.json();
      
      if (!tokenData.access_token) {
        console.error("❌ [PayPal X-Ray] Token 獲取失敗:", tokenData);
        throw new Error("無法連接 PayPal 驗證伺服器 (請檢查 Secret 密碼是否正確)");
      }

      // 2. 🔥 執行伺服器對伺服器 (S2S) 扣款 (Capture)
      console.log("👉 [PayPal X-Ray] 正在透過後端伺服器向 PayPal 執行安全扣款 (Capture)...");
      const captureRes = await fetch(`${paypalApiBase}/v2/checkout/orders/${prime}/capture`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenData.access_token}` 
        },
      });
      
      const captureData = await captureRes.json();

      // 3. 驗證扣款狀態
      if (captureData.status !== "COMPLETED") {
        console.error("❌ [PayPal X-Ray] 後端伺服器扣款失敗:", captureData);
        throw new Error(`PayPal 扣款失敗 (狀態: ${captureData.status || '未知錯誤'})`);
      }

      const captureInfo = captureData.purchase_units[0].payments.captures[0];
      const paidAmount = parseFloat(captureInfo.amount.value);
      const paidCurrency = captureInfo.amount.currency_code;
      
      console.log(`✅ [PayPal X-Ray] 後端伺服器扣款成功！實際入帳: ${paidCurrency} ${paidAmount}`);

      // 4. 寫入購物車 Metadata 留存證據
      await fetch(`${backendUrl}/store/carts/${cart_id}`, {
        method: "POST", headers: internalHeaders,
        body: JSON.stringify({
            metadata: {
                payment_method: "PAYPAL",
                paypal_transaction_id: captureInfo.id, // 這是真正扣款成功的交易序號
                paid_currency: paidCurrency,
                paid_amount: paidAmount
            }
        })
      });

    } else {
      return res.status(400).json({ message: "不支援的付款方式" });
    }

    // ==========================================
    // 建立 Medusa 訂單 (轉單程序)
    // ==========================================
    console.log("👉 [Medusa] 準備建立 Payment Sessions...");
    const payColRes = await fetch(`${backendUrl}/store/payment-collections`, { method: "POST", headers: internalHeaders, body: JSON.stringify({ cart_id }) });
    const payColData = await payColRes.json();
    
    // 動態決定要用哪個 Medusa 金流 Provider (PayPal 用 system, TapPay 照舊)
    const providerId = payment_method === "PAYPAL" ? "system" : "pp_tappay_tappay";
    await fetch(`${backendUrl}/store/payment-collections/${payColData.payment_collection.id}/payment-sessions`, {
      method: "POST", headers: internalHeaders, body: JSON.stringify({ provider_id: providerId }) 
    });

    console.log("👉 [Medusa] 準備 Complete 訂單轉單...");
    const completeRes = await fetch(`${backendUrl}/store/carts/${cart_id}/complete`, {
      method: "POST", headers: { ...internalHeaders, "Idempotency-Key": `complete_${cart_id}` }
    });

    let completeData: any = await completeRes.json();

    if (!completeRes.ok) {
      console.error("❌ [Medusa] Complete 轉單失敗:", completeData);
      if (completeRes.status === 409) completeData = { type: "order", order: { id: "pending" } };
      else return res.status(completeRes.status).json({ message: completeData.message || "Medusa 訂單建立失敗" });
    }

    console.log("🎉 [Medusa] 訂單建立成功！返回前端。");
    
    if (payment_method === "PAYPAL") {
        completeData.type = "order"; // PayPal 已扣款完畢，直接回傳 order 狀態給前端
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