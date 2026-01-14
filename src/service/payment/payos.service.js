import dotenv from "dotenv";

// Đảm bảo biến môi trường được load (trong server.js cũng đã gọi rồi, nhưng thêm ở đây cho chắc)
dotenv.config();

// SDK payOS (cài ở package.json)
// Theo docs hiện tại dùng CommonJS, Babel sẽ transpile nên require vẫn dùng được
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PayOS } = require("@payos/node");

let payosInstance = null;

function getPayOS() {
  if (payosInstance) return payosInstance;

  const clientId = process.env.PAYOS_CLIENT_ID;
  const apiKey = process.env.PAYOS_API_KEY;
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY;

  if (!clientId || !apiKey || !checksumKey) {
    console.warn(
      "[payOS] Thiếu PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY trong .env – chế độ mock"
    );
    return null;
  }

  payosInstance = new PayOS({ clientId, apiKey, checksumKey });
  return payosInstance;
}

const payosService = {
  /**
   * Tạo link thanh toán cho gói tập
   * @returns {Promise<{ checkoutUrl: string, orderCode: string|number, raw: any }>}
   */
  async createPackagePaymentLink({ orderCode, amount, description }) {
    const payos = getPayOS();

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new Error("Số tiền thanh toán không hợp lệ.");
    }

    const payload = {
      orderCode,
      amount: Math.round(numericAmount),
      description: description || "Thanh toán gói tập",
      returnUrl:
        process.env.PAYOS_RETURN_URL || "http://localhost:3000/member/my-packages?payos=success",
      cancelUrl:
        process.env.PAYOS_CANCEL_URL || "http://localhost:3000/member/packages?payos=cancel",
    };

    // Nếu chưa cấu hình payOS thật thì mock checkoutUrl để dev FE
    if (!payos) {
      const fakeUrl = `https://sandbox.payos.local/mock-checkout?orderCode=${encodeURIComponent(
        String(orderCode)
      )}&amount=${payload.amount}`;
      return {
        checkoutUrl: fakeUrl,
        orderCode,
        raw: { mock: true, ...payload },
      };
    }

    const resp = await payos.createPaymentLink(payload);
    // Tùy theo SDK, key có thể là checkoutUrl / paymentUrl – map về checkoutUrl cho FE
    const checkoutUrl = resp.checkoutUrl || resp.paymentUrl || resp.payUrl;

    if (!checkoutUrl) {
      throw new Error("Không lấy được checkoutUrl từ payOS.");
    }

    return {
      checkoutUrl,
      orderCode: resp.orderCode || orderCode,
      raw: resp,
    };
  },

  /**
   * Xác thực webhook từ payOS.
   * Trả về data đã verify hoặc ném lỗi nếu checksum sai.
   */
  verifyWebhook(webhookBody) {
    const payos = getPayOS();
    if (!payos) {
      console.warn("[payOS] verifyWebhook đang ở chế độ mock – bỏ qua verify checksum.");
      return webhookBody;
    }

    return payos.verifyPaymentWebhookData(webhookBody);
  },
};

export default payosService;

