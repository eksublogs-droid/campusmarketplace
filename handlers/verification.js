const User = require('../models/User');
const { buildVerifyDeepLink, parseVerifyDeepLink, generateVerifyCode } = require('../utils/deeplink');
const { verifyContactLink } = require('../utils/whatsapp');
const { setSession, clearSession } = require('../utils/session');

// Step 1: Ask for Gmail
async function askGmail(bot, chatId, firstName) {
  await bot.sendMessage(chatId,
    `👋 Welcome ${firstName}!\n\nTo get started, please enter your *Gmail address*:`,
    { parse_mode: 'Markdown' }
  );
  setSession(chatId, 'awaiting_gmail');
}

// Step 2: Save Gmail and ask for number verification
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

// Show verification wall
async function showVerificationStep(bot, chatId, user) {
  const deepLink = buildVerifyDeepLink(user.telegramId);
  const waLink = verifyContactLink(process.env.ADMIN_TELEGRAM_NUMBER, user);

  await bot.sendMessage(chatId,
    `📱 *One Last Step — Save Our Number*\n\nTo unlock the marketplace, save our contact number and send us a quick message:\n\n*+2348137890167*\n\nThis lets us verify you're a real person ✅`,
    { parse_mode: 'Markdown' }
  );

  await bot.sendMessage(chatId,
    `Tap the button below. It will open our Telegram with a message already typed for you.\n\nSend it → then tap "Return to Bot" to get verified.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📲 Save Our Number & Notify Us', url: waLink }],
          [{ text: '↩️ Return to Bot & Get Verified', url: deepLink }]
        ]
      }
    }
  );

  setSession(chatId, 'awaiting_verification');
}

// Handle deep link return: start=verified_TELEGRAMID_CODE
async function handleVerifyDeepLink(bot, chatId, param) {
  const parsed = parseVerifyDeepLink(param);
  if (!parsed) return false;

  const { telegramId, code } = parsed;
  const expectedCode = generateVerifyCode(telegramId);

  if (String(telegramId) !== String(chatId) || code !== expectedCode) {
    await bot.sendMessage(chatId, '❌ Invalid verification link. Please try again.');
    return false;
  }

  const user = await User.findOne({ telegramId });
  if (!user) return false;

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
