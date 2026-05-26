const User = require('../models/User');
const { emailNewProduct } = require('../utils/email');

async function broadcastProduct(bot, product) {
  const users = await User.find({ verified: true });
  
  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    try {
      // Send Telegram notification
      if (product.media && product.media.length > 0) {
        const m = product.media[0];
        const caption =
          `🆕 *New Product Available!*\n\n` +
          `📦 ${product.name}\n` +
          `💰 ₦${product.price.toLocaleString()}\n` +
          `📍 ${product.location}\n\n` +
          `Tap below to view in bot 👇`;

        const keyboard = {
          inline_keyboard: [
            [{ text: '👀 View Item', url: `https://t.me/${process.env.BOT_USERNAME}` }]
          ]
        };

        if (m.type === 'video') {
          await bot.sendVideo(user.telegramId, m.file_id, {
            caption,
            parse_mode: 'Markdown',
            reply_markup: keyboard
          });
        } else {
          await bot.sendPhoto(user.telegramId, m.file_id, {
            caption,
            parse_mode: 'Markdown',
            reply_markup: keyboard
          });
        }
      } else {
        await bot.sendMessage(user.telegramId,
          `🆕 *New Product Available!*\n\n` +
          `📦 ${product.name}\n` +
          `💰 ₦${product.price.toLocaleString()}\n` +
          `📍 ${product.location}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '👀 View Item', url: `https://t.me/${process.env.BOT_USERNAME}` }]]
            }
          }
        );
      }

      // Send email notification
      if (user.gmail) {
        await emailNewProduct(user.gmail, user.firstName, product, process.env.BOT_USERNAME);
      }

      successCount++;
    } catch (err) {
      console.error(`Broadcast to ${user.telegramId} failed:`, err.message);
      failCount++;
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`✅ Broadcast complete: ${successCount} sent, ${failCount} failed`);
  return { successCount, failCount };
}

module.exports = { broadcastProduct };
