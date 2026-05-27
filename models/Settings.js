const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema({
  bankName:      { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  accountName:   { type: String, default: '' },
  active:        { type: Boolean, default: true }
}, { _id: false });

const settingsSchema = new mongoose.Schema({
  defaultWhatsapp: { type: String, default: '2348137890167' },
  proPricePerDay:  { type: Number, default: 1000 },
  // Up to 3 bank accounts
  bankAccounts: {
    type: [bankAccountSchema],
    default: [
      { bankName: '', accountNumber: '', accountName: '', active: false },
      { bankName: '', accountNumber: '', accountName: '', active: false },
      { bankName: '', accountNumber: '', accountName: '', active: false }
    ]
  },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models['Settings'] || mongoose.model('Settings', settingsSchema);
