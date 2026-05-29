const Settings = require('../models/Settings');
const PaymentReceipt = require('../models/PaymentReceipt');
const SellerSubmission = require('../models/SellerSubmission');
const { setSession, updateSession, getSession, clearSession } = require('../utils/session');
const { deleteMsgs } = require('./product');

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
  updateSession(chatId, { paymentDays: days, paymentAmount: amount, promoDays: days, proAmount: amount });
}

async function handleReceiptPhoto(bot, chatId, fileId, user) {
  const session = getSession(chatId);
  if (!session || session.step !== 'awaiting_receipt') return;

  const paymentDays   = session.data.paymentDays   || session.data.promoDays   || 0;
  const paymentAmount = session.data.paymentAmount  || session.data.proAmount   || 0;
  const submissionId  = session.data.submissionId   || null;

  const receipt = new PaymentReceipt({
    telegramId:     user.telegramId,
    firstName:      user.firstName,
    username:       user.username || '',
    amountExpected: paymentAmount,
    days:           paymentDays,
    receiptFileId:  fileId,
    submissionId:   submissionId,
    status:         'pending'
  });
  await receipt.save();

  // Collect all messages to delete:
  // - all receipt photo messages the user sent
  // - proSummaryMsgId (already deleted in handleMiniAppSubmission but kept as safety)
  // - formReceivedMsgId (the "Form Received! Now Complete Payment" message)
  const msgIdsToDelete = [
    ...(session.data.receiptPhotoMsgIds || []),
    session.data.proSummaryMsgId,
    session.data.formReceivedMsgId
  ].filter(Boolean);

  // Send "Receipt received!" confirmation first
  const receiptReceivedMsg = await bot.sendMessage(chatId,
    `✅ *Receipt received!*\n\n` +
    `Your payment of ₦${paymentAmount.toLocaleString()} is pending admin approval.\n` +
    `You'll be notified once it's confirmed.`,
    { parse_mode: 'Markdown' }
  );

  // Delete all the tracked flow messages
  await deleteMsgs(bot, chatId, msgIdsToDelete);

  clearSession(chatId);

  // Store receiptReceivedMsgId so approveReceipt can delete it
  receipt.receiptReceivedMsgId = receiptReceivedMsg.message_id;
  await receipt.save();

  // Also store on the submission record so approval.js can delete it
  if (submissionId) {
    try {
      await SellerSubmission.findByIdAndUpdate(submissionId, {
        finalStatusMsgId: receiptReceivedMsg.message_id
      });
    } catch (_) {}
  }

  await notifyAdminNewReceipt(bot, receipt);
}

async function notifyAdminNewReceipt(bot, receipt) {
  const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID);

  const caption =
    `💰 *NEW PAYMENT RECEIPT*\n` +
    `─────────────────\n` +
    `👤 Name: ${receipt.firstName}\n` +
    `🆔 Username: @${receipt.username || 'N/A'}\n` +
    `🔢 Telegram ID: ${receipt.telegramId}\n` +
    `💵 Amount Expected: ₦${(receipt.amountExpected || 0).toLocaleString()}\n` +
    `📅 Days: ${receipt.days}\n` +
    `🕐 Submitted: ${receipt.submittedAt.toLocaleString('en-NG')}`;

  const sentMsg = await bot.sendPhoto(adminId, receipt.receiptFileId, {
    caption,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Approve', callback_data: `receipt_approve_${receipt._id}` },
        { text: '❌ Reject',  callback_data: `receipt_reject_${receipt._id}`  }
      ]]
    }
  });

  // Store admin receipt msg ID for deletion on action
  if (sentMsg) {
    receipt.adminReceiptMsgId = sentMsg.message_id;
    await receipt.save();
  }
}

module.exports = { initiatePayment, handleReceiptPhoto, notifyAdminNewReceipt };
