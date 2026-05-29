const Product = require('../models/Product');
const SellerSubmission = require('../models/SellerSubmission');
const Settings = require('../models/Settings');
const User = require('../models/User');
const PaymentReceipt = require('../models/PaymentReceipt');
const { adminMenu } = require('../utils/keyboard');
const { emailPaymentConfirmed } = require('../utils/email');
const { setSession, updateSession, getSession, clearSession } = require('../utils/session');
const { approveSellerSubmission, rejectSellerSubmission } = require('./approval');
const { broadcastProduct } = require('./broadcast');
const { notifyAdminNewReceipt } = require('./payment');

async function showAdminMenu(bot, chatId) {
  const user = await User.findOne({ telegramId: chatId });
  await bot.sendMessage(chatId,
    `👨‍💼 *Admin Control Panel*\n\nHello ${user?.firstName || 'Admin'}!`,
    { parse_mode: 'Markdown', reply_markup: adminMenu() }
  );
  clearSession(chatId);
}

// ========== HELPER: Full product detail text ==========
function buildFullProductDetail(sub, premiumExpiresAt) {
  const neg = sub.negotiable
    ? `Yes (Min: ₦${(sub.lowestPrice || 0).toLocaleString()})`
    : 'No';
  const plan = sub.plan === 'pro'
    ? `Pro (${sub.premiumDays || 0} day(s))`
    : 'Free';
  const expiry = premiumExpiresAt
    ? premiumExpiresAt.toDateString()
    : (sub.premiumExpiresAt ? new Date(sub.premiumExpiresAt).toDateString() : 'N/A');

  return (
    `👤 Name      : ${sub.firstName || sub.name || 'N/A'}\n` +
    `🆔 Username  : @${sub.username || 'N/A'}\n` +
    `🔢 Telegram  : ${sub.telegramId || 'N/A'}\n` +
    `📧 Gmail     : ${sub.gmail || 'N/A'}\n` +
    `📱 WhatsApp  : ${sub.whatsappNumber || sub.whatsapp || 'N/A'}\n` +
    `📋 Plan      : ${plan}\n` +
    `💎 Expires   : ${expiry}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Title     : ${sub.productName || sub.name || 'N/A'}\n` +
    `🗂 Category  : ${sub.category || 'N/A'}\n` +
    `📁 Subcategory: ${sub.subcategory || 'N/A'}\n` +
    `🏷 Brand     : ${sub.brand || 'N/A'}\n` +
    `⚙️ Condition : ${sub.condition || 'N/A'}\n` +
    `📄 Desc      : ${sub.description || sub.details || 'N/A'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💵 Orig Price : ₦${(sub.originalPrice || 0).toLocaleString()}\n` +
    `💰 Selling   : ₦${(sub.sellingPrice || sub.price || 0).toLocaleString()}\n` +
    `🤝 Negotiable: ${neg}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ Used For  : ${sub.usedDuration || 'N/A'}\n` +
    `🔧 Defects   : ${sub.hasDefects ? (sub.defectsDetails || 'Yes') : 'None'}\n` +
    `🛠 Repairs   : ${sub.wasRepaired ? (sub.repairsDetails || 'Yes') : 'None'}\n` +
    `❓ Reason    : ${sub.reasonForSelling || 'N/A'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📍 State     : ${sub.state || 'N/A'}\n` +
    `🏙 City      : ${sub.city || 'N/A'}\n` +
    `🚚 Dropoff   : ${sub.doorDropoff ? 'Yes' : 'No'}\n` +
    `🚶 Pickup    : ${sub.doorPickup ? 'Yes' : 'No'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧾 Receipt   : ${sub.receiptAvailable || 'N/A'}\n` +
    `🛡 Warranty  : ${sub.warrantyRemaining === 'yes' ? (sub.warrantyDuration || 'Yes') : (sub.warrantyRemaining || 'N/A')}\n` +
    `📦 Packaging : ${sub.originalPackaging || 'N/A'}`
  );
}

// ========== ADD PRODUCT (full form — same as user, no payment) ==========
async function startAddProduct(bot, chatId) {
  setSession(chatId, 'admin_add_product_media');
  updateSession(chatId, {});
  await bot.sendMessage(chatId,
    '📸 *Add New Product*\n\nStep 1: Upload photos/videos of the product.\nSend all media then type *DONE* when finished.',
    { parse_mode: 'Markdown' }
  );
}

async function handleAdminAddProductStep(bot, chatId, text) {
  const session = getSession(chatId);
  if (!session) return;
  const step = session.step;
  const data = session.data || {};

  switch (step) {
    case 'admin_add_product_media':
      if (text.toLowerCase() === 'done') {
        if (!data.productMedia || data.productMedia.length === 0) {
          return bot.sendMessage(chatId, '⚠️ Please upload at least one photo or video first.');
        }
        setSession(chatId, 'admin_add_product_title');
        return bot.sendMessage(chatId, '📦 Product title/name:');
      }
      return;

    case 'admin_add_product_title':
      updateSession(chatId, { productName: text });
      setSession(chatId, 'admin_add_product_category');
      return bot.sendMessage(chatId, '🗂 Category (e.g. Electronics, Clothing, Furniture):');

    case 'admin_add_product_category':
      updateSession(chatId, { category: text });
      setSession(chatId, 'admin_add_product_subcategory');
      return bot.sendMessage(chatId, '📁 Subcategory (or type N/A):');

    case 'admin_add_product_subcategory':
      updateSession(chatId, { subcategory: text });
      setSession(chatId, 'admin_add_product_brand');
      return bot.sendMessage(chatId, '🏷 Brand (or type N/A):');

    case 'admin_add_product_brand':
      updateSession(chatId, { brand: text });
      setSession(chatId, 'admin_add_product_condition');
      return bot.sendMessage(chatId, '⚙️ Condition (New / Like New / Good / Fair / Poor):');

    case 'admin_add_product_condition':
      updateSession(chatId, { condition: text });
      setSession(chatId, 'admin_add_product_description');
      return bot.sendMessage(chatId, '📄 Description:');

    case 'admin_add_product_description':
      updateSession(chatId, { description: text });
      setSession(chatId, 'admin_add_product_orig_price');
      return bot.sendMessage(chatId, '💵 Original price (₦):');

    case 'admin_add_product_orig_price': {
      const p = parseInt(text.replace(/[^0-9]/g, ''));
      if (isNaN(p) || p < 0) return bot.sendMessage(chatId, '❌ Enter a valid price (numbers only).');
      updateSession(chatId, { originalPrice: p });
      setSession(chatId, 'admin_add_product_sell_price');
      return bot.sendMessage(chatId, '💰 Selling price (₦):');
    }

    case 'admin_add_product_sell_price': {
      const p = parseInt(text.replace(/[^0-9]/g, ''));
      if (isNaN(p) || p <= 0) return bot.sendMessage(chatId, '❌ Enter a valid selling price.');
      updateSession(chatId, { sellingPrice: p });
      setSession(chatId, 'admin_add_product_negotiable');
      await bot.sendMessage(chatId, '🤝 Is the price negotiable?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Yes', callback_data: 'admin_neg_yes' }, { text: 'No', callback_data: 'admin_neg_no' }]
          ]
        }
      });
      return;
    }

    case 'admin_add_product_lowest_price': {
      const p = parseInt(text.replace(/[^0-9]/g, ''));
      updateSession(chatId, { lowestPrice: isNaN(p) ? 0 : p });
      setSession(chatId, 'admin_add_product_used_for');
      return bot.sendMessage(chatId, '⏱ How long has it been used? (e.g. 6 months, 2 years, or N/A):');
    }

    case 'admin_add_product_used_for':
      updateSession(chatId, { usedDuration: text });
      setSession(chatId, 'admin_add_product_defects');
      await bot.sendMessage(chatId, '🔧 Any defects?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Yes', callback_data: 'admin_defects_yes' }, { text: 'No', callback_data: 'admin_defects_no' }]
          ]
        }
      });
      return;

    case 'admin_add_product_defects_details':
      updateSession(chatId, { defectsDetails: text, hasDefects: true });
      setSession(chatId, 'admin_add_product_repairs');
      await bot.sendMessage(chatId, '🛠 Any repairs done?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Yes', callback_data: 'admin_repairs_yes' }, { text: 'No', callback_data: 'admin_repairs_no' }]
          ]
        }
      });
      return;

    case 'admin_add_product_repairs_details':
      updateSession(chatId, { repairsDetails: text, wasRepaired: true });
      setSession(chatId, 'admin_add_product_reason');
      return bot.sendMessage(chatId, '❓ Reason for selling (or N/A):');

    case 'admin_add_product_reason':
      updateSession(chatId, { reasonForSelling: text });
      setSession(chatId, 'admin_add_product_state');
      return bot.sendMessage(chatId, '📍 State (e.g. Ekiti, Lagos):');

    case 'admin_add_product_state':
      updateSession(chatId, { state: text });
      setSession(chatId, 'admin_add_product_city');
      return bot.sendMessage(chatId, '🏙 City:');

    case 'admin_add_product_city':
      updateSession(chatId, { city: text });
      setSession(chatId, 'admin_add_product_delivery');
      await bot.sendMessage(chatId, '🚚 Delivery options?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Door Dropoff', callback_data: 'admin_del_dropoff' }],
            [{ text: 'Pickup Only', callback_data: 'admin_del_pickup' }],
            [{ text: 'Both', callback_data: 'admin_del_both' }],
            [{ text: 'None', callback_data: 'admin_del_none' }]
          ]
        }
      });
      return;

    case 'admin_add_product_whatsapp_custom':
      updateSession(chatId, { productWhatsapp: text });
      await showAdminProductSummary(bot, chatId);
      return;

    case 'admin_add_product_plan_days': {
      const days = parseInt(text.replace(/[^0-9]/g, ''));
      if (isNaN(days) || days < 1) return bot.sendMessage(chatId, '❌ Enter a valid number of days (e.g. 7, 14, 30).');
      updateSession(chatId, { premiumDays: days });
      setSession(chatId, 'admin_add_product_whatsapp');
      await bot.sendMessage(chatId, '📱 Use default WhatsApp or enter a custom one?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Use Default', callback_data: 'admin_wa_default' }],
            [{ text: 'Type Custom', callback_data: 'admin_wa_custom' }]
          ]
        }
      });
      return;
    }
  }
}

async function handleAdminMediaUpload(bot, chatId, file_id, mediaType) {
  const session = getSession(chatId);
  if (!session || !session.step || !session.step.includes('media')) {
    return bot.sendMessage(chatId, '❌ Not in the right step.');
  }
  if (!session.data.productMedia) session.data.productMedia = [];
  session.data.productMedia.push({ file_id, type: mediaType });
  updateSession(chatId, { productMedia: session.data.productMedia });
  await bot.sendMessage(chatId, `✅ Media added (${session.data.productMedia.length} file(s)). Send more or type DONE.`);
}

async function showAdminProductSummary(bot, chatId) {
  const session = getSession(chatId);
  const d = session.data;

  const neg = d.negotiable ? `Yes (Min: ₦${(d.lowestPrice || 0).toLocaleString()})` : 'No';
  const expiryStr = d.isPremium && d.premiumDays
    ? new Date(Date.now() + d.premiumDays * 24 * 60 * 60 * 1000).toDateString()
    : 'N/A (Free)';

  const summary =
    `📋 *Product Summary*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Title     : ${d.productName || 'N/A'}\n` +
    `🗂 Category  : ${d.category || 'N/A'}\n` +
    `📁 Subcategory: ${d.subcategory || 'N/A'}\n` +
    `🏷 Brand     : ${d.brand || 'N/A'}\n` +
    `⚙️ Condition : ${d.condition || 'N/A'}\n` +
    `📄 Desc      : ${d.description || 'N/A'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💵 Orig Price : ₦${(d.originalPrice || 0).toLocaleString()}\n` +
    `💰 Selling   : ₦${(d.sellingPrice || 0).toLocaleString()}\n` +
    `🤝 Negotiable: ${neg}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ Used For  : ${d.usedDuration || 'N/A'}\n` +
    `🔧 Defects   : ${d.hasDefects ? (d.defectsDetails || 'Yes') : 'None'}\n` +
    `🛠 Repairs   : ${d.wasRepaired ? (d.repairsDetails || 'Yes') : 'None'}\n` +
    `❓ Reason    : ${d.reasonForSelling || 'N/A'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📍 State     : ${d.state || 'N/A'}\n` +
    `🏙 City      : ${d.city || 'N/A'}\n` +
    `🚚 Dropoff   : ${d.doorDropoff ? 'Yes' : 'No'}\n` +
    `🚶 Pickup    : ${d.doorPickup ? 'Yes' : 'No'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📸 Media     : ${(d.productMedia || []).length} file(s)\n` +
    `📱 WhatsApp  : ${d.productWhatsapp || 'Default'}\n` +
    `💎 Plan      : ${d.isPremium ? `Pro (${d.premiumDays || 0} day(s))` : 'Free (Admin post)'}`;

  await bot.sendMessage(chatId, summary, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Confirm & Post', callback_data: 'admin_confirm_post' }],
        [{ text: '❌ Cancel', callback_data: 'admin_menu' }]
      ]
    }
  });
  setSession(chatId, 'admin_awaiting_confirm_post');
}

async function confirmAdminProductPost(bot, chatId) {
  const session = getSession(chatId);
  const d = session.data;

  const product = new Product({
    name: d.productName,
    media: d.productMedia || [],
    details: d.description || '',
    description: d.description || '',
    location: `${d.city ? d.city + ', ' : ''}${d.state || ''}`,
    whatsappNumber: d.productWhatsapp || process.env.ADMIN_WHATSAPP || '',
    price: d.sellingPrice || 0,
    category: d.category || '',
    subcategory: d.subcategory || '',
    brand: d.brand || '',
    condition: d.condition || '',
    originalPrice: d.originalPrice || 0,
    sellingPrice: d.sellingPrice || 0,
    negotiable: d.negotiable || false,
    lowestPrice: d.lowestPrice || 0,
    usedDuration: d.usedDuration || '',
    hasDefects: d.hasDefects || false,
    defectsDetails: d.defectsDetails || '',
    wasRepaired: d.wasRepaired || false,
    repairsDetails: d.repairsDetails || '',
    reasonForSelling: d.reasonForSelling || '',
    state: d.state || '',
    city: d.city || '',
    doorDropoff: d.doorDropoff || false,
    doorPickup: d.doorPickup || false,
    receiptAvailable: d.receiptAvailable || '',
    warrantyRemaining: d.warrantyRemaining || '',
    warrantyDuration: d.warrantyDuration || '',
    originalPackaging: d.originalPackaging || '',
    postedBy: 'admin',
    isPremium: d.isPremium || false,
    premiumExpiresAt: d.isPremium && d.premiumDays
      ? new Date(Date.now() + d.premiumDays * 24 * 60 * 60 * 1000)
      : null
  });

  await product.save();
  clearSession(chatId);

  const planLabel = d.isPremium ? `Pro (${d.premiumDays} day(s))` : 'Free';

  await bot.sendMessage(chatId,
    `✅ *Product Posted!*

` +
    `📦 ${d.productName}
` +
    `💎 Plan: ${planLabel}
` +
    `📢 Broadcasting to all users now...`,
    { parse_mode: 'Markdown' }
  );

  broadcastProduct(bot, product)
    .then(result => {
      bot.sendMessage(chatId,
        `📢 *Broadcast Complete*
✅ Sent: ${result.successCount}
❌ Failed: ${result.failCount}`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    })
    .catch(err => {
      console.error('Broadcast error (admin post):', err.message);
      bot.sendMessage(chatId, `⚠️ Broadcast encountered an error: ${err.message}`).catch(() => {});
    });

  await showAdminMenu(bot, chatId);
}

// ========== PENDING SUBMISSIONS ==========
async function showPendingSubmissions(bot, chatId) {
  const submissions = await SellerSubmission.find({ approvalStatus: 'pending' }).sort({ submittedAt: -1 });

  if (submissions.length === 0) {
    return bot.sendMessage(chatId, '✅ No pending submissions.');
  }

  await bot.sendMessage(chatId, `📋 *${submissions.length}* Pending Submission(s)`, { parse_mode: 'Markdown' });

  for (const sub of submissions) {
    const expiry = sub.plan === 'pro' && sub.premiumDays
      ? new Date(Date.now() + sub.premiumDays * 24 * 60 * 60 * 1000)
      : null;
    const detail = buildFullProductDetail(sub, expiry);
    const validMedia = (sub.media || []).filter(m => m && m.file_id);
    const keyboard = {
      inline_keyboard: [[
        { text: '✅ Approve', callback_data: `approve_${sub._id}` },
        { text: '❌ Reject', callback_data: `reject_${sub._id}` }
      ]]
    };

    if (validMedia.length === 1) {
      const m = validMedia[0];
      try {
        if (m.type === 'video') await bot.sendVideo(chatId, m.file_id);
        else await bot.sendPhoto(chatId, m.file_id);
      } catch (_) {}
    } else if (validMedia.length > 1) {
      try {
        const mediaGroup = validMedia.slice(0, 10).map((m) => ({
          type: m.type === 'video' ? 'video' : 'photo',
          media: m.file_id
        }));
        await bot.sendMediaGroup(chatId, mediaGroup);
      } catch (_) {}
    }
    // Always send full details as separate message — no caption limit issue
    await bot.sendMessage(chatId, detail, { reply_markup: keyboard });
  }
}

async function approveSubmission(bot, chatId, submissionId, adminMsgId) {
  await approveSellerSubmission(bot, submissionId, chatId, adminMsgId);
  await showAdminMenu(bot, chatId);
}

async function rejectSubmission(bot, chatId, submissionId, adminMsgId) {
  const submission = await SellerSubmission.findById(submissionId);
  if (!submission) return bot.sendMessage(chatId, '❌ Submission not found.');
  if (submission.approvalStatus !== 'pending') {
    return bot.sendMessage(chatId, `⚠️ This submission was already ${submission.approvalStatus}.`);
  }
  setSession(chatId, 'admin_reject_reason');
  updateSession(chatId, { rejectSubmissionId: submissionId, rejectAdminMsgId: adminMsgId });
  await bot.sendMessage(chatId, `Enter rejection reason for "${submission.productName}":`);
}

async function handleRejectReason(bot, chatId, reason) {
  const session = getSession(chatId);
  const submissionId = session.data.rejectSubmissionId;
  const adminMsgId   = session.data.rejectAdminMsgId || null;
  await rejectSellerSubmission(bot, submissionId, chatId, reason, adminMsgId);
  clearSession(chatId);
  await showAdminMenu(bot, chatId);
}

// ========== PENDING PAYMENTS ==========
async function showPendingPayments(bot, chatId) {
  const receipts = await PaymentReceipt.find({ status: 'pending' }).sort({ submittedAt: -1 });

  if (receipts.length === 0) {
    return bot.sendMessage(chatId, '✅ No pending payment receipts.');
  }

  await bot.sendMessage(chatId, `💰 *${receipts.length}* Pending Receipt(s)`, { parse_mode: 'Markdown' });

  for (const receipt of receipts) {
    // Try to get full user details
    const user = await User.findOne({ telegramId: receipt.telegramId });
    const daysRemaining = receipt.days; // days they paid for (not yet started, pending approval)

    const caption =
      `💰 *PENDING PAYMENT RECEIPT*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 Name      : ${receipt.firstName}\n` +
      `🆔 Username  : @${receipt.username || 'N/A'}\n` +
      `🔢 Telegram  : ${receipt.telegramId}\n` +
      `📧 Gmail     : ${user?.gmail || 'N/A'}\n` +
      `📱 WhatsApp  : ${user?.whatsapp || 'N/A'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💵 Amount    : ₦${receipt.amountExpected.toLocaleString()}\n` +
      `📅 Plan Days : ${receipt.days} day(s) Pro\n` +
      `⏳ Days Remaining: ${daysRemaining} day(s) (starts on approval)\n` +
      `🕐 Submitted : ${receipt.submittedAt.toLocaleString('en-NG')}`;

    await bot.sendPhoto(chatId, receipt.receiptFileId, {
      caption,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Approve', callback_data: `receipt_approve_${receipt._id}` },
          { text: '❌ Reject',  callback_data: `receipt_reject_${receipt._id}` }
        ]]
      }
    });
  }
}

// ========== APPROVE RECEIPT ==========
async function approveReceipt(bot, adminChatId, receiptId, adminReceiptMsgId) {
  const receipt = await PaymentReceipt.findById(receiptId);
  if (!receipt) return bot.sendMessage(adminChatId, '❌ Receipt not found.');
  if (receipt.status !== 'pending') {
    return bot.sendMessage(adminChatId, `⚠️ This receipt was already ${receipt.status}.`);
  }

  const { telegramId, firstName, username, amountExpected, days, receiptReceivedMsgId } = receipt;
  const adminMsgToDelete = adminReceiptMsgId || receipt.adminReceiptMsgId;

  await PaymentReceipt.findByIdAndDelete(receiptId);

  if (adminMsgToDelete) {
    setTimeout(() => { bot.deleteMessage(adminChatId, adminMsgToDelete).catch(() => {}); }, 2000);
  }
  if (receiptReceivedMsgId) {
    try { await bot.deleteMessage(telegramId, receiptReceivedMsgId); } catch (_) {}
  }

  const user = await require('../models/User').findOne({ telegramId });
  if (!user) return;

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  emailPaymentConfirmed(user.gmail, user.firstName, amountExpected, days, expiresAt)
    .catch(e => console.error('Email error on receipt approval:', e.message));

  // Show approval confirmation to admin
  const approveConfirmMsg = await bot.sendMessage(adminChatId,
    `✅ *Receipt Approved*\n\n` +
    `👤 ${firstName} (@${username || 'N/A'})\n` +
    `💰 ₦${amountExpected.toLocaleString()} | ${days} day(s) Pro`,
    { parse_mode: 'Markdown' }
  );
  setTimeout(() => { bot.deleteMessage(adminChatId, approveConfirmMsg.message_id).catch(() => {}); }, 3000);

  // Notify user — clean message, no buttons
  await bot.sendMessage(telegramId,
    `✅ *Payment Approved!*\n\n` +
    `₦${amountExpected.toLocaleString()} confirmed for *${days} day(s)* Pro.`,
    { parse_mode: 'Markdown' }
  );

}

// ========== REJECT RECEIPT ==========
async function startRejectReceipt(bot, adminChatId, receiptId, adminReceiptMsgId) {
  const receipt = await PaymentReceipt.findById(receiptId);
  if (!receipt) return bot.sendMessage(adminChatId, '❌ Receipt not found.');
  if (receipt.status !== 'pending') {
    return bot.sendMessage(adminChatId, `⚠️ This receipt was already ${receipt.status}.`);
  }
  setSession(adminChatId, 'admin_receipt_reject_reason');
  updateSession(adminChatId, {
    rejectReceiptId: receiptId.toString(),
    rejectReceiptAdminMsgId: adminReceiptMsgId || receipt.adminReceiptMsgId || null
  });
  await bot.sendMessage(adminChatId,
    `Type rejection reason for @${receipt.username || receipt.firstName}'s receipt:\n(Will be sent to them)`
  );
}

async function handleReceiptRejectReason(bot, adminChatId, reason) {
  const session = getSession(adminChatId);
  const receiptId = session.data.rejectReceiptId;
  const receipt = await PaymentReceipt.findById(receiptId);
  if (!receipt) {
    clearSession(adminChatId);
    return bot.sendMessage(adminChatId, '❌ Receipt not found.');
  }

  const { telegramId, amountExpected, receiptReceivedMsgId } = receipt;
  const adminMsgToDelete = session.data.rejectReceiptAdminMsgId || receipt.adminReceiptMsgId || null;

  if (receiptReceivedMsgId) {
    try { await bot.deleteMessage(telegramId, receiptReceivedMsgId); } catch (_) {}
  }

  receipt.status = 'rejected';
  receipt.rejectionReason = reason;
  receipt.reviewedAt = new Date();
  await receipt.save();

  if (adminMsgToDelete) {
    setTimeout(() => { bot.deleteMessage(adminChatId, adminMsgToDelete).catch(() => {}); }, 2000);
  }

  clearSession(adminChatId);
  const rejectConfirmMsg = await bot.sendMessage(adminChatId, `❌ Receipt Rejected. Reason sent to user.`);
  setTimeout(() => { bot.deleteMessage(adminChatId, rejectConfirmMsg.message_id).catch(() => {}); }, 3000);

  await bot.sendMessage(telegramId,
    `❌ *Payment Receipt Rejected*\n\n` +
    `Your receipt of ₦${amountExpected.toLocaleString()} was not approved.\n\n` +
    `📝 *Reason:* ${reason}\n\n` +
    `If you believe this is a mistake, please contact the admin.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '📞 Contact Admin', url: `https://wa.me/${process.env.ADMIN_WHATSAPP || '2348137890167'}` }]]
      }
    }
  );
}

async function reReviewReceipt(bot, adminChatId, receiptId) {
  const receipt = await PaymentReceipt.findById(receiptId);
  if (!receipt) return bot.sendMessage(adminChatId, '❌ Receipt not found.');
  receipt.status = 'pending';
  receipt.rejectionReason = '';
  receipt.reviewedAt = undefined;
  await receipt.save();
  await bot.sendMessage(adminChatId, `🔄 Receipt reset to pending. Re-sending for review...`);
  await notifyAdminNewReceipt(bot, receipt);
}

// ========== ACTIVE PRODUCTS — full details + Message Seller ==========
async function showActiveProducts(bot, chatId) {
  const products = await Product.find({ isSold: false }).sort({ isPremium: -1, createdAt: -1 });

  if (products.length === 0) {
    return bot.sendMessage(chatId, '📭 No active products.');
  }

  await bot.sendMessage(chatId, `📦 *${products.length}* Active Product(s)`, { parse_mode: 'Markdown' });

  for (const p of products) {
    // Try to find seller info if postedBy is seller
    let sellerInfo = null;
    if (p.postedBy === 'seller') {
      sellerInfo = await require('../models/SellerSubmission')
        .findOne({ productName: p.name, approvalStatus: 'approved' })
        .sort({ submittedAt: -1 });
    }

    const expiryStr = p.isPremium && p.premiumExpiresAt
      ? p.premiumExpiresAt.toDateString()
      : 'N/A (Free)';
    const plan = p.isPremium ? `Pro` : 'Free';

    // Build full detail message
    const detail =
      `👤 Name      : ${sellerInfo?.firstName || p.postedBy || 'Admin'}\n` +
      `🆔 Username  : @${sellerInfo?.username || 'N/A'}\n` +
      `🔢 Telegram  : ${sellerInfo?.telegramId || 'N/A'}\n` +
      `📧 Gmail     : ${sellerInfo?.gmail || 'N/A'}\n` +
      `📱 WhatsApp  : ${sellerInfo?.whatsappNumber || p.whatsappNumber || 'N/A'}\n` +
      `📋 Plan      : ${plan}\n` +
      `💎 Expires   : ${expiryStr}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 Title     : ${p.name}\n` +
      `🗂 Category  : ${p.category || 'N/A'}\n` +
      `📁 Subcategory: ${p.subcategory || 'N/A'}\n` +
      `🏷 Brand     : ${p.brand || 'N/A'}\n` +
      `⚙️ Condition : ${p.condition || 'N/A'}\n` +
      `📄 Desc      : ${p.description || p.details || 'N/A'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💵 Orig Price : ₦${(p.originalPrice || 0).toLocaleString()}\n` +
      `💰 Selling   : ₦${(p.sellingPrice || p.price || 0).toLocaleString()}\n` +
      `🤝 Negotiable: ${p.negotiable ? `Yes (Min: ₦${(p.lowestPrice || 0).toLocaleString()})` : 'No'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏱ Used For  : ${p.usedDuration || 'N/A'}\n` +
      `🔧 Defects   : ${p.hasDefects ? (p.defectsDetails || 'Yes') : 'None'}\n` +
      `🛠 Repairs   : ${p.wasRepaired ? (p.repairsDetails || 'Yes') : 'None'}\n` +
      `❓ Reason    : ${p.reasonForSelling || 'N/A'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 State     : ${p.state || 'N/A'}\n` +
      `🏙 City      : ${p.city || 'N/A'}\n` +
      `🚚 Dropoff   : ${p.doorDropoff ? 'Yes' : 'No'}\n` +
      `🚶 Pickup    : ${p.doorPickup ? 'Yes' : 'No'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🧾 Receipt   : ${p.receiptAvailable || 'N/A'}\n` +
      `🛡 Warranty  : ${p.warrantyRemaining === 'yes' ? (p.warrantyDuration || 'Yes') : (p.warrantyRemaining || 'N/A')}\n` +
      `📦 Packaging : ${p.originalPackaging || 'N/A'}`;

    const waNumber = sellerInfo?.whatsappNumber || p.whatsappNumber || process.env.ADMIN_WHATSAPP || '';
    // Build message seller WhatsApp link with full product details
    const sellerMsg = encodeURIComponent(
      `Hi! I'm the admin of CampusMarketplace.\n\n` +
      `A buyer is interested in your product:\n\n` +
      `📦 ${p.name}\n` +
      `💰 ₦${(p.sellingPrice || p.price || 0).toLocaleString()}\n` +
      `📍 ${p.city || ''}, ${p.state || ''}\n\n` +
      `Please respond to their inquiry soon.`
    );
    const msgSellerUrl = `https://wa.me/${waNumber.replace(/[^0-9]/g, '')}?text=${sellerMsg}`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔴 Mark as Sold', callback_data: `mark_sold_${p._id}` }],
        [{ text: '💬 Message Seller', url: msgSellerUrl }]
      ]
    };

    const validMedia = (p.media || []).filter(m => m && m.file_id);

    if (validMedia.length === 1) {
      const m = validMedia[0];
      try {
        if (m.type === 'video') await bot.sendVideo(chatId, m.file_id);
        else await bot.sendPhoto(chatId, m.file_id);
      } catch (_) {}
    } else if (validMedia.length > 1) {
      try {
        const mediaGroup = validMedia.slice(0, 10).map((m) => ({
          type: m.type === 'video' ? 'video' : 'photo',
          media: m.file_id
        }));
        await bot.sendMediaGroup(chatId, mediaGroup);
      } catch (_) {}
    }
    // Always send full details as a separate message — bypasses 1024-char caption limit
    await bot.sendMessage(chatId, detail, { reply_markup: keyboard });
  }
}

async function markAsSold(bot, chatId, productId) {
  const product = await Product.findById(productId);
  if (!product) return bot.sendMessage(chatId, '❌ Product not found.');
  await bot.sendMessage(chatId,
    `⚠️ *Are you sure?* This will permanently delete "${product.name}" from the database.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Yes, Delete It', callback_data: `confirm_sold_${productId}` },
          { text: '❌ Cancel', callback_data: 'cancel_sold' }
        ]]
      }
    }
  );
}

async function confirmSoldProduct(bot, chatId, productId) {
  const product = await Product.findById(productId);
  if (!product) return bot.sendMessage(chatId, '❌ Product not found.');
  product.isSold = true;
  product.soldAt = new Date();
  await product.save();
  await bot.sendMessage(chatId, `🔴 "${product.name}" marked as sold. Will be permanently deleted in 7 days.`);
  await showAdminMenu(bot, chatId);
}

// ========== PAID ADS / PRO USERS LIST ==========
async function showPaidAds(bot, chatId) {
  // Find all active pro products
  const now = new Date();
  const proProducts = await Product.find({
    isPremium: true,
    isSold: false,
    premiumExpiresAt: { $gt: now }
  }).sort({ premiumExpiresAt: 1 });

  if (proProducts.length === 0) {
    return bot.sendMessage(chatId, '📭 No active paid ads at the moment.');
  }

  await bot.sendMessage(chatId, `💎 *${proProducts.length}* Active Paid Ad(s)`, { parse_mode: 'Markdown' });

  for (const p of proProducts) {
    const sellerInfo = await require('../models/SellerSubmission')
      .findOne({ productName: p.name, approvalStatus: 'approved' })
      .sort({ submittedAt: -1 });

    const msLeft = p.premiumExpiresAt - now;
    const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
    const hoursLeft = Math.max(0, Math.ceil((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));

    const remainingStr = daysLeft > 0
      ? `${daysLeft} day(s) ${hoursLeft} hr(s)`
      : `${hoursLeft} hour(s)`;

    const msg =
      `💎 *${p.name}*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 Name      : ${sellerInfo?.firstName || 'N/A'}\n` +
      `🆔 Username  : @${sellerInfo?.username || 'N/A'}\n` +
      `🔢 Telegram  : ${sellerInfo?.telegramId || 'N/A'}\n` +
      `📧 Gmail     : ${sellerInfo?.gmail || 'N/A'}\n` +
      `📱 WhatsApp  : ${sellerInfo?.whatsappNumber || p.whatsappNumber || 'N/A'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 Product   : ${p.name}\n` +
      `💰 Price     : ₦${(p.sellingPrice || p.price || 0).toLocaleString()}\n` +
      `📍 Location  : ${p.city || 'N/A'}, ${p.state || 'N/A'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📅 Ad Started  : ${p.createdAt ? new Date(p.createdAt).toDateString() : 'N/A'}\n` +
      `💎 Expires     : ${p.premiumExpiresAt.toDateString()}\n` +
      `⏳ Days Left   : ${remainingStr}`;

    await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }
}

// ========== SETTINGS ==========
async function showSettings(bot, chatId) {
  const settings = await Settings.findOne() || new Settings();
  const accounts = (settings.bankAccounts || []);
  let bankLines = '';
  accounts.forEach((acc, i) => {
    const status = acc.active ? '🟢 ON' : '🔴 OFF';
    bankLines += `\nAccount ${i + 1} [${status}]: ${acc.bankName || '—'} | ${acc.accountNumber || '—'} | ${acc.accountName || '—'}`;
  });

  const msg =
    `⚙️ *Admin Settings*\n\n` +
    `📱 Default WhatsApp: ${settings.defaultWhatsapp}\n` +
    `💰 Pro Price Per Day: ₦${settings.proPricePerDay.toLocaleString()}\n\n` +
    `🏦 *Bank Accounts:*${bankLines}`;

  await bot.sendMessage(chatId, msg, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 Edit WhatsApp', callback_data: 'settings_whatsapp' }],
        [{ text: '💰 Edit Pro Price', callback_data: 'settings_pro_price' }],
        [{ text: '🏦 Edit Bank Account 1', callback_data: 'settings_bank_0' }],
        [{ text: '🏦 Edit Bank Account 2', callback_data: 'settings_bank_1' }],
        [{ text: '🏦 Edit Bank Account 3', callback_data: 'settings_bank_2' }],
        [{ text: '🔁 Toggle Account 1', callback_data: 'settings_toggle_0' },
         { text: '🔁 Toggle Account 2', callback_data: 'settings_toggle_1' },
         { text: '🔁 Toggle Account 3', callback_data: 'settings_toggle_2' }],
        [{ text: '🏠 Back', callback_data: 'admin_menu' }]
      ]
    }
  });
}

async function editSettingStep(bot, chatId, setting) {
  if (setting === 'whatsapp') {
    setSession(chatId, 'settings_edit_whatsapp');
    return bot.sendMessage(chatId, 'Enter new default WhatsApp number (with country code, no +):');
  }
  if (setting === 'pro_price') {
    setSession(chatId, 'settings_edit_pro_price');
    return bot.sendMessage(chatId, 'Enter new Pro price per day (₦):');
  }
  if (setting.startsWith('bank_')) {
    const idx = parseInt(setting.split('_')[1]);
    setSession(chatId, `settings_edit_bank_${idx}_name`);
    updateSession(chatId, { bankIdx: idx });
    return bot.sendMessage(chatId, `Enter bank name for Account ${idx + 1}:`);
  }
  if (setting.startsWith('toggle_')) {
    const idx = parseInt(setting.split('_')[1]);
    const settings = await Settings.findOne() || new Settings();
    if (!settings.bankAccounts[idx]) return bot.sendMessage(chatId, '❌ Account not found.');
    settings.bankAccounts[idx].active = !settings.bankAccounts[idx].active;
    settings.updatedAt = new Date();
    await settings.save();
    const state = settings.bankAccounts[idx].active ? '🟢 ON' : '🔴 OFF';
    await bot.sendMessage(chatId, `✅ Account ${idx + 1} is now ${state}.`);
    return showSettings(bot, chatId);
  }
}

async function saveSettingValue(bot, chatId, value) {
  const session = getSession(chatId);
  const step = session?.step;
  let settings = await Settings.findOne() || new Settings();

  if (step === 'settings_edit_whatsapp') {
    settings.defaultWhatsapp = value;
    settings.updatedAt = new Date();
    await settings.save();
    clearSession(chatId);
    await bot.sendMessage(chatId, '✅ WhatsApp updated!');
    return showSettings(bot, chatId);
  }
  if (step === 'settings_edit_pro_price') {
    const price = parseInt(value);
    if (isNaN(price) || price <= 0) return bot.sendMessage(chatId, '❌ Invalid price.');
    settings.proPricePerDay = price;
    settings.updatedAt = new Date();
    await settings.save();
    clearSession(chatId);
    await bot.sendMessage(chatId, '✅ Pro price updated!');
    return showSettings(bot, chatId);
  }
  if (step && step.startsWith('settings_edit_bank_')) {
    const parts = step.split('_');
    const idx = parseInt(parts[3]);
    const field = parts[4];
    if (field === 'name') {
      updateSession(chatId, { bankName: value });
      setSession(chatId, `settings_edit_bank_${idx}_number`);
      updateSession(chatId, { bankIdx: idx, bankName: value });
      return bot.sendMessage(chatId, `Enter account number for Account ${idx + 1}:`);
    }
    if (field === 'number') {
      const bankName = session.data.bankName;
      updateSession(chatId, { bankNumber: value });
      setSession(chatId, `settings_edit_bank_${idx}_accountname`);
      updateSession(chatId, { bankIdx: idx, bankName, bankNumber: value });
      return bot.sendMessage(chatId, `Enter account name for Account ${idx + 1}:`);
    }
    if (field === 'accountname') {
      const { bankName, bankNumber } = session.data;
      settings.bankAccounts[idx] = {
        bankName, accountNumber: bankNumber, accountName: value,
        active: settings.bankAccounts[idx]?.active ?? true
      };
      settings.updatedAt = new Date();
      await settings.save();
      clearSession(chatId);
      await bot.sendMessage(chatId, `✅ Account ${idx + 1} updated!`);
      return showSettings(bot, chatId);
    }
  }
}

module.exports = {
  showAdminMenu,
  startAddProduct,
  handleAdminAddProductStep,
  handleAdminMediaUpload,
  showAdminProductSummary,
  confirmAdminProductPost,
  showPendingSubmissions,
  approveSubmission,
  rejectSubmission,
  handleRejectReason,
  showPendingPayments,
  approveReceipt,
  startRejectReceipt,
  handleReceiptRejectReason,
  reReviewReceipt,
  showActiveProducts,
  markAsSold,
  confirmSoldProduct,
  showSettings,
  editSettingStep,
  saveSettingValue,
  showPaidAds
};
