const axios = require('axios');
const crypto = require('crypto');

const PREFERRED_BANKS = ['providus', 'wema bank'];

async function createVirtualAccount(user, amount, ref) {
  const lastName = user.firstName || 'User';

  for (let attempt = 1; attempt <= 5; attempt++) {
    const payload = {
      email: user.gmail,
      is_permanent: false,
      bvn: '22650878518',
      tx_ref: `${ref}_a${attempt}`,
      amount,
      currency: 'NGN',
      phonenumber: '08107517052',
      firstname: 'CampusMarketplace',
      lastname: lastName,
      preferred_bank: 'providus',
      narration: `CampusMarketplace ${lastName}`
    };

    console.log(`FLW attempt ${attempt} payload:`, JSON.stringify(payload));

    try {
      const response = await axios.post(
        'https://api.flutterwave.com/v3/virtual-account-numbers',
        payload,
        { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
      );

      console.log(`FLW attempt ${attempt} response:`, JSON.stringify(response.data));

      if (response.data && response.data.status === 'success') {
        const bankName = (response.data.data.bank_name || '').toLowerCase();
        const isPreferred = PREFERRED_BANKS.some(b => bankName.includes(b));

        if (isPreferred) {
          console.log(`FLW got preferred bank on attempt ${attempt}: ${bankName}`);
          return response.data;
        }

        console.log(`FLW attempt ${attempt} got non-preferred bank: ${bankName}, retrying...`);

        // Last attempt — return whatever we got
        if (attempt === 5) {
          console.log('FLW max retries reached, returning last result');
          return response.data;
        }
      }
    } catch (err) {
      const detail = err.response ? JSON.stringify(err.response.data) : err.message;
      console.error(`FLW attempt ${attempt} error:`, detail);
      if (attempt === 5) throw err;
    }
  }
}

async function verifyPayment(ref) {
  // Try base ref and all possible retry refs (_a1 to _a5)
  const refs = [ref, ...Array.from({ length: 5 }, (_, i) => `${ref}_a${i + 1}`)];

  for (const txRef of refs) {
    try {
      const response = await axios.get(
        `https://api.flutterwave.com/v3/transactions?tx_ref=${txRef}`,
        { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } }
      );
      const transactions = response.data.data;
      if (!transactions || transactions.length === 0) continue;
      const tx = transactions[0];
      if (tx.status === 'successful') return tx;
    } catch (err) {
      console.error(`Payment verify error for ref ${txRef}:`, err.message);
    }
  }

  return null;
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
