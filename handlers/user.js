const User = require('../models/User');
const SellerSubmission = require('../models/SellerSubmission');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const { mainMenu, planSelection, proDayOptions } = require('../utils/keyboard');
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
    `💎 *Choose Your Plan*\n\n` +
    `🆓 *Free Plan:*\n` +
    `✅ WhatsApp Status\n` +
    `✅ Telegram Status\n\n` +
    `⭐ *Pro Plan (₦1,000/day):*\n` +
    `✅ Everything in Free +\n` +
    `✅ 30+ WhatsApp Groups\n` +
    `✅ Facebook Group (140k members)\n` +
    `✅ Telegram Group (5.2k members)\n` +
    `✅ First position on all listings\n` +
    `🚀 Sell up to *5x faster!*\n\n` +
    `Serious sellers choose Pro ⭐`;

  await bot.sendMessage(chatId, planMsg, {
    parse_mode: 'Markdown',
    reply_markup: planSelection()
  });

  setSession(chatId, 'select_plan');
}

async function handlePlanSelection(bot, chatId, plan, user) {
  if (plan === 'free') {
    updateSession(chatId, { plan: 'free' });
    setSession(chatId, 'awaiting_miniapp');

    const miniAppUrl = `https://eksublogs-droid.github.io/campusmarketplace/miniapp/?userId=${user.telegramId}&plan=free`;

    await bot.sendMessage(chatId,
      `✅ *Free Plan Selected!*\n\nTap below to fill your listing form.\nTakes about 3–5 minutes.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📋 Open Listing Form', web_app: { url: miniAppUrl } }
          ]]
        }
      }
    );
    return;
  }

  // Pro selected
  setSession(chatId, 'select_pro_days');
  updateSession(chatId, { plan: 'pro' });
  await bot.sendMessage(chatId,
    `⭐ *Pro Plan Selected*\n\nHow many days would you like to promote your listing?`,
    { parse_mode: 'Markdown', reply_markup: proDayOptions() }
  );
}

async function handleProDays(bot, chatId, days, user) {
  const settings = await Settings.findOne() || new Settings();
  const pricePerDay = settings.proPricePerDay || 1000;
  const amount = days * pricePerDay;

  updateSession(chatId, { promoDays: days, proAmount: amount });
  setSession(chatId, 'awaiting_miniapp');

  const miniAppUrl = `https://eksublogs-droid.github.io/campusmarketplace/miniapp/?userId=${user.telegramId}&plan=pro&days=${days}&amount=${amount}`;

  const summary =
    `📋 *Pro Plan Summary*\n` +
    `Duration : ${days} day${days > 1 ? 's' : ''}\n` +
    `Total    : ₦${amount.toLocaleString()}\n\n` +
    `What you get:\n` +
    `✅ First position on all listings\n` +
    `✅ 30+ WhatsApp groups\n` +
    `✅ Facebook group (140k members)\n` +
    `✅ Telegram group (5.2k members)\n\n` +
    `Fill your listing form first, then complete payment after.`;

  await bot.sendMessage(chatId, summary, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '📋 Open Listing Form', web_app: { url: miniAppUrl } }
      ]]
    }
  });
}

// ========== AFTER MINI APP SUBMITS ==========
// Called by POST /api/submit-listing in index.js
async function handleMiniAppSubmission(bot, userId, formData, settings) {
  const user = await User.findOne({ telegramId: userId });
  if (!user) return;

  const plan = formData.plan || 'free';
  const days = parseInt(formData.days) || 0;
  const amount = parseInt(formData.amount) || 0;
  const pricePerDay = (settings && settings.proPricePerDay) || 1000;

  const submission = new SellerSubmission({
    telegramId:       user.telegramId,
    firstName:        user.firstName,
    username:         user.username,
    gmail:            user.gmail,
    whatsappNumber:   user.whatsapp || 'N/A',
    productName:      formData.itemTitle || '',
    media:            formData.media || [],
    description:      formData.description || '',
    category:         formData.category || '',
    subcategory:      formData.subcategory || '',
    brand:            formData.brand || '',
    condition:        formData.condition || '',
    originalPrice:    parseInt(formData.originalPrice) || 0,
    sellingPrice:     parseInt(formData.sellingPrice) || 0,
    negotiable:       formData.negotiable === true || formData.negotiable === 'true',
    lowestPrice:      parseInt(formData.lowestPrice) || 0,
    usedDuration:     formData.usedDuration || '',
    hasDefects:       formData.hasDefects === true || formData.hasDefects === 'true',
    defectsDetails:   formData.defectsDetails || '',
    wasRepaired:      formData.wasRepaired === true || formData.wasRepaired === 'true',
    repairsDetails:   formData.repairsDetails || '',
    reasonForSelling: formData.reasonForSelling || '',
    state:            formData.state || '',
    city:             formData.city || '',
    doorDropoff:      formData.doorDropoff === true || formData.doorDropoff === 'true',
    doorPickup:       formData.doorPickup === true || formData.doorPickup === 'true',
    receiptAvailable: formData.receiptAvailable || '',
    warrantyRemaining:formData.warrantyRemaining || '',
    warrantyDuration: formData.warrantyDuration || '',
    originalPackaging:formData.originalPackaging || '',
    plan:             plan,
    premiumDays:      plan === 'pro' ? days : 0,
    premiumPrice:     plan === 'pro' ? amount : 0,
    paymentStatus:    plan === 'pro' ? 'pending' : 'not_needed',
    approvalStatus:   'pending'
  });

  await submission.save();
  clearSession(userId);

  if (plan === 'free') {
    await bot.sendMessage(userId,
      `✅ *Listing Submitted!*\n\n` +
      `We will review it and notify you here on Telegram and via email once approved.\n` +
      `Usually reviewed within 24 hours.`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: 'main_menu' }]] }
      }
    );
  } else {
    if (settings && settings.bankAccounts && settings.bankAccounts.length > 0) {
      const bank = settings.bankAccounts.find(b => b.active) || settings.bankAccounts[0];
      await bot.sendMessage(userId,
        `📋 *Form Received! Now Complete Payment:*\n\n` +
        `Bank         : ${bank.bankName}\n` +
        `Account No   : ${bank.accountNumber}\n` +
        `Account Name : ${bank.accountName}\n` +
        `Amount       : ₦${amount.toLocaleString()}\n\n` +
        `Send your payment screenshot here after paying.`,
        { parse_mode: 'Markdown' }
      );
      setSession(userId, 'awaiting_receipt');
      updateSession(userId, { plan: 'pro', promoDays: days, proAmount: amount, submissionId: submission._id.toString() });
    } else {
      await bot.sendMessage(userId,
        `📋 *Form Received!*\n\nPlease contact admin to complete your Pro payment of ₦${amount.toLocaleString()}.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  await notifyAdminNewSubmission(bot, submission);
}

async function notifyAdminNewSubmission(bot, submission) {
  const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID);

  const neg = submission.negotiable
    ? `Yes (Min: ₦${submission.lowestPrice.toLocaleString()})`
    : 'No';

  const notif =
    `🆕 *NEW SELLER SUBMISSION*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 Name      : ${submission.firstName}\n` +
    `🆔 Username  : @${submission.username || 'N/A'}\n` +
    `🔢 Telegram  : ${submission.telegramId}\n` +
    `📧 Gmail     : ${submission.gmail}\n` +
    `📱 WhatsApp  : ${submission.whatsappNumber}\n` +
    `📋 Plan      : ${submission.plan === 'pro' ? `Pro (${submission.premiumDays} days)` : 'Free'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Title     : ${submission.productName}\n` +
    `🗂 Category  : ${submission.category} > ${submission.subcategory}\n` +
    `🏷 Brand     : ${submission.brand}\n` +
    `⚙️ Condition : ${submission.condition}\n` +
    `📄 Desc      : ${submission.description || 'N/A'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💵 Orig Price : ₦${submission.originalPrice.toLocaleString()}\n` +
    `💰 Selling   : ₦${submission.sellingPrice.toLocaleString()}\n` +
    `🤝 Negotiable: ${neg}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ Used For  : ${submission.usedDuration || 'N/A'}\n` +
    `🔧 Defects   : ${submission.hasDefects ? (submission.defectsDetails || 'Yes') : 'None'}\n` +
    `🛠 Repairs   : ${submission.wasRepaired ? (submission.repairsDetails || 'Yes') : 'None'}\n` +
    `❓ Reason    : ${submission.reasonForSelling || 'N/A'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📍 State     : ${submission.state}\n` +
    `🏙 City      : ${submission.city}\n` +
    `🚚 Dropoff   : ${submission.doorDropoff ? 'Yes' : 'No'}\n` +
    `🚶 Pickup    : ${submission.doorPickup ? 'Yes' : 'No'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧾 Receipt   : ${submission.receiptAvailable || 'N/A'}\n` +
    `🛡 Warranty  : ${submission.warrantyRemaining === 'yes' ? (submission.warrantyDuration || 'Yes') : (submission.warrantyRemaining || 'N/A')}\n` +
    `📦 Packaging : ${submission.originalPackaging || 'N/A'}`;

  await bot.sendMessage(adminId, notif, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Approve', callback_data: `approve_${submission._id}` },
        { text: '❌ Reject', callback_data: `reject_${submission._id}` }
      ]]
    }
  });

  if (submission.media && submission.media.length > 0) {
    for (const m of submission.media) {
      if (m.type === 'video') await bot.sendVideo(adminId, m.file_id).catch(() => {});
      else await bot.sendPhoto(adminId, m.file_id).catch(() => {});
    }
  }
}

// Legacy stubs kept so existing imports in index.js don't break
async function startProductForm(bot, chatId) {
  await bot.sendMessage(chatId, '❌ Please use the listing form button to submit your item.');
}
async function handleProductFormStep(bot, chatId, text) {}
async function handleMediaUpload(bot, chatId, file_id, mediaType) {}
async function showProductSummary(bot, chatId) {}
async function submitProductToAdmin(bot, chatId, user) {}

module.exports = {
  showMainMenu,
  handleBuyFlow,
  startSellFlow,
  handlePlanSelection,
  handleProDays,
  handleMiniAppSubmission,
  notifyAdminNewSubmission,
  // legacy stubs
  startProductForm,
  handleProductFormStep,
  handleMediaUpload,
  showProductSummary,
  submitProductToAdmin
};
