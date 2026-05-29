const mongoose = require('mongoose');

const paymentReceiptSchema = new mongoose.Schema({
  telegramId:           { type: Number, required: true },
  firstName:            { type: String, required: true },
  username:             { type: String, default: '' },
  amountExpected:       { type: Number, required: true },
  days:                 { type: Number, required: true },
  receiptFileId:        { type: String, required: true },
  // pending | approved | rejected
  status:               { type: String, default: 'pending' },
  rejectionReason:      { type: String, default: '' },
  submittedAt:          { type: Date, default: Date.now },
  reviewedAt:           { type: Date },
  // Links back to the SellerSubmission (pro plan flow)
  submissionId:         { type: String, default: null },
  // message_id of "✅ Receipt received!" shown to user — deleted on payment approval
  receiptReceivedMsgId: { type: Number, default: null },
  // message_id of the admin's NEW PAYMENT RECEIPT message — deleted after admin acts
  adminReceiptMsgId:    { type: Number, default: null }
});

module.exports = mongoose.models['PaymentReceipt'] || mongoose.model('PaymentReceipt', paymentReceiptSchema);
