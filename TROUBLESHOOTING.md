# Troubleshooting Guide

Common issues and how to fix them.

---

## Bot Not Responding

### Symptom:
- Send `/start` → nothing happens
- Bot shows "online" but doesn't reply

### Diagnosis:
```bash
# Check Railway logs
railway.app → Deployments → click active deployment → scroll logs
```

Look for:
- `✅ MongoDB connected` — if missing, MongoDB issue
- `✅ Bot running on port 3000` — if missing, server crashed
- `Polling error` — Telegram connection issue

### Fixes:

**Fix 1: Wrong BOT_TOKEN**
- Railway → Variables → check `BOT_TOKEN`
- Should look like: `123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg`
- No spaces, no quotes
- Redeploy after fixing

**Fix 2: MongoDB Connection Failed**
- Check `MONGODB_URI` in variables
- Should have password filled in (not `<password>`)
- Test connection: paste URI into MongoDB Compass
- Check MongoDB Atlas whitelist: `0.0.0.0/0` for all IPs

**Fix 3: Railway Crashed**
- Check logs for `Error:` lines
- Common: `Cannot find module 'dotenv'` → missing dependency
- Fix: `npm install` locally, push to GitHub, Railway redeploys

---

## Gmail Verification Not Working

### Symptom:
- User taps "Return to Bot & Get Verified"
- Bot doesn't verify them

### Diagnosis:
Check the deep link format in user.js:
```javascript
`https://t.me/${process.env.BOT_USERNAME}?start=verified_${telegramId}_${code}`
```

### Fixes:

**Fix 1: Wrong BOT_USERNAME**
- Railway → Variables → check `BOT_USERNAME`
- Should be: `YourMarketplaceBot` (NO @ symbol)
- Redeploy

**Fix 2: User Telegram ID Mismatch**
- Check MongoDB → Users collection
- Find user → check `telegramId` field
- Compare with deep link parameter
- If mismatch, delete user from MongoDB and restart

---

## Payments Not Verifying

### Symptom:
- User pays ₦3,000
- Bot says "❌ Payment not seen yet" after 40 seconds

### Diagnosis:
Check Flutterwave dashboard:
- Login → Transactions → filter by today
- Is transaction there?

### Fixes:

**Fix 1: Wrong Flutterwave Keys**
- Railway → Variables
- Check `FLW_SECRET_KEY` starts with `FLWSECK_TEST_`
- Check `FLW_PUBLIC_KEY` starts with `FLWPUBK_TEST_`
- No spaces, no quotes
- Redeploy

**Fix 2: Payment to Wrong Account**
- Virtual account expires after 30 minutes
- User must use exact account number bot provided
- Check transaction reference matches `tx_ref` in code

**Fix 3: Test vs Live Mode**
- Flutterwave has TEST and LIVE modes
- Use TEST keys for testing (start with `_TEST_`)
- Use LIVE keys for production (no `_TEST_`)
- Don't mix them

---

## Emails Not Sending

### Symptom:
- Product approved, seller gets Telegram notification
- No email received

### Diagnosis:
Check Railway logs for:
```
Email send error: ...
```

### Fixes:

**Fix 1: Wrong Gmail App Password**
- Gmail → Security → App Passwords
- Generate new 16-character password
- Railway → Variables → `GMAIL_APP_PASSWORD`
- **Include spaces** exactly as Google shows: `abcd efgh ijkl mnop`
- Redeploy

**Fix 2: Wrong Gmail Address**
- Check `GMAIL_USER` matches your actual Gmail
- Format: `your.email@gmail.com`

**Fix 3: Gmail Account Security**
- Gmail → Security
- Turn ON "2-Step Verification" (required for app passwords)
- Then generate app password again

---

## Photos/Videos Not Showing

### Symptom:
- Admin uploads product with photo
- Bot shows text but no image

### Diagnosis:
Telegram `file_id` expires after ~30 days for files not cached.

### Fixes:

**Fix 1: Re-upload Media**
- Delete old product
- Upload new product with fresh photo
- `file_id` refreshes

**Fix 2: Use Telegram CDN**
- Instead of storing `file_id`, download and re-upload to your own CDN
- Not implemented in current version (future upgrade)

---

## Countdown Timer Not Updating

### Symptom:
- User taps "I Have Sent The Money"
- Bot shows "⏳ Verifying... 40 seconds"
- Countdown stuck, doesn't change

### Diagnosis:
Telegram rate limits message edits (1 per second max).

### Fixes:

**Fix 1: Increase Interval**
- In `payment.js`, countdown updates every 5 seconds
- If still stuck, increase to 10 seconds:
```javascript
}, 10000); // was 5000
```

**Fix 2: Check Logs**
- Railway logs might show: `Error editing message`
- Telegram blocks too many edits
- Current 5-second interval should work fine

---

## Broadcast Takes Too Long

### Symptom:
- 1000 users registered
- Broadcast takes 5+ minutes

### Diagnosis:
Telegram rate limit: 30 messages/second max.

### Fixes:

**Fix 1: Add Delay (Already Implemented)**
- `broadcast.js` has 100ms delay between sends
- This allows ~10 users/second safely

**Fix 2: Batch Broadcasting**
- Send to 100 users, wait 1 minute, send next 100
- Modify `broadcast.js`:
```javascript
if (successCount % 100 === 0) {
  await new Promise(resolve => setTimeout(resolve, 60000)); // wait 1 min
}
```

---

## Pro Plan Not Expiring

### Symptom:
- Pro listing set to expire yesterday
- Still showing as Premium today

### Diagnosis:
Cron job runs every 24 hours. Might not have run yet.

### Fixes:

**Fix 1: Manual Trigger**
- Railway → Deployments → Restart deployment
- Cron runs on startup (10 seconds after)
- Check logs: `✅ Demoted X expired Pro listing(s)`

**Fix 2: Check Date Format**
- MongoDB → Products → find the product
- Check `premiumExpiresAt` field
- Should be ISO date: `2026-05-26T00:00:00.000Z`
- If wrong format, manually fix in MongoDB

---

## Search Not Finding Products

### Symptom:
- User searches "iPhone"
- Bot says "No results found"
- But iPhone product exists

### Diagnosis:
MongoDB regex search is case-sensitive by default.

### Fixes:

**Already Fixed in Code**
- `product.js` uses case-insensitive regex:
```javascript
const regex = new RegExp(keyword, 'i'); // 'i' = case-insensitive
```

**If Still Not Working:**
- Check product name in MongoDB
- Ensure no extra spaces: `"iPhone 12"` not `" iPhone 12 "`
- Search matches `name`, `description`, `details` fields

---

## Admin Menu Not Showing

### Symptom:
- Admin sends `/start`
- Sees user menu, not admin menu

### Diagnosis:
`ADMIN_TELEGRAM_ID` doesn't match.

### Fixes:

**Fix 1: Check Telegram ID**
- Message @userinfobot on Telegram
- Copy your User ID
- Railway → Variables → `ADMIN_TELEGRAM_ID`
- Paste exact ID (no spaces, no quotes)
- Should be numbers only: `1794483261`
- Redeploy

**Fix 2: Type Mismatch**
- index.js compares as strings:
```javascript
String(chatId) === String(process.env.ADMIN_TELEGRAM_ID)
```
- Should work even if one is number, one is string

---

## Database Collections Missing

### Symptom:
- Check MongoDB Atlas
- Only see `users` collection
- No `products`, `sellersub missions`, `settings`

### Diagnosis:
Collections created when first document inserted.

### Fixes:

**Not a Problem**
- Collections auto-create when needed
- Add a product as admin → `products` appears
- Submit as seller → `sellersubmissions` appears
- Edit settings → `settings` appears

---

## Railway Out of Memory

### Symptom:
- Logs show: `JavaScript heap out of memory`
- Bot crashes randomly

### Diagnosis:
Railway free tier: 512MB RAM limit.

### Fixes:

**Fix 1: Optimize Image Handling**
- Don't download images, just store `file_id`
- Already implemented in current code

**Fix 2: Upgrade Railway Plan**
- Railway → Settings → Upgrade to $5/month plan
- Gets 2GB RAM

**Fix 3: Reduce Broadcast Size**
- Split large broadcasts into batches
- See "Broadcast Takes Too Long" section above

---

## Quick Health Check Commands

Run these in Railway logs or local terminal:

```bash
# Check if bot is online
curl https://api.telegram.org/bot<BOT_TOKEN>/getMe

# Check MongoDB connection
# (paste MONGODB_URI into MongoDB Compass)

# Check Flutterwave API
curl -H "Authorization: Bearer <FLW_SECRET_KEY>" https://api.flutterwave.com/v3/transactions

# Test Gmail SMTP
# (send test email from code)
```

---

## Emergency Fixes

### Bot Completely Broken

1. Railway → Deployments → View → scroll to last working deployment
2. Click "Redeploy" on that version
3. Or: GitHub → revert last commit → Railway auto-redeploys

### Lost Environment Variables

1. `.env.example` has all variable names
2. Check your notes for actual values
3. Re-enter in Railway → Variables

### Database Corrupted

1. MongoDB Atlas → Clusters → Browse Collections
2. Download JSON backup of each collection
3. Drop database
4. Recreate collections
5. Import JSON backups

---

**Still stuck? Check Railway logs first. 90% of issues show there.** 🛠️
