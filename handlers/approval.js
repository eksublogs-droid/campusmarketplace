const Product = require('../models/Product');
const SellerSubmission = require('../models/SellerSubmission');
const { emailApproved, emailRejected } = require('../utils/email');
const { broadcastProduct } = require('./broadcast');

async function approveSellerSubmission(bot, submissionId, adminChatId) {
  const submission = await SellerSubmission.findById(submissionId);
  if (!submission) {
    return bot.sendMessage(adminChatId, '❌ Submission not found.');
  }

  submission.approvalStatus = 'approved';
  await submission.save();

  // Calculate premium expiry date
  let premiumExpiresAt = null;
  if (submission.plan === 'pro' && submission.premiumDays > 0) {
    premiumExpiresAt = new Date(Date.now() + submission.premiumDays * 24 * 60 * 60 * 1000);
  }

  // Create product from submission
  const product = new Product({
    name: submission.productName,
    media: submission.media || [],
    details: submission.details,
    description: submission.description,
    location: submission.location,
    whatsappNumber: submission.whatsappNumber,
    price: submission.askingPrice,
    postedBy: 'seller',
    isPremium: submission.plan === 'pro',
    premiumExpiresAt,
    isSold: false
  });

  await product.save();

  // Notify seller via Telegram
  try {
    await bot.sendMessage(submission.telegramId,
      `🎉 *Your product has been approved!*\n\n` +
      `📦 ${submission.productName}\n\n` +
      `Your listing is now live and visible to all buyers. You'll start receiving inquiries on WhatsApp soon!`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error(`Notify seller ${submission.telegramId} failed:`, err.message);
  }

  // Notify seller via Email
  await emailApproved(submission.gmail, submission.firstName, submission.productName, process.env.BOT_USERNAME);

  // Broadcast to all verified users
  await broadcastProduct(bot, product);

  await bot.sendMessage(adminChatId,
    `✅ *Submission Approved*\n\n` +
    `📦 ${submission.productName}\n` +
    `👤 Seller: ${submission.firstName}\n` +
    `📧 Email sent to seller\n` +
    `📢 Broadcasted to all users`,
    { parse_mode: 'Markdown' }
  );
}

async function rejectSellerSubmission(bot, submissionId, adminChatId, reason) {
  const submission = await SellerSubmission.findById(submissionId);
  if (!submission) {
    return bot.sendMessage(adminChatId, '❌ Submission not found.');
  }

  submission.approvalStatus = 'rejected';
  submission.rejectionReason = reason;
  await submission.save();

  // Notify seller via Telegram
  try {
    await bot.sendMessage(submission.telegramId,
      `❌ *Your product was not approved*\n\n` +
      `📦 ${submission.productName}\n\n` +
      `*Reason:* ${reason}\n\n` +
      `You can fix the issue and resubmit a new product from the main menu.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error(`Notify seller ${submission.telegramId} failed:`, err.message);
  }

  // Notify seller via Email
  await emailRejected(submission.gmail, submission.firstName, submission.productName, reason);

  await bot.sendMessage(adminChatId,
    `❌ *Submission Rejected*\n\n` +
    `📦 ${submission.productName}\n` +
    `👤 Seller: ${submission.firstName}\n` +
    `📧 Email sent with rejection reason`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = { approveSellerSubmission, rejectSellerSubmission };
