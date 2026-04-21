require('dotenv').config();

let payos = null;

function getPayOS() {
  if (payos) return payos;

  const PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID || process.env.PAYOS_CLIENTID;
  const PAYOS_API_KEY = process.env.PAYOS_API_KEY || process.env.PAYOS_KEY;
  const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY || process.env.PAYOS_SECRET_KEY;

  if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
    console.warn('[PayOS] Missing env → MOCK mode');
    return null;
  }

  try {
    const PayOSModule = require('@payos/node');
    const PayOSClass = PayOSModule.default || PayOSModule.PayOS || PayOSModule;
    payos = new PayOSClass({
      clientId: PAYOS_CLIENT_ID,
      apiKey: PAYOS_API_KEY,
      checksumKey: PAYOS_CHECKSUM_KEY,
    });
    return payos;
  } catch (error) {
    console.error('❌ PayOS init error:', error.message);
    return null;
  }
}

function normalizeDescription(description) {
  const base = String(description || 'Thanh toan combo').trim() || 'Thanh toan combo';
  return base.length > 25 ? `${base.slice(0, 22)}...` : base;
}

async function createPaymentLink({ orderCode, amount, description, returnUrl, cancelUrl, metadata }) {
  const client = getPayOS();

  if (!client) {
    return {
      checkoutUrl: `https://sandbox.payos.local/mock?orderCode=${orderCode}`,
      orderCode,
      paymentLinkId: `mock-${orderCode}`,
      metadata: metadata || null,
    };
  }

  const paymentData = {
    orderCode: Number(orderCode),
    amount: Math.round(Number(amount)),
    description: normalizeDescription(description),
    returnUrl:
      returnUrl ||
      process.env.PAYOS_RETURN_URL ||
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/member/payment-success?payos=success&orderCode=${encodeURIComponent(orderCode)}`,
    cancelUrl:
      cancelUrl ||
      process.env.PAYOS_CANCEL_URL ||
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/member/payment-success?payos=cancel`,
  };

  try {
    const response = await client.paymentRequests.create(paymentData);
    return {
      checkoutUrl: response.checkoutUrl,
      orderCode: response.orderCode,
      paymentLinkId: response.paymentLinkId || response.id,
      metadata: metadata || null,
    };
  } catch (error) {
    console.error('❌ Create payment error:', error.message);
    throw error;
  }
}

async function createPackagePaymentLink(args) {
  return createPaymentLink(args);
}

function verifyWebhook(webhookBody) {
  const client = getPayOS();
  if (!client) return webhookBody;

  try {
    if (client.webhooks && typeof client.webhooks.verify === 'function') {
      return client.webhooks.verify(webhookBody);
    }
  } catch (e) {
    console.error('❌ Webhook verify error:', e.message);
  }

  return webhookBody;
}

async function getPaymentLinkInformation(id) {
  const client = getPayOS();
  if (!client) return null;

  try {
    if (client.paymentRequests && typeof client.paymentRequests.get === 'function') {
      return await client.paymentRequests.get(id);
    }
  } catch (e) {
    console.error('❌ PayOS getPaymentLinkInformation error:', e?.message || e);
  }

  return null;
}

module.exports = {
  createPackagePaymentLink,
  createPaymentLink,
  verifyWebhook,
  getPaymentLinkInformation,
};
