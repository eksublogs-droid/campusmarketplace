const axios = require('axios');

async function getAuthToken() {
  const credentials = Buffer.from(
    `${process.env.MONNIFY_API_KEY}:${process.env.MONNIFY_SECRET_KEY}`
  ).toString('base64');

  const response = await axios.post(
    `${process.env.MONNIFY_BASE_URL}/api/v1/auth/login`,
    {},
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  if (!response.data || response.data.requestSuccessful === false) {
    throw new Error('Monnify auth failed');
  }

  return response.data.responseBody.accessToken;
}

async function createVirtualAccount(user, amount, ref) {
  const token = await getAuthToken();

  const payload = {
    amount,
    customerName: `${user.firstName || 'User'}`,
    customerEmail: user.gmail,
    orderReference: ref,
    paymentDescription: `CampusMarketplace Pro - ${user.firstName || 'User'}`,
    currencyCode: 'NGN',
    contractCode: process.env.MONNIFY_CONTRACT_CODE,
    incomeSplitConfig: [],
    paymentMethods: ['ACCOUNT_TRANSFER']
  };

  console.log('Monnify payload:', JSON.stringify(payload));

  const response = await axios.post(
    `${process.env.MONNIFY_BASE_URL}/api/v1/merchant/transactions/init-transaction`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  console.log('Monnify response:', JSON.stringify(response.data));

  if (!response.data || response.data.requestSuccessful === false) {
    throw new Error('Monnify virtual account creation failed');
  }

  const body = response.data.responseBody;

  // Pick Wema bank account if available, otherwise first account
  const accounts = body.accounts || [];
  const wema = accounts.find(a => a.bankName && a.bankName.toLowerCase().includes('wema'));
  const account = wema || accounts[0];

  return {
    status: 'success',
    data: {
      bank_name: account ? account.bankName : 'N/A',
      account_number: account ? account.accountNumber : 'N/A',
      account_name: account ? account.accountName : `CampusMarketplace ${user.firstName || 'User'}`,
      transactionReference: body.transactionReference
    }
  };
}

async function verifyPayment(ref) {
  try {
    const token = await getAuthToken();

    const response = await axios.get(
      `${process.env.MONNIFY_BASE_URL}/api/v2/transactions/${encodeURIComponent(ref)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log('Monnify verify response:', JSON.stringify(response.data));

    if (!response.data || response.data.requestSuccessful === false) return null;

    const body = response.data.responseBody;
    if (body.paymentStatus === 'PAID') {
      return { amount: body.amountPaid, ref: body.transactionReference };
    }

    return null;
  } catch (err) {
    console.error('Monnify verify error:', err.message);
    return null;
  }
}

function generateRef(telegramId) {
  return `MKT_${telegramId}_${Date.now()}`;
}

module.exports = { createVirtualAccount, verifyPayment, generateRef };
