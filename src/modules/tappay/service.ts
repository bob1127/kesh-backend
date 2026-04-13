import { AbstractPaymentProvider, PaymentSessionStatus } from "@medusajs/framework/utils"

class TappayService extends AbstractPaymentProvider<any> {
  static identifier = "tappay" 

  constructor(container: any) {
    super(container)
    console.log("🚀🚀🚀 [系統訊息] TapPay 笨蛋通關模組已就緒。");
  }

  async getPaymentStatus(paymentSessionData: any): Promise<any> {
    return { status: PaymentSessionStatus.AUTHORIZED } 
  }

  // 🚨 修正核心 1：初始化必須是 PENDING！不能太早 AUTHORIZED，否則會發生 409 撞車！
  async initiatePayment(input: any): Promise<any> {
    return { 
      data: input?.context?.data || input?.context || {}, 
      status: PaymentSessionStatus.PENDING 
    }
  }

  async authorizePayment(input: any): Promise<any> {
    console.log("⚡️ [內部流程] Medusa 呼叫授權，回傳 AUTHORIZED 通關！");
    return { 
      status: PaymentSessionStatus.AUTHORIZED,
      data: input?.paymentSessionData || input?.context?.data || {}
    };
  }

  async updatePayment(input: any): Promise<any> {
    return { data: input?.data || {}, status: PaymentSessionStatus.PENDING }
  }

  async capturePayment(paymentSessionData: any): Promise<any> { return paymentSessionData }
  async refundPayment(input: any): Promise<any> { return input }
  async cancelPayment(paymentSessionData: any): Promise<any> { return paymentSessionData }
  async deletePayment(paymentSessionData: any): Promise<any> { return paymentSessionData }
  async retrievePayment(paymentSessionData: any): Promise<any> { return paymentSessionData }
  async getWebhookActionAndData(data: any): Promise<any> { return { action: "not_supported", data: data?.data || {} } }
}

export default TappayService