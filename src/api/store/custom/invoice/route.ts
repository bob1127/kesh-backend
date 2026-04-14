import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import crypto from "crypto";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    // 1. 接收從 notify.js 傳過來的訂單資料
    const { 
      orderId, 
      amount, 
      email, 
      items, 
      buyerName = "客人", 
      phone = "", 
      taxId = "" // 統編
    } = req.body as any;

    console.log(`\n🧾 [光貿發票開立] 啟動！準備開立訂單: ${orderId}`);

    // 2. 讀取環境變數
    const appKey = process.env.INVOICE_APP_KEY; // 光貿 App Key
    const merchantTaxId = process.env.INVOICE_MERCHANT_ID; // 你自己公司的統編

    if (!appKey || !merchantTaxId) {
       throw new Error("伺服器缺少光貿發票金鑰 (INVOICE_APP_KEY 或 INVOICE_MERCHANT_ID)");
    }

    // 3. 判斷 B2B (打統編) 還是 B2C (不打統編)，計算稅額
    const isB2B = taxId && taxId.length === 8;
    let taxAmount = 0;
    let salesAmount = amount;

    if (isB2B) {
      // 打統編：稅額 = 總計 - Round(總計 / 1.05)
      taxAmount = amount - Math.round(amount / 1.05);
      salesAmount = amount - taxAmount;
    }

    // 4. 準備發票明細 (ProductItem)
    const productItems = items.map((item: any) => ({
      Description: item.name.substring(0, 256), // 品名不可超過 256 字
      Quantity: String(item.quantity),
      UnitPrice: String(item.price),
      Amount: String(item.price * item.quantity),
      Remark: "",
      TaxType: "1" // 1: 應稅
    }));

    // 5. 組合光貿要求的 Data JSON 物件
    const invoiceDataObj = {
      OrderId: String(orderId).substring(0, 40),
      BuyerIdentifier: isB2B ? taxId : "0000000000",
      BuyerName: isB2B && buyerName === "客人" ? taxId : buyerName, // 若打統編且沒給抬頭，光貿規定填統編
      BuyerAddress: "",
      BuyerTelephoneNumber: phone,
      BuyerEmailAddress: email || "",
      MainRemark: "",
      CarrierType: "", // 載具類別 (可依需求擴充)
      CarrierId1: "",
      CarrierId2: "",
      NPOBAN: "", // 捐贈碼
      ProductItem: productItems,
      SalesAmount: String(salesAmount),
      FreeTaxSalesAmount: "0",
      ZeroTaxSalesAmount: "0",
      TaxType: "1",
      TaxRate: "0.05",
      TaxAmount: String(taxAmount),
      TotalAmount: String(amount)
    };

    // 將資料轉成 JSON 字串
    const dataJsonString = JSON.stringify(invoiceDataObj);

    // =========================================================
    // 🚨 核心加密區：產生光貿專屬的 MD5 簽名 (Sign)
    // 加密規則：md5(data 轉 json 格式字串 + time + APP Key)
    // =========================================================
    const time = Math.floor(Date.now() / 1000).toString(); // Unix 時間戳記 (秒)
    const signString = dataJsonString + time + appKey;
    const sign = crypto.createHash("md5").update(signString).digest("hex");

    console.log(`🧾 準備送出發票 API (MD5 簽名已生成)`);

    // 6. 組合 x-www-form-urlencoded 的 Request Body
    const formData = new URLSearchParams();
    formData.append("invoice", merchantTaxId); // 你的公司統編
    formData.append("data", dataJsonString);   // fetch 會自動幫我們做 URL encode
    formData.append("time", time);
    formData.append("sign", sign);

    // 7. 發送請求至光貿正式機 (MIG 4.0: /json/f0401)
    const amegoRes = await fetch("https://invoice-api.amego.tw/json/f0401", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded" // ⚠️ 官方規定不能用 application/json
      },
      body: formData.toString()
    });

    const result = await amegoRes.json();
    console.log(`🔍 光貿 API 回傳結果:`, result);

    // 8. 判斷開立結果 (code === 0 代表成功)
    if (result.code === 0) {
      console.log(`✅ 發票開立大成功！發票號碼: ${result.invoice_number}`);
      return res.status(200).json({ success: true, data: result });
    } else {
      console.error(`❌ 發票開立失敗:`, result.msg);
      return res.status(400).json({ success: false, message: result.msg, data: result });
    }

  } catch (error: any) {
    console.error("🔥 發票 API 發生系統例外:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}