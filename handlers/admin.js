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

// ========== ADD PRODUCT ==========
async function startAddProduct(bot, chatId) {
  setSession(chatId, 'admin_add_product_name');
  await bot.sendMessage(chatId, 'Admin: What is the product name?');
}

async function handleAdminAddProductStep(bot, chatId, text) {
  const session = getSession(chatId);
  if (!session) return;

  const step = session.step;
  const data = session.data || {};

  switch (step) {
    case 'admin_add_product_name':
      updateSession(chatId, { productName: text });
      setSession(chatId, 'admin_add_product_media');
      return bot.sendMessage(chatId, 'Upload photos/videos (send multiple, type DONE when finished):');

    case 'admin_add_product_media':
      if (text.toLowerCase() === 'done') {
        if (!data.productMedia || data.productMedia.length === 0) {
          return bot.sendMessage(chatId, '⚠️ Upload at least one media.');
        }
        setSession(chatId, 'admin_add_product_details');
        return bot.sendMessage(chatId, 'Enter details (brand, condition, etc):');
      }
      return;

    case 'admin_add_product_details':
      updateSession(chatId, { productDetails: text });
      setSession(chatId, 'admin_add_product_description');
      return bot.sendMessage(chatId, 'Enter description:');

    case 'admin_add_product_description':
      updateSession(chatId, { productDescription: text });
      setSession(chatId, 'admin_add_product_location');
      return bot.sendMessage(chatId, 'Enter location:');

    case 'admin_add_product_location':
      updateSession(chatId, { productLocation: text });
      setSession(chatId, 'admin_add_product_whatsapp');
      await bot.sendMessage(chatId, 'Use default WhatsApp?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Use Default', callback_data: 'admin_wa_default' }],
            [{ text: 'Type Custom', callback_data: 'admin_wa_custom' }]
          ]
        }
      });
      return;

    case 'admin_add_product_whatsapp_custom':
      updateSession(chatId, { productWhatsapp: text });
      setSession(chatId, 'admin_add_product_price');
      return bot.sendMessage(chatId, 'Enter price (₦):');

    case 'admin_add_product_price': {
      const price = parseInt(text);
      if (isNaN(price) || price <= 0) return bot.sendMessage(chatId, '❌ Invalid price.');
      updateSession(chatId, { productPrice: price });
      await showAdminProductSummary(bot, chatId);
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

  const summary =
    `📦 *Product Summary*\n` +
    `─────────────────\n` +
    `Product: ${d.productName}\n` +
    `📸 Media: ${d.productMedia?.length || 0} file(s)\n` +
    `📝 Details: ${d.productDetails}\n` +
    `📄 Description: ${d.productDescription}\n` +
    `📍 Location: ${d.productLocation}\n` +
    `📱 WhatsApp: ${d.productWhatsapp || '+2348137890167'}\n` +
    `💰 Price: ₦${d.productPrice?.toLocaleString() || 'N/A'}`;

  await bot.sendMessage(chatId, summary, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '✅ Confirm & Post', callback_data: 'admin_confirm_post' }]]
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
    details: d.productDetails,
    description: d.productDescription,
    location: d.productLocation,
    whatsappNumber: d.productWhatsapp || '+2348137890167',
    price: d.productPrice,
    postedBy: 'admin',
    isPremium: false
  });

  await product.save();
  clearSession(chatId);

  await bot.sendMessage(chatId, '✅ Product posted successfully! Broadcasting to all users...');

  const result = await broadcastProduct(bot, product);
  await bot.sendMessage(chatId,
    `📢 Broadcast complete!\n\n✅ Sent: ${result.successCount}\n❌ Failed: ${result.failCount}`
  );

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
    const price = sub.sellingPrice || sub.askingPrice || 0;
    const loc = [sub.city, sub.state].filter(Boolean).join(', ') || sub.location || 'N/A';
    // Plain text only — no Markdown — so user-submitted data with _ or * won't break rendering
    const msg =
      `👤 ${sub.firstName} (@${sub.username || 'N/A'})\n` +
      `📦 ${sub.productName}\n` +
      `🗂 ${sub.category || 'N/A'} › ${sub.subcategory || 'N/A'}\n` +
      `💰 ₦${price.toLocaleString()}\n` +
      `📍 ${loc}\n` +
      `📋 Plan: ${sub.plan}`;

    await bot.sendMessage(chatId, msg, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Approve', callback_data: `approve_${sub._id}` },
          { text: '❌ Reject', callback_data: `reject_${sub._id}` }
        ]]
      }
    });
  }
}

async function approveSubmission(bot, chatId, submissionId) {
  await approveSellerSubmission(bot, submissionId, chatId);
  await showAdminMenu(bot, chatId);
}

async function rejectSubmission(bot, chatId, submissionId) {
  const submission = await SellerSubmission.findById(submissionId);
  if (!submission) return bot.sendMessage(chatId, '❌ Submission not found.');

  setSession(chatId, 'admin_reject_reason');
  updateSession(chatId, { rejectSubmissionId: submissionId });

  await bot.sendMessage(chatId, `Enter rejection reason for "${submission.productName}":`);
}

async function handleRejectReason(bot, chatId, reason) {
  const session = getSession(chatId);
  const submissionId = session.data.rejectSubmissionId;

  await rejectSellerSubmission(bot, submissionId, chatId, reason);

  clearSession(chatId);
  await showAdminMenu(bot, chatId);
}

// ========== PENDING PAYMENTS (Receipt Review) ==========
async function showPendingPayments(bot, chatId) {
  const receipts = await PaymentReceipt.find({ status: 'pending' }).sort({ submittedAt: -1 });

  if (receipts.length === 0) {
    return bot.sendMessage(chatId, '✅ No pending payment receipts.');
  }

  await bot.sendMessage(chatId, `💰 *${receipts.length}* Pending Receipt(s)`, { parse_mode: 'Markdown' });

  for (const receipt of receipts) {
    const caption =
      `💰 *PENDING RECEIPT*\n` +
      `👤 ${receipt.firstName} (@${receipt.username || 'N/A'})\n` +
      `💵 ₦${receipt.amountExpected.toLocaleString()} | ${receipt.days} day(s)\n` +
      `🕐 ${receipt.submittedAt.toLocaleString('en-NG')}`;

    await bot.sendPhoto(chatId, receipt.receiptFileId, {
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
}

/**
 * Admin taps Approve on a receipt.
 * Updates DB, notifies user, opens product form for them.
 */
async function approveReceipt(bot, adminChatId, receiptId) {
  const receipt = await PaymentReceipt.findById(receiptId);
  if (!receipt) return bot.sendMessage(adminChatId, '❌ Receipt not found.');

  if (receipt.status !== 'pending') {
    return bot.sendMessage(adminChatId, `⚠️ This receipt was already ${receipt.status}.`);
  }

  // Capture all needed fields before deleting
  const { telegramId, firstName, username, amountExpected, days } = receipt;

  // Delete immediately — job done
  await PaymentReceipt.findByIdAndDelete(receiptId);

  await bot.sendMessage(adminChatId, `✅ Approved! ₦${amountExpected.toLocaleString()} for @${username || firstName}.`);

  // Notify user + open product form
  const user = await require('../models/User').findOne({ telegramId });
  if (!user) return;

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  try {
    await emailPaymentConfirmed(user.gmail, user.firstName, amountExpected, days, expiresAt);
  } catch (e) {
    console.error('Email error on receipt approval:', e.message);
  }

  await bot.sendMessage(telegramId,
    `✅ *Payment Approved!*\n\n` +
    `₦${amountExpected.toLocaleString()} confirmed for *${days} day(s)* Pro.\n\n` +
    `Let's add your product now! 🎉`,
    { parse_mode: 'Markdown' }
  );

  // Open product form (lazy require avoids circular dependency at module load)
  const { startProductForm } = require('./user');
  await startProductForm(bot, telegramId);

  // Store approved days in session so submitProductToAdmin knows it's a pro plan
  setSession(telegramId, 'sell_product_name');
  updateSession(telegramId, { plan: 'pro', promoDays: days });
}

/**
 * Admin taps Reject on a receipt.
 * Asks admin to type a reason, then informs user.
 */
async function startRejectReceipt(bot, adminChatId, receiptId) {
  const receipt = await PaymentReceipt.findById(receiptId);
  if (!receipt) return bot.sendMessage(adminChatId, '❌ Receipt not found.');

  if (receipt.status !== 'pending') {
    return bot.sendMessage(adminChatId, `⚠️ This receipt was already ${receipt.status}.`);
  }

  setSession(adminChatId, 'admin_receipt_reject_reason');
  updateSession(adminChatId, { rejectReceiptId: receiptId.toString() });

  await bot.sendMessage(adminChatId,
    `Type the rejection reason for @${receipt.username || receipt.firstName}'s receipt:\n` +
    `(This will be sent directly to them)`
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

  // Capture fields before deleting
  const { telegramId, amountExpected } = receipt;

  // Keep record for 48hrs in case of re-review, mark as rejected
  receipt.status = 'rejected';
  receipt.rejectionReason = reason;
  receipt.reviewedAt = new Date();
  await receipt.save();
  // Cron will auto-delete this after 48 hours

  clearSession(adminChatId);
  await bot.sendMessage(adminChatId, `❌ Rejected. Reason sent to user.`);

  // Notify user with reason
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

/**
 * Admin taps Re-review — re-sends the receipt photo+buttons to admin.
 */
async function reReviewReceipt(bot, adminChatId, receiptId) {
  const receipt = await PaymentReceipt.findById(receiptId);
  if (!receipt) return bot.sendMessage(adminChatId, '❌ Receipt not found.');

  // Reset to pending
  receipt.status = 'pending';
  receipt.rejectionReason = '';
  receipt.reviewedAt = undefined;
  await receipt.save();

  await bot.sendMessage(adminChatId, `🔄 Receipt reset to pending. Re-sending for review...`);
  await notifyAdminNewReceipt(bot, receipt);
}

// ========== ACTIVE PRODUCTS ==========
async function showActiveProducts(bot, chatId) {
  const products = await Product.find({ isSold: false }).sort({ isPremium: -1, createdAt: -1 });

  if (products.length === 0) {
    return bot.sendMessage(chatId, '📭 No active products.');
  }

  await bot.sendMessage(chatId, `📦 *${products.length}* Active Product(s)`, { parse_mode: 'Markdown' });

  for (const p of products) {
    const premium = p.isPremium ? `💎 Expires: ${p.premiumExpiresAt?.toDateString() || 'N/A'}` : 'Regular';
    const msg = `📦 ${p.name}\n💰 ₦${p.price.toLocaleString()}\n📍 ${p.location}\n${premium}`;

    await bot.sendMessage(chatId, msg, {
      reply_markup: {
        inline_keyboard: [[{ text: '🔴 Mark as Sold', callback_data: `mark_sold_${p._id}` }]]
      }
    });
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

  await bot.sendMessage(chatId, `🔴 "${product.name}" marked as sold. It will be permanently deleted in 7 days.`);
  await showAdminMenu(bot, chatId);
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

  // Bank account editing: setting = 'bank_0', 'bank_1', 'bank_2'
  if (setting.startsWith('bank_')) {
    const idx = parseInt(setting.split('_')[1]);
    setSession(chatId, `settings_edit_bank_${idx}_name`);
    updateSession(chatId, { bankIdx: idx });
    return bot.sendMessage(chatId, `Enter bank name for Account ${idx + 1}:`);
  }

  // Toggle bank account on/off
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

  // Bank account multi-step: name → number → account name
  if (step && step.startsWith('settings_edit_bank_')) {
    const parts = step.split('_'); // ['settings','edit','bank','0','name'] or ['number'] or ['accountname']
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
        bankName:      bankName,
        accountNumber: bankNumber,
        accountName:   value,
        active:        settings.bankAccounts[idx]?.active ?? true
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
  saveSettingValue
};
