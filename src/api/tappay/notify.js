// src/pages/api/tappay/notify.js
export default async function handler(req, res) {
  // TapPay 會用 POST 把結果傳進來
  if (req.method !== "POST") return res.status(405).end();

  const tappayData = req.body;
  console.log("🔔 [Webhook 收到 TapPay 通知]:", tappayData);

  // 如果狀態不是 0 (成功)，代表客人 3D 驗證失敗或按了取消，我們什麼都不做！
  if (tappayData.status !== 0) {
    console.log(`❌ 交易未成功 (狀態: ${tappayData.status})，不執行任何動作。`);
    return res.status(200).send("OK"); // 永遠回傳 200 給 TapPay，不然它會一直重試
  }

  // 1. 從 TapPay 傳回來的 order_number 抓出我們當初塞進去的 cart_id
  const cartId = tappayData.order_number;
  if (!cartId) return res.status(200).send("No Cart ID");

  console.log(`✅ 交易大成功！準備處理 Cart: ${cartId} 的後續動作...`);

  try {
    // 準備超級管理員的 Headers (解決 401 問題)
    const adminHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.MEDUSA_ADMIN_API_KEY}` // 使用你剛申請的 Secret Key
    };

    // ==========================================
    // 動作 A：找出 Order 並執行 Capture (請款)
    // ==========================================
    const orderSearchRes = await fetch(`http://localhost:9000/admin/orders?cart_id=${cartId}`, { headers: adminHeaders });
    const orderData = await orderSearchRes.json();
    const order = orderData.orders?.[0];

    if (order) {
      const paymentId = order.payments?.[0]?.id;
      if (paymentId) {
        await fetch(`http://localhost:9000/admin/payments/${paymentId}/capture`, {
          method: "POST", headers: adminHeaders
        });
        console.log(`💰 成功將 Order ${order.id} 標記為 Captured (已付款)！`);
      }
      
      // ==========================================
      // 動作 B：寄送 Email (保證只在收到錢後寄出！)
      // ==========================================
      const emailPayload = {
        email: order.email,
        name: order.shipping_address?.first_name || "Customer",
        orderId: order.id,
        amount: order.total,
        shippingMethod: "宅配/超商", // 這裡可依需求調整
        paymentMethod: "Credit Card (TapPay)",
        items: order.items.map(item => ({
          name: item.title,
          price: item.unit_price,
          quantity: item.quantity
        }))
      };
      
      await fetch("http://localhost:3000/api/send-order-email", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(emailPayload)
      }).catch(e => console.log("Email error:", e));
      console.log(`💌 訂單確認信已寄出！`);

      // ==========================================
      // 動作 C：開立電子發票 (保證只在收到錢後開立！)
      // ==========================================
      // await fetch("http://localhost:3000/api/invoice", { ... }).catch(e => console.log("Invoice error", e));
      // console.log(`🧾 發票已開立！`);
    }

    // 最後一定要回傳 200 OK 給 TapPay，代表你收到了
    return res.status(200).send("OK");
  } catch (error) {
    console.error("🔥 Webhook 處理發生錯誤:", error);
    return res.status(200).send("Error but received"); // 還是回傳 200，避免 TapPay 狂塞
  }
}