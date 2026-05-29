require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const express = require('express');
const multer = require('multer');

// Models
const User = require('./models/User');
const Product = require('./models/Product');
const Settings = require('./models/Settings');

// Handlers
const {
  askGmail, handleGmailInput, showVerificationStep, handleVerifyDeepLink,
  handleTryVerify, handleTelegramLinkOpened,
  handleWhatsappInput, askWhatsapp
} = require('./handlers/verification');
const {
  showMainMenu, handleBuyFlow, startSellFlow, handlePlanSelection, handleProDays,
  handleMiniAppSubmission,
  startProductForm, handleProductFormStep, handleMediaUpload, submitProductToAdmin
} = require('./handlers/user');
const { initiatePayment, handleReceiptPhoto } = require('./handlers/payment');
const { showProducts, searchProducts } = require('./handlers/product');
const {
  showAdminMenu, startAddProduct, handleAdminAddProductStep, handleAdminMediaUpload,
  showAdminProductSummary, confirmAdminProductPost,
  showPendingSubmissions, approveSubmission, rejectSubmission,
  handleRejectReason, showPendingPayments, approveReceipt, startRejectReceipt,
  handleReceiptRejectReason, reReviewReceipt,
  showActiveProducts, markAsSold, confirmSoldProduct,
  showSettings, editSettingStep, saveSettingValue,
  showPaidAds
} = require('./handlers/admin');

// Utils
const { getSession, setSession, updateSession, clearSession } = require('./utils/session');
const { checkExpiringProPlans, demoteExpiredProPlans, deleteOldSoldProducts, deleteOldRejectedReceipts } = require('./utils/cron');
const { mainMenu } = require('./utils/keyboard');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.use(express.json({ limit: '1mb' }));

// ========== CORS ==========
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ========== MONGODB ==========
mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log('✅ MongoDB connected');
  bot.startPolling();
  console.log('✅ Bot polling started');
  bot.setMyCommands([
    { command: 'begin', description: '🏠 Show main menu' }
  ]).catch(() => {});
}).catch(err => {
  console.error('❌ MongoDB error:', err.message);
  process.exit(1);
});

// ========== HELPERS ==========
async function getOrCreateUser(telegramId, message) {
  let user = await User.findOne({ telegramId });
  const isNew = !user;

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

  // Notify admin of new user registration
  if (isNew) {
    notifyAdminNewUser(user).catch(() => {});
  }

  return user;
}

async function notifyAdminNewUser(user) {
  const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID);
  if (!adminId) return;
  const msg =
    `🆕 *NEW USER REGISTERED*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 Name     : ${[user.firstName, user.lastName].filter(Boolean).join(' ')}\n` +
    `🆔 Username : @${user.username || 'N/A'}\n` +
    `🔢 Telegram : ${user.telegramId}\n` +
    `📅 Joined   : ${new Date().toLocaleString('en-NG')}`;
  await bot.sendMessage(adminId, msg, { parse_mode: 'Markdown' }).catch(() => {});
}

function isAdmin(chatId) {
  return String(chatId) === String(process.env.ADMIN_TELEGRAM_ID);
}

async function checkUserReady(bot, chatId, user) {
  if (!user.gmailSubmitted) {
    await askGmail(bot, chatId, user.firstName);
    return false;
  }
  if (!user.whatsappSubmitted) {
    await askWhatsapp(bot, chatId);
    return false;
  }
  if (!user.verified) {
    await showVerificationStep(bot, chatId, user);
    return false;
  }
  return true;
}

// ========== UPLOAD FILE TO TELEGRAM STORAGE ==========
async function uploadToTelegram(fileBuffer, mimeType, filename) {
  const storageChannelId = process.env.STORAGE_CHANNEL_ID;
  if (!storageChannelId) throw new Error('STORAGE_CHANNEL_ID not set in .env');

  const isVideo = mimeType && mimeType.startsWith('video');
  const fileSizeMB = fileBuffer.length / (1024 * 1024);

  if (!isVideo && fileSizeMB > 10) {
    const msg = await bot.sendDocument(storageChannelId, fileBuffer, {}, {
      filename: filename || 'photo.jpg',
      contentType: mimeType || 'image/jpeg'
    });
    return { file_id: msg.document.file_id, type: 'photo' };
  }

  if (isVideo) {
    const msg = await bot.sendVideo(storageChannelId, fileBuffer, {}, {
      filename: filename || 'video.mp4',
      contentType: mimeType || 'video/mp4'
    });
    return { file_id: msg.video.file_id, type: 'video' };
  } else {
    const msg = await bot.sendPhoto(storageChannelId, fileBuffer, {}, {
      filename: filename || 'photo.jpg',
      contentType: mimeType || 'image/jpeg'
    });
    const photos = msg.photo;
    const file_id = photos[photos.length - 1].file_id;
    return { file_id, type: 'photo' };
  }
}

// ========== MEDIA PRE-UPLOAD ==========
app.post('/api/upload-media', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  try {
    const result = await uploadToTelegram(req.file.buffer, req.file.mimetype, req.file.originalname);
    return res.json({ success: true, file_id: result.file_id, type: result.type });
  } catch (err) {
    console.error('Pre-upload error:', err.message);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// ========== MINI APP SUBMISSION ==========
app.post('/api/submit-listing', upload.array('media', 15), async (req, res) => {
  const { userId, plan, days, amount, ...formFields } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  res.json({ success: true });

  (async () => {
    try {
      const settings = await Settings.findOne();
      const mediaArray = [];
      const preuploadedMedia = req.body.preuploadedMedia;
      if (preuploadedMedia) {
        const items = Array.isArray(preuploadedMedia) ? preuploadedMedia : [preuploadedMedia];
        items.forEach(item => {
          try {
            const parsed = JSON.parse(item);
            if (parsed.file_id) mediaArray.push(parsed);
          } catch (e) {}
        });
      }
      if (req.files && req.files.length > 0) {
        const uploads = await Promise.allSettled(
          req.files.map(file => uploadToTelegram(file.buffer, file.mimetype, file.originalname))
        );
        uploads.forEach((result) => {
          if (result.status === 'fulfilled') mediaArray.push(result.value);
        });
      }
      await handleMiniAppSubmission(
        bot, parseInt(userId),
        { plan, days, amount, ...formFields, media: mediaArray },
        settings
      );
    } catch (err) {
      console.error('❌ submit-listing background error:', err);
    }
  })();
});

// ========== ADMIN CHANNEL TEST ==========
bot.onText(/^\/test_channel$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return;
  const storageChannelId = process.env.STORAGE_CHANNEL_ID;
  if (!storageChannelId) {
    return bot.sendMessage(chatId, '❌ FAILED: STORAGE_CHANNEL_ID is not set.');
  }
  await bot.sendMessage(chatId, `✅ Step 1: STORAGE_CHANNEL_ID found → ${storageChannelId}`);
  setSession(chatId, 'test_channel_awaiting_media');
  updateSession(chatId, { testMediaItems: [] });
  await bot.sendMessage(chatId,
    `📸 *Step 2: Send me any photo(s) or video(s) now.*`,
    { parse_mode: 'Markdown' }
  );
});

// ========== TESTER RESET ==========
bot.onText(/^\/reset$/, async (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== '6511973707') return;
  await User.deleteOne({ telegramId: chatId });
  await bot.sendMessage(chatId, '🗑 Your account has been wiped. Send /start to begin fresh.');
});

// ========== /begin — admin gets admin panel, users get main menu ==========
bot.onText(/^\/begin$/, async (msg) => {
  const chatId = msg.chat.id;

  if (isAdmin(chatId)) {
    await showAdminMenu(bot, chatId);
    return;
  }

  const user = await User.findOne({ telegramId: chatId });
  if (!user || !user.verified) {
    // Try to create or guide unverified user
    if (!user) {
      await bot.sendMessage(chatId, 'Welcome! Please use /start to register first.');
    } else {
      await checkUserReady(bot, chatId, user);
    }
    return;
  }

  await bot.sendMessage(chatId,
    `👋 Welcome back *${user.firstName}*!\n\n` +
    `Here's what you can do:\n\n` +
    `🛍️ *Buy Used Items* — Browse available products\n` +
    `💰 *Sell Used Items* — List your item for sale\n\n` +
    `Use the buttons below 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: mainMenu()
    }
  );
});

// ========== /start ==========
bot.onText(/^\/start(.*)/, async (msg) => {
  const chatId = msg.chat.id;
  const param = (msg.text || '').replace(/^\/start\s*/, '').trim();
  const user = await getOrCreateUser(chatId, msg);

  if (param && param.startsWith('verified_')) {
    const verified = await handleVerifyDeepLink(bot, chatId, param);
    if (verified) {
      const freshUser = await User.findOne({ telegramId: chatId });
      const ready = await checkUserReady(bot, chatId, freshUser);
      if (ready) await showMainMenu(bot, chatId, freshUser);
    }
    return;
  }

  if (param && param.startsWith('view_')) {
    const productId = param.replace('view_', '');
    try {
      const { sendProductCard } = require('./handlers/product');
      const settings = await Settings.findOne() || new Settings();
      const product = await Product.findById(productId);
      if (!product) return bot.sendMessage(chatId, '❌ Product not found or has been removed.');
      const ready = await checkUserReady(bot, chatId, user);
      if (!ready) return;
      await sendProductCard(bot, chatId, product, user, settings);
    } catch (e) {
      await bot.sendMessage(chatId, '❌ Could not load product.');
    }
    return;
  }

  if (isAdmin(chatId)) {
    await showAdminMenu(bot, chatId);
    return;
  }

  const ready = await checkUserReady(bot, chatId, user);
  if (ready) await showMainMenu(bot, chatId, user);
});

// ========== MESSAGE HANDLER ==========
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  if (text.startsWith('/start')) return;
  if (text === '/begin') return;
  const user = await User.findOne({ telegramId: chatId });
  if (!user) return;

  if (isAdmin(chatId)) {
    if (text === '/menu') return await showAdminMenu(bot, chatId);
    const session = getSession(chatId);
    if (text === '/addproduct') return await startAddProduct(bot, chatId);
    if (text === '/pending') return await showPendingSubmissions(bot, chatId);
    if (text === '/pending_payments') return await showPendingPayments(bot, chatId);
    if (text === '/products') return await showActiveProducts(bot, chatId);
    if (text === '/paid_ads') return await showPaidAds(bot, chatId);
    if (text === '/settings') return await showSettings(bot, chatId);

    if (session && session.step && session.step.startsWith('admin_add_product')) {
      return await handleAdminAddProductStep(bot, chatId, text);
    }
    if (session && session.step === 'admin_reject_reason') {
      return await handleRejectReason(bot, chatId, text);
    }
    if (session && session.step === 'admin_receipt_reject_reason') {
      return await handleReceiptRejectReason(bot, chatId, text);
    }
    if (session && session.step && session.step.startsWith('settings_edit')) {
      return await saveSettingValue(bot, chatId, text);
    }
    return;
  }

  if (!user.gmailSubmitted) return await handleGmailInput(bot, chatId, text, user);
  if (!user.whatsappSubmitted) {
    const session = getSession(chatId);
    if (session && session.step === 'awaiting_whatsapp') {
      await handleWhatsappInput(bot, chatId, text, user);
      return;
    }
    await askWhatsapp(bot, chatId);
    return;
  }
  if (!user.verified) {
    await showVerificationStep(bot, chatId, user);
    return;
  }

  const session = getSession(chatId);

  if (session && session.step === 'searching') {
    return await searchProducts(bot, chatId, user, text);
  }

  if (session && session.step === 'select_pro_days_custom') {
    const days = parseInt(text);
    if (isNaN(days) || days <= 0) return bot.sendMessage(chatId, '❌ Enter a valid number of days.');
    updateSession(chatId, { promoDays: days, customDaysUserMsgId: msg.message_id });
    return await handleProDays(bot, chatId, days, user);
  }

  if (text === '🛍️ Buy Used Items') return await handleBuyFlow(bot, chatId, user);
  if (text === '💰 Sell Used Items') {
    await startSellFlow(bot, chatId, user, msg.message_id);
    return;
  }

  if (text.startsWith('/')) {
    return bot.sendMessage(chatId, '❌ Unknown command.');
  }
});

// ========== TEST CHANNEL MEDIA FLUSH ==========
const testChannelTimers = {};

async function flushTestChannelMedia(chatId) {
  const session = getSession(chatId);
  if (!session || session.step !== 'test_channel_awaiting_media') return;
  const items = (session.data && session.data.testMediaItems) || [];
  clearSession(chatId);
  const storageChannelId = process.env.STORAGE_CHANNEL_ID;
  try {
    if (items.length === 0) {
      return bot.sendMessage(chatId, '❌ No media received. Please try /test_channel again.');
    }
    if (items.length === 1) {
      const item = items[0];
      if (item.type === 'photo') {
        const sentMsg = await bot.sendPhoto(storageChannelId, item.file_id, {
          caption: '🧪 Test media from CampusMarketplace bot — channel is working!'
        });
        const returned_file_id = sentMsg.photo[sentMsg.photo.length - 1].file_id;
        return bot.sendMessage(chatId,
          `✅ Photo sent to channel successfully!\n\n` +
          `📋 file\\_id: ${returned_file_id.substring(0, 30)}...\n\n` +
          `✅ *CHANNEL IS WORKING PERFECTLY.*`,
          { parse_mode: 'Markdown' }
        );
      } else {
        const sentMsg = await bot.sendVideo(storageChannelId, item.file_id, {
          caption: '🧪 Test media from CampusMarketplace bot — channel is working!'
        });
        return bot.sendMessage(chatId,
          `✅ Video sent to channel successfully!\n\n✅ *CHANNEL IS WORKING PERFECTLY.*`,
          { parse_mode: 'Markdown' }
        );
      }
    }
    const mediaGroup = items.map((item, index) => {
      const base = { type: item.type === 'photo' ? 'photo' : 'video', media: item.file_id };
      if (index === 0) base.caption = '🧪 Test media from CampusMarketplace bot — channel is working!';
      return base;
    });
    await bot.sendMediaGroup(storageChannelId, mediaGroup);
    return bot.sendMessage(chatId,
      `✅ ${items.length} media item(s) sent to channel!\n✅ *CHANNEL IS WORKING PERFECTLY.*`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    return bot.sendMessage(chatId,
      `❌ Could not send media to channel.\n\nError: ${err.message}`,
      { parse_mode: 'Markdown' }
    );
  }
}

// ========== PHOTO/VIDEO ==========
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const user = await User.findOne({ telegramId: chatId });
  if (!user) return;
  const session = getSession(chatId);
  const file_id = msg.photo[msg.photo.length - 1].file_id;

  if (isAdmin(chatId)) {
    if (session && session.step === 'test_channel_awaiting_media') {
      const items = (session.data && session.data.testMediaItems) || [];
      items.push({ type: 'photo', file_id });
      updateSession(chatId, { testMediaItems: items });
      if (testChannelTimers[chatId]) clearTimeout(testChannelTimers[chatId]);
      testChannelTimers[chatId] = setTimeout(() => {
        delete testChannelTimers[chatId];
        flushTestChannelMedia(chatId);
      }, 1500);
      return;
    }
    if (session && session.step === 'admin_add_product_media') {
      return await handleAdminMediaUpload(bot, chatId, file_id, 'photo');
    }
    return;
  }

  if (!user.verified) return;
  if (session && session.step === 'awaiting_receipt') {
    const existingIds = session.data.receiptPhotoMsgIds || [];
    existingIds.push(msg.message_id);
    updateSession(chatId, { receiptPhotoMsgIds: existingIds });
    return await handleReceiptPhoto(bot, chatId, file_id, user);
  }
});

bot.on('video', async (msg) => {
  const chatId = msg.chat.id;
  const user = await User.findOne({ telegramId: chatId });
  if (!user) return;
  const session = getSession(chatId);
  const file_id = msg.video.file_id;

  if (isAdmin(chatId)) {
    if (session && session.step === 'test_channel_awaiting_media') {
      const items = (session.data && session.data.testMediaItems) || [];
      items.push({ type: 'video', file_id });
      updateSession(chatId, { testMediaItems: items });
      if (testChannelTimers[chatId]) clearTimeout(testChannelTimers[chatId]);
      testChannelTimers[chatId] = setTimeout(() => {
        delete testChannelTimers[chatId];
        flushTestChannelMedia(chatId);
      }, 1500);
      return;
    }
    if (session && session.step === 'admin_add_product_media') {
      return await handleAdminMediaUpload(bot, chatId, file_id, 'video');
    }
    return;
  }
  if (!user.verified) return;
});

// ========== CALLBACK QUERY ==========
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const user = await User.findOne({ telegramId: chatId });
  if (!user) return;

  const adminMode = isAdmin(chatId);

  if (data === 'telegram_link_opened') {
    await handleTelegramLinkOpened(bot, chatId);
    return bot.answerCallbackQuery(query.id);
  }

  if (data && data.startsWith('try_verify_')) {
    const targetId = data.replace('try_verify_', '');
    await handleTryVerify(bot, chatId, targetId);
    return bot.answerCallbackQuery(query.id);
  }

  if (data === 'main_menu') return await showMainMenu(bot, chatId, user);
  if (data === 'buy') return await handleBuyFlow(bot, chatId, user);

  if (data.startsWith('page_')) {
    const page = parseInt(data.split('_')[1]);
    const sess = getSession(chatId);
    const prevMsgIds = (sess && sess.data && sess.data.buyAllMsgIds) || [];
    const result = await showProducts(bot, chatId, user, page, prevMsgIds);
    if (result) {
      const allMsgIds = [result.headerMsgId, ...result.cardMsgIds, result.paginationMsgId];
      setSession(chatId, 'browsing');
      updateSession(chatId, { buyAllMsgIds: allMsgIds });
    }
    return bot.answerCallbackQuery(query.id);
  }

  if (data === 'search') {
    setSession(chatId, 'searching');
    return bot.sendMessage(chatId, '🔍 What are you looking for?');
  }

  if (data === 'sell') return await startSellFlow(bot, chatId, user, null);

  if (data === 'plan_free') {
    await handlePlanSelection(bot, chatId, 'free', user);
    return bot.answerCallbackQuery(query.id);
  }
  if (data === 'plan_pro') {
    await handlePlanSelection(bot, chatId, 'pro', user);
    return bot.answerCallbackQuery(query.id);
  }

  if (data.startsWith('prodays_')) {
    const daysStr = data.split('_')[1];
    if (daysStr === 'custom') {
      setSession(chatId, 'select_pro_days_custom');
      const customPromptMsg = await bot.sendMessage(chatId, 'How many days? (type a number):');
      updateSession(chatId, { customDaysBotMsgId: customPromptMsg.message_id });
      return bot.answerCallbackQuery(query.id);
    }
    const days = parseInt(daysStr);
    await handleProDays(bot, chatId, days, user);
    return bot.answerCallbackQuery(query.id);
  }

  if (data === 'view_items') {
    const sess = getSession(chatId);
    const prevMsgIds = (sess && sess.data && sess.data.buyAllMsgIds) || [];
    const result = await showProducts(bot, chatId, user, 0, prevMsgIds);
    if (result) {
      const allMsgIds = [result.headerMsgId, ...result.cardMsgIds, result.paginationMsgId];
      setSession(chatId, 'browsing');
      updateSession(chatId, { buyAllMsgIds: allMsgIds });
    }
    return bot.answerCallbackQuery(query.id);
  }

  if (adminMode) {
    if (data === 'admin_menu') { await showAdminMenu(bot, chatId); return bot.answerCallbackQuery(query.id); }
    if (data === 'admin_add_product') { await startAddProduct(bot, chatId); return bot.answerCallbackQuery(query.id); }
    if (data === 'admin_pending') { await showPendingSubmissions(bot, chatId); return bot.answerCallbackQuery(query.id); }
    if (data === 'admin_pending_payments') { await showPendingPayments(bot, chatId); return bot.answerCallbackQuery(query.id); }
    if (data === 'admin_paid_ads') { await showPaidAds(bot, chatId); return bot.answerCallbackQuery(query.id); }
    if (data === 'admin_products') { await showActiveProducts(bot, chatId); return bot.answerCallbackQuery(query.id); }
    if (data === 'admin_settings') { await showSettings(bot, chatId); return bot.answerCallbackQuery(query.id); }

    if (data.startsWith('receipt_approve_')) {
      await approveReceipt(bot, chatId, data.replace('receipt_approve_', ''), query.message.message_id);
      return bot.answerCallbackQuery(query.id);
    }
    if (data.startsWith('receipt_reject_')) {
      await startRejectReceipt(bot, chatId, data.replace('receipt_reject_', ''), query.message.message_id);
      return bot.answerCallbackQuery(query.id);
    }
    if (data.startsWith('receipt_rereview_')) {
      await reReviewReceipt(bot, chatId, data.replace('receipt_rereview_', ''));
      return bot.answerCallbackQuery(query.id);
    }
    if (data.startsWith('approve_')) {
      bot.answerCallbackQuery(query.id).catch(() => {});
      await approveSubmission(bot, chatId, data.split('_')[1], query.message.message_id);
      return;
    }
    if (data.startsWith('reject_')) {
      bot.answerCallbackQuery(query.id).catch(() => {});
      await rejectSubmission(bot, chatId, data.split('_')[1], query.message.message_id);
      return;
    }

    // Admin add product inline callbacks
    if (data === 'admin_neg_yes') {
      updateSession(chatId, { negotiable: true });
      setSession(chatId, 'admin_add_product_lowest_price');
      await bot.sendMessage(chatId, '💰 What is the lowest acceptable price (₦)?');
      return bot.answerCallbackQuery(query.id);
    }
    if (data === 'admin_neg_no') {
      updateSession(chatId, { negotiable: false, lowestPrice: 0 });
      setSession(chatId, 'admin_add_product_used_for');
      await bot.sendMessage(chatId, '⏱ How long has it been used? (e.g. 6 months, 2 years, or N/A):');
      return bot.answerCallbackQuery(query.id);
    }
    if (data === 'admin_defects_yes') {
      setSession(chatId, 'admin_add_product_defects_details');
      await bot.sendMessage(chatId, '🔧 Describe the defects:');
      return bot.answerCallbackQuery(query.id);
    }
    if (data === 'admin_defects_no') {
      updateSession(chatId, { hasDefects: false, defectsDetails: '' });
      setSession(chatId, 'admin_add_product_repairs');
      await bot.sendMessage(chatId, '🛠 Any repairs done?', {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Yes', callback_data: 'admin_repairs_yes' },
            { text: 'No',  callback_data: 'admin_repairs_no' }
          ]]
        }
      });
      return bot.answerCallbackQuery(query.id);
    }
    if (data === 'admin_repairs_yes') {
      setSession(chatId, 'admin_add_product_repairs_details');
      await bot.sendMessage(chatId, '🛠 Describe the repairs:');
      return bot.answerCallbackQuery(query.id);
    }
    if (data === 'admin_repairs_no') {
      updateSession(chatId, { wasRepaired: false, repairsDetails: '' });
      setSession(chatId, 'admin_add_product_reason');
      await bot.sendMessage(chatId, '❓ Reason for selling (or N/A):');
      return bot.answerCallbackQuery(query.id);
    }
    if (data.startsWith('admin_del_')) {
      const delType = data.replace('admin_del_', '');
      updateSession(chatId, {
        doorDropoff: delType === 'dropoff' || delType === 'both',
        doorPickup: delType === 'pickup' || delType === 'both'
      });
      setSession(chatId, 'admin_add_product_whatsapp');
      await bot.sendMessage(chatId, '📱 Use default WhatsApp or enter a custom one?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Use Default', callback_data: 'admin_wa_default' }],
            [{ text: 'Type Custom', callback_data: 'admin_wa_custom' }]
          ]
        }
      });
      return bot.answerCallbackQuery(query.id);
    }
    if (data === 'admin_wa_default') {
      const session = getSession(chatId);
      if (session && (session.step === 'admin_add_product_whatsapp' || session.step === 'admin_add_product_whatsapp_custom')) {
        await showAdminProductSummary(bot, chatId);
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
      await markAsSold(bot, chatId, data.split('_')[2]);
      return bot.answerCallbackQuery(query.id);
    }
    if (data.startsWith('confirm_sold_')) {
      await confirmSoldProduct(bot, chatId, data.split('_')[2]);
      return bot.answerCallbackQuery(query.id);
    }
    if (data === 'cancel_sold') {
      clearSession(chatId);
      await showActiveProducts(bot, chatId);
      return bot.answerCallbackQuery(query.id);
    }
    if (data === 'settings_whatsapp') { await editSettingStep(bot, chatId, 'whatsapp'); return bot.answerCallbackQuery(query.id); }
    if (data === 'settings_pro_price') { await editSettingStep(bot, chatId, 'pro_price'); return bot.answerCallbackQuery(query.id); }
    if (data.startsWith('settings_bank_')) { await editSettingStep(bot, chatId, `bank_${data.split('_')[2]}`); return bot.answerCallbackQuery(query.id); }
    if (data.startsWith('settings_toggle_')) { await editSettingStep(bot, chatId, `toggle_${data.split('_')[2]}`); return bot.answerCallbackQuery(query.id); }
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


  const param = (msg.text || '').replace(/^\/start\s*/, '').trim();

  const user = await getOrCreateUser(chatId, msg);

  if (param && param.startsWith('verified_')) {
    const verified = await handleVerifyDeepLink(bot, chatId, param);
    if (verified) {
      const freshUser = await User.findOne({ telegramId: chatId });
      const ready = await checkUserReady(bot, chatId, freshUser);
      if (ready) await showMainMenu(bot, chatId, freshUser);
    }
    return;
  }

  // Handle view_[productId] deep link
  if (param && param.startsWith('view_')) {
    const productId = param.replace('view_', '');
    try {
      const { sendProductCard } = require('./handlers/product');
      const settings = await Settings.findOne() || new Settings();
      const product = await Product.findById(productId);
      if (!product) return bot.sendMessage(chatId, '❌ Product not found or has been removed.');
      // Auto show products instead of /start
      const ready = await checkUserReady(bot, chatId, user);
      if (!ready) return;
      await sendProductCard(bot, chatId, product, user, settings);
    } catch (e) {
      await bot.sendMessage(chatId, '❌ Could not load product.');
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
  if (text === '/begin') return; // handled by onText
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

    if (session && session.step === 'admin_receipt_reject_reason') {
      return await handleReceiptRejectReason(bot, chatId, text);
    }

    if (session && session.step && session.step.startsWith('settings_edit')) {
      return await saveSettingValue(bot, chatId, text);
    }

    return;
  }

  // Regular user message handling — enforce order: gmail -> whatsapp -> verify
  if (!user.gmailSubmitted) {
    return await handleGmailInput(bot, chatId, text, user);
  }

  if (!user.whatsappSubmitted) {
    const session = getSession(chatId);
    if (session && session.step === 'awaiting_whatsapp') {
      await handleWhatsappInput(bot, chatId, text, user);
      return;
    }
    await askWhatsapp(bot, chatId);
    return;
  }

  if (!user.verified) {
    await showVerificationStep(bot, chatId, user);
    return;
  }

  const session = getSession(chatId);

  if (session && session.step === 'searching') {
    return await searchProducts(bot, chatId, user, text);
  }

  if (session && session.step === 'select_pro_days_custom') {
    const days = parseInt(text);
    if (isNaN(days) || days <= 0) return bot.sendMessage(chatId, '❌ Enter a valid number of days.');
    // Store user reply msg id so handleProDays can include it in sell flow deletions
    updateSession(chatId, { promoDays: days, customDaysUserMsgId: msg.message_id });
    return await handleProDays(bot, chatId, days, user);
  }

  // ReplyKeyboardMarkup persistent buttons
  if (text === '🛍️ Buy Used Items') return await handleBuyFlow(bot, chatId, user);
  if (text === '💰 Sell Used Items') {
    await startSellFlow(bot, chatId, user, msg.message_id);
    return;
  }

  if (text.startsWith('/')) {
    return bot.sendMessage(chatId, '❌ Unknown command.');
  }
});

// ========== TEST CHANNEL MEDIA FLUSH ==========
// Timers keyed by chatId — used to batch media_group items before sending
const testChannelTimers = {};

async function flushTestChannelMedia(chatId) {
  const session = getSession(chatId);
  if (!session || session.step !== 'test_channel_awaiting_media') return;

  const items = (session.data && session.data.testMediaItems) || [];
  clearSession(chatId);

  const storageChannelId = process.env.STORAGE_CHANNEL_ID;

  try {
    if (items.length === 0) {
      return bot.sendMessage(chatId, '❌ No media received. Please try /test_channel again.');
    }

    if (items.length === 1) {
      // Single item — send directly
      const item = items[0];
      let sentMsg;
      if (item.type === 'photo') {
        sentMsg = await bot.sendPhoto(storageChannelId, item.file_id, {
          caption: '🧪 Test media from CampusMarketplace bot — channel is working!'
        });
        const returned_file_id = sentMsg.photo[sentMsg.photo.length - 1].file_id;
        return bot.sendMessage(chatId,
          `✅ Step 2: Photo sent to channel successfully!\n\n` +
          `📋 file\\_id: ${returned_file_id.substring(0, 30)}...\n\n` +
          `✅ *CHANNEL IS WORKING PERFECTLY.*`,
          { parse_mode: 'Markdown' }
        );
      } else {
        sentMsg = await bot.sendVideo(storageChannelId, item.file_id, {
          caption: '🧪 Test media from CampusMarketplace bot — channel is working!'
        });
        const returned_file_id = sentMsg.video.file_id;
        return bot.sendMessage(chatId,
          `✅ Step 2: Video sent to channel successfully!\n\n` +
          `📋 file\\_id: ${returned_file_id.substring(0, 30)}...\n\n` +
          `✅ *CHANNEL IS WORKING PERFECTLY.*`,
          { parse_mode: 'Markdown' }
        );
      }
    }

    // Multiple items — use sendMediaGroup
    const mediaGroup = items.map((item, index) => {
      const base = { type: item.type === 'photo' ? 'photo' : 'video', media: item.file_id };
      if (index === 0) base.caption = '🧪 Test media from CampusMarketplace bot — channel is working!';
      return base;
    });

    const sentMsgs = await bot.sendMediaGroup(storageChannelId, mediaGroup);
    const count = sentMsgs.length;
    return bot.sendMessage(chatId,
      `✅ Step 2: ${count} media item(s) sent to channel successfully!\n\n` +
      `✅ *CHANNEL IS WORKING PERFECTLY.*\n` +
      `Photos and videos from the miniapp will show in all locations.`,
      { parse_mode: 'Markdown' }
    );

  } catch (err) {
    return bot.sendMessage(chatId,
      `❌ Step 2 FAILED: Could not send media to channel.\n\n` +
      `Error: ${err.message}\n\n` +
      `*What to check:*\n` +
      `1. Is the bot an admin in the channel?\n` +
      `2. Is STORAGE\\_CHANNEL\\_ID exactly correct?\n` +
      `3. Open the channel, tap the bot name, confirm it shows "admin"`,
      { parse_mode: 'Markdown' }
    );
  }
}

// ========== PHOTO/VIDEO UPLOAD ==========
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const user = await User.findOne({ telegramId: chatId });
  if (!user) return;

  const session = getSession(chatId);
  const file_id = msg.photo[msg.photo.length - 1].file_id;

  if (isAdmin(chatId)) {
    // Test channel: collect photo into media batch, then flush after 1.5s of silence
    if (session && session.step === 'test_channel_awaiting_media') {
      const items = (session.data && session.data.testMediaItems) || [];
      items.push({ type: 'photo', file_id });
      updateSession(chatId, { testMediaItems: items });
      // Reset flush timer
      if (testChannelTimers[chatId]) clearTimeout(testChannelTimers[chatId]);
      testChannelTimers[chatId] = setTimeout(() => {
        delete testChannelTimers[chatId];
        flushTestChannelMedia(chatId);
      }, 1500);
      return;
    }
    if (session && session.step === 'admin_add_product_media') {
      return await handleAdminMediaUpload(bot, chatId, file_id, 'photo');
    }
    return;
  }

  if (!user.verified) return;

  if (session && session.step === 'awaiting_receipt') {
    // Accumulate message IDs of all receipt photos sent (user may send multiple)
    const existingIds = session.data.receiptPhotoMsgIds || [];
    existingIds.push(msg.message_id);
    updateSession(chatId, { receiptPhotoMsgIds: existingIds });
    return await handleReceiptPhoto(bot, chatId, file_id, user);
  }
});

bot.on('video', async (msg) => {
  const chatId = msg.chat.id;
  const user = await User.findOne({ telegramId: chatId });
  if (!user) return;

  const session = getSession(chatId);
  const file_id = msg.video.file_id;

  if (isAdmin(chatId)) {
    // Test channel: collect video into media batch, then flush after 1.5s of silence
    if (session && session.step === 'test_channel_awaiting_media') {
      const items = (session.data && session.data.testMediaItems) || [];
      items.push({ type: 'video', file_id });
      updateSession(chatId, { testMediaItems: items });
      // Reset flush timer
      if (testChannelTimers[chatId]) clearTimeout(testChannelTimers[chatId]);
      testChannelTimers[chatId] = setTimeout(() => {
        delete testChannelTimers[chatId];
        flushTestChannelMedia(chatId);
      }, 1500);
      return;
    }
    if (session && session.step === 'admin_add_product_media') {
      return await handleAdminMediaUpload(bot, chatId, file_id, 'video');
    }
    return;
  }

  if (!user.verified) return;
});

// ========== CALLBACK QUERY ==========
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const user = await User.findOne({ telegramId: chatId });

  if (!user) return;

  const adminMode = isAdmin(chatId);

  // Telegram link opened tracking
  if (data === 'telegram_link_opened') {
    await handleTelegramLinkOpened(bot, chatId);
    return bot.answerCallbackQuery(query.id);
  }

  // Try verify callback (from "Click Here to Get Verified" button)
  if (data && data.startsWith('try_verify_')) {
    const targetId = data.replace('try_verify_', '');
    await handleTryVerify(bot, chatId, targetId);
    return bot.answerCallbackQuery(query.id);
  }

  if (data === 'main_menu') return await showMainMenu(bot, chatId, user);
  if (data === 'buy') return await handleBuyFlow(bot, chatId, user);

  if (data.startsWith('page_')) {
    const page = parseInt(data.split('_')[1]);
    const sess = getSession(chatId);
    const prevMsgIds = (sess && sess.data && sess.data.buyAllMsgIds) || [];
    const result = await showProducts(bot, chatId, user, page, prevMsgIds);
    if (result) {
      const allMsgIds = [result.headerMsgId, ...result.cardMsgIds, result.paginationMsgId];
      setSession(chatId, 'browsing');
      updateSession(chatId, { buyAllMsgIds: allMsgIds });
    }
    return bot.answerCallbackQuery(query.id);
  }

  if (data === 'search') {
    setSession(chatId, 'searching');
    return bot.sendMessage(chatId, '🔍 What are you looking for?');
  }

  if (data === 'sell') return await startSellFlow(bot, chatId, user, null);

  if (data === 'plan_free') {
    await handlePlanSelection(bot, chatId, 'free', user);
    return bot.answerCallbackQuery(query.id);
  }

  if (data === 'plan_pro') {
    await handlePlanSelection(bot, chatId, 'pro', user);
    return bot.answerCallbackQuery(query.id);
  }

  if (data.startsWith('prodays_')) {
    const daysStr = data.split('_')[1];
    if (daysStr === 'custom') {
      setSession(chatId, 'select_pro_days_custom');
      const customPromptMsg = await bot.sendMessage(chatId, 'How many days? (type a number):');
      updateSession(chatId, { customDaysBotMsgId: customPromptMsg.message_id });
      return bot.answerCallbackQuery(query.id);
    }
    const days = parseInt(daysStr);
    await handleProDays(bot, chatId, days, user);
    return bot.answerCallbackQuery(query.id);
  }

  // View items — auto list products without /start
  if (data === 'view_items') {
    const sess = getSession(chatId);
    const prevMsgIds = (sess && sess.data && sess.data.buyAllMsgIds) || [];
    const result = await showProducts(bot, chatId, user, 0, prevMsgIds);
    if (result) {
      const allMsgIds = [result.headerMsgId, ...result.cardMsgIds, result.paginationMsgId];
      setSession(chatId, 'browsing');
      updateSession(chatId, { buyAllMsgIds: allMsgIds });
    }
    return bot.answerCallbackQuery(query.id);
  }

  if (adminMode) {
    if (data === 'admin_menu') return await showAdminMenu(bot, chatId);
    if (data === 'admin_add_product') return await startAddProduct(bot, chatId);
    if (data === 'admin_pending') return await showPendingSubmissions(bot, chatId);
    if (data === 'admin_pending_payments') return await showPendingPayments(bot, chatId);
    if (data === 'admin_products') return await showActiveProducts(bot, chatId);
    if (data === 'admin_settings') return await showSettings(bot, chatId);

    if (data.startsWith('receipt_approve_')) {
      await approveReceipt(bot, chatId, data.replace('receipt_approve_', ''), query.message.message_id);
      return bot.answerCallbackQuery(query.id);
    }
    if (data.startsWith('receipt_reject_')) {
      await startRejectReceipt(bot, chatId, data.replace('receipt_reject_', ''), query.message.message_id);
      return bot.answerCallbackQuery(query.id);
    }
    if (data.startsWith('receipt_rereview_')) {
      await reReviewReceipt(bot, chatId, data.replace('receipt_rereview_', ''));
      return bot.answerCallbackQuery(query.id);
    }
    if (data.startsWith('approve_')) {
      bot.answerCallbackQuery(query.id).catch(() => {});
      await approveSubmission(bot, chatId, data.split('_')[1], query.message.message_id);
      return;
    }
    if (data.startsWith('reject_')) {
      bot.answerCallbackQuery(query.id).catch(() => {});
      await rejectSubmission(bot, chatId, data.split('_')[1], query.message.message_id);
      return;
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
      await markAsSold(bot, chatId, data.split('_')[2]);
      return bot.answerCallbackQuery(query.id);
    }
    if (data.startsWith('confirm_sold_')) {
      await confirmSoldProduct(bot, chatId, data.split('_')[2]);
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
    if (data.startsWith('settings_bank_')) {
      await editSettingStep(bot, chatId, `bank_${data.split('_')[2]}`);
      return bot.answerCallbackQuery(query.id);
    }
    if (data.startsWith('settings_toggle_')) {
      await editSettingStep(bot, chatId, `toggle_${data.split('_')[2]}`);
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
