const mongoose = require('mongoose');

const sellerSubmissionSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true },
  firstName: { type: String, default: '' },
  username: { type: String, default: '' },
  gmail: { type: String, default: '' },
  whatsappNumber: { type: String, default: '' },
  productName: { type: String, default: '' },
  media: [{ file_id: String, type: { type: String, enum: ['photo', 'video'] } }],
  details: { type: String, default: '' },
  description: { type: String, default: '' },
  location: { type: String, default: '' },
  askingPrice: { type: Number, default: 0 },
  lastPrice: { type: Number, default: 0 },
  plan: { type: String, enum: ['free', 'pro'], default: 'free' },
  premiumDays: { type: Number, default: 0 },
  premiumPrice: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  paymentRef: { type: String, default: '' },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  rejectionReason: { type: String, default: '' },
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models['SellerSubmission'] || mongoose.model('SellerSubmission', sellerSubmissionSchema);
