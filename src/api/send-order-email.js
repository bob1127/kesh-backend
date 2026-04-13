import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { email, name, orderId, items, amount, shippingMethod, paymentMethod } = req.body;

  // 1. 設定發信帳號 (建議用 Gmail + 應用程式密碼)
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // 你的 Gmail (例如: contact@kesh-de1.com)
      pass: process.env.EMAIL_PASS, // 你的 Gmail 應用程式密碼
    },
  });

  // 2. KESH 極簡黑白風格 HTML 模板
  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
      <div style="text-align: center; padding: 40px 0; border-bottom: 1px solid #eee;">
        <h1 style="margin: 0; font-size: 24px; letter-spacing: 4px; text-transform: uppercase;">K E S H .</h1>
      </div>

      <div style="padding: 40px 20px;">
        <p style="font-size: 14px; text-transform: uppercase; letter-spacing: 2px; color: #666;">Order Confirmation</p>
        <h2 style="font-size: 20px; font-weight: normal; margin-top: 10px;">Hi ${name},</h2>
        <p style="color: #666; font-size: 14px;">Thank you for your purchase. We are getting your order ready to be shipped. We will notify you when it has been sent.</p>
        
        <div style="margin-top: 30px; padding: 20px; background-color: #f9f9f9; border-radius: 4px;">
          <p style="margin: 0; font-size: 13px; color: #666;"><strong>Order ID:</strong> #${orderId}</p>
          <p style="margin: 5px 0 0; font-size: 13px; color: #666;"><strong>Payment Method:</strong> ${paymentMethod === 'TAPPAY' ? 'Credit Card' : paymentMethod}</p>
          <p style="margin: 5px 0 0; font-size: 13px; color: #666;"><strong>Shipping:</strong> ${shippingMethod}</p>
        </div>
      </div>

      <div style="padding: 0 20px;">
        <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Order Summary</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          ${items.map(item => `
            <tr>
              <td style="padding: 15px 0; border-bottom: 1px solid #eee; width: 70%;">
                <p style="margin: 0; font-size: 14px; text-transform: uppercase;">${item.name}</p>
                <p style="margin: 5px 0 0; font-size: 12px; color: #999;">QTY: ${item.quantity}</p>
              </td>
              <td style="padding: 15px 0; border-bottom: 1px solid #eee; text-align: right; font-size: 14px;">
                NT$ ${Number(item.price * item.quantity).toLocaleString()}
              </td>
            </tr>
          `).join('')}
        </table>
        
        <table style="width: 100%; margin-top: 20px;">
          <tr>
            <td style="text-align: right; padding: 5px 0; font-size: 14px; color: #666;">Subtotal</td>
            <td style="text-align: right; padding: 5px 0; font-size: 14px;">NT$ ${Number(amount).toLocaleString()}</td>
          </tr>
          <tr>
            <td style="text-align: right; padding: 5px 0; font-size: 14px; color: #666;">Shipping</td>
            <td style="text-align: right; padding: 5px 0; font-size: 14px;">FREE</td>
          </tr>
          <tr>
            <td style="text-align: right; padding: 15px 0; font-size: 16px; font-weight: bold;">Total</td>
            <td style="text-align: right; padding: 15px 0; font-size: 16px; font-weight: bold;">NT$ ${Number(amount).toLocaleString()}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; padding: 40px 20px; margin-top: 40px; background-color: #fafafa; font-size: 12px; color: #999;">
        <p style="margin: 0;">If you have any questions, reply to this email or contact us at contact@kesh-de1.com</p>
        <p style="margin: 10px 0 0;">© ${new Date().getFullYear()} KESH. All rights reserved.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"KESH" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Order Confirmation #${orderId.substring(0, 8)}`,
      html: htmlContent,
    });
    return res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("Email Error:", error);
    return res.status(500).json({ error: "Failed to send email" });
  }
}