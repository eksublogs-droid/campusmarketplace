const { createVirtualAccount, verifyPayment, generateRef } = require('../utils/flutterwave');
const { emailPaymentConfirmed } = require('../utils/email');
const { setSession, updateSession, getSession } = require('../utils/session');

// Map to track active payment countdowns: ref -> { intervalId, countdownMsgId, chatId }
const activePayments = {};

async function initiatePayment(bot, chatId, user, days, pricePerDay) {
  const amount = days * pricePerDay;
  const ref = generateRef(user.telegramId);

  await bot.sendMessage(chatId, '⏳ Generating your payment details...');

  let accountData;
  try {
    const result = await createVirtualAccount(user, amount, ref);
    if (!result || result.status !== 'success') {
      return bot.sendMessage(chatId, '❌ Could not generate payment details. Please try again later.');
    }
    accountData = result.data;
  } catch (err) {
    console.error('FLW account error:', err.message);
    return bot.sendMessage(chatId, '❌ Payment service error. Please try again later.');
  }

  updateSession(chatId, { paymentRef: ref, paymentDays: days, paymentAmount: amount });

  await bot.sendMessage(chatId,
    `🏦 *Payment Details*\n` +
    `─────────────────\n` +
    `🏛️ Bank: *${accountData.bank_name}*\n` +
    `🔢 Account Number: *${accountData.account_number}*\n` +
    `👤 Account Name: *${accountData.account_name}*\n` +
    `💰 Amount: *₦${amount.toLocaleString()}*\n\n` +
    `⏰ This account expires in *30 minutes*\n` +
    `⚠️ Pay exactly ₦${amount.toLocaleString()} — no more, no less`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '✅ I Have Sent The Money', callback_data: `payment_sent_${ref}` }]]
      }
    }
  );
}

async function handlePaymentSent(bot, chatId, ref, user, onSuccess) {
  // Send verifying message with countdown
  const sentMsg = await bot.sendMessage(chatId,
    `⏳ *Verifying payment...*\n\n⏱ Checking in *40* seconds...`,
    { parse_mode: 'Markdown' }
  );

  const msgId = sentMsg.message_id;
  let secondsLeft = 40;

  // Countdown timer — update message every 5 seconds
  const interval = setInterval(async () => {
    secondsLeft -= 5;
    if (secondsLeft > 0) {
      try {
        await bot.editMessageText(
          `⏳ *Verifying payment...*\n\n⏱ Checking in *${secondsLeft}* seconds...`,
          { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
        );
      } catch (_) {}
    }
  }, 5000);

  // After 40 seconds, check payment
  setTimeout(async () => {
    clearInterval(interval);
    if (activePayments[ref]) delete activePayments[ref];

    const tx = await verifyPayment(ref);

    if (tx) {
      try {
        await bot.editMessageText(
          `✅ *Payment confirmed!* ₦${tx.amount.toLocaleString()} received.\n\nProceeding to product form...`,
          { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
        );
      } catch (_) {}

      // Send email receipt
      const days = getSession(chatId)?.data?.paymentDays || 1;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      await emailPaymentConfirmed(user.gmail, user.firstName, tx.amount, days, expiresAt);

      if (onSuccess) onSuccess(tx, days);
    } else {
      try {
        await bot.editMessageText(
          `❌ *Payment not seen yet.*\n\nIf you already paid, tap the button below to check again.`,
          {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '🔄 Reverify Payment', callback_data: `reverify_${ref}` }]]
            }
          }
        );
      } catch (_) {}
    }
  }, 40000);

  activePayments[ref] = { interval, chatId };
}

async function handleReverify(bot, chatId, ref, user, onSuccess) {
  // Clear any existing interval for this ref to prevent stacking
  if (activePayments[ref]) {
    clearInterval(activePayments[ref].interval);
    delete activePayments[ref];
  }

  const verifyMsg = await bot.sendMessage(chatId,
    `⏳ *Reverifying payment...*\n\n⏱ Checking in *40* seconds...`,
    { parse_mode: 'Markdown' }
  );

  const msgId = verifyMsg.message_id;
  let secondsLeft = 40;

  const interval = setInterval(async () => {
    secondsLeft -= 5;
    if (secondsLeft > 0) {
      try {
        await bot.editMessageText(
          `⏳ *Reverifying payment...*\n\n⏱ Checking in *${secondsLeft}* seconds...`,
          { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
        );
      } catch (_) {}
    }
  }, 5000);

  setTimeout(async () => {
    clearInterval(interval);
    if (activePayments[ref]) delete activePayments[ref];

    const tx = await verifyPayment(ref);
    if (tx) {
      try {
        await bot.editMessageText(
          `✅ *Payment confirmed!* ₦${tx.amount.toLocaleString()} received. Proceeding...`,
          { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
        );
      } catch (_) {}

      const days = getSession(chatId)?.data?.paymentDays || 1;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      await emailPaymentConfirmed(user.gmail, user.firstName, tx.amount, days, expiresAt);

      if (onSuccess) onSuccess(tx, days);
    } else {
      try {
        await bot.editMessageText(
          `❌ *Payment still not found.*\n\nPlease make sure you paid exactly the right amount. Contact admin if you need help.`,
          {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: `reverify_${ref}` }],
                [{ text: `📞 Contact Admin on WhatsApp`, url: `https://wa.me/${process.env.ADMIN_WHATSAPP}` }]
              ]
            }
          }
        );
      } catch (_) {}
    }
  }, 40000);

  activePayments[ref] = { interval, chatId };
}

module.exports = { initiatePayment, handlePaymentSent, handleReverify };
