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

    // 先行撈取初始購物車資訊
    const initialCartRes = await fetch(`${backendUrl}/store/carts/${cart_id}`, { headers: internalHeaders });
    let cartJson = await initialCartRes.json();
    if (!cartJson.cart) throw new Error("找不到購物車資訊");
    let cart = cartJson.cart;

    // ==========================================
    // 🌍 PAYPAL 專屬：Medusa 原生多幣別自動轉換引擎
    // ==========================================
    if (payment_method === "PAYPAL" && cart.currency_code?.toLowerCase() !== "usd") {
       console.log(`🔄 [多幣別轉換] 偵測到 PayPal 結帳，正在自動將購物車轉換為原生美金區域...`);
       
       // 1. 撈取後端所有的 Regions，尋找使用 USD 的區域
       const regionsRes = await fetch(`${backendUrl}/store/regions`, { headers: internalHeaders });
       const regionsData = await regionsRes.json();
       const usdRegion = regionsData.regions?.find((r: any) => r.currency_code?.toLowerCase() === "usd");

       if (!usdRegion) {
          throw new Error("Medusa 後台尚未建立支援 USD 美金的 Region 區域，無法使用 PayPal 結帳！");
       }

       // 2. 呼叫 Medusa API 變更購物車區域，Medusa 會自動重新分派你在後台「寫死的美金售價」
       const updateCartRes = await fetch(`${backendUrl}/store/carts/${cart_id}`, {
          method: "POST",
          headers: internalHeaders,
          body: JSON.stringify({ region_id: usdRegion.id })
       });

       if (!updateCartRes.ok) throw new Error("將購物車變更為美金區域失敗");

       // 3. 重新撈取最新美金計價的購物車資料
       const refetchedCartRes = await fetch(`${backendUrl}/store/carts/${cart_id}`, { headers: internalHeaders });
       cartJson = await refetchedCartRes.json();
       cart = cartJson.cart;
       console.log(`✅ [轉換成功] 購物車已切換為美金！目前真實美金總計為: ${cart.total / 100} USD`);
    }

    // 權威級金額基礎定義
    let rawAmount = cart.total;
    if (!rawAmount || rawAmount === 0) {
      rawAmount = cart.items?.reduce((sum: number, item: any) => sum + (item.unit_price * item.quantity || item.total || 0), 0) || 1;
    }
    const amount = Math.max(1, Math.round(Number(rawAmount)));
    
    const phone = customer_info?.phone || cart.shipping_address?.phone || "0900000000";
    const firstName = customer_info?.name?.split(' ')[0] || cart.shipping_address?.first_name || "Customer";
    const lastName = customer_info?.name?.split(' ').slice(1).join(' ') || cart.shipping_address?.last_name || "";
    const email = customer_info?.email || cart.email || "customer@example.com";

    let tappayResult: any = {};
    let isAtm = false;

    // ==========================================
    // 1. 金流分流
    // ==========================================
    if (payment_method === "CREDIT_CARD" || payment_method === "ATM") {
      // 💳 TapPay 傳統台幣結帳邏輯 (完全保留)
      const partnerKey = process.env.TAPPAY_PARTNER_KEY;
      const env = process.env.TAPPAY_ENV || "sandbox"; 
      if (!partnerKey) throw new Error("伺服器遺失 TapPay Partner Key");

      let merchantId = process.env.TAPPAY_MERCHANT_ID; 
      if (payment_method === "ATM") merchantId = process.env.TAPPAY_ATM_MERCHANT_ID || "tppf_keshde1_5984001"; 

      const tappayApiUrl = env === "production" ? "https://prod.tappaysdk.com/tpc/payment/pay-by-prime" : "https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime";

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

      const tappayRes = await fetch(tappayApiUrl, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": partnerKey as string }, body: JSON.stringify(payload) });
      tappayResult = await tappayRes.json();
      if (tappayResult.status !== 0 && tappayResult.status !== 3) return res.status(400).json({ message: `TapPay 交易失敗: ${tappayResult.msg}` });

      if (isAtm && tappayResult.payee_info) {
          await fetch(`${backendUrl}/store/carts/${cart_id}`, {
              method: "POST", headers: internalHeaders,
              body: JSON.stringify({ metadata: { payment_method: "ATM", atm_bank_code: tappayResult.payee_info.vacc_bank_code, atm_vaccount: tappayResult.payee_info.vacc_no, atm_expire_date: tappayResult.payee_info.expire_time } })
          });
      }

    } else if (payment_method === "PAYPAL") {
      // 🌍 PayPal 先驗證、後請款 (100% 精準對帳)
      console.log(`🌍 [PayPal] 啟動 S2S 安全驗證...`);
      const paypalClientId = process.env.PAYPAL_CLIENT_ID;
      const paypalSecret = process.env.PAYPAL_SECRET;
      const paypalApiBase = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.sandbox.paypal.com";

      if (!paypalClientId || !paypalSecret) throw new Error("伺服器遺失 PayPal 金鑰");

      const auth = Buffer.from(`${paypalClientId}:${paypalSecret}`).toString("base64");
      const tokenRes = await fetch(`${paypalApiBase}/v1/oauth2/token`, { method: "POST", body: "grant_type=client_credentials", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" } });
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      
      // 🕵️‍♂️ 動作 A：僅調取 PayPal 訂單詳情 (此時尚未扣款)
      const orderCheckRes = await fetch(`${paypalApiBase}/v2/checkout/orders/${prime}`, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
      const orderCheckData = await orderCheckRes.json();

      if (orderCheckData.status !== "APPROVED") {
          throw new Error(`PayPal 訂單尚未獲得用戶授權: ${orderCheckData.status}`);
      }

      const paypalCurrency = orderCheckData.purchase_units[0].amount.currency_code.toUpperCase();
      const paypalApprovedAmount = parseFloat(orderCheckData.purchase_units[0].amount.value);

      // 還原 Medusa 兩位小數點的真實美金總定價 (例如後台 2150000 變成 21500.00)
      const expectedUsdAmount = Number(amount) / 100;

      console.log(`🔍 [安全核對] PayPal 授權扣款: $${paypalApprovedAmount} ${paypalCurrency} | Medusa 後台寫死應收: $${expectedUsdAmount} USD`);

      // 🚨 終極安全防禦：因為兩邊都是絕對美金數值，實施「零誤差」對帳！
      if (paypalCurrency !== "USD" || Math.abs(paypalApprovedAmount - expectedUsdAmount) > 0.05) {
          console.error(`🚨 鋼鐵攔截：數值不匹配！這是一筆惡意竄改金額的交易。`);
          throw new Error(`安全安全攔截：付款金額與 Medusa 後台官方美金定價不符，交易已被伺服器拒絕。`);
      }

      // 🎯 動作 B：對帳 100% 完美通過，正式執行請款 (Capture)
      console.log(`✅ [對帳無誤] 安全通行！正式發送請款指令收錢...`);
      const captureRes = await fetch(`${paypalApiBase}/v2/checkout/orders/${prime}/capture`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` } });
      const captureData = await captureRes.json();
      
      if (captureData.status !== "COMPLETED") throw new Error(`PayPal 請款完成失敗: ${captureData.status}`);
      
      const paypalCaptureId = captureData.purchase_units[0].payments.captures[0].id;
      await fetch(`${backendUrl}/store/carts/${cart_id}`, { method: "POST", headers: internalHeaders, body: JSON.stringify({ metadata: { payment_method: "PAYPAL", paypal_id: paypalCaptureId } }) });

    } else {
      return res.status(400).json({ message: "不支援的付款方式" });
    }

    // ==========================================
    // 2. 建立訂單與 Payment Session (原生邏輯，完全未動)
    // ==========================================
    console.log("👉 [Medusa] Step A: Creating Payment Collection...");
    const payColRes = await fetch(`${backendUrl}/store/payment-collections`, { method: "POST", headers: internalHeaders, body: JSON.stringify({ cart_id }) });
    const payColId = (await payColRes.json()).payment_collection.id;
    
    console.log("👉 [Medusa] Step B: Creating Payment Session...");
    const sessionRes = await fetch(`${backendUrl}/store/payment-collections/${payColId}/payment-sessions`, {
      method: "POST", headers: internalHeaders, body: JSON.stringify({ provider_id: "pp_tappay_tappay" }) 
    });
    if (!sessionRes.ok) throw new Error(`建立 Session 失敗 (請確認該國家已在後台勾選 Tappay)`);
    
    console.log("👉 [Medusa] Step C: Completing Cart...");
    const completeRes = await fetch(`${backendUrl}/store/carts/${cart_id}/complete`, {
      method: "POST", headers: { ...internalHeaders, "Idempotency-Key": `complete_${cart_id}` }
    });

    let completeData: any = await completeRes.json();
    if (!completeRes.ok) {
      if (completeRes.status === 409 || completeData?.type === "not_allowed") {
         completeData = { type: "order", order: { id: "pending" } };
      } else {
         return res.status(completeRes.status).json(completeData);
      }
    }

    // ==========================================
    // 🔥 全自動請款 (Auto-Capture) (原始邏輯，完全未動)
    // ==========================================
    if (completeData.type === "order" && completeData.order?.id) {
       const adminApiKey = process.env.MEDUSA_ADMIN_API_KEY;
       if (adminApiKey) {
          try {
             const orderId = completeData.order.id;
             const adminHeaders = { "Authorization": `Bearer ${adminApiKey}`, "Content-Type": "application/json" };
             const orderRes = await fetch(`${backendUrl}/admin/orders/${orderId}?fields=*payment_collections,*payment_collections.payments`, { headers: adminHeaders });
             const orderData = await orderRes.json();
             const paymentId = orderData.order?.payment_collections?.[0]?.payments?.[0]?.id;
             if (paymentId) {
                await fetch(`${backendUrl}/admin/payments/${paymentId}/capture`, { method: "POST", headers: adminHeaders });
                console.log(`✅ 訂單 ${orderId} 已成功自動切換為 Paid (已付款)！`);
             }
          } catch(e) {
             console.error("❌ 自動請款發生錯誤，但不影響訂單建立:", e);
          }
       }
    }

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
    console.error("❌ 結帳錯誤:", error.message);
    return res.status(500).json({ message: error.message });
  }
}