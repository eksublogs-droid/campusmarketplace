function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '🛍️ Buy Used Items', callback_data: 'buy' }],
      [{ text: '💰 Sell Used Items', callback_data: 'sell' }]
    ]
  };
}

function planSelection() {
  return {
    inline_keyboard: [
      [{ text: '🆓 Go Free', callback_data: 'plan_free' }],
      [{ text: '⭐ Go Pro — Recommended', callback_data: 'plan_pro' }]
    ]
  };
}

function proDayOptions() {
  return {
    inline_keyboard: [
      [{ text: '1 day — ₦1,000', callback_data: 'prodays_1' }, { text: '2 days — ₦2,000', callback_data: 'prodays_2' }],
      [{ text: '3 days — ₦3,000', callback_data: 'prodays_3' }, { text: '5 days — ₦5,000', callback_data: 'prodays_5' }],
      [{ text: '7 days — ₦7,000', callback_data: 'prodays_7' }],
      [{ text: '✏️ Custom Days', callback_data: 'prodays_custom' }]
    ]
  };
}

function proceedPayment() {
  return {
    inline_keyboard: [[{ text: '💳 Proceed to Payment', callback_data: 'proceed_payment' }]]
  };
}

function productActions(productId, waLink, waLinkReady) {
  return {
    inline_keyboard: [
      [{ text: '👀 Interested — Not Ready', url: waLink }],
      [{ text: '✅ Interested & Ready to Buy', url: waLinkReady }]
    ]
  };
}

function productPagination(page, total) {
  const buttons = [];
  const row = [];
  if (page > 0) row.push({ text: '⬅️ Previous', callback_data: `page_${page - 1}` });
  if ((page + 1) * 5 < total) row.push({ text: 'Next ➡️', callback_data: `page_${page + 1}` });
  if (row.length) buttons.push(row);
  buttons.push([{ text: '🔍 Search', callback_data: 'search' }]);
  buttons.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);
  return { inline_keyboard: buttons };
}

function submitToAdmin() {
  return {
    inline_keyboard: [[{ text: '📤 Send to Admin for Approval', callback_data: 'submit_product' }]]
  };
}

function adminApproveReject(submissionId) {
  return {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `approve_${submissionId}` },
      { text: '❌ Reject', callback_data: `reject_${submissionId}` }
    ]]
  };
}

function whatsappOrDefault() {
  return {
    inline_keyboard: [
      [{ text: `📱 Use Default (+2348137890167)`, callback_data: 'wa_default' }],
      [{ text: '✏️ Type Custom Number', callback_data: 'wa_custom' }]
    ]
  };
}

function confirmPost() {
  return {
    inline_keyboard: [[{ text: '✅ Confirm & Post', callback_data: 'confirm_post' }]]
  };
}

function markAsSoldBtn(productId) {
  return {
    inline_keyboard: [[{ text: '🔴 Mark as Sold', callback_data: `mark_sold_${productId}` }]]
  };
}

function confirmSold(productId) {
  return {
    inline_keyboard: [[
      { text: '✅ Yes, Delete It', callback_data: `confirm_sold_${productId}` },
      { text: '❌ Cancel', callback_data: 'cancel_sold' }
    ]]
  };
}

function adminMenu() {
  return {
    inline_keyboard: [
      [{ text: '➕ Add Product', callback_data: 'admin_add_product' }],
      [{ text: '📋 Pending Submissions', callback_data: 'admin_pending' }],
      [{ text: '💰 Pending Payments', callback_data: 'admin_pending_payments' }],
      [{ text: '📦 Active Products', callback_data: 'admin_products' }],
      [{ text: '⚙️ Settings', callback_data: 'admin_settings' }]
    ]
  };
}

module.exports = {
  mainMenu, planSelection, proDayOptions, proceedPayment,
  productActions, productPagination,
  submitToAdmin, adminApproveReject, whatsappOrDefault, confirmPost,
  markAsSoldBtn, confirmSold, adminMenu
};
