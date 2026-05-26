const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  username: { type: String, default: '' },
  gmail: { type: String, default: '' },
  gmailSubmitted: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  verifyCode: { type: String, default: '' },
  notifiedAdmin: { type: Boolean, default: false },
  registeredAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
