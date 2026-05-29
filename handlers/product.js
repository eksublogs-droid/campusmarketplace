const Product = require('../models/Product');
const Settings = require('../models/Settings');
const User = require('../models/User');
const { buyerInterestedLink, enquirePriceLink } = require('../utils/whatsapp');
const { productPagination } = require('../utils/keyboard');
const { emailBuyerInterest } = require('../utils/email');
const { setSession, clearSession } = require('../utils/session');

const PAGE_SIZE = 5;

async function getSettings() {
  let s = await Settings.findOne();
  if (!s) { s = new Settings(); await s.save(); }
  return s;
}

// Helper: delete a batch of message IDs silently
async function deleteMsgs(bot, chatId, msgIds) {
  for (const id of (msgIds || [])) {
    if (id) {
      try { await bot.deleteMessage(chatId, id); } catch (_) {}
    }
  }
}

async function sendProductCard(bot, chatId, product, user, settings) {
  const waNum = settings.defaultWhatsapp;
  // Full-detail WhatsApp links
  const waLink      = buyerInterestedLink(waNum, product, user, false);
  const waLinkReady = buyerInterestedLink(waNum, product, user, true);
  const waEnquire   = enquirePriceLink(waNum, product, user, false);
  const waEnquireReady = enquirePriceLink(waNum, product, user, true);

  const badge = product.isPremium ? '💎 PRO  |  ' : '';

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
      [{ text: '👀 Interested — Not Ready to Buy', url: waLink }],
      [{ text: '✅ Interested & Ready to Buy',      url: waLinkReady }],
      [{ text: '🔍 Enquire Price',                  url: waEnquire }],
      [{ text: '💸 Ready to Buy — Enquire Price',   url: waEnquireReady }]
    ]
  };

  const sent = [];

  if (product.media && product.media.length > 0) {
    try {
      if (product.media.length === 1) {
        const m = product.media[0];
        let msg;
        if (m.type === 'video') {
          msg = await bot.sendVideo(chatId, m.file_id, { caption, parse_mode: 'Markdown', reply_markup: keyboard });
        } else {
          msg = await bot.sendPhoto(chatId, m.file_id, { caption, parse_mode: 'Markdown', reply_markup: keyboard });
        }
        if (msg) sent.push(msg.message_id);
      } else {
        const mediaGroup = product.media.slice(0, 10).map((m, i) => ({
          type: m.type === 'video' ? 'video' : 'photo',
          media: m.file_id,
          ...(i === 0 ? { caption, parse_mode: 'Markdown' } : {})
        }));
        const msgs = await bot.sendMediaGroup(chatId, mediaGroup);
        if (msgs) msgs.forEach(m => sent.push(m.message_id));
        const btnMsg = await bot.sendMessage(chatId, `👆 *${product.name}*\nTap a button below to contact the seller:`, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        if (btnMsg) sent.push(btnMsg.message_id);
      }
    } catch (err) {
      const msg = await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', reply_markup: keyboard });
      if (msg) sent.push(msg.message_id);
    }
  } else {
    const msg = await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', reply_markup: keyboard });
    if (msg) sent.push(msg.message_id);
  }

  return sent;
}

async function showProducts(bot, chatId, user, page = 0, prevMsgIds = []) {
  const settings = await getSettings();
  const now = new Date();

  const products = await Product.find({ isSold: false }).sort({ isPremium: -1, createdAt: -1 });
  const sorted = [
    ...products.filter(p => p.isPremium && p.premiumExpiresAt && p.premiumExpiresAt > now),
    ...products.filter(p => !p.isPremium || !p.premiumExpiresAt || p.premiumExpiresAt <= now)
  ];

  await deleteMsgs(bot, chatId, prevMsgIds);

  if (sorted.length === 0) {
    await bot.sendMessage(chatId, '📭 No products listed yet. Check back soon!', {
      reply_markup: { inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: 'main_menu' }]] }
    });
    return null;
  }

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const headerMsg = await bot.sendMessage(chatId,
    `🛍️ *Available Items* (${sorted.length} total) — Page ${page + 1}`,
    { parse_mode: 'Markdown' }
  );

  const cardMsgIds = [];
  for (const product of paginated) {
    const ids = await sendProductCard(bot, chatId, product, user, settings);
    cardMsgIds.push(...ids);
  }

  const paginationMsg = await bot.sendMessage(chatId, 'Navigate or search below:', {
    reply_markup: productPagination(page, sorted.length)
  });

  return {
    headerMsgId:    headerMsg.message_id,
    cardMsgIds,
    paginationMsgId: paginationMsg.message_id
  };
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

module.exports = { showProducts, searchProducts, sendProductCard, deleteMsgs };
