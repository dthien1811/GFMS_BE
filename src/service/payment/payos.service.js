require("dotenv").config();

let payos = null;

function getPayOS() {
  if (payos) return payos;

  const {
    PAYOS_CLIENT_ID,
    PAYOS_API_KEY,
    PAYOS_CHECKSUM_KEY
  } = process.env;

  if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
    console.warn("[PayOS] Missing env → MOCK mode");
    return null;
  }

  try {
    const PayOSModule = require("@payos/node");
    const PayOSClass = PayOSModule.default || PayOSModule;
    
    payos = new PayOSClass({
      clientId: PAYOS_CLIENT_ID,
      apiKey: PAYOS_API_KEY,
      checksumKey: PAYOS_CHECKSUM_KEY,
    });
    
    console.log("✅ PayOS initialized!");
    return payos;
  } catch (error) {
    try {
      const { PayOS: PayOSClass } = require("@payos/node");
      payos = new PayOSClass({
        clientId: PAYOS_CLIENT_ID,
        apiKey: PAYOS_API_KEY,
        checksumKey: PAYOS_CHECKSUM_KEY,
      });
      
      console.log("✅ PayOS initialized successfully!");
      return payos;
    } catch (error2) {
      console.error("❌ PayOS init error:", error2.message);
      return null;
    }
  }
}

async function createPackagePaymentLink({ orderCode, amount, description }) {
  const client = getPayOS();

  if (!client) {
    return {
      checkoutUrl: `https://sandbox.payos.local/mock?orderCode=${orderCode}`,
      orderCode,
    };
  }

  // ✅ Rút ngắn description xuống tối đa 25 ký tự
  let shortDesc = description || "Thanh toan goi tap";
  if (shortDesc.length > 25) {
    shortDesc = shortDesc.substring(0, 22) + "...";
  }

  const paymentData = {
    orderCode: Number(orderCode),
    amount: Math.round(Number(amount)),
    description: shortDesc,
    returnUrl:
      process.env.PAYOS_RETURN_URL ||
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/member/my-packages?payos=success&orderCode=${encodeURIComponent(
        orderCode
      )}`,
    cancelUrl:
      process.env.PAYOS_CANCEL_URL ||
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/member/packages?payos=cancel`,
  };

  console.log("\n💳 Creating payment link with data:", paymentData);

  try {
    const response = await client.paymentRequests.create(paymentData);
    console.log("✅ Payment link created:", response.checkoutUrl);
    
    return {
      checkoutUrl: response.checkoutUrl,
      orderCode: response.orderCode,
      paymentLinkId: response.paymentLinkId || response.id,
    };
  } catch (error) {
    console.error("❌ Create payment error:", error.message);
    throw error;
  }
}

function verifyWebhook(webhookBody) {
  const client = getPayOS();
  if (!client) return webhookBody;
  
  try {
    if (client.webhooks && typeof client.webhooks.verify === 'function') {
      return client.webhooks.verify(webhookBody);
    }
  } catch (e) {
    console.error("❌ Webhook verify error:", e.message);
  }
  
  return webhookBody;
}

async function getPaymentLinkInformation(id) {
  const client = getPayOS();
  if (!client) return null;

  try {
    if (client.paymentRequests && typeof client.paymentRequests.get === "function") {
      return await client.paymentRequests.get(id);
    }
  } catch (e) {
    const detail = e?.message || e;
    console.error("❌ PayOS getPaymentLinkInformation error:", detail);
  }

  return null;
}

module.exports = {
  createPackagePaymentLink,
  verifyWebhook,
  getPaymentLinkInformation,
};