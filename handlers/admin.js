const Product = require('../models/Product');
const SellerSubmission = require('../models/SellerSubmission');
const Settings = require('../models/Settings');
const User = require('../models/User');
const { adminMenu } = require('../utils/keyboard');
const { emailNewProduct } = require('../utils/email');
const { setSession, updateSession, getSession, clearSession } = require('../utils/session');
const { approveSellerSubmission, rejectSellerSubmission } = require('./approval');
const { broadcastProduct } = require('./broadcast');

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

    case 'admin_add_product_price':
      const price = parseInt(text);
      if (isNaN(price) || price <= 0) return bot.sendMessage(chatId, '❌ Invalid price.');
      updateSession(chatId, { productPrice: price });
      await showAdminProductSummary(bot, chatId);
      return;
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

  // Broadcast to all users
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
    const msg =
      `👤 ${sub.firstName} (@${sub.username})\n` +
      `📦 ${sub.productName}\n` +
      `💰 ₦${sub.askingPrice.toLocaleString()}\n` +
      `📍 ${sub.location}\n` +
      `📋 Plan: ${sub.plan}`;

    await bot.sendMessage(chatId, msg, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `approve_${sub._id}` },
            { text: '❌ Reject', callback_data: `reject_${sub._id}` }
          ]
        ]
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
        inline_keyboard: [
          [
            { text: '✅ Yes, Delete It', callback_data: `confirm_sold_${productId}` },
            { text: '❌ Cancel', callback_data: 'cancel_sold' }
          ]
        ]
      }
    }
  );
}

async function confirmSoldProduct(bot, chatId, productId) {
  const product = await Product.findByIdAndDelete(productId);
  if (!product) return bot.sendMessage(chatId, '❌ Product not found.');

  await bot.sendMessage(chatId, `🔴 "${product.name}" has been deleted.`);
  await showAdminMenu(bot, chatId);
}

// ========== SETTINGS ==========
async function showSettings(bot, chatId) {
  const settings = await Settings.findOne() || new Settings();

  const msg =
    `⚙️ *Admin Settings*\n\n` +
    `📱 Default WhatsApp: ${settings.defaultWhatsapp}\n` +
    `💰 Pro Price Per Day: ₦${settings.proPricePerDay.toLocaleString()}`;

  await bot.sendMessage(chatId, msg, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 Edit WhatsApp', callback_data: 'settings_whatsapp' }],
        [{ text: '💰 Edit Pro Price', callback_data: 'settings_pro_price' }],
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
}

async function saveSettingValue(bot, chatId, value) {
  const session = getSession(chatId);
  const step = session?.step;

  let settings = await Settings.findOne() || new Settings();

  if (step === 'settings_edit_whatsapp') {
    settings.defaultWhatsapp = value;
  } else if (step === 'settings_edit_pro_price') {
    const price = parseInt(value);
    if (isNaN(price) || price <= 0) return bot.sendMessage(chatId, '❌ Invalid price.');
    settings.proPricePerDay = price;
  }

  settings.updatedAt = new Date();
  await settings.save();
  clearSession(chatId);

  await bot.sendMessage(chatId, '✅ Setting updated!');
  await showSettings(bot, chatId);
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
  showActiveProducts,
  markAsSold,
  confirmSoldProduct,
  showSettings,
  editSettingStep,
  saveSettingValue
};
