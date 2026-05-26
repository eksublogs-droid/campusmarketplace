const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  defaultWhatsapp: { type: String, default: '2348137890167' },
  proPricePerDay: { type: Number, default: 1000 },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Settings', settingsSchema);
