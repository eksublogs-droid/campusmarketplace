const Product = require('../models/Product');
const SellerSubmission = require('../models/SellerSubmission');
const PaymentReceipt = require('../models/PaymentReceipt');
const { emailProExpiringSoon } = require('../utils/email');

// ========== PRO PLAN EXPIRY CHECK ==========
async function checkExpiringProPlans(bot) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const expiring = await Product.find({
    isPremium: true,
    premiumExpiresAt: { $gte: tomorrow, $lt: dayAfter }
  });

  for (const product of expiring) {
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

// ========== DEMOTE EXPIRED PRO PLANS ==========
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

// ========== DELETE SOLD PRODUCTS AFTER 7 DAYS ==========
async function deleteOldSoldProducts() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const result = await Product.deleteMany({
    isSold: true,
    soldAt: { $lte: cutoff }
  });

  if (result.deletedCount > 0) {
    console.log(`🗑 Deleted ${result.deletedCount} sold product(s) older than 7 days.`);
  }
}

// ========== DELETE OLD REJECTED RECEIPTS AFTER 48 HOURS ==========
async function deleteOldRejectedReceipts() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const result = await PaymentReceipt.deleteMany({
    status: 'rejected',
    reviewedAt: { $lte: cutoff }
  });

  if (result.deletedCount > 0) {
    console.log(`🗑 Deleted ${result.deletedCount} rejected receipt(s) older than 48 hours.`);
  }
}

module.exports = {
  checkExpiringProPlans,
  demoteExpiredProPlans,
  deleteOldSoldProducts,
  deleteOldRejectedReceipts
};
