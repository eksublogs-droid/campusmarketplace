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
  await askWhatsapp(bot, chatId);
}

async function askWhatsapp(bot, chatId) {
  await bot.sendMessage(chatId,
    `📱 *WhatsApp Number*\n\n` +
    `Please enter your *WhatsApp number* — just the *10 digits*, without 0 or +234 in front.\n\n` +
    `Example: *8012345678*`,
    { parse_mode: 'Markdown' }
  );
  setSession(chatId, 'awaiting_whatsapp');
}

async function handleWhatsappInput(bot, chatId, text, user) {
  const number = text.trim().replace(/\D/g, '');

  if (!/^\d{10}$/.test(number) || number.startsWith('0')) {
    return bot.sendMessage(chatId,
      '❌ Enter exactly 10 digits, no 0 or +234 in front.\n\nExample: *8012345678*',
      { parse_mode: 'Markdown' }
    );
  }

  const fullNumber = '234' + number;
  user.whatsapp = fullNumber;
  user.whatsappSubmitted = true;
  await user.save();

  await showVerificationStep(bot, chatId, user);
}

async function showVerificationStep(bot, chatId, user) {
  if (!user.notifiedAdmin) {
    await bot.sendMessage(chatId,
      `📱 *One Last Step — Get Verified*\n\n` +
      `To access the marketplace, follow these steps:\n\n` +
      `1️⃣ Tap *"Message Us on Telegram"* below\n` +
      `2️⃣ Save our contact\n` +
      `3️⃣ Send us a message saying *"Saved your contact"*\n` +
      `4️⃣ Come back here and tap *"✅ I've Messaged You"*\n` +
      `5️⃣ Then tap *"Click Here to Get Verified"*\n\n` +
      `⚠️ *You CANNOT be verified until you tap "I've Messaged You" first!*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📲 Message Us on Telegram', url: 'https://t.me/EksuBlog' }],
            [{ text: "✅ I've Messaged You", callback_data: 'telegram_link_opened' }],
            [{ text: '🔐 Click Here to Get Verified', callback_data: `try_verify_${user.telegramId}` }]
          ]
        }
      }
    );

    user.notifiedAdmin = true;
    await user.save();
    setSession(chatId, 'awaiting_verification');

  } else {
    const telegramOpenedText = user.telegramLinkOpened
      ? '✅ Telegram messaged'
      : "📲 Message Us on Telegram first, then tap \"I've Messaged You\"";

    await bot.sendMessage(chatId,
      `👋 *Welcome back!*\n\n${telegramOpenedText}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📲 Message Us on Telegram', url: 'https://t.me/EksuBlog' }],
            [{ text: "✅ I've Messaged You", callback_data: 'telegram_link_opened' }],
            [{ text: '🔐 Click Here to Get Verified', callback_data: `try_verify_${user.telegramId}` }]
          ]
        }
      }
    );
  }
}

// Called when user taps "I've Messaged You"
async function handleTelegramLinkOpened(bot, chatId) {
  const user = await User.findOne({ telegramId: Number(chatId) });
  if (!user) return;
  user.telegramLinkOpened = true;
  await user.save();
  await bot.sendMessage(chatId,
    `✅ *Noted!* Now tap *"Click Here to Get Verified"* to complete your verification.`,
    { parse_mode: 'Markdown' }
  );
}

// Called when user taps "Click Here to Get Verified"
async function handleTryVerify(bot, chatId, targetUserId) {
  if (Number(chatId) !== Number(targetUserId)) {
    await bot.sendMessage(chatId, '❌ This button is not for you.');
    return false;
  }

  const user = await User.findOne({ telegramId: Number(chatId) });
  if (!user) {
    await bot.sendMessage(chatId, '❌ Account not found. Please restart with /start.');
    return false;
  }

  if (!user.telegramLinkOpened) {
    await bot.sendMessage(chatId,
      `⚠️ *Action Required*\n\n` +
      `You must first:\n` +
      `1️⃣ Tap *"Message Us on Telegram"*\n` +
      `2️⃣ Send us a message\n` +
      `3️⃣ Tap *"✅ I've Messaged You"*\n\n` +
      `Then you can tap *"Click Here to Get Verified"*.`,
      { parse_mode: 'Markdown' }
    );
    return false;
  }

  const { mainMenu } = require('../utils/keyboard');

  user.verified = true;
  await user.save();
  clearSession(chatId);

  await bot.sendMessage(chatId,
    `🎉 *You're Verified! Welcome aboard, ${user.firstName}!*\n\n` +
    `You now have full access to CampusMarketplace.\n\n` +
    `Use the buttons below to get started 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: mainMenu()
    }
  );

  return true;
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

  const { mainMenu } = require('../utils/keyboard');
  await bot.sendMessage(chatId,
    `🎉 *You're Verified! Welcome aboard, ${user.firstName}!*\n\nYou now have full access to the marketplace.`,
    {
      parse_mode: 'Markdown',
      reply_markup: mainMenu()
    }
  );

  return true;
}

module.exports = {
  askGmail,
  handleGmailInput,
  showVerificationStep,
  handleVerifyDeepLink,
  handleTryVerify,
  handleTelegramLinkOpened,
  askWhatsapp,
  handleWhatsappInput
};
