const Product = require('../models/Product');
const Settings = require('../models/Settings');
const User = require('../models/User');
const { buyerInterestedLink } = require('../utils/whatsapp');
const { productPagination } = require('../utils/keyboard');
const { emailBuyerInterest } = require('../utils/email');
const { setSession, clearSession } = require('../utils/session');

const PAGE_SIZE = 5;

async function getSettings() {
  let s = await Settings.findOne();
  if (!s) { s = new Settings(); await s.save(); }
  return s;
}

async function sendProductCard(bot, chatId, product, user, settings) {
  // Always use admin default WhatsApp, not the product's stored number
  const waNum = settings.defaultWhatsapp;
  const waLink      = buyerInterestedLink(waNum, product, user, false);
  const waLinkReady = buyerInterestedLink(waNum, product, user, true);

  const badge = product.isPremium ? '💎 PRO  |  ' : '';

  // Build full caption
  const lines = [];
  lines.push(`${badge}📦 *${product.name}*`);
  if (product.category)   lines.push(`🗂 Category : ${product.category}${product.subcategory ? ' › ' + product.subcategory : ''}`);
  if (product.brand)      lines.push(`🏷 Brand    : ${product.brand}`);
  if (product.condition)  lines.push(`⚙️ Condition: ${product.condition}`);
  if (product.usedDuration) lines.push(`⏱ Used For : ${product.usedDuration}`);
  lines.push(`💰 Price    : *Tap a button below to enquire*`);

  const loc = [product.city, product.state].filter(Boolean).join(', ') || product.location;
  if (loc) lines.push(`📍 Location : ${loc}`);

  const delivery = [];
  if (product.doorDropoff) delivery.push('Door Dropoff (seller brings it to you)');
  if (product.doorPickup)  delivery.push('Door Pickup (you collect from seller)');
  if (delivery.length)    lines.push(`🚚 Delivery : ${delivery.join(' & ')}`);

  if (product.receiptAvailable && product.receiptAvailable !== 'no')
    lines.push(`🧾 Receipt  : Available`);
  if (product.warrantyRemaining === 'yes')
    lines.push(`🛡 Warranty : ${product.warrantyDuration || 'Yes'}`);
  if (product.originalPackaging && product.originalPackaging !== 'no')
    lines.push(`📦 Packaging: Available`);

  if (product.hasDefects)
    lines.push(`⚠️ Defects  : ${product.defectsDetails || 'Yes'}`);
  if (product.wasRepaired)
    lines.push(`🔧 Repaired : ${product.repairsDetails || 'Yes'}`);
  if (product.description)
    lines.push(`\n📝 ${product.description}`);

  const caption = lines.join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: '💬 Enquire Price — Just Looking', url: waLink }],
      [{ text: '✅ Enquire Price — Ready to Buy',  url: waLinkReady }]
    ]
  };

  // Filter out any media entries with missing file_id
  const validMedia = (product.media || []).filter(m => m && m.file_id);
  let mediaSent = false;

  if (validMedia.length === 1) {
    const m = validMedia[0];
    try {
      if (m.type === 'video') {
        await bot.sendVideo(chatId, m.file_id, { caption, parse_mode: 'Markdown', reply_markup: keyboard });
      } else {
        await bot.sendPhoto(chatId, m.file_id, { caption, parse_mode: 'Markdown', reply_markup: keyboard });
      }
      mediaSent = true;
    } catch (err) {
      console.error('sendProductCard single media failed:', err.message);
    }
  } else if (validMedia.length > 1) {
    try {
      const mediaGroup = validMedia.slice(0, 10).map((m, i) => ({
        type: m.type === 'video' ? 'video' : 'photo',
        media: m.file_id,
        ...(i === 0 ? { caption, parse_mode: 'Markdown' } : {})
      }));
      await bot.sendMediaGroup(chatId, mediaGroup);
      await bot.sendMessage(chatId, `👆 *${product.name}*\nTap a button below to enquire:`, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      mediaSent = true;
    } catch (err) {
      console.error('sendProductCard media group failed:', err.message);
    }
  }

  // Always guarantee the product card is delivered
  if (!mediaSent) {
    await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

async function showProducts(bot, chatId, user, page = 0) {
  const settings = await getSettings();
  const now = new Date();

  const products = await Product.find({ isSold: false }).sort({ isPremium: -1, createdAt: -1 });
  const sorted = [
    ...products.filter(p => p.isPremium && p.premiumExpiresAt && p.premiumExpiresAt > now),
    ...products.filter(p => !p.isPremium || !p.premiumExpiresAt || p.premiumExpiresAt <= now)
  ];

  if (sorted.length === 0) {
    return bot.sendMessage(chatId, '📭 No products listed yet. Check back soon!', {
      reply_markup: { inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: 'main_menu' }]] }
    });
  }

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  await bot.sendMessage(chatId,
    `🛍️ *Available Items* (${sorted.length} total) — Page ${page + 1}`,
    { parse_mode: 'Markdown' }
  );

  for (const product of paginated) {
    await sendProductCard(bot, chatId, product, user, settings);
  }

  await bot.sendMessage(chatId, 'Navigate or search below:', {
    reply_markup: productPagination(page, sorted.length)
  });
}

async function searchProducts(bot, chatId, user, keyword) {
  const settings = await getSettings();
  const regex = new RegExp(keyword, 'i');
  const products = await Product.find({
    isSold: false,
    $or: [{ name: regex }, { description: regex }, { details: regex }, { brand: regex }, { category: regex }]
  }).sort({ isPremium: -1, createdAt: -1 });

  if (products.length === 0) {
    return bot.sendMessage(chatId, `🔍 No results found for "*${keyword}*"`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: 'main_menu' }]] }
    });
  }

  await bot.sendMessage(chatId, `🔍 Found *${products.length}* result(s) for "*${keyword}*"`, { parse_mode: 'Markdown' });
  for (const product of products) {
    await sendProductCard(bot, chatId, product, user, settings);
  }
  clearSession(chatId);
}

// Broadcast a newly approved product to ALL users
async function broadcastProduct(bot, product) {
  const settings = await getSettings();
  const users = await User.find({});

  let successCount = 0;
  let failCount = 0;

  // Send "New Product Available!" header once per user
  for (const user of users) {
    try {
      await bot.sendMessage(user.telegramId,
        `🆕 *New Product Available!*\n\nA new item just got listed on Campus Marketplace. Check it out! 👇`,
        { parse_mode: 'Markdown' }
      );
      await sendProductCard(bot, user.telegramId, product, user, settings);
      successCount++;
    } catch (err) {
      failCount++;
    }
  }

  return { successCount, failCount };
}

module.exports = { showProducts, searchProducts, sendProductCard, broadcastProduct };
