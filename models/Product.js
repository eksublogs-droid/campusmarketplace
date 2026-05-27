const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:             { type: String, required: true },
  media:            [{ file_id: String, type: { type: String, enum: ['photo', 'video'] } }],
  details:          { type: String, default: '' },
  description:      { type: String, default: '' },
  location:         { type: String, default: '' },
  whatsappNumber:   { type: String, default: '' },
  price:            { type: Number, default: 0 },
  postedBy:         { type: String, default: 'admin' },
  isPremium:        { type: Boolean, default: false },
  premiumExpiresAt: { type: Date, default: null },
  isSold:           { type: Boolean, default: false },
  soldAt:           { type: Date, default: null },
  createdAt:        { type: Date, default: Date.now }
});

module.exports = mongoose.models['Product'] || mongoose.model('Product', productSchema);
