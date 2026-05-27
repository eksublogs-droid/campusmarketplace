const User = require('../models/User');
const SellerSubmission = require('../models/SellerSubmission');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const { mainMenu, planSelection, proDayOptions, proceedPayment, submitToAdmin } = require('../utils/keyboard');
const { showProducts, searchProducts } = require('./product');
const { initiatePayment } = require('./payment');
const { setSession, updateSession, getSession, clearSession } = require('../utils/session');

async function showMainMenu(bot, chatId, user) {
  await bot.sendMessage(chatId,
    `Welcome back *${user.firstName}*! 👋\n\nWhat can we do for you today?`,
    { parse_mode: 'Markdown', reply_markup: mainMenu() }
  );
  clearSession(chatId);
}

// ========== BUY FLOW ==========
async function handleBuyFlow(bot, chatId, user) {
  await showProducts(bot, chatId, user, 0);
}

// ========== SELL FLOW ==========
async function startSellFlow(bot, chatId, user) {
  const planMsg =
    `💎 *WHY GO PRO?*\n\n` +
    `🆓 *Free gets you:*\n` +
    `✅ WhatsApp Status\n` +
    `✅ Telegram Status\n\n` +
    `⭐ *Pro gets you EVERYTHING +:*\n` +
    `✅ WhatsApp Status\n` +
    `✅ Telegram Status\n` +
    `✅ 30+ WhatsApp Groups\n` +
    `✅ Facebook Group 140k\n` +
    `✅ Telegram Group 5.2k\n` +
    `✅ First On Listings\n` +
    `🚀 Find buyers up to *5x faster!*\n\n` +
    `💰 Just *₦1,000/day*\n\n` +
    `Don't let your item sit for weeks.\n` +
    `Serious sellers choose Pro ⭐`;

  await bot.sendMessage(chatId, planMsg, {
    parse_mode: 'Markdown',
    reply_markup: planSelection()
  });

  setSession(chatId, 'select_plan');
}

async function handlePlanSelection(bot, chatId, plan) {
  if (plan === 'free') {
    setSession(chatId, 'sell_product_name');
    return bot.sendMessage(chatId, '✅ Free plan selected. Let\'s add your product!\n\n📦 What is the product name?');
  }

  // Pro selected
  setSession(chatId, 'select_pro_days');
  await bot.sendMessage(chatId,
    `⭐ *Pro Plan Selected*\n\nHow many days would you like to promote your listing?`,
    { parse_mode: 'Markdown', reply_markup: proDayOptions() }
  );
}

async function handleProDays(bot, chatId, days) {
  const settings = await Settings.findOne() || new Settings();
  const pricePerDay = settings.proPricePerDay || 1000;
  const amount = days * pricePerDay;

  const user = await User.findOne({ telegramId: chatId });
  const summary =
    `📋 *Pro Plan Summary*\n` +
    `Days: ${days}\n` +
    `Price: ₦${amount.toLocaleString()}\n` +
    `What you get: First on listings + all promotion channels`;

  await bot.sendMessage(chatId, summary, {
    parse_mode: 'Markdown',
    reply_markup: proceedPayment()
  });

  // setSession must come BEFORE updateSession — setSession resets data:{} and would wipe promoDays/plan
  setSession(chatId, 'awaiting_payment');
  updateSession(chatId, { plan: 'pro', promoDays: days });
}

async function proceedWithPaymentForPro(bot, chatId, user) {
  const session = getSession(chatId);
  if (!session || !session.data) {
    return bot.sendMessage(chatId, '❌ Session expired. Please start over from the main menu.');
  }

  const days = session.data.promoDays;
  if (!days || isNaN(days) || days <= 0) {
    return bot.sendMessage(chatId, '❌ Could not read your selected days. Please start over.');
  }

  const settings = await Settings.findOne() || new Settings();
  const pricePerDay = settings.proPricePerDay || 1000;

  // initiatePayment already sets session to 'awaiting_receipt' — do NOT overwrite it here
  await initiatePayment(bot, chatId, user, days, pricePerDay);
}

// After payment confirmed, start product form
async function startProductForm(bot, chatId) {
  setSession(chatId, 'sell_product_name');
  await bot.sendMessage(chatId, '✅ Great! Let\'s add your product.\n\n📦 What is the product name?');
}

// ========== PRODUCT FORM STEPS ==========
async function handleProductFormStep(bot, chatId, text) {
  const session = getSession(chatId);
  if (!session) return bot.sendMessage(chatId, '❌ Session expired. Start over.');

  const step = session.step;
  const data = session.data || {};

  switch (step) {
    case 'sell_product_name':
      updateSession(chatId, { productName: text });
      setSession(chatId, 'sell_product_media');
      return bot.sendMessage(chatId, '📸 Upload photos and/or videos (send multiple, type DONE when finished):');

    case 'sell_product_media':
      if (text.toLowerCase() === 'done') {
        if (!data.productMedia || data.productMedia.length === 0) {
          return bot.sendMessage(chatId, '⚠️ Please upload at least one photo or video.');
        }
        setSession(chatId, 'sell_product_details');
        return bot.sendMessage(chatId, '📝 Enter custom details (brand, condition, age, etc):');
      }
      return; // Wait for media

    case 'sell_product_details':
      updateSession(chatId, { productDetails: text });
      setSession(chatId, 'sell_product_description');
      return bot.sendMessage(chatId, '📄 Enter product description:');

    case 'sell_product_description':
      updateSession(chatId, { productDescription: text });
      setSession(chatId, 'sell_product_location');
      return bot.sendMessage(chatId, '📍 Where is the product located?');

    case 'sell_product_location':
      updateSession(chatId, { productLocation: text });
      setSession(chatId, 'sell_product_whatsapp');
      await bot.sendMessage(chatId, '📱 Which WhatsApp number should buyers use?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📱 Use Default (+2348137890167)', callback_data: 'wa_default' }],
            [{ text: '✏️ Type Custom Number', callback_data: 'wa_custom' }]
          ]
        }
      });
      return;

    case 'sell_product_whatsapp_custom':
      updateSession(chatId, { productWhatsapp: text });
      setSession(chatId, 'sell_product_price');
      return bot.sendMessage(chatId, '💰 What is your asking price? (₦)');

    case 'sell_product_price': {
      const price = parseInt(text);
      if (isNaN(price) || price <= 0) {
        return bot.sendMessage(chatId, '❌ Please enter a valid number.');
      }
      updateSession(chatId, { productPrice: price });
      setSession(chatId, 'sell_product_lastprice');
      return bot.sendMessage(chatId, '💸 What is your lowest/last price? (₦)');
    }

    case 'sell_product_lastprice': {
      const lastPrice = parseInt(text);
      if (isNaN(lastPrice) || lastPrice <= 0) {
        return bot.sendMessage(chatId, '❌ Please enter a valid number.');
      }
      updateSession(chatId, { productLastPrice: lastPrice });

      await bot.sendMessage(chatId,
        '⚠️ *Pricing Tip:* Items priced too high sit for months with no buyers. ' +
        'A fair price means faster sale and quicker cash. Consider pricing competitively!',
        { parse_mode: 'Markdown' }
      );

      await showProductSummary(bot, chatId);
      return;
    }
  }
}

async function handleMediaUpload(bot, chatId, file_id, mediaType) {
  const session = getSession(chatId);
  if (!session || session.step !== 'sell_product_media') {
    return bot.sendMessage(chatId, '❌ Not in the right step. Type DONE to proceed.');
  }

  if (!session.data.productMedia) session.data.productMedia = [];
  session.data.productMedia.push({ file_id, type: mediaType });
  updateSession(chatId, { productMedia: session.data.productMedia });

  await bot.sendMessage(chatId, `✅ Media added (${session.data.productMedia.length} file(s)). Send more or type DONE.`);
}

async function showProductSummary(bot, chatId) {
  const session = getSession(chatId);
  const d = session.data;

  const summary =
    `📦 *Product Summary*\n` +
    `─────────────────\n` +
    `Product: ${d.productName}\n` +
    `📸 Media: ${d.productMedia?.length || 0} file(s)\n` +
    `📝 Details: ${d.productDetails}\n` +
    `📄 Description: ${d.productDescription}\n` +
    `📍 Location: ${d.productLocation}\n` +
    `📱 WhatsApp: ${d.productWhatsapp || '+2348137890167'}\n` +
    `💰 Asking: ₦${d.productPrice?.toLocaleString() || 'N/A'}\n` +
    `💸 Last: ₦${d.productLastPrice?.toLocaleString() || 'N/A'}\n` +
    `📋 Plan: ${d.plan === 'pro' ? `Pro (${d.promoDays} days)` : 'Free'}`;

  await bot.sendMessage(chatId, summary, {
    parse_mode: 'Markdown',
    reply_markup: submitToAdmin()
  });

  setSession(chatId, 'awaiting_submit');
}

async function submitProductToAdmin(bot, chatId, user) {
  const session = getSession(chatId);
  const d = session.data;

  const settings = await Settings.findOne() || new Settings();
  const pricePerDay = settings.proPricePerDay || 1000;

  const submission = new SellerSubmission({
    telegramId: user.telegramId,
    firstName: user.firstName,
    username: user.username,
    gmail: user.gmail,
    whatsappNumber: d.productWhatsapp || '+2348137890167',
    productName: d.productName,
    media: d.productMedia || [],
    details: d.productDetails,
    description: d.productDescription,
    location: d.productLocation,
    askingPrice: d.productPrice,
    lastPrice: d.productLastPrice,
    plan: d.plan,
    premiumDays: d.plan === 'pro' ? d.promoDays : 0,
    premiumPrice: d.plan === 'pro' ? (d.promoDays * pricePerDay) : 0,
    paymentStatus: d.plan === 'pro' ? 'paid' : 'not_needed',
    approvalStatus: 'pending'
  });

  await submission.save();
  clearSession(chatId);

  await bot.sendMessage(chatId,
    '📤 *Product submitted for approval!*\n\n' +
    'We\'ll review it and notify you soon via email and Telegram.\n\n' +
    '🏠 Back to main menu',
    {
      reply_markup: { inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: 'main_menu' }]] }
    }
  );

  // Notify admin
  await notifyAdminNewSubmission(bot, submission);
}

async function notifyAdminNewSubmission(bot, submission) {
  const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID);
  const notif =
    `🆕 *NEW SELLER SUBMISSION*\n\n` +
    `👤 Name: ${submission.firstName}\n` +
    `🆔 Username: @${submission.username || 'N/A'}\n` +
    `🔢 Telegram ID: ${submission.telegramId}\n` +
    `📧 Gmail: ${submission.gmail}\n\n` +
    `📦 Product: ${submission.productName}\n` +
    `📝 Details: ${submission.details}\n` +
    `📄 Description: ${submission.description}\n` +
    `📍 Location: ${submission.location}\n` +
    `💰 Asking: ₦${submission.askingPrice.toLocaleString()}\n` +
    `💸 Last: ₦${submission.lastPrice.toLocaleString()}\n` +
    `📱 WhatsApp: ${submission.whatsappNumber}\n` +
    `📋 Plan: ${submission.plan === 'pro' ? `Pro (${submission.premiumDays} days)` : 'Free'}`;

  await bot.sendMessage(adminId, notif, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `approve_${submission._id}` },
          { text: '❌ Reject', callback_data: `reject_${submission._id}` }
        ]
      ]
    }
  });

  // Send media
  if (submission.media && submission.media.length > 0) {
    for (const m of submission.media) {
      if (m.type === 'video') await bot.sendVideo(adminId, m.file_id);
      else await bot.sendPhoto(adminId, m.file_id);
    }
  }
}

module.exports = {
  showMainMenu,
  handleBuyFlow,
  startSellFlow,
  handlePlanSelection,
  handleProDays,
  proceedWithPaymentForPro,
  startProductForm,
  handleProductFormStep,
  handleMediaUpload,
  showProductSummary,
  submitProductToAdmin,
  notifyAdminNewSubmission
};

    `🆔 Username: @${submission.username || 'N/A'}\n` +
    `🔢 Telegram ID: ${submission.telegramId}\n` +
    `📧 Gmail: ${submission.gmail}\n\n` +
    `📦 Product: ${submission.productName}\n` +
    `📝 Details: ${submission.details}\n` +
    `📄 Description: ${submission.description}\n` +
    `📍 Location: ${submission.location}\n` +
    `💰 Asking: ₦${submission.askingPrice.toLocaleString()}\n` +
    `💸 Last: ₦${submission.lastPrice.toLocaleString()}\n` +
    `📱 WhatsApp: ${submission.whatsappNumber}\n` +
    `📋 Plan: ${submission.plan === 'pro' ? `Pro (${submission.premiumDays} days)` : 'Free'}`;

  await bot.sendMessage(adminId, notif, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `approve_${submission._id}` },
          { text: '❌ Reject', callback_data: `reject_${submission._id}` }
        ]
      ]
    }
  });

  // Send media
  if (submission.media && submission.media.length > 0) {
    for (const m of submission.media) {
      if (m.type === 'video') await bot.sendVideo(adminId, m.file_id);
      else await bot.sendPhoto(adminId, m.file_id);
    }
  }
}

module.exports = {
  showMainMenu,
  handleBuyFlow,
  startSellFlow,
  handlePlanSelection,
  handleProDays,
  proceedWithPaymentForPro,
  startProductForm,
  handleProductFormStep,
  handleMediaUpload,
  showProductSummary,
  submitProductToAdmin,
  notifyAdminNewSubmission
};
