const mongoose = require('mongoose');

const sellerSubmissionSchema = new mongoose.Schema({
  telegramId:       { type: Number, required: true },
  firstName:        { type: String, default: '' },
  username:         { type: String, default: '' },
  gmail:            { type: String, default: '' },
  whatsappNumber:   { type: String, default: '' },
  productName:      { type: String, default: '' },
  media:            [{ file_id: String, type: { type: String, enum: ['photo', 'video'] } }],
  details:          { type: String, default: '' },
  description:      { type: String, default: '' },
  location:         { type: String, default: '' },
  category:         { type: String, default: '' },
  subcategory:      { type: String, default: '' },
  brand:            { type: String, default: '' },
  condition:        { type: String, default: '' },
  originalPrice:    { type: Number, default: 0 },
  sellingPrice:     { type: Number, default: 0 },
  negotiable:       { type: Boolean, default: false },
  lowestPrice:      { type: Number, default: 0 },
  usedDuration:     { type: String, default: '' },
  hasDefects:       { type: Boolean, default: false },
  defectsDetails:   { type: String, default: '' },
  wasRepaired:      { type: Boolean, default: false },
  repairsDetails:   { type: String, default: '' },
  reasonForSelling: { type: String, default: '' },
  state:            { type: String, default: '' },
  city:             { type: String, default: '' },
  doorDropoff:      { type: Boolean, default: false },
  doorPickup:       { type: Boolean, default: false },
  receiptAvailable: { type: String, default: '' },
  warrantyRemaining:{ type: String, default: '' },
  warrantyDuration: { type: String, default: '' },
  originalPackaging:{ type: String, default: '' },
  // Legacy fields kept for backward compat
  askingPrice:      { type: Number, default: 0 },
  lastPrice:        { type: Number, default: 0 },
  plan:             { type: String, enum: ['free', 'pro'], default: 'free' },
  premiumDays:      { type: Number, default: 0 },
  premiumPrice:     { type: Number, default: 0 },
  paymentStatus:    { type: String, enum: ['pending', 'paid', 'failed', 'not_needed'], default: 'pending' },
  paymentRef:       { type: String, default: '' },
  approvalStatus:   { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  rejectionReason:  { type: String, default: '' },
  submittedAt:      { type: Date, default: Date.now },

  // ------------------------------------------------------------------
  // Message IDs stored so we can clean up the seller's chat on approval/rejection
  // sellFlowMsgIds: all msgs from "💰 Sell Used Items" up to (not including)
  //   the final status msg (✅ Listing Submitted! or ✅ Receipt received!)
  // finalStatusMsgId: the last msg shown to seller before admin acts
  //   free plan → ✅ Listing Submitted!
  //   pro plan  → ✅ Receipt received!
  // adminSubmissionMsgId: the 🆕 NEW SELLER SUBMISSION message sent to admin
  // ------------------------------------------------------------------
  sellFlowMsgIds:       { type: [Number], default: [] },
  finalStatusMsgId:     { type: Number, default: null },
  adminSubmissionMsgId: { type: Number, default: null }
});

module.exports = mongoose.models['SellerSubmission'] || mongoose.model('SellerSubmission', sellerSubmissionSchema);
