function buildWhatsappLink(number, message) {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${number}?text=${encoded}`;
}

function buyerInterestedLink(adminWhatsapp, product, user, readyToBuy) {
  const status = readyToBuy ? "I'm interested and READY TO BUY" : "I'm interested but not ready to buy yet";
  const msg = `Hi! I saw *${product.name}* on your Telegram bot.\nPrice: ₦${product.price.toLocaleString()}\nLocation: ${product.location}\n${status}.\n\nMy details:\nName: ${user.firstName} ${user.lastName}\nUsername: @${user.username || 'N/A'}\nGmail: ${user.gmail}`;
  return buildWhatsappLink(adminWhatsapp, msg);
}

function verifyContactLink() {
  // Opens @EksuBlog chat directly — Telegram does not support pre-filled
  // text for non-bot usernames, so we just open the chat
  return `https://t.me/EksuBlog`;
}

module.exports = { buildWhatsappLink, buyerInterestedLink, verifyContactLink };
