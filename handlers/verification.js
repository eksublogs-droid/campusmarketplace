const User = require('../models/User');
const { buildVerifyDeepLink, parseVerifyDeepLink, generateVerifyCode } = require('../utils/deeplink');
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
  const deepLink = buildVerifyDeepLink(user.telegramId);

  if (!user.notifiedAdmin) {
    // Message 1 — instructions + message us button
    await bot.sendMessage(chatId,
      `📱 *One Last Step — Get Verified*\n\n` +
      `To access the marketplace, you *MUST* follow these steps in order:\n\n` +
      `1️⃣ Tap the button below to message us\n` +
      `2️⃣ Save our contact\n` +
      `3️⃣ Send us a message saying *"Saved your contact"*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📲 Message Us on Telegram', url: 'https://t.me/EksuBlog' }]
          ]
        }
      }
    );

    // Message 2 — warning + verify button
    await bot.sendMessage(chatId,
      `⚠️ *WARNING: Do NOT tap the button below until you have messaged us first\\!*\n\n` +
      `If you tap it without messaging us first, you will *NOT* be verified\\!\n\n` +
      `Once you've messaged us, come back and tap below ✅`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Click Here to Get Verified', url: deepLink }]
          ]
        }
      }
    );

    user.notifiedAdmin = true;
    await user.save();
    setSession(chatId, 'awaiting_verification');

  } else {
    // They came back — just show the verify button
    await bot.sendMessage(chatId,
      `👋 *Welcome back\\!*\n\nIf you've already messaged us, tap below to complete your verification ✅`,
      {
        parse_mode: 'MarkdownV2',
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
