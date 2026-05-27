const User = require('../models/User');
const { emailNewProduct } = require('../utils/email');

async function broadcastProduct(bot, product) {
  const users = await User.find({ verified: true });

  let successCount = 0;
  let failCount = 0;

  // Build full caption (no price as per spec)
  const parts = [];
  parts.push(`🆕 *New Product Available!*\n`);
  parts.push(`📦 *${product.name}*`);
  if (product.category)   parts.push(`🗂 Category : ${product.category}${product.subcategory ? ' › ' + product.subcategory : ''}`);
  if (product.brand)      parts.push(`🏷 Brand    : ${product.brand}`);
  if (product.condition)  parts.push(`⚙️ Condition: ${product.condition}`);
  if (product.usedDuration) parts.push(`⏱ Used For : ${product.usedDuration}`);

  const loc = [product.city, product.state].filter(Boolean).join(', ') || product.location;
  if (loc) parts.push(`📍 Location : ${loc}`);

  const delivery = [];
  if (product.doorDropoff) delivery.push('Door Dropoff');
  if (product.doorPickup)  delivery.push('Door Pickup');
  if (delivery.length)    parts.push(`🚚 Delivery : ${delivery.join(' & ')}`);

  if (product.receiptAvailable && product.receiptAvailable !== 'no')
    parts.push(`🧾 Receipt  : Available`);
  if (product.warrantyRemaining === 'yes')
    parts.push(`🛡 Warranty : ${product.warrantyDuration || 'Yes'}`);
  if (product.originalPackaging && product.originalPackaging !== 'no')
    parts.push(`📦 Original Packaging: Available`);

  parts.push(`\nTap below to view full details 👇`);

  const caption = parts.join('\n');

  const viewUrl = `https://t.me/${process.env.BOT_USERNAME}?start=view_${product._id}`;
  const keyboard = {
    inline_keyboard: [[{ text: '👀 View Item', url: viewUrl }]]
  };

  for (const user of users) {
    try {
      if (product.media && product.media.length > 0) {
        const m = product.media[0];
        if (m.type === 'video') {
          await bot.sendVideo(user.telegramId, m.file_id, {
            caption, parse_mode: 'Markdown', reply_markup: keyboard
          });
        } else {
          await bot.sendPhoto(user.telegramId, m.file_id, {
            caption, parse_mode: 'Markdown', reply_markup: keyboard
          });
        }
      } else {
        await bot.sendMessage(user.telegramId, caption, {
          parse_mode: 'Markdown', reply_markup: keyboard
        });
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
