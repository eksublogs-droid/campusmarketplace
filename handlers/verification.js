const User = require('../models/User');
const { buildVerifyDeepLink, parseVerifyDeepLink, generateVerifyCode } = require('../utils/deeplink');
const { verifyContactLink } = require('../utils/whatsapp');
const { setSession, clearSession } = require('../utils/session');

async function askGmail(bot, chatId, firstName) {
  await bot.sendMessage(chatId,
    `👋 Welcome ${firstName}!\n\nTo get started, please enter your *Gmail address*:`,
    { parse_mode: 'Markdown' }
  );
  setSession(chatId, 'awaiting_gmail');
}

async function handleGmailInput(bot, chatId, text, user) {
  const gmail = text.trim().toLowerCase();
  if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(gmail)) {
    return bot.sendMessage(chatId, '❌ That doesn\'t look like a valid Gmail address. Please enter a valid @gmail.com address:');
  }
  user.gmail = gmail;
  user.gmailSubmitted = true;
  await user.save();
  await showVerificationStep(bot, chatId, user);
}

async function showVerificationStep(bot, chatId, user) {
  if (!user.notifiedAdmin) {
    // First time — show button 1 only
    const waLink = verifyContactLink();
    await bot.sendMessage(chatId,
      `📱 *One Last Step — Get Verified*\n\nTo unlock the marketplace, tap the button below.\n\nIt will open Telegram with a message already typed for you — just hit *Send*.\n\nOnce you've sent the message, come back to the bot to Get Verified to complete the process ✅`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📲 Save Our Number & Notify Us', url: waLink }]
          ]
        }
      }
    );
    user.notifiedAdmin = true;
    await user.save();
    setSession(chatId, 'awaiting_verification');
  } else {
    // Already tapped button 1 — show button 2
    const deepLink = buildVerifyDeepLink(user.telegramId);
    await bot.sendMessage(chatId,
      `✅ *Just one more tap to complete your verification:*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Click Here to Get Verified', url: deepLink }]
          ]
        }
      }
    );
  }
}

async function handleVerifyDeepLink(bot, chatId, param) {
  const parsed = parseVerifyDeepLink(param);
  if (!parsed) return false;

  const { telegramId, code } = parsed;
  const expectedCode = generateVerifyCode(telegramId);

  if (Number(telegramId) !== Number(chatId) || code !== expectedCode) {
    await bot.sendMessage(chatId, '❌ Invalid verification link. Please try again.');
    return false;
  }

  const user = await User.findOne({ telegramId: Number(telegramId) });
  if (!user) {
    await bot.sendMessage(chatId, '❌ Account not found. Please restart with /start.');
    return false;
  }

  user.verified = true;
  await user.save();
  clearSession(chatId);

  await bot.sendMessage(chatId,
    `🎉 *You're verified! Welcome aboard, ${user.firstName}!*\n\nYou now have full access to the marketplace.`,
    { parse_mode: 'Markdown' }
  );

  return true;
}

module.exports = { askGmail, handleGmailInput, showVerificationStep, handleVerifyDeepLink };
