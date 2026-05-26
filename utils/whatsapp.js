function buildWhatsappLink(number, message) {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${number}?text=${encoded}`;
}

function buyerInterestedLink(adminWhatsapp, product, user, readyToBuy) {
  const status = readyToBuy ? "I'm interested and READY TO BUY" : "I'm interested but not ready to buy yet";
  const msg = `Hi! I saw *${product.name}* on your Telegram bot.\nPrice: ₦${product.price.toLocaleString()}\nLocation: ${product.location}\n${status}.\n\nMy details:\nName: ${user.firstName} ${user.lastName}\nUsername: @${user.username || 'N/A'}\nGmail: ${user.gmail}`;
  return buildWhatsappLink(adminWhatsapp, msg);
}

function verifyContactLink(adminNumber, user) {
  const msg = `Hi! I just saved your number ✅ Please verify me — ${user.firstName} | @${user.username || 'N/A'} | ID: ${user.telegramId}`;
  return `https://t.me/${adminNumber.replace('+', '')}?text=${encodeURIComponent(msg)}`;
}

module.exports = { buildWhatsappLink, buyerInterestedLink, verifyContactLink };
