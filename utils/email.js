const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

async function sendEmail(to, subject, html) {
  if (!to || !to.includes('@gmail.com')) return;
  try {
    await transporter.sendMail({
      from: `"Marketplace Bot" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html
    });
  } catch (err) {
    console.error('Email send error:', err.message);
  }
}

// 1. New product alert
async function emailNewProduct(gmail, firstName, product, botUsername) {
  const botLink = `https://t.me/${botUsername}`;
  await sendEmail(gmail, `🛍️ New Item Just Listed: ${product.name}`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px">
      <h2 style="color:#2563eb">🛍️ New Item Available!</h2>
      <p>Hi ${firstName},</p>
      <p>A new item just dropped on the marketplace!</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Product</td><td style="padding:8px">${product.name}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Price</td><td style="padding:8px">₦${product.price.toLocaleString()}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Location</td><td style="padding:8px">${product.location}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Description</td><td style="padding:8px">${product.description}</td></tr>
      </table>
      <a href="${botLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Item in Bot →</a>
      <p style="color:#888;font-size:12px;margin-top:20px">You're receiving this because you registered on our Telegram marketplace.</p>
    </div>
  `);
}

// 2. Seller match found / buyer notification
async function emailMatchFound(gmail, firstName, productName, adminWhatsapp) {
  const waLink = `https://wa.me/${adminWhatsapp}`;
  await sendEmail(gmail, `🎉 Great News! We Found a Match for "${productName}"`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px">
      <h2 style="color:#16a34a">🎉 We Found a Match!</h2>
      <p>Hi ${firstName},</p>
      <p>Good news! We have found a <strong>ready buyer</strong> for <strong>${productName}</strong>.</p>
      <p>Contact us on WhatsApp now to complete the deal before the buyer moves on.</p>
      <a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:10px">Chat on WhatsApp →</a>
      <p style="color:#888;font-size:12px;margin-top:20px">Marketplace Bot — connect, buy & sell fast.</p>
    </div>
  `);
}

// 3. Submission approved
async function emailApproved(gmail, firstName, productName, botUsername) {
  const botLink = `https://t.me/${botUsername}`;
  await sendEmail(gmail, `✅ Your Product "${productName}" Is Now Live!`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px">
      <h2 style="color:#16a34a">✅ Product Approved & Live!</h2>
      <p>Hi ${firstName},</p>
      <p>Your product <strong>${productName}</strong> has been <strong>approved</strong> and is now visible to all buyers on the marketplace.</p>
      <p>Buyers can now reach you through the WhatsApp button on your listing. Sit back and wait for interested buyers!</p>
      <a href="${botLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:10px">View Marketplace →</a>
      <p style="color:#888;font-size:12px;margin-top:20px">Marketplace Bot — connect, buy & sell fast.</p>
    </div>
  `);
}

// 4. Submission rejected
async function emailRejected(gmail, firstName, productName, reason) {
  await sendEmail(gmail, `❌ Your Product "${productName}" Was Not Approved`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px">
      <h2 style="color:#dc2626">❌ Product Not Approved</h2>
      <p>Hi ${firstName},</p>
      <p>Unfortunately your product <strong>${productName}</strong> was not approved.</p>
      <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px;border-radius:4px;margin:16px 0">
        <strong>Reason:</strong> ${reason}
      </div>
      <p>You can fix the issue and resubmit. Open the bot and go to <em>Sell Used Items</em> to try again.</p>
      <p style="color:#888;font-size:12px;margin-top:20px">Marketplace Bot — connect, buy & sell fast.</p>
    </div>
  `);
}

// 5. Payment confirmed
async function emailPaymentConfirmed(gmail, firstName, amount, days, expiresAt) {
  await sendEmail(gmail, `💳 Payment Confirmed — Pro Plan Active!`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px">
      <h2 style="color:#7c3aed">💎 Pro Plan Activated!</h2>
      <p>Hi ${firstName},</p>
      <p>Your payment has been confirmed. Your Pro listing is now active.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Amount Paid</td><td style="padding:8px">₦${amount.toLocaleString()}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Duration</td><td style="padding:8px">${days} day(s)</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Expires</td><td style="padding:8px">${expiresAt.toDateString()}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Benefit</td><td style="padding:8px">First on listings + all promotion channels</td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:20px">Keep this email as your payment receipt.</p>
    </div>
  `);
}

// 6. Pro plan expiry reminder
async function emailProExpiringSoon(gmail, firstName, productName, expiresAt, botUsername) {
  const botLink = `https://t.me/${botUsername}`;
  await sendEmail(gmail, `⏰ Your Pro Listing Expires Tomorrow — "${productName}"`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px">
      <h2 style="color:#d97706">⏰ Pro Plan Expiring Soon</h2>
      <p>Hi ${firstName},</p>
      <p>Your Pro listing for <strong>${productName}</strong> expires on <strong>${expiresAt.toDateString()}</strong> (tomorrow).</p>
      <p>After expiry, your product will remain listed but will drop to the regular position. Renew now to keep your top spot and all promotional channels.</p>
      <a href="${botLink}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:10px">Renew Pro Plan →</a>
      <p style="color:#888;font-size:12px;margin-top:20px">Marketplace Bot — connect, buy & sell fast.</p>
    </div>
  `);
}

// 7. Interest shown — notify admin's seller (bonus useful notification)
async function emailBuyerInterest(gmail, firstName, productName, buyerName, buyerUsername, readyToBuy) {
  const status = readyToBuy ? '✅ READY TO BUY' : '👀 Interested (Not Ready Yet)';
  await sendEmail(gmail, `👀 Someone Is Interested in "${productName}"`, `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px">
      <h2 style="color:#2563eb">👀 New Interest on Your Listing!</h2>
      <p>Hi ${firstName},</p>
      <p>Someone just showed interest in <strong>${productName}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Buyer Name</td><td style="padding:8px">${buyerName}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Username</td><td style="padding:8px">@${buyerUsername || 'N/A'}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6">Status</td><td style="padding:8px">${status}</td></tr>
      </table>
      <p>We'll connect you both via WhatsApp. Stay close to your phone!</p>
      <p style="color:#888;font-size:12px;margin-top:20px">Marketplace Bot — connect, buy & sell fast.</p>
    </div>
  `);
}

module.exports = {
  emailNewProduct,
  emailMatchFound,
  emailApproved,
  emailRejected,
  emailPaymentConfirmed,
  emailProExpiringSoon,
  emailBuyerInterest
};
