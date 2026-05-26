const crypto = require('crypto');

function generateVerifyCode(telegramId) {
  return crypto.createHash('md5').update(`${telegramId}_${process.env.BOT_TOKEN}`).digest('hex').substring(0, 10);
}

function buildVerifyDeepLink(telegramId) {
  const code = generateVerifyCode(telegramId);
  return `https://t.me/${process.env.BOT_USERNAME}?start=verified_${telegramId}_${code}`;
}

function parseVerifyDeepLink(param) {
  // param format: verified_TELEGRAMID_CODE
  if (!param || !param.startsWith('verified_')) return null;
  const parts = param.split('_');
  if (parts.length !== 3) return null;
  return { telegramId: parseInt(parts[1]), code: parts[2] };
}

module.exports = { generateVerifyCode, buildVerifyDeepLink, parseVerifyDeepLink };
