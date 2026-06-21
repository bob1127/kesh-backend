import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

const PRODUCTION_NOTIFY_URL =
  "https://kesh-backend-production.up.railway.app/tappay/notify";

function formatTapPayError(result: { status?: number; msg?: string }, isAtm: boolean) {
  const prefix = isAtm ? "虛擬帳號建立失敗" : "扣款失敗";
  const status = result?.status;
  const msg = result?.msg || "請稍後再試";

  if (status === 627) {
    return `${prefix}: TapPay 不接受目前的 callback 網址（須為 https 正式網域）。請設定 TAPPAY_NOTIFY_URL=${PRODUCTION_NOTIFY_URL}`;
  }

  if (status === 915 && isAtm) {
    return `${prefix}: TapPay 系統錯誤，常見原因是 ATM 使用了信用卡 Merchant ID。請至 TapPay Portal 確認 Virtual Account 專用 Merchant ID，並設定 TAPPAY_ATM_MERCHANT_ID。`;
  }

  return `${prefix}: ${msg}${status ? ` (TapPay #${status})` : ""}`;
}

function resolveNotifyUrl(backendUrl: string): string {
  if (process.env.TAPPAY_NOTIFY_URL) {
    return process.env.TAPPAY_NOTIFY_URL;
  }

  const env = process.env.TAPPAY_ENV || "sandbox";
  if (env === "production") {
    return PRODUCTION_NOTIFY_URL;
  }

  return `${backendUrl}/tappay/notify`;
}

function resolveBackendUrl(req: MedusaRequest): string {
  if (process.env.MEDUSA_BACKEND_URL) {
    return process.env.MEDUSA_BACKEND_URL.replace(/\/$/, "");
  }

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) {
    return `https://${railwayDomain}`;
  }

  const host = req.get("host");
  if (host) {
    const protocol = req.protocol || "https";
    return `${protocol}://${host}`;
  }

  return "http://localhost:9000";
}

function formatPhoneForTapPay(phone: string): string {
  const digits = (phone || "0900000000").replace(/\D/g, "");
  if (digits.startsWith("886")) return `+${digits}`;
  if (digits.startsWith("0")) return `+886${digits.slice(1)}`;
  return `+886${digits}`;
}

async function storeFetch(
  backendUrl: string,
  path: string,
  headers: Record<string, string>,
  init?: RequestInit
) {
  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function completeMedusaOrder(
  backendUrl: string,
  headers: Record<string, string>,
  cartId: string
) {
  const idempotencyKey = `complete_${cartId}`;

  const payColRes = await storeFetch(backendUrl, "/store/payment-collections", headers, {
    method: "POST",
    body: JSON.stringify({ cart_id: cartId }),
  });

  const payColId = payColRes.data?.payment_collection?.id;
  if (!payColId) {
    throw new Error("無法建立付款流程，請稍後再試。");
  }

  await storeFetch(
    backendUrl,
    `/store/payment-collections/${payColId}/payment-sessions`,
    headers,
    {
      method: "POST",
      body: JSON.stringify({ provider_id: "pp_tappay_tappay" }),
    }
  );

  const completeRes = await storeFetch(
    backendUrl,
    `/store/carts/${cartId}/complete`,
    headers,
    {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": idempotencyKey },
    }
  );

  if (completeRes.response.ok) {
    return completeRes.data;
  }

  if (completeRes.response.status === 409) {
    const orderSearchRes = await storeFetch(
      backendUrl,
      `/store/orders?cart_id=${cartId}`,
      headers
    );

    if (orderSearchRes.data?.orders?.length > 0) {
      return { type: "order", order: orderSearchRes.data.orders[0] };
    }

    return { type: "order", order: {} };
  }

  throw new Error(
    completeRes.data?.message || "訂單建立失敗，請聯絡客服或稍後再試。"
  );
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { cart_id, prime, payment_method } = req.body as {
    cart_id?: string;
    prime?: string;
    payment_method?: string;
  };

  const pubKey = req.headers["x-publishable-api-key"] as string;
  if (!pubKey) {
    return res.status(400).json({ message: "缺少 x-publishable-api-key" });
  }

  if (!cart_id || !prime) {
    return res.status(400).json({ message: "缺少 cart_id 或 prime" });
  }

  const isAtm = payment_method === "ATM";
  const backendUrl = resolveBackendUrl(req);
  const internalHeaders = {
    "Content-Type": "application/json",
    "x-publishable-api-key": pubKey,
  };

  try {
    const cartRes = await storeFetch(
      backendUrl,
      `/store/carts/${cart_id}`,
      internalHeaders
    );

    if (!cartRes.response.ok) {
      return res.status(cartRes.response.status).json(cartRes.data);
    }

    const cart = cartRes.data.cart;
    const amount = cart.total;
    const email = cart.email;
    const phone = cart.shipping_address?.phone || "0900000000";
    const firstName = cart.shipping_address?.first_name || "Customer";
    const lastName = cart.shipping_address?.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();

    const partnerKey = process.env.TAPPAY_PARTNER_KEY;
    const merchantId = isAtm
      ? process.env.TAPPAY_ATM_MERCHANT_ID || process.env.TAPPAY_MERCHANT_ID
      : process.env.TAPPAY_MERCHANT_ID;
    const env = process.env.TAPPAY_ENV || "sandbox";

    if (!partnerKey || !merchantId) {
      throw new Error("伺服器遺失 TapPay 金鑰設定");
    }

    const tappayApiUrl =
      env === "production"
        ? "https://prod.tappaysdk.com/tpc/payment/pay-by-prime"
        : "https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime";

    const frontendUrl =
      process.env.NEXT_PUBLIC_STORE_URL || "https://www.kesh-de1.com";
    const notifyUrl = resolveNotifyUrl(backendUrl);

    console.log(
      `\n🛒 [TapPay 結帳] cart=${cart_id} method=${payment_method || "CREDIT_CARD"} amount=${amount} notify=${notifyUrl}`
    );

    const payload: Record<string, unknown> = {
      prime,
      partner_key: partnerKey,
      merchant_id: merchantId,
      details: "KESH Online Order",
      amount,
      order_number: cart_id,
      cardholder: {
        phone_number: formatPhoneForTapPay(phone),
        name: fullName,
        email: email || "customer@example.com",
      },
      remember: false,
      result_url: {
        backend_notify_url: notifyUrl,
      },
    };

    if (isAtm) {
      payload.expire_in_days = Number(process.env.TAPPAY_ATM_EXPIRE_DAYS || 3);
    } else {
      payload.three_domain_secure = true;
      payload.result_url = {
        frontend_redirect_url: `${frontendUrl}/checkout`,
        backend_notify_url: notifyUrl,
      };
    }

    const tappayRes = await fetch(tappayApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": partnerKey,
      },
      body: JSON.stringify(payload),
    });

    const tappayResult = await tappayRes.json();
    console.log("🔍 TapPay 回傳:", tappayResult);

    if (isAtm) {
      if (tappayResult.status !== 0) {
        return res.status(400).json({
          message: formatTapPayError(tappayResult, true),
        });
      }

      const payeeInfo = tappayResult.payee_info || {};
      const completeData = await completeMedusaOrder(
        backendUrl,
        internalHeaders,
        cart_id
      );

      if (completeData.order?.id) {
        const orderModule = req.scope.resolve("order") as {
          updateOrders: (
            data: Array<{ id: string; metadata: Record<string, unknown> }>
          ) => Promise<unknown>;
        };

        await orderModule.updateOrders([
          {
            id: completeData.order.id,
            metadata: {
              ...(completeData.order.metadata || {}),
              payment_method: "ATM",
              atm_bank_code: payeeInfo.vacc_bank_code,
              atm_vaccount: payeeInfo.vacc_no,
              atm_expire_time: payeeInfo.expire_time,
              tappay_rec_trade_id: tappayResult.rec_trade_id,
            },
          },
        ]);
      }

      return res.status(200).json({
        bank_code: payeeInfo.vacc_bank_code,
        vaccount: payeeInfo.vacc_no,
        expire_date: payeeInfo.expire_time,
        order: completeData.order,
      });
    }

    if (tappayResult.status !== 0 && tappayResult.status !== 3) {
      return res.status(400).json({
        message: formatTapPayError(tappayResult, false),
      });
    }

    const completeData = await completeMedusaOrder(
      backendUrl,
      internalHeaders,
      cart_id
    );

    console.log(`🎉 訂單建立成功: ${completeData.order?.id}`);

    if (completeData.order?.id) {
      try {
        const paymentId = completeData.order.payments?.[0]?.id;
        if (paymentId) {
          const captureRes = await fetch(
            `${backendUrl}/admin/payments/${paymentId}/capture`,
            { method: "POST", headers: internalHeaders }
          );

          if (captureRes.ok) {
            console.log("✅ 訂單款項已標記為 Captured");
          }
        }
      } catch (captureErr) {
        console.error("⚠️ Capture 發生錯誤:", captureErr);
      }
    }

    if (tappayResult.payment_url) {
      completeData.type = "order";
      if (!completeData.order) completeData.order = {};
      completeData.order.payment_status = "requires_action";
      completeData.order.payments = [
        { data: { payment_url: tappayResult.payment_url } },
      ];
    }

    return res.status(200).json(completeData);
  } catch (error: any) {
    console.error("🔥 TapPay 結帳例外:", error);
    return res.status(500).json({ message: error.message || "結帳失敗" });
  }
}
