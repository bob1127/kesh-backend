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
    
    // 🔥 修正 1 & 2：直接給定正式上線的絕對網址，避免 Railway 抓不到環境變數而退回 localhost
    const backendUrl = process.env.MEDUSA_BACKEND_URL || "https://kesh-backend-production.up.railway.app";
    const frontendUrl = process.env.STORE_URL || "https://www.kesh-de1.com"; // 替換成你實際的正式前台網址

    // 這時候 NotifyUrl 就會是完美的 https://kesh-backend.../tappay/notify
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

    const partnerKey = process.env.TAPPAY_PARTNER_KEY;
    const env = process.env.TAPPAY_ENV || "sandbox"; 
    if (!partnerKey) throw new Error("伺服器遺失 TapPay Partner Key");

    let merchantId = process.env.TAPPAY_MERCHANT_ID; 
    if (payment_method === "ATM") {
      merchantId = process.env.TAPPAY_ATM_MERCHANT_ID || "tppf_keshde1_5984001"; 
    }

    let tappayResult: any = {};
    let isAtm = false;

    // 1. 呼叫 TapPay
    if (payment_method === "CREDIT_CARD" || payment_method === "ATM") {
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
    } else {
      return res.status(400).json({ message: "不支援的付款方式" });
    }

    // 🔥 2. 核心修正：將 ATM 帳號提早存入購物車 Metadata (繞過 Medusa 訂單保護機制)
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
        console.log(`📦 已成功將 ATM 資訊寫入購物車 Metadata`);
    }

    // 3. 建立訂單與 Payment Session
    const payColRes = await fetch(`${backendUrl}/store/payment-collections`, {
      method: "POST", headers: internalHeaders, body: JSON.stringify({ cart_id })
    });
    const payColData = await payColRes.json();
    
    await fetch(`${backendUrl}/store/payment-collections/${payColData.payment_collection.id}/payment-sessions`, {
      method: "POST", headers: internalHeaders, body: JSON.stringify({ provider_id: "pp_tappay_tappay" }) 
    });

    const completeRes = await fetch(`${backendUrl}/store/carts/${cart_id}/complete`, {
      method: "POST", headers: { ...internalHeaders, "Idempotency-Key": `complete_${cart_id}` }
    });

    let completeData: any = await completeRes.json();

    if (!completeRes.ok) {
      if (completeRes.status === 409) completeData = { type: "order", order: { id: "pending" } };
      else return res.status(completeRes.status).json(completeData);
    }

    // 4. 回傳給前端
    if (isAtm) {
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