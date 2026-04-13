// @ts-nocheck
import { AbstractPaymentService } from "@medusajs/medusa";

class TappayService extends AbstractPaymentService {
  static identifier = "kesh-tappay"; // 👉 確保這裡叫 kesh-tappay

  constructor(container: any) {
    super(container);
    console.log("🚀🚀🚀 [狂賀] TapPay 成功登入系統大腦！準備執行扣款！");
  }

  async getStatus(data: any) { 
    return "authorized" as any; 
  }
  
  async createPayment(cart: any) { 
    return { status: "pending" }; 
  }
  
  async retrievePayment(data: any) { 
    return data; 
  }
  
  async updatePayment(sessionData: any, cart: any) { 
    return sessionData; 
  }
  
  async updatePaymentData(sessionData: any, data: any) { 
    return { ...sessionData, ...data }; 
  }

  // 🚨 這是這次大改版的核心：真正去呼叫 TapPay 銀行主機的邏輯
  async authorizePayment(session: any, context: any) {
    try {
      // 1. 取得前端傳來的 Prime (授權碼)
      const prime = session.data.prime;
      if (!prime) {
        throw new Error("❌ 缺少 TapPay Prime 授權碼");
      }

      // 2. 讀取你 .env 裡面的正式版金鑰
      const partnerKey = process.env.TAPPAY_PARTNER_KEY;
      const merchantId = process.env.TAPPAY_MERCHANT_ID;
      
      if (!partnerKey || !merchantId) {
         throw new Error("❌ 後端 .env 缺少 TAPPAY_PARTNER_KEY 或 TAPPAY_MERCHANT_ID");
      }

      // 3. 判斷環境，決定打測試機還是正式機
      const isProd = process.env.TAPPAY_ENV === "production";
      const tappayApiUrl = isProd 
        ? "https://prod.tappaysdk.com/tpc/payment/pay-by-prime" 
        : "https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime";

      console.log(`📡 [TapPay Service] 準備向 TapPay 發送扣款請求... (環境: ${isProd ? "正式機" : "測試機"})`);

      // 4. 組合要發給 TapPay 的標準格式資料
      const payload = {
        prime: prime,
        partner_key: partnerKey,
        merchant_id: merchantId,
        details: "KESH Online Order", // 你的訂單摘要
        amount: context.cart.total || 0, // Medusa 算出的總金額
        cardholder: {
          phone_number: context.cart.shipping_address?.phone || "0900000000",
          name: context.cart.shipping_address?.first_name || "Customer",
          email: context.cart.email || "customer@example.com",
        },
        // 👇 這是給 3D 驗證用的，收完 OTP 簡訊後要跳轉回哪個畫面
        result_url: {
          // 測試時先寫 localhost，之後上線要改成你們真實的網址 (例如 https://www.kesh-de1.com/checkout)
          frontend_redirect_url: "http://localhost:3000/checkout?tappay_success=true",
          backend_notify_url: "http://localhost:9000/tappay/notify" 
        }
      };

      // 5. 正式發射 API 給 TapPay
      const response = await fetch(tappayApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": partnerKey as string,
        },
        body: JSON.stringify(payload),
      });

      const tappayResult = await response.json();
      console.log("🔍 [TapPay Service] 銀行主機回傳結果:", tappayResult);

      // 6. 判斷 TapPay 回傳的扣款結果
      if (tappayResult.status === 0) {
        // ✅ 扣款完全成功 (免 3D 驗證的卡片會走這條)
        console.log("🎉 [TapPay Service] 扣款成功！");
        return { 
          data: { ...session.data, tappayResponse: tappayResult }, 
          status: "authorized" as any 
        };
      } else if (tappayResult.status === 3 && tappayResult.payment_url) {
        // 🚨 這是 3D 驗證卡片！必須通知前端準備跳轉
        console.log("⚠️ [TapPay Service] 需要 3D 驗證，請前端跳轉至:", tappayResult.payment_url);
        return {
          data: { 
            ...session.data, 
            tappayResponse: tappayResult,
            payment_url: tappayResult.payment_url // 把跳轉網址存進 data，讓前端抓
          },
          status: "requires_more" as any // 讓 Medusa 知道這筆訂單還沒結案
        };
      } else {
        // ❌ 扣款失敗 (餘額不足、卡號錯誤等)
        console.error(`❌ [TapPay Service] 扣款失敗: ${tappayResult.msg} (代碼: ${tappayResult.status})`);
        throw new Error(`TapPay 扣款失敗: ${tappayResult.msg}`);
      }

    } catch (error) {
      console.error("❌ [TapPay Service] 系統發生嚴重錯誤:", error);
      return { data: session.data, status: "error" as any };
    }
  }

  async capturePayment(payment: any) { 
    return payment.data; 
  }
  
  async refundPayment(payment: any, amount: number) { 
    return payment.data; 
  }
  
  async cancelPayment(payment: any) { 
    return payment.data; 
  }
  
  async deletePayment(session: any) { 
    return; 
  }
  
  async getPaymentData(session: any) { 
    return session.data; 
  }
}

export default TappayService;