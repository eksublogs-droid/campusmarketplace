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

// Show verification wall — Step 1: only "Save Our Number & Notify Us" button
async function showVerificationStep(bot, chatId, user) {
  const sent = await bot.sendMessage(chatId,
    `📱 *One Last Step — Get Verified*\n\nTo unlock the marketplace, tap the button below.\n\nIt will open Telegram with a message already typed for you — just hit *Send*.\n\nOnce you've sent the message, come back to the bot to Get Verified to complete the process ✅`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📲 Save Our Number & Notify Us', callback_data: 'save_number' }]
        ]
      }
    }
  );

  // Store message_id so we can edit it after the button is tapped
  setSession(chatId, { step: 'awaiting_verification', verifyMsgId: sent.message_id });
}

// Handle "Save Our Number & Notify Us" tap — swap button then open Telegram
async function handleSaveNumberCallback(bot, chatId, query, user) {
  const deepLink = buildVerifyDeepLink(user.telegramId);
  const waLink = verifyContactLink(process.env.ADMIN_TELEGRAM_NUMBER, user);

  const messageId = query.message.message_id;

  // 1. Edit the markup first — swap to the deeplink "Click Here to Get Verified" button
  try {
    await bot.editMessageReplyMarkup(
      {
        inline_keyboard: [
          [{ text: '✅ Click Here to Get Verified', url: deepLink }]
        ]
      },
      { chat_id: chatId, message_id: messageId }
    );
  } catch (e) {
    // Non-fatal — markup may already be updated if user tapped twice
  }

  // 2. Answer the callback with the Telegram URL — this is what actually opens @EksuBlog
  await bot.answerCallbackQuery(query.id, { url: waLink });
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

module.exports = { askGmail, handleGmailInput, showVerificationStep, handleSaveNumberCallback, handleVerifyDeepLink };
