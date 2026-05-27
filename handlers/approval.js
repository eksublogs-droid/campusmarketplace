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

  let premiumExpiresAt = null;
  if (submission.plan === 'pro' && submission.premiumDays > 0) {
    premiumExpiresAt = new Date(Date.now() + submission.premiumDays * 24 * 60 * 60 * 1000);
  }

  // Map ALL submission fields into Product
  const product = new Product({
    name:             submission.productName,
    media:            submission.media || [],
    details:          submission.description || '',
    description:      submission.description || '',
    location:         `${submission.city ? submission.city + ', ' : ''}${submission.state || ''}`,
    whatsappNumber:   submission.whatsappNumber,
    price:            submission.sellingPrice || submission.askingPrice || 0,
    category:         submission.category || '',
    subcategory:      submission.subcategory || '',
    brand:            submission.brand || '',
    condition:        submission.condition || '',
    originalPrice:    submission.originalPrice || 0,
    sellingPrice:     submission.sellingPrice || 0,
    negotiable:       submission.negotiable || false,
    lowestPrice:      submission.lowestPrice || 0,
    usedDuration:     submission.usedDuration || '',
    hasDefects:       submission.hasDefects || false,
    defectsDetails:   submission.defectsDetails || '',
    wasRepaired:      submission.wasRepaired || false,
    repairsDetails:   submission.repairsDetails || '',
    reasonForSelling: submission.reasonForSelling || '',
    state:            submission.state || '',
    city:             submission.city || '',
    doorDropoff:      submission.doorDropoff || false,
    doorPickup:       submission.doorPickup || false,
    receiptAvailable: submission.receiptAvailable || '',
    warrantyRemaining:submission.warrantyRemaining || '',
    warrantyDuration: submission.warrantyDuration || '',
    originalPackaging:submission.originalPackaging || '',
    postedBy:         'seller',
    isPremium:        submission.plan === 'pro',
    premiumExpiresAt,
    isSold:           false
  });

  await product.save();

  // Build full detail message for seller
  const neg = submission.negotiable
    ? `Yes (Min: ₦${(submission.lowestPrice || 0).toLocaleString()})`
    : 'No';
  const warranty = submission.warrantyRemaining === 'yes'
    ? (submission.warrantyDuration || 'Yes')
    : (submission.warrantyRemaining || 'N/A');

  try {
    await bot.sendMessage(submission.telegramId,
      `🎉 *Your product has been approved!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 *${submission.productName}*\n` +
      `🗂 Category : ${submission.category}\n` +
      `📁 Subcategory: ${submission.subcategory}\n` +
      `🏷 Brand    : ${submission.brand || 'N/A'}\n` +
      `⚙️ Condition: ${submission.condition}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 Selling Price: ₦${(submission.sellingPrice || 0).toLocaleString()}\n` +
      `🤝 Negotiable   : ${neg}\n` +
      `⏱ Used For     : ${submission.usedDuration || 'N/A'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 State    : ${submission.state}\n` +
      `🏙 City     : ${submission.city}\n` +
      `🚚 Door Dropoff: ${submission.doorDropoff ? 'Yes' : 'No'}\n` +
      `🚶 Door Pickup : ${submission.doorPickup ? 'Yes' : 'No'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🧾 Receipt  : ${submission.receiptAvailable || 'N/A'}\n` +
      `🛡 Warranty : ${warranty}\n` +
      `📦 Packaging: ${submission.originalPackaging || 'N/A'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Your listing is now *live* and visible to all buyers. You'll start receiving inquiries on WhatsApp soon!`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error(`Notify seller ${submission.telegramId} failed:`, err.message);
  }

  await emailApproved(submission.gmail, submission.firstName, submission.productName, process.env.BOT_USERNAME);

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
