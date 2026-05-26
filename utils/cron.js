const Product = require('../models/Product');
const SellerSubmission = require('../models/SellerSubmission');
const { emailProExpiringSoon } = require('../utils/email');

// Run this function once daily to check for expiring Pro plans
async function checkExpiringProPlans(bot) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);

  // Find products with premium expiring tomorrow
  const expiring = await Product.find({
    isPremium: true,
    premiumExpiresAt: {
      $gte: tomorrow,
      $lt: dayAfter
    }
  });

  for (const product of expiring) {
    // Find the original submission to get seller's email
    const submission = await SellerSubmission.findOne({
      productName: product.name,
      approvalStatus: 'approved'
    }).sort({ submittedAt: -1 });

    if (submission && submission.gmail) {
      await emailProExpiringSoon(
        submission.gmail,
        submission.firstName,
        product.name,
        product.premiumExpiresAt,
        process.env.BOT_USERNAME
      );

      // Also notify via Telegram
      try {
        await bot.sendMessage(submission.telegramId,
          `⏰ *Pro Plan Expiring Soon*\n\n` +
          `Your Pro listing for *${product.name}* expires tomorrow (${product.premiumExpiresAt.toDateString()}).\n\n` +
          `After expiry, your product stays listed but drops to regular position. Renew now to keep your top spot!`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        console.error(`Pro expiry notification to ${submission.telegramId} failed:`, err.message);
      }
    }
  }

  console.log(`✅ Pro plan expiry check complete. ${expiring.length} notifications sent.`);
}

// Run this to demote expired Pro plans
async function demoteExpiredProPlans() {
  const now = new Date();

  const expired = await Product.find({
    isPremium: true,
    premiumExpiresAt: { $lte: now }
  });

  for (const product of expired) {
    product.isPremium = false;
    await product.save();
  }

  if (expired.length > 0) {
    console.log(`✅ Demoted ${expired.length} expired Pro listing(s) to regular.`);
  }
}

module.exports = { checkExpiringProPlans, demoteExpiredProPlans };
