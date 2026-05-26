const axios = require('axios');
const crypto = require('crypto');

async function createVirtualAccount(user, amount, ref) {
  const payload = {
    email: user.gmail,
    is_permanent: false,
    bvn: '22222222222', // placeholder — Flutterwave requires BVN for some accounts; use your business BVN
    tx_ref: ref,
    amount,
    currency: 'NGN',
    narration: `Marketplace Pro Plan - ${user.firstName}`
  };

  const response = await axios.post(
    'https://api.flutterwave.com/v3/virtual-account-numbers',
    payload,
    { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
  );

  return response.data;
}

async function verifyPayment(ref) {
  try {
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions?tx_ref=${ref}`,
      { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
    );
    const transactions = response.data.data;
    if (!transactions || transactions.length === 0) return null;
    const tx = transactions[0];
    if (tx.status === 'successful') return tx;
    return null;
  } catch (err) {
    console.error('Payment verify error:', err.message);
    return null;
  }
}

function generateRef(telegramId) {
  return `MKT_${telegramId}_${Date.now()}`;
}

function verifyWebhookSignature(body, signature) {
  const hash = crypto
    .createHmac('sha256', process.env.FLW_SECRET_KEY)
    .update(JSON.stringify(body))
    .digest('hex');
  return hash === signature;
}

module.exports = { createVirtualAccount, verifyPayment, generateRef, verifyWebhookSignature };
