require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const express = require('express');

// Models
const User = require('./models/User');
const Product = require('./models/Product');

// Handlers
const { askGmail, handleGmailInput, showVerificationStep, handleVerifyDeepLink, handleWhatsappInput } = require('./handlers/verification');
const { showMainMenu, handleBuyFlow, startSellFlow, handlePlanSelection, handleProDays, proceedWithPaymentForPro, startProductForm, handleProductFormStep, handleMediaUpload, submitProductToAdmin } = require('./handlers/user');
const { initiatePayment, handleReceiptPhoto } = require('./handlers/payment');
const { showProducts, searchProducts } = require('./handlers/product');
const {
  showAdminMenu, startAddProduct, handleAdminAddProductStep, handleAdminMediaUpload,
  confirmAdminProductPost, showPendingSubmissions, approveSubmission, rejectSubmission,
  handleRejectReason, showPendingPayments, approveReceipt, startRejectReceipt,
  handleReceiptRejectReason, reReviewReceipt,
  showActiveProducts, markAsSold, confirmSoldProduct,
  showSettings, editSettingStep, saveSettingValue
} = require('./handlers/admin');

// Utils
const { getSession, setSession, updateSession, clearSession } = require('./utils/session');
const { checkExpiringProPlans, demoteExpiredProPlans, deleteOldSoldProducts, deleteOldRejectedReceipts } = require('./utils/cron');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
const app = express();
app.use(express.json());

// ========== MONGODB CONNECTION ==========
mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log('✅ MongoDB connected');
  bot.startPolling();
  console.log('✅ Bot polling started');
}).catch(err => {
  console.error('❌ MongoDB error:', err.message);
  process.exit(1);
});

// ========== HELPER ==========
async function getOrCreateUser(telegramId, message) {
  let user = await User.findOne({ telegramId });

  if (!user) {
    user = new User({
      telegramId,
      firstName: message.from.first_name,
      lastName: message.from.last_name || '',
      username: message.from.username || '',
      gmailSubmitted: false,
      verified: false
    });
    await user.save();
  }

  user.lastSeen = new Date();
  await user.save();

  return user;
}

function isAdmin(chatId) {
  return String(chatId) === String(process.env.ADMIN_TELEGRAM_ID);
}

async function checkUserReady(bot, chatId, user) {
  if (!user.gmailSubmitted) {
    await askGmail(bot, chatId, user.firstName);
    return false;
  }

  if (!user.verified) {
    await showVerificationStep(bot, chatId, user);
    return false;
  }

  if (!user.whatsappSubmitted) {
    const { askWhatsapp } = require('./handlers/verification');
    await askWhatsapp(bot, chatId);
    return false;
  }

  return true;
}

// ========== TESTER RESET (ID: 6511973707 only) ==========
bot.onText(/^\/reset$/, async (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== '6511973707') return;
  await User.deleteOne({ telegramId: chatId });
  await bot.sendMessage(chatId, '🗑 Your account has been wiped. Send /start to begin fresh.');
});

// ========== START COMMAND ==========
bot.onText(/^\/start(.*)/, async (msg) => {
  const chatId = msg.chat.id;

  const param = (msg.text || '').replace(/^\/start\s*/, '').trim();

  const user = await getOrCreateUser(chatId, msg);

  if (param && param.startsWith('verified_')) {
    const verified = await handleVerifyDeepLink(bot, chatId, param);
    if (verified) {
      const freshUser = await User.findOne({ telegramId: chatId });
      return await showMainMenu(bot, chatId, freshUser);
    }
    return;
  }

  if (isAdmin(chatId)) {
    await showAdminMenu(bot, chatId);
    return;
  }

  const ready = await checkUserReady(bot, chatId, user);
  if (ready) {
    await showMainMenu(bot, chatId, user);
  }
});

// ========== MESSAGE HANDLER ==========
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  if (text.startsWith('/start')) return;
  const user = await User.findOne({ telegramId: chatId });

  if (!user) return;

  // Admin commands
  if (isAdmin(chatId)) {
    if (text === '/menu') return await showAdminMenu(bot, chatId);

    const session = getSession(chatId);

    if (text === '/addproduct') return await startAddProduct(bot, chatId);
    if (text === '/pending') return await showPendingSubmissions(bot, chatId);
    if (text === '/pending_payments') return await showPendingPayments(bot, chatId);
    if (text === '/products') return await showActiveProducts(bot, chatId);
    if (text === '/settings') return await showSettings(bot, chatId);

    if (session && session.step && session.step.startsWith('admin_add_product')) {
      return await handleAdminAddProductStep(bot, chatId, text);
    }

    if (session && session.step === 'admin_reject_reason') {
      return await handleRejectReason(bot, chatId, text);
    }

    // Receipt rejection reason
    if (session && session.step === 'admin_receipt_reject_reason') {
      return await handleReceiptRejectReason(bot, chatId, text);
    }

    if (session && session.step && session.step.startsWith('settings_edit')) {
      return await saveSettingValue(bot, chatId, text);
    }

    return;
  }

  // Regular user message handling
  if (!user.gmailSubmitted) {
    return await handleGmailInput(bot, chatId, text, user);
  }

  if (!user.verified) {
    await showVerificationStep(bot, chatId, user);
    return;
  }

  if (!user.whatsappSubmitted) {
    const session = getSession(chatId);
    if (session && session.step === 'awaiting_whatsapp') {
      await handleWhatsappInput(bot, chatId, text, user);
      return;
    }
    const { askWhatsapp } = require('./handlers/verification');
    await askWhatsapp(bot, chatId);
    return;
  }

  const session = getSession(chatId);

  if (session && session.step === 'searching') {
    return await searchProducts(bot, chatId, user, text);
  }

  if (session && session.step && session.step.startsWith('sell_product')) {
    return await handleProductFormStep(bot, chatId, text);
  }

  if (session && session.step === 'select_pro_days_custom') {
    const days = parseInt(text);
    if (isNaN(days) || days <= 0) return bot.sendMessage(chatId, '❌ Enter a valid number of days.');
    updateSession(chatId, { promoDays: days });
    return await handleProDays(bot, chatId, days);
  }

  if (text.startsWith('/')) {
    return bot.sendMessage(chatId, '❌ Unknown command.');
  }
});

// ========== PHOTO/VIDEO UPLOAD ==========
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const user = await User.findOne({ telegramId: chatId });
  if (!user) return;

  const session = getSession(chatId);
  const file_id = msg.photo[msg.photo.length - 1].file_id;

  // Admin photo uploads (product media)
  if (isAdmin(chatId)) {
    if (session && session.step === 'admin_add_product_media') {
      return await handleAdminMediaUpload(bot, chatId, file_id, 'photo');
    }
    return;
  }

  // User must be verified for anything below
  if (!user.verified) return;

  // Receipt photo
  if (session && session.step === 'awaiting_receipt') {
    return await handleReceiptPhoto(bot, chatId, file_id, user);
  }

  // Product media upload
  if (session && session.step === 'sell_product_media') {
    return await handleMediaUpload(bot, chatId, file_id, 'photo');
  }
});

bot.on('video', async (msg) => {
  const chatId = msg.chat.id;
  const user = await User.findOne({ telegramId: chatId });
  if (!user || !user.verified) return;

  const session = getSession(chatId);
  if (!session) return;

  const file_id = msg.video.file_id;

  if (session.step === 'sell_product_media') {
    return await handleMediaUpload(bot, chatId, file_id, 'video');
  }

  if (session.step === 'admin_add_product_media') {
    return await handleAdminMediaUpload(bot, chatId, file_id, 'video');
  }
});

// ========== CALLBACK QUERY ==========
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const user = await User.findOne({ telegramId: chatId });

  if (!user) return;

  const adminMode = isAdmin(chatId);

  // ===== MAIN MENU =====
  if (data === 'main_menu') {
    return await showMainMenu(bot, chatId, user);
  }

  // ===== BUY FLOW =====
  if (data === 'buy') {
    return await handleBuyFlow(bot, chatId, user);
  }

  if (data.startsWith('page_')) {
    const page = parseInt(data.split('_')[1]);
    return await showProducts(bot, chatId, user, page);
  }

  if (data === 'search') {
    setSession(chatId, 'searching');
    return bot.sendMessage(chatId, '🔍 What are you looking for?');
  }

  // ===== SELL FLOW =====
  if (data === 'sell') {
    return await startSellFlow(bot, chatId, user);
  }

  if (data === 'plan_free') {
    await handlePlanSelection(bot, chatId, 'free');
    return bot.answerCallbackQuery(query.id);
  }

  if (data === 'plan_pro') {
    await handlePlanSelection(bot, chatId, 'pro');
    return bot.answerCallbackQuery(query.id);
  }

  if (data.startsWith('prodays_')) {
    const daysStr = data.split('_')[1];

    if (daysStr === 'custom') {
      setSession(chatId, 'select_pro_days_custom');
      bot.sendMessage(chatId, 'How many days? (type a number):');
      return bot.answerCallbackQuery(query.id);
    }

    const days = parseInt(daysStr);
    await handleProDays(bot, chatId, days);
    return bot.answerCallbackQuery(query.id);
  }

  if (data === 'proceed_payment') {
    await proceedWithPaymentForPro(bot, chatId, user);
    return bot.answerCallbackQuery(query.id);
  }

  if (data === 'submit_product') {
    await submitProductToAdmin(bot, chatId, user);
    return bot.answerCallbackQuery(query.id);
  }

  // ===== ADMIN FLOWS =====
  if (adminMode) {
    if (data === 'admin_menu') {
      return await showAdminMenu(bot, chatId);
    }

    if (data === 'admin_add_product') {
      return await startAddProduct(bot, chatId);
    }

    if (data === 'admin_pending') {
      return await showPendingSubmissions(bot, chatId);
    }

    if (data === 'admin_pending_payments') {
      return await showPendingPayments(bot, chatId);
    }

    if (data === 'admin_products') {
      return await showActiveProducts(bot, chatId);
    }

    if (data === 'admin_settings') {
      return await showSettings(bot, chatId);
    }

    // Receipt: approve
    if (data.startsWith('receipt_approve_')) {
      const id = data.replace('receipt_approve_', '');
      await approveReceipt(bot, chatId, id);
      return bot.answerCallbackQuery(query.id);
    }

    // Receipt: reject (asks for reason)
    if (data.startsWith('receipt_reject_')) {
      const id = data.replace('receipt_reject_', '');
      await startRejectReceipt(bot, chatId, id);
      return bot.answerCallbackQuery(query.id);
    }

    // Receipt: re-review
    if (data.startsWith('receipt_rereview_')) {
      const id = data.replace('receipt_rereview_', '');
      await reReviewReceipt(bot, chatId, id);
      return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith('approve_')) {
      const id = data.split('_')[1];
      await approveSubmission(bot, chatId, id);
      return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith('reject_')) {
      const id = data.split('_')[1];
      await rejectSubmission(bot, chatId, id);
      return bot.answerCallbackQuery(query.id);
    }

    if (data === 'admin_wa_default') {
      const session = getSession(chatId);
      if (session && session.step === 'admin_add_product_whatsapp') {
        setSession(chatId, 'admin_add_product_price');
        bot.sendMessage(chatId, 'Enter price (₦):');
      }
      return bot.answerCallbackQuery(query.id);
    }

    if (data === 'admin_wa_custom') {
      setSession(chatId, 'admin_add_product_whatsapp_custom');
      bot.sendMessage(chatId, 'Enter WhatsApp number (with country code, no +):');
      return bot.answerCallbackQuery(query.id);
    }

    if (data === 'admin_confirm_post') {
      await confirmAdminProductPost(bot, chatId);
      return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith('mark_sold_')) {
      const id = data.split('_')[2];
      await markAsSold(bot, chatId, id);
      return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith('confirm_sold_')) {
      const id = data.split('_')[2];
      await confirmSoldProduct(bot, chatId, id);
      return bot.answerCallbackQuery(query.id);
    }

    if (data === 'cancel_sold') {
      clearSession(chatId);
      await showActiveProducts(bot, chatId);
      return bot.answerCallbackQuery(query.id);
    }

    if (data === 'settings_whatsapp') {
      await editSettingStep(bot, chatId, 'whatsapp');
      return bot.answerCallbackQuery(query.id);
    }

    if (data === 'settings_pro_price') {
      await editSettingStep(bot, chatId, 'pro_price');
      return bot.answerCallbackQuery(query.id);
    }

    // Bank account edit buttons: settings_bank_0, settings_bank_1, settings_bank_2
    if (data.startsWith('settings_bank_')) {
      const idx = data.split('_')[2];
      await editSettingStep(bot, chatId, `bank_${idx}`);
      return bot.answerCallbackQuery(query.id);
    }

    // Bank account toggle buttons: settings_toggle_0, settings_toggle_1, settings_toggle_2
    if (data.startsWith('settings_toggle_')) {
      const idx = data.split('_')[2];
      await editSettingStep(bot, chatId, `toggle_${idx}`);
      return bot.answerCallbackQuery(query.id);
    }
  }

  bot.answerCallbackQuery(query.id);
});

// ========== SERVER ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot running on port ${PORT}`);
});

// ========== CRON JOBS ==========
setInterval(async () => {
  await checkExpiringProPlans(bot);
  await demoteExpiredProPlans();
  await deleteOldSoldProducts();
  await deleteOldRejectedReceipts();
}, 24 * 60 * 60 * 1000);

setTimeout(async () => {
  await demoteExpiredProPlans();
}, 10000);

// ========== ERROR HANDLING ==========
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
