# Testing Guide — Marketplace Bot

This document guides you through testing every feature of the bot before going live.

---

## Prerequisites for Testing

1. ✅ Railway deployment successful
2. ✅ All environment variables set
3. ✅ MongoDB connected (check Railway logs for "✅ MongoDB connected")
4. ✅ Bot responding to `/start`

---

## Test 1: New User Registration Flow

### Steps:
1. Find your bot on Telegram: `@YourMarketplaceBot`
2. Send `/start`
3. Bot should ask: **"👋 Welcome! What is your Gmail address?"**
4. Type a Gmail address: `test@gmail.com`
5. Bot should say: **"📱 One Last Step — Save Our Number"**
6. Tap **"📲 Save Our Number & Notify Us"**
7. Sends you to admin's DM with pre-filled message
8. Send that message
9. Tap **"↩️ Return to Bot & Get Verified"**
10. Bot should say: **"🎉 You're verified! Welcome aboard!"**
11. Main menu appears with **Buy** and **Sell** buttons

### Expected Outcome:
- User in MongoDB with `verified: true`, `gmailSubmitted: true`
- Gmail saved correctly

---

## Test 2: Buy Flow (Product Listing)

### Steps:
1. As a **verified user**, send `/start`
2. Tap **🛍️ Buy Used Items**
3. Bot shows: **"📭 No products listed yet"** (since no products exist yet)
4. Create a product as admin (see Test 4), then repeat Buy flow
5. Bot should show product with photo/video, name, price, location
6. Two buttons appear:
   - **👀 Interested — Not Ready to Buy**
   - **✅ Interested & Ready to Buy**
7. Tap either button → opens WhatsApp with pre-filled message

### Expected Outcome:
- Product displayed correctly
- WhatsApp link contains product info + user's Gmail, name, username

---

## Test 3: Sell Flow — Free Plan

### Steps:
1. As verified user, tap **💰 Sell Used Items**
2. Bot shows plan comparison table
3. Tap **🆓 Go Free**
4. Bot asks: **"📦 What is the product name?"**
5. Type: `iPhone 12 Pro`
6. Bot asks: **"📸 Upload photos and/or videos"**
7. Send 1 photo → bot confirms media added
8. Type: `DONE`
9. Bot asks for **details** → Type: `Brand new, 128GB, blue color`
10. Bot asks for **description** → Type: `Barely used, no scratches, all accessories included`
11. Bot asks for **location** → Type: `Lagos, Ikeja`
12. Bot asks for **WhatsApp number** → Tap **Use Default**
13. Bot asks for **asking price** → Type: `250000`
14. Bot asks for **last price** → Type: `230000`
15. Bot shows pricing tip + full summary
16. Tap **📤 Send to Admin for Approval**
17. Bot says: **"📤 Product submitted for approval!"**

### Expected Outcome:
- Seller submission saved in MongoDB with `approvalStatus: 'pending'`
- Admin receives notification with all product details + media

---

## Test 4: Admin Flow — Add Product

### Steps:
1. As **admin** (your Telegram ID), send `/start`
2. Admin menu appears
3. Tap **➕ Add Product** (or type `/addproduct`)
4. Bot asks: **"Admin: What is the product name?"**
5. Type: `MacBook Pro 2020`
6. Bot asks: **"Upload photos/videos"**
7. Send 1 photo → Type: `DONE`
8. Enter **details**: `Intel i5, 8GB RAM, 256GB SSD`
9. Enter **description**: `Perfect condition, original charger included`
10. Enter **location**: `Abuja`
11. Bot asks: **"Use default WhatsApp?"** → Tap **Use Default**
12. Enter **price**: `450000`
13. Bot shows full summary
14. Tap **✅ Confirm & Post**
15. Bot says: **"✅ Product posted successfully! Broadcasting..."**
16. All verified users receive broadcast notification

### Expected Outcome:
- Product saved in MongoDB with `postedBy: 'admin'`
- All users get Telegram notification + email notification
- Product appears in Buy section

---

## Test 5: Sell Flow — Pro Plan with Payment

### Steps:
1. As verified user, tap **💰 Sell Used Items**
2. Tap **⭐ Go Pro — Recommended**
3. Select **3 days — ₦3,000**
4. Bot shows Pro plan summary
5. Tap **💳 Proceed to Payment**
6. Bot says: **"⏳ Generating payment details..."**
7. Bot shows virtual account number
8. **PAY** ₦3,000 to that account (use test Flutterwave account)
9. Tap **✅ I Have Sent The Money**
10. Bot shows: **"⏳ Verifying payment... ⏱ Checking in 40 seconds..."**
11. Countdown timer updates every 5 seconds
12. After 40 seconds:
    - If paid → **"✅ Payment confirmed!"** → product form starts
    - If not paid → **"❌ Payment not seen yet"** with **Reverify** button

### Expected Outcome:
- Payment verified from Flutterwave
- User gets email receipt with plan details
- Product form starts after payment

---

## Test 6: Admin — Approve Submission

### Steps:
1. As admin, tap **📋 Pending Submissions** (or type `/pending`)
2. Bot shows pending seller submission from Test 3
3. All product details + media displayed
4. Tap **✅ Approve**
5. Bot says: **"✅ Submission Approved"**
6. Seller gets Telegram notification: **"🎉 Your product has been approved!"**
7. Seller gets email notification
8. All users receive broadcast with product
9. Product appears in Buy section

### Expected Outcome:
- Product moved from SellerSubmission to Product collection
- Seller notified via Telegram + Email
- All users get broadcast
- Product visible in listings

---

## Test 7: Admin — Reject Submission

### Steps:
1. Submit another product as user (see Test 3)
2. As admin, tap **📋 Pending Submissions**
3. Tap **❌ Reject** on that submission
4. Bot asks: **"Enter rejection reason"**
5. Type: `Product name too vague. Please be more specific.`
6. Bot says: **"❌ Submission rejected"**
7. Seller gets Telegram notification with reason
8. Seller gets email with rejection reason

### Expected Outcome:
- Submission marked as `rejected` in MongoDB
- Seller notified with reason
- Product NOT posted

---

## Test 8: Search Feature

### Steps:
1. As user, go to **Buy Used Items**
2. Tap **🔍 Search**
3. Bot asks: **"🔍 What are you looking for?"**
4. Type: `MacBook`
5. Bot returns matching products by name or description

### Expected Outcome:
- Products matching "MacBook" displayed
- If no match → bot says **"🔍 No results found"**

---

## Test 9: Pagination

### Steps:
1. As admin, add 10+ products (repeat Test 4)
2. As user, tap **Buy Used Items**
3. Bot shows first 5 products
4. **Next ➡️** button appears
5. Tap it → shows next 5 products
6. **⬅️ Previous** button appears

### Expected Outcome:
- 5 products per page
- Navigation buttons work correctly

---

## Test 10: Mark as Sold

### Steps:
1. As admin, tap **📦 Active Products** (or type `/products`)
2. Bot lists all active products
3. Tap **🔴 Mark as Sold** on any product
4. Bot asks: **"⚠️ Are you sure? This will permanently delete..."**
5. Tap **✅ Yes, Delete It**
6. Bot says: **"🔴 [Product] has been deleted."**
7. Product removed from Buy section

### Expected Outcome:
- Product completely deleted from MongoDB
- No longer appears in listings

---

## Test 11: Admin Settings

### Steps:
1. As admin, tap **⚙️ Settings** (or type `/settings`)
2. Bot shows current settings:
   - Default WhatsApp number
   - Pro price per day
3. Tap **📱 Edit WhatsApp**
4. Type new number: `2349012345678`
5. Bot says: **"✅ Setting updated!"**
6. Tap **💰 Edit Pro Price**
7. Type: `1500`
8. Bot confirms update

### Expected Outcome:
- Settings saved in MongoDB
- Changes apply immediately to new submissions

---

## Test 12: Email Notifications

Check these emails were sent:

1. **New Product Alert** — when admin posted MacBook in Test 4
2. **Submission Approved** — when admin approved seller's iPhone in Test 6
3. **Submission Rejected** — when admin rejected in Test 7
4. **Payment Confirmed** — when user paid for Pro plan in Test 5

### Expected Outcome:
- All emails delivered to Gmail inbox
- Each email formatted correctly with product details

---

## Test 13: Pro Plan Expiry (Advanced)

### Steps:
1. Create a product with Pro plan expiring tomorrow (manually edit MongoDB):
   ```javascript
   {
     isPremium: true,
     premiumExpiresAt: new Date('2026-05-26T00:00:00Z') // tomorrow
   }
   ```
2. Wait for cron job (runs every 24 hours) OR manually trigger:
   - Restart Railway deployment
   - Check logs for expiry check
3. Seller receives email reminder: **"⏰ Your Pro Listing Expires Tomorrow"**
4. After expiry date passes, product demoted to regular listing (but NOT deleted)

### Expected Outcome:
- Email reminder sent 1 day before expiry
- Product demoted after expiry (isPremium → false)
- Product still visible in listings

---

## Common Test Failures & Fixes

| Issue | Likely Cause | Fix |
|---|---|---|
| Bot not responding | Railway crashed or BOT_TOKEN wrong | Check Railway logs, verify token |
| Gmail not asked | User already in MongoDB | Delete user from MongoDB, restart |
| Payment not verifying | Flutterwave keys wrong | Check FLW_SECRET_KEY in variables |
| Emails not sending | Gmail app password wrong | Regenerate app password, update |
| Photos not showing | file_id expired | Re-upload photos (Telegram file_id expires after 30 days) |
| Countdown not updating | Polling issues | Check Railway logs for errors |

---

## Final Checklist Before Going Live

- [ ] All 13 tests passed
- [ ] Gmail notifications working
- [ ] Payment flow tested with real money (₦100 test)
- [ ] Admin can approve/reject submissions
- [ ] Mark as sold works
- [ ] Pro plan expiry tested
- [ ] Broadcast to 3+ users tested
- [ ] Search returns correct results
- [ ] Pagination works with 10+ products
- [ ] Railway logs show no errors
- [ ] MongoDB has all collections (Users, Products, SellerSubmissions, Settings)

---

**All tests green? You're ready to launch! 🚀**
