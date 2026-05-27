const mongoose = require('mongoose');

const paymentReceiptSchema = new mongoose.Schema({
  telegramId:     { type: Number, required: true },
  firstName:      { type: String, required: true },
  username:       { type: String, default: '' },
  amountExpected: { type: Number, required: true },
  days:           { type: Number, required: true },
  receiptFileId:  { type: String, required: true },
  // pending | approved | rejected
  status:         { type: String, default: 'pending' },
  rejectionReason:{ type: String, default: '' },
  submittedAt:    { type: Date, default: Date.now },
  reviewedAt:     { type: Date }
});

module.exports = mongoose.models['PaymentReceipt'] || mongoose.model('PaymentReceipt', paymentReceiptSchema);
