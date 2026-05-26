# Marketplace Bot — Complete Setup Guide

A Telegram bot for buying & selling used items with Flutterwave payments, Gmail verification, MongoDB, and admin controls.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 1: Create Telegram Bot](#step-1-create-telegram-bot)
3. [Step 2: MongoDB Setup](#step-2-mongodb-setup)
4. [Step 3: Flutterwave Account](#step-3-flutterwave-account)
5. [Step 4: Gmail Setup](#step-4-gmail-setup)
6. [Step 5: Deploy to Railway](#step-5-deploy-to-railway)
7. [Step 6: Environment Variables](#step-6-environment-variables)
8. [Step 7: Test the Bot](#step-7-test-the-bot)
9. [Features Overview](#features-overview)
10. [Admin Commands](#admin-commands)

---

## Prerequisites

- **Node.js** v16+ installed locally
- **Git** installed
- A **Telegram account** (obviously!)
- **MongoDB Atlas account** (free tier works)
- **Flutterwave account** (for payments)
- **Gmail account** (for email notifications)
- **Railway account** (for hosting) — `railway.app`

---

## Step 1: Create Telegram Bot

### 1.1 Open BotFather
- Open Telegram and search for **@BotFather**
- Send `/start`

### 1.2 Create New Bot
- Send `/newbot`
- BotFather asks: "What should your bot be called?" → Type: `Marketplace Bot` (or any name)
- BotFather asks: "Give your bot a username" → Type: `YourMarketplaceBot` (must end with "Bot" or "bot")
- **Copy the token** that looks like: `123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg`

### 1.3 Save Your Bot Info
```
Bot Name: Marketplace Bot
Bot Username: @YourMarketplaceBot
Bot Token: 123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg (KEEP THIS SECRET!)
```

### 1.4 Get Your Telegram ID (Admin)
- Search for **@userinfobot** in Telegram
- Send `/start`
- Copy your **User ID** (e.g., 1794483261)

---

## Step 2: MongoDB Setup

### 2.1 Create MongoDB Atlas Account
- Go to `mongodb.com/cloud/atlas`
- Click "Try Free"
- Sign up with email

### 2.2 Create Free Cluster
- Click "Create" (on the left)
- Choose **AWS**, region **us-east-1** (free tier)
- Cluster name: `MarketplaceDB` (or any name)
- Click "Create Cluster" — wait 3 minutes

### 2.3 Create Database User
- Click "Database Access" (left menu)
- Click "Add New Database User"
- Username: `marketplace` (or any name)
- Password: Generate a strong password — **COPY IT**
- Click "Add User"

### 2.4 Whitelist IP
- Click "Network Access" (left menu)
- Click "Add IP Address"
- Click "Allow Access from Anywhere" → confirm
- (This allows Railway to connect)

### 2.5 Get Connection String
- Go back to "Clusters" → Click "Connect"
- Choose "Drivers" → select "Node.js" → version 3.6 or higher
- **Copy the connection string:**
```
mongodb+srv://marketplace:<password>@cluster0.xxxxx.mongodb.net/marketplace?retryWrites=true&w=majority
```
- Replace `<password>` with your actual password
- Replace `marketplace` at the end with your DB name if you want

---

## Step 3: Flutterwave Account

### 3.1 Sign Up
- Go to `flutterwave.com`
- Click "Get Started"
- Fill details (business type: Marketplace/Freelance)
- Verify email

### 3.2 Complete KYC
- Go to Dashboard → "Settings"
- Complete KYC verification (upload ID, business info)
- This takes 24–48 hours

### 3.3 Get API Keys
- Dashboard → "Settings" → "API Keys"
- You'll see:
  - **Secret Key** (starts with `FLWSECK_TEST_...`)
  - **Public Key** (starts with `FLWPUBK_TEST_...`)
- **Copy both**

### 3.4 Get Encryption Key
- Same page → scroll to "Encryption Key"
- **Copy it**

---

## Step 4: Gmail Setup

### 4.1 Enable App Password
- Go to `myaccount.google.com`
- Click "Security" (left menu)
- Scroll to "App passwords" → click it
- Select "Mail" and "Windows Computer" (doesn't matter)
- Google generates a **16-character password** — **COPY IT**

### 4.2 Note Your Gmail
- Example: `your.email@gmail.com`

---

## Step 5: Deploy to Railway

### 5.1 Prepare Your Code

Create a folder locally:
```bash
mkdir marketplace-bot
cd marketplace-bot
```

Copy all files from the project structure into this folder.

### 5.2 Initialize Git & Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
```

Create a **GitHub repository** (if you don't have one):
- Go to `github.com` → click "+" → "New repository"
- Name: `marketplace-bot`
- Click "Create repository"

Push your code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/marketplace-bot.git
git branch -M main
git push -u origin main
```

### 5.3 Connect to Railway
- Go to `railway.app`
- Click "New Project"
- Select "Deploy from GitHub"
- Find `marketplace-bot` repository → click it
- Railway auto-detects Node.js → click "Deploy"
- Wait for deployment to complete

---

## Step 6: Environment Variables

### 6.1 Add to Railway
After deployment on Railway:
- Go to "Variables" tab
- Add each variable:

```
BOT_TOKEN=123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg
BOT_USERNAME=YourMarketplaceBot
ADMIN_TELEGRAM_ID=1794483261
ADMIN_TELEGRAM_NUMBER=+2348137890167
ADMIN_WHATSAPP=2348137890167
MONGODB_URI=mongodb+srv://marketplace:PASSWORD@cluster0.xxxxx.mongodb.net/marketplace?retryWrites=true&w=majority
FLW_SECRET_KEY=FLWSECK_TEST_xxxxxxxxxxxxx
FLW_PUBLIC_KEY=FLWPUBK_TEST_xxxxxxxxxxxxx
FLW_ENCRYPTION_KEY=xxxxxxxxxxxxx
GMAIL_USER=your.email@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
PORT=3000
```

**Click "Save Variables"** → Railway redeploys automatically

---

## Step 7: Test the Bot

### 7.1 Test as Regular User
- Search for **@YourMarketplaceBot** in Telegram
- Send `/start`
- You should see:
  1. Request for Gmail
  2. Save number verification
  3. Main menu

### 7.2 Test as Admin
- Use your admin ID (1794483261)
- Send `/start`
- You should see admin menu with:
  - ➕ Add Product
  - 📋 Pending Submissions
  - 📦 Active Products
  - 📢 Notify Buyer
  - ⚙️ Settings

### 7.3 Check Logs
- Railway → "Deployments" → click active one
- Scroll to see real-time logs
- Check for errors

---

## Features Overview

### User Features
✅ Gmail collection on first visit  
✅ Number saving verification with deep link  
✅ Auto pre-check every visit  
✅ Buy products with pagination & search  
✅ See seller WhatsApp via interested buttons  
✅ Sell products (Free or Pro plan)  
✅ Flutterwave payment with 40-sec countdown  
✅ Email notifications for all events  

### Admin Features
✅ Add products directly  
✅ Review & approve/reject seller submissions  
✅ Mark products as sold (delete)  
✅ Edit settings (WhatsApp, Pro price)  
✅ View active products & pending submissions  
✅ Notify buyers about product matches  

### Email Notifications Sent
1. **New Product Alert** — when admin posts or seller approved
2. **Seller Match Found** — when admin finds a buyer
3. **Submission Approved** — when admin approves seller's product
4. **Submission Rejected** — with rejection reason
5. **Payment Confirmed** — receipt with plan details
6. **Pro Plan Expiring Soon** — 1 day before expiry
7. **Buyer Interest** — seller notified when someone shows interest

---

## Admin Commands

### Text Commands
- `/start` — show admin menu
- `/menu` — same as start
- `/addproduct` — add product to marketplace
- `/pending` — see pending seller submissions
- `/products` — see all active products
- `/settings` — edit bot settings

### Button-Based Flows
All approval, rejection, and actions done via inline buttons in Telegram.

---

## Payment Flow Explanation

1. User selects Pro plan & days
2. Bot shows price summary
3. User taps "Proceed to Payment"
4. Bot calls Flutterwave API → generates virtual account
5. Bot shows bank details (account number, amount)
6. User transfers exact amount to account
7. User taps "I Have Sent The Money"
8. Bot shows **"⏳ Verifying payment..."** with 40-second countdown timer
9. After 40 seconds, bot checks Flutterwave
10. If payment found → ✅ confirmed, product form starts
11. If payment NOT found → user can tap "🔄 Reverify Payment"

---

## Common Issues & Fixes

### Bot not responding
- Check Railway logs for errors
- Verify `BOT_TOKEN` is correct
- Make sure MongoDB is whitelisted

### Emails not sending
- Check Gmail app password is correct (include spaces)
- Enable "Less secure app access" if issues continue
- Check GMAIL_USER matches your actual Gmail

### Payment not verifying
- Check Flutterwave keys are correct (use TEST keys for testing)
- Check BVN in `flutterwave.js` (placeholder `22222222222`)
- Logs should show payment verification errors

### Verification deep link not working
- Ensure BOT_USERNAME matches exactly (with or without @)
- Deep link expires if user takes too long to tap

---

## Deployment Checklist

Before going live:
- [ ] All environment variables set on Railway
- [ ] MongoDB Atlas cluster created & whitelisted
- [ ] Flutterwave account verified (KYC passed)
- [ ] Gmail app password generated
- [ ] Bot tested as user and admin
- [ ] Product upload tested
- [ ] Payment flow tested (use test Flutterwave account)
- [ ] Email notifications working

---

## Support

For issues:
1. Check Railway logs: `railway.app` → "Deployments" → logs
2. Check MongoDB connection in Railway variables
3. Test bot locally: `npm install` then `node index.js`
4. DM admin Telegram ID for manual testing

---

**Good luck! 🚀**
