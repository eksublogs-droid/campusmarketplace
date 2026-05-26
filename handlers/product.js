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
  const waNum = product.whatsappNumber || settings.defaultWhatsapp;
  const waLink = buyerInterestedLink(waNum, product, user, false);
  const waLinkReady = buyerInterestedLink(waNum, product, user, true);

  const badge = product.isPremium ? '💎 PRO  |  ' : '';
  const caption =
    `${badge}📦 *${product.name}*\n` +
    `💰 Price: ₦${product.price.toLocaleString()}\n` +
    `📍 Location: ${product.location}\n` +
    `📝 ${product.details}\n` +
    `📄 ${product.description}`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '👀 Interested — Not Ready to Buy', url: waLink }],
      [{ text: '✅ Interested & Ready to Buy', url: waLinkReady }]
    ]
  };

  if (product.media && product.media.length > 0) {
    const first = product.media[0];
    try {
      if (first.type === 'video') {
        await bot.sendVideo(chatId, first.file_id, { caption, parse_mode: 'Markdown', reply_markup: keyboard });
      } else {
        await bot.sendPhoto(chatId, first.file_id, { caption, parse_mode: 'Markdown', reply_markup: keyboard });
      }
      // Send remaining media without caption
      for (let i = 1; i < product.media.length; i++) {
        const m = product.media[i];
        if (m.type === 'video') await bot.sendVideo(chatId, m.file_id);
        else await bot.sendPhoto(chatId, m.file_id);
      }
    } catch (err) {
      await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
  } else {
    await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

async function showProducts(bot, chatId, user, page = 0) {
  const settings = await getSettings();
  const now = new Date();

  // Premium first (active), then regular by date
  const products = await Product.find({ isSold: false }).sort({ isPremium: -1, createdAt: -1 });
  // Filter expired premiums — they stay listed but demote
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
    $or: [{ name: regex }, { description: regex }, { details: regex }]
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

module.exports = { showProducts, searchProducts, sendProductCard };
