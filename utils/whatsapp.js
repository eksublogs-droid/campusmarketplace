function buildWhatsappLink(number, message) {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${number}?text=${encoded}`;
}

function buildFullProductMessage(product, user, readyToBuy) {
  const status = readyToBuy ? "I'm READY TO BUY" : "I'm interested but not ready to buy yet";
  const neg = product.negotiable
    ? `Yes (Min: ₦${(product.lowestPrice || 0).toLocaleString()})`
    : 'No';

  const lines = [
    `Hi! I saw this item on CampusMarketplace Telegram bot.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📦 Title     : ${product.name}`,
    `🗂 Category  : ${product.category || 'N/A'}`,
    `📁 Subcategory: ${product.subcategory || 'N/A'}`,
    `🏷 Brand     : ${product.brand || 'N/A'}`,
    `⚙️ Condition : ${product.condition || 'N/A'}`,
    `📄 Desc      : ${product.description || product.details || 'N/A'}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 Price     : ₦${(product.sellingPrice || product.price || 0).toLocaleString()}`,
    `🤝 Negotiable: ${neg}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⏱ Used For  : ${product.usedDuration || 'N/A'}`,
    `🔧 Defects   : ${product.hasDefects ? (product.defectsDetails || 'Yes') : 'None'}`,
    `🛠 Repairs   : ${product.wasRepaired ? (product.repairsDetails || 'Yes') : 'None'}`,
    `❓ Reason    : ${product.reasonForSelling || 'N/A'}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📍 State     : ${product.state || 'N/A'}`,
    `🏙 City      : ${product.city || 'N/A'}`,
    `🚚 Dropoff   : ${product.doorDropoff ? 'Yes' : 'No'}`,
    `🚶 Pickup    : ${product.doorPickup ? 'Yes' : 'No'}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🧾 Receipt   : ${product.receiptAvailable || 'N/A'}`,
    `🛡 Warranty  : ${product.warrantyRemaining === 'yes' ? (product.warrantyDuration || 'Yes') : (product.warrantyRemaining || 'N/A')}`,
    `📦 Packaging : ${product.originalPackaging || 'N/A'}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `👤 Buyer Details:`,
    `Name     : ${user.firstName} ${user.lastName || ''}`.trim(),
    `Username : @${user.username || 'N/A'}`,
    `Gmail    : ${user.gmail || 'N/A'}`,
    ``,
    `💬 Status: ${status}`
  ];

  return lines.join('\n');
}

function buyerInterestedLink(adminWhatsapp, product, user, readyToBuy) {
  const msg = buildFullProductMessage(product, user, readyToBuy);
  return buildWhatsappLink(adminWhatsapp, msg);
}

function enquirePriceLink(adminWhatsapp, product, user, readyToBuy) {
  // Same as buyerInterestedLink — full details with enquire context
  const status = readyToBuy ? "I'm READY TO BUY and want to enquire the price" : "I want to enquire the price";
  const msg = buildFullProductMessage(product, user, readyToBuy).replace(
    /💬 Status:.*/,
    `💬 Status: ${status}`
  );
  return buildWhatsappLink(adminWhatsapp, msg);
}

function verifyContactLink() {
  return `https://t.me/EksuBlog`;
}

module.exports = { buildWhatsappLink, buyerInterestedLink, enquirePriceLink, verifyContactLink };
