const Settings = require('../models/Settings');
const PaymentReceipt = require('../models/PaymentReceipt');
const { setSession, updateSession, getSession, clearSession } = require('../utils/session');

/**
 * Called when user clicks "Proceed to Payment".
 * Shows active bank account details + instructs them to send receipt.
 */
async function initiatePayment(bot, chatId, user, days, pricePerDay) {
  const amount = days * pricePerDay;
  const settings = await Settings.findOne() || new Settings();
  const activeAccounts = (settings.bankAccounts || []).filter(a => a.active && a.accountNumber);

  if (activeAccounts.length === 0) {
    return bot.sendMessage(chatId,
      '❌ Payment is temporarily unavailable. Please contact the admin.',
      { reply_markup: { inline_keyboard: [[{ text: '📞 Contact Admin', url: `https://wa.me/${settings.defaultWhatsapp}` }]] } }
    );
  }

  // Build bank details block
  let bankBlock = '';
  activeAccounts.forEach((acc, i) => {
    bankBlock +=
      `\n🏦 *Account ${activeAccounts.length > 1 ? i + 1 : ''}*\n` +
      `🏛️ Bank: *${acc.bankName}*\n` +
      `🔢 Number: *${acc.accountNumber}*\n` +
      `👤 Name: *${acc.accountName}*\n`;
  });

  await bot.sendMessage(chatId,
    `💳 *Payment Details*\n` +
    `─────────────────\n` +
    `💰 Amount: *₦${amount.toLocaleString()}*\n` +
    `📅 Plan: *${days} day(s) Pro*\n` +
    bankBlock +
    `\n⚠️ Transfer *exactly ₦${amount.toLocaleString()}* to any account above.\n\n` +
    `📸 After paying, *send your receipt screenshot* here.`,
    { parse_mode: 'Markdown' }
  );

  setSession(chatId, 'awaiting_receipt');
  updateSession(chatId, { paymentDays: days, paymentAmount: amount });
}

/**
 * Called when user sends a photo while in 'awaiting_receipt' state.
 * Saves the receipt and pings admin immediately.
 */
async function handleReceiptPhoto(bot, chatId, fileId, user) {
  const session = getSession(chatId);
  if (!session || session.step !== 'awaiting_receipt') return;

  const { paymentDays, paymentAmount } = session.data;

  // Save receipt to DB
  const receipt = new PaymentReceipt({
    telegramId:     user.telegramId,
    firstName:      user.firstName,
    username:       user.username || '',
    amountExpected: paymentAmount,
    days:           paymentDays,
    receiptFileId:  fileId,
    status:         'pending'
  });
  await receipt.save();

  // Tell user it's pending
  await bot.sendMessage(chatId,
    `✅ *Receipt received!*\n\n` +
    `Your payment of ₦${paymentAmount.toLocaleString()} is pending admin approval.\n` +
    `You'll be notified once it's confirmed.`,
    { parse_mode: 'Markdown' }
  );

  // Clear session — they're done until admin approves
  clearSession(chatId);

  // Ping admin immediately
  await notifyAdminNewReceipt(bot, receipt);
}

/**
 * Sends receipt + Approve/Reject buttons to admin.
 */
async function notifyAdminNewReceipt(bot, receipt) {
  const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID);

  const caption =
    `💰 *NEW PAYMENT RECEIPT*\n` +
    `─────────────────\n` +
    `👤 Name: ${receipt.firstName}\n` +
    `🆔 Username: @${receipt.username || 'N/A'}\n` +
    `🔢 Telegram ID: ${receipt.telegramId}\n` +
    `💵 Amount Expected: ₦${receipt.amountExpected.toLocaleString()}\n` +
    `📅 Days: ${receipt.days}\n` +
    `🕐 Submitted: ${receipt.submittedAt.toLocaleString('en-NG')}`;

  await bot.sendPhoto(adminId, receipt.receiptFileId, {
    caption,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `receipt_approve_${receipt._id}` },
          { text: '❌ Reject', callback_data: `receipt_reject_${receipt._id}` }
        ]
      ]
    }
  });
}

module.exports = { initiatePayment, handleReceiptPhoto, notifyAdminNewReceipt };
