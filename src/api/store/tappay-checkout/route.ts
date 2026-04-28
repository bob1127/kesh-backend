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

    // 獲取購物車資訊
    const cartRes = await fetch(`${backendUrl}/store/carts/${cart_id}`, { headers: internalHeaders });
    const cartData = await cartRes.json();
    if (!cartData.cart) throw new Error("找不到購物車資訊");
    
    const amount = cartData.cart.total;
    const email = customer_info?.email || cartData.cart.email || "customer@example.com";

    let paymentCaptured = false;
    let paypalCaptureId = "";

    // ==========================================
    // 1. 金流扣款處理 (S2S)
    // ==========================================
    if (payment_method === "PAYPAL") {
      console.log(`🌍 [PayPal] 啟動 S2S 安全扣款... 授權碼: ${prime}`);

      const paypalClientId = process.env.PAYPAL_CLIENT_ID;
      const paypalSecret = process.env.PAYPAL_SECRET;
      const paypalApiBase = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

      if (!paypalClientId || !paypalSecret) throw new Error("伺服器遺失 PayPal 金鑰");

      // 獲取 PayPal Token
      const auth = Buffer.from(`${paypalClientId}:${paypalSecret}`).toString("base64");
      const tokenRes = await fetch(`${paypalApiBase}/v1/oauth2/token`, {
        method: "POST", body: "grant_type=client_credentials",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      });
      const tokenData = await tokenRes.json();
      
      // 執行扣款 (Capture)
      const captureRes = await fetch(`${paypalApiBase}/v2/checkout/orders/${prime}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenData.access_token}` },
      });
      const captureData = await captureRes.json();

      if (captureData.status !== "COMPLETED") throw new Error(`PayPal 扣款失敗: ${captureData.status}`);
      
      paypalCaptureId = captureData.purchase_units[0].payments.captures[0].id;
      paymentCaptured = true;
      console.log(`✅ [PayPal] 扣款成功！交易序號: ${paypalCaptureId}`);

      // 存入 Metadata
      await fetch(`${backendUrl}/store/carts/${cart_id}`, {
        method: "POST", headers: internalHeaders,
        body: JSON.stringify({ metadata: { payment_method: "PAYPAL", paypal_id: paypalCaptureId } })
      });
    } else {
        // (如果是 TapPay 邏輯...這裡先省略以專注解決你的 PayPal 問題)
        console.log("💳 處理 TapPay 邏輯...");
    }

    // ==========================================
    // 2. Medusa 轉單流程 (核心修復區)
    // ==========================================
    
    // Step A: 建立 Payment Collection
    console.log("👉 [Medusa] Step A: Creating Payment Collection...");
    const payColRes = await fetch(`${backendUrl}/store/payment-collections`, { 
        method: "POST", headers: internalHeaders, body: JSON.stringify({ cart_id }) 
    });
    const payColData = await payColRes.json();
    const payColId = payColData.payment_collection.id;

    // Step B: 建立 Payment Session
    console.log("👉 [Medusa] Step B: Creating Payment Session...");
    const providerId = payment_method === "PAYPAL" ? "system" : "pp_tappay_tappay";
    const sessionRes = await fetch(`${backendUrl}/store/payment-collections/${payColId}/payment-sessions`, {
      method: "POST", headers: internalHeaders, body: JSON.stringify({ provider_id: providerId }) 
    });
    const sessionData = await sessionRes.json();
    const sessionId = sessionData.payment_collection.payment_sessions[0].id;

    // 🔥 Step C: 授權支付會話 (這是之前缺少的關鍵！)
    console.log("👉 [Medusa] Step C: Authorizing Payment Session...");
    const authRes = await fetch(`${backendUrl}/store/payment-collections/${payColId}/sessions/${sessionId}/authorize`, {
        method: "POST", headers: internalHeaders, body: JSON.stringify({})
    });
    if (!authRes.ok) {
        const authErr = await authRes.json();
        console.error("❌ 授權失敗:", authErr);
        throw new Error("無法授權支付會話，請確認 Medusa Provider 設定");
    }

    // Step D: 完成購物車轉為訂單
    console.log("👉 [Medusa] Step D: Completing Cart...");
    const completeRes = await fetch(`${backendUrl}/store/carts/${cart_id}/complete`, {
      method: "POST", headers: { ...internalHeaders, "Idempotency-Key": `complete_${cart_id}` }
    });

    let completeData: any = await completeRes.json();

    if (!completeRes.ok) {
      console.error("❌ [Medusa] 轉單失敗:", completeData);
      return res.status(completeRes.status).json({ message: completeData.message || "Medusa 訂單建立失敗" });
    }

    console.log("🎉 [Medusa] 訂單建立成功！");
    return res.status(200).json(completeData);

  } catch (error: any) {
    console.error("\n❌ [後端 API 捕捉到致命錯誤]:", error.message);
    return res.status(500).json({ message: error.message });
  }
}