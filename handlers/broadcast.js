const User = require('../models/User');
const { emailNewProduct } = require('../utils/email');

async function broadcastProduct(bot, product) {
  const users = await User.find({ verified: true });

  let successCount = 0;
  let failCount = 0;

  // Build caption — no prices shown to buyers (admin sees prices)
  const parts = [];
  parts.push(`🆕 *New Product Available!*\n`);
  parts.push(`📦 *${product.name}*`);
  if (product.category)   parts.push(`🗂 Category : ${product.category}${product.subcategory ? ' › ' + product.subcategory : ''}`);
  if (product.brand)      parts.push(`🏷 Brand    : ${product.brand}`);
  if (product.condition)  parts.push(`⚙️ Condition: ${product.condition}`);
  if (product.usedDuration) parts.push(`⏱ Used For : ${product.usedDuration}`);

  const loc = [product.city, product.state].filter(Boolean).join(', ') || product.location;
  if (loc) parts.push(`📍 Location : ${loc}`);

  // Layman-friendly delivery descriptions
  const delivery = [];
  if (product.doorDropoff) delivery.push('Door Dropoff (seller brings to your door)');
  if (product.doorPickup)  delivery.push('Door Pickup (you collect from seller)');
  if (delivery.length)    parts.push(`🚚 Delivery : ${delivery.join(' & ')}`);

  if (product.receiptAvailable && product.receiptAvailable !== 'no')
    parts.push(`🧾 Receipt  : Available`);
  if (product.warrantyRemaining === 'yes')
    parts.push(`🛡 Warranty : ${product.warrantyDuration || 'Yes'}`);
  if (product.originalPackaging && product.originalPackaging !== 'no')
    parts.push(`📦 Original Packaging: Available`);

  parts.push(`\nTap below to view full details 👇`);

  const caption = parts.join('\n');

  // Use callback_data so clicking "View Items" auto-lists products (no /start redirect)
  const keyboard = {
    inline_keyboard: [[{ text: '👀 View Items', callback_data: 'view_items' }]]
  };

  for (const user of users) {
    try {
      if (product.media && product.media.length > 0) {
        if (product.media.length === 1) {
          const m = product.media[0];
          if (m.type === 'video') {
            await bot.sendVideo(user.telegramId, m.file_id, { caption, parse_mode: 'Markdown', reply_markup: keyboard });
          } else {
            await bot.sendPhoto(user.telegramId, m.file_id, { caption, parse_mode: 'Markdown', reply_markup: keyboard });
          }
        } else {
          // Send all media as album — first item gets caption
          const mediaGroup = product.media.slice(0, 10).map((m, i) => ({
            type: m.type === 'video' ? 'video' : 'photo',
            media: m.file_id,
            ...(i === 0 ? { caption, parse_mode: 'Markdown' } : {})
          }));
          await bot.sendMediaGroup(user.telegramId, mediaGroup);
          // Separate message for the View Items button
          await bot.sendMessage(user.telegramId, `👆 *${product.name}* — Tap below to view details:`, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          });
        }
      } else {
        await bot.sendMessage(user.telegramId, caption, { parse_mode: 'Markdown', reply_markup: keyboard });
      }

      if (user.gmail) {
        await emailNewProduct(user.gmail, user.firstName, product, process.env.BOT_USERNAME);
      }

      successCount++;
    } catch (err) {
      console.error(`Broadcast to ${user.telegramId} failed:`, err.message);
      failCount++;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`✅ Broadcast complete: ${successCount} sent, ${failCount} failed`);
  return { successCount, failCount };
}

module.exports = { broadcastProduct };
