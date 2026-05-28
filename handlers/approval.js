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

  const warranty = submission.warrantyRemaining === 'yes'
    ? (submission.warrantyDuration || 'Yes')
    : (submission.warrantyRemaining || 'N/A');

  // Delivery descriptions in layman terms
  const deliveryParts = [];
  if (submission.doorDropoff) deliveryParts.push('Door Dropoff (seller brings it to your door)');
  if (submission.doorPickup)  deliveryParts.push('Door Pickup (you pick it up from seller\'s location)');
  const deliveryText = deliveryParts.length ? deliveryParts.join(' & ') : 'Not specified';

  const approvalMsg =
    `🎉 *Your product has been approved!*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 *${submission.productName}*\n` +
    `🗂 Category   : ${submission.category}\n` +
    `📁 Subcategory: ${submission.subcategory}\n` +
    `🏷 Brand      : ${submission.brand || 'N/A'}\n` +
    `⚙️ Condition  : ${submission.condition}\n` +
    `📄 Description: ${submission.description || 'N/A'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱ Used For   : ${submission.usedDuration || 'N/A'}\n` +
    `🔧 Defects    : ${submission.hasDefects ? (submission.defectsDetails || 'Yes') : 'None'}\n` +
    `🛠 Repairs    : ${submission.wasRepaired ? (submission.repairsDetails || 'Yes') : 'None'}\n` +
    `❓ Reason     : ${submission.reasonForSelling || 'N/A'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📍 State      : ${submission.state}\n` +
    `🏙 City       : ${submission.city}\n` +
    `🚚 Delivery   : ${deliveryText}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧾 Receipt    : ${submission.receiptAvailable || 'N/A'}\n` +
    `🛡 Warranty   : ${warranty}\n` +
    `📦 Packaging  : ${submission.originalPackaging || 'N/A'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Your listing is now *live* and visible to all buyers. You'll start receiving inquiries on WhatsApp soon!`;

  // Send approval message with media as album
  const validMedia = (submission.media || []).filter(m => m && m.file_id);
  let sellerMediaSent = false;

  if (validMedia.length === 1) {
    const m = validMedia[0];
    try {
      if (m.type === 'video') {
        await bot.sendVideo(submission.telegramId, m.file_id, { caption: approvalMsg, parse_mode: 'Markdown' });
      } else {
        await bot.sendPhoto(submission.telegramId, m.file_id, { caption: approvalMsg, parse_mode: 'Markdown' });
      }
      sellerMediaSent = true;
    } catch (err) {
      console.error(`Approval single media to seller ${submission.telegramId} failed:`, err.message);
    }
  } else if (validMedia.length > 1) {
    try {
      const mediaGroup = validMedia.slice(0, 10).map((m, i) => ({
        type: m.type === 'video' ? 'video' : 'photo',
        media: m.file_id,
        ...(i === 0 ? { caption: approvalMsg, parse_mode: 'Markdown' } : {})
      }));
      await bot.sendMediaGroup(submission.telegramId, mediaGroup);
      await bot.sendMessage(submission.telegramId,
        `✅ Your listing is now live! You'll start receiving buyer inquiries on WhatsApp soon.`,
        { parse_mode: 'Markdown' }
      );
      sellerMediaSent = true;
    } catch (err) {
      console.error(`Approval media group to seller ${submission.telegramId} failed:`, err.message);
    }
  }

  // Always guarantee seller gets the approval notification
  if (!sellerMediaSent) {
    try {
      await bot.sendMessage(submission.telegramId, approvalMsg, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(`Approval text fallback to seller ${submission.telegramId} failed:`, err.message);
    }
  }

  await emailApproved(submission.gmail, submission.firstName, submission.productName, process.env.BOT_USERNAME);

  // Send admin confirmation FIRST — always, before broadcast
  try {
    await bot.sendMessage(adminChatId,
      `✅ *Submission Approved*\n\n` +
      `📦 ${submission.productName}\n` +
      `👤 Seller: ${submission.firstName}\n` +
      `📧 Email sent to seller\n` +
      `📢 Broadcasting to all users now...`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('Admin approval confirmation failed:', err.message);
  }

  // Fire broadcast in background — never await, never crash the flow
  broadcastProduct(bot, product, submission.telegramId)
    .then(result => {
      bot.sendMessage(adminChatId,
        `📢 *Broadcast Complete*\n✅ Sent: ${result.successCount}\n❌ Failed: ${result.failCount}`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    })
    .catch(err => {
      console.error('Broadcast error:', err.message);
      bot.sendMessage(adminChatId, `⚠️ Broadcast encountered an error: ${err.message}`).catch(() => {});
    });
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

  try {
    await bot.sendMessage(adminChatId,
      `❌ *Submission Rejected*\n\n` +
      `📦 ${submission.productName}\n` +
      `👤 Seller: ${submission.firstName}\n` +
      `📧 Email sent with rejection reason`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('Admin rejection confirmation failed:', err.message);
  }
}

module.exports = { approveSellerSubmission, rejectSellerSubmission };
