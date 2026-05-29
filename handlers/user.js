const User = require('../models/User');
const SellerSubmission = require('../models/SellerSubmission');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const { mainMenu, planSelection, proDayOptions } = require('../utils/keyboard');
const { showProducts, deleteMsgs } = require('./product');
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
  const session = getSession(chatId);
  // Collect ALL previous buy listing msg IDs: header + cards + pagination
  const prevMsgIds = (session && session.data && session.data.buyAllMsgIds) || [];

  const result = await showProducts(bot, chatId, user, 0, prevMsgIds);

  if (result) {
    const allMsgIds = [result.headerMsgId, ...result.cardMsgIds, result.paginationMsgId];
    setSession(chatId, 'browsing');
    updateSession(chatId, { buyAllMsgIds: allMsgIds });
  }
}

// ========== SELL FLOW ==========
async function startSellFlow(bot, chatId, user, sellTriggerMsgId) {
  // sellTriggerMsgId: the user's "💰 Sell Used Items" message (ReplyKeyboard tap)
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

  const sentPlanMsg = await bot.sendMessage(chatId, planMsg, {
    parse_mode: 'Markdown',
    reply_markup: planSelection()
  });

  // Start fresh sell flow tracking — store user trigger msg + plan message
  setSession(chatId, 'select_plan');
  const initialMsgIds = [];
  if (sellTriggerMsgId) initialMsgIds.push(sellTriggerMsgId);
  initialMsgIds.push(sentPlanMsg.message_id);
  updateSession(chatId, { sellFlowMsgIds: initialMsgIds });
}

async function handlePlanSelection(bot, chatId, plan, user) {
  const session = getSession(chatId);
  const sellFlowMsgIds = (session && session.data && session.data.sellFlowMsgIds) || [];

  if (plan === 'free') {
    updateSession(chatId, { plan: 'free' });
    setSession(chatId, 'awaiting_miniapp');

    const miniAppUrl = `https://eksublogs-droid.github.io/campusmarketplace/miniapp/?userId=${user.telegramId}&plan=free`;

    const sentMsg = await bot.sendMessage(chatId,
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

    // Track the "Free Plan Selected" message too — gets deleted on submission
    updateSession(chatId, {
      sellFlowMsgIds: [...sellFlowMsgIds, sentMsg.message_id]
    });
    return;
  }

  // Pro selected
  setSession(chatId, 'select_pro_days');
  updateSession(chatId, { plan: 'pro' });

  const sentMsg = await bot.sendMessage(chatId,
    `⭐ *Pro Plan Selected*\n\nHow many days would you like to promote your listing?`,
    { parse_mode: 'Markdown', reply_markup: proDayOptions() }
  );

  updateSession(chatId, {
    sellFlowMsgIds: [...sellFlowMsgIds, sentMsg.message_id]
  });
}

async function handleProDays(bot, chatId, days, user) {
  const session = getSession(chatId);
  const sellFlowMsgIds = (session && session.data && session.data.sellFlowMsgIds) || [];
  // Also grab any custom-days bot prompt + user reply msg IDs stored earlier
  const customDaysBotMsgId  = (session && session.data && session.data.customDaysBotMsgId)  || null;
  const customDaysUserMsgId = (session && session.data && session.data.customDaysUserMsgId) || null;

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

  const summaryMsg = await bot.sendMessage(chatId, summary, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '📋 Open Listing Form', web_app: { url: miniAppUrl } }
      ]]
    }
  });

  // Build the full sell flow msg list: existing + custom days msgs (if any) + this summary
  const updatedSellFlowMsgIds = [
    ...sellFlowMsgIds,
    ...(customDaysBotMsgId  ? [customDaysBotMsgId]  : []),
    ...(customDaysUserMsgId ? [customDaysUserMsgId] : []),
    summaryMsg.message_id
  ];

  updateSession(chatId, {
    proSummaryMsgId:   summaryMsg.message_id,
    sellFlowMsgIds:    updatedSellFlowMsgIds,
    customDaysBotMsgId:  null,
    customDaysUserMsgId: null
  });
}

// ========== AFTER MINI APP SUBMITS ==========
async function handleMiniAppSubmission(bot, userId, formData, settings) {
  const user = await User.findOne({ telegramId: userId });
  if (!user) return;

  const plan = formData.plan || 'free';
  const days = parseInt(formData.days) || 0;
  const amount = parseInt(formData.amount) || 0;

  // Grab sell flow msg IDs stored in session BEFORE clearSession
  const session = getSession(userId);
  const sellFlowMsgIds = (session && session.data && session.data.sellFlowMsgIds) || [];

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
    approvalStatus:   'pending',
    sellFlowMsgIds:   sellFlowMsgIds
  });

  await submission.save();
  clearSession(userId);

  if (plan === 'free') {
    // Delete all sell flow messages (plan msg, free plan selected msg)
    await deleteMsgs(bot, userId, sellFlowMsgIds);

    const listingSubmittedMsg = await bot.sendMessage(userId,
      `✅ *Listing Submitted!*\n\n` +
      `We will review it and notify you here on Telegram and via email once approved.\n` +
      `Usually reviewed within 24 hours.`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: 'main_menu' }]] }
      }
    );

    // Save the final status msg ID so approval/rejection can delete it
    submission.finalStatusMsgId = listingSubmittedMsg.message_id;
    await submission.save();

  } else {
    // Pro plan — delete all sell flow msgs (plan, pro selected, pro summary)
    await deleteMsgs(bot, userId, sellFlowMsgIds);

    if (settings && settings.bankAccounts && settings.bankAccounts.length > 0) {
      const bank = settings.bankAccounts.find(b => b.active) || settings.bankAccounts[0];
      const formReceivedMsg = await bot.sendMessage(userId,
        `📋 *Form Received! Now Complete Payment:*\n\n` +
        `Bank         : ${bank.bankName}\n` +
        `Account No   : ${bank.accountNumber}\n` +
        `Account Name : ${bank.accountName}\n` +
        `Amount       : ₦${amount.toLocaleString()}\n\n` +
        `Send your payment screenshot here after paying.`,
        { parse_mode: 'Markdown' }
      );
      setSession(userId, 'awaiting_receipt');
      updateSession(userId, {
        plan: 'pro',
        promoDays: days,
        proAmount: amount,
        submissionId: submission._id.toString(),
        formReceivedMsgId: formReceivedMsg.message_id
      });

      // Store formReceivedMsgId on submission so payment handler can delete it
      submission.sellFlowMsgIds = [formReceivedMsg.message_id];
      await submission.save();
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
    `🗂 Category  : ${submission.category}\n` +
    `📁 Subcategory: ${submission.subcategory}\n` +
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

  const actionKeyboard = {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `approve_${submission._id}` },
      { text: '❌ Reject',  callback_data: `reject_${submission._id}` }
    ]]
  };

  const validMedia = (submission.media || []).filter(m => m && m.file_id);
  let adminMsgId = null;
  let mediaSent = false;

  if (validMedia.length === 1) {
    const m = validMedia[0];
    const opts = { caption: notif, parse_mode: 'Markdown', reply_markup: actionKeyboard };
    try {
      let sent;
      if (m.type === 'video') sent = await bot.sendVideo(adminId, m.file_id, opts);
      else sent = await bot.sendPhoto(adminId, m.file_id, opts);
      if (sent) adminMsgId = sent.message_id;
      mediaSent = true;
    } catch (err) {
      console.error('Admin single media send failed:', err.message);
    }
  } else if (validMedia.length > 1) {
    try {
      const mediaGroup = validMedia.slice(0, 10).map((m, i) => ({
        type: m.type === 'video' ? 'video' : 'photo',
        media: m.file_id,
        ...(i === 0 ? { caption: notif, parse_mode: 'Markdown' } : {})
      }));
      await bot.sendMediaGroup(adminId, mediaGroup);
      const actionMsg = await bot.sendMessage(adminId, `📋 Actions for *${submission.productName}*:`, {
        parse_mode: 'Markdown',
        reply_markup: actionKeyboard
      });
      if (actionMsg) adminMsgId = actionMsg.message_id;
      mediaSent = true;
    } catch (err) {
      console.error('Admin media group send failed:', err.message);
    }
  }

  if (!mediaSent) {
    const sent = await bot.sendMessage(adminId, notif, {
      parse_mode: 'Markdown',
      reply_markup: actionKeyboard
    });
    if (sent) adminMsgId = sent.message_id;
  }

  // Store admin submission msg ID on the submission record for later deletion
  if (adminMsgId) {
    submission.adminSubmissionMsgId = adminMsgId;
    await submission.save();
  }
}

// Legacy stubs
async function startProductForm(bot, chatId) {}
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
  startProductForm,
  handleProductFormStep,
  handleMediaUpload,
  showProductSummary,
  submitProductToAdmin
};
