const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:             { type: String, required: true },
  media:            [{ file_id: String, type: { type: String, enum: ['photo', 'video'] } }],
  details:          { type: String, default: '' },
  description:      { type: String, default: '' },
  location:         { type: String, default: '' },
  whatsappNumber:   { type: String, default: '' },
  price:            { type: Number, default: 0 },
  // New fields
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
  postedBy:         { type: String, default: 'admin' },
  isPremium:        { type: Boolean, default: false },
  premiumExpiresAt: { type: Date, default: null },
  isSold:           { type: Boolean, default: false },
  soldAt:           { type: Date, default: null },
  createdAt:        { type: Date, default: Date.now }
});

module.exports = mongoose.models['Product'] || mongoose.model('Product', productSchema);
