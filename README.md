# USDT Whale Transfer Watcher

It is a fullstack application that listens to the USDT contract on the Ethereum mainnet, detects transfers of 100,000 USDT, and sends real-time notifications to users via Firebase Cloud Messaging.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS, Ethers.
| **Blockchain** | Ethereum Mainnet via Alchemy (WebSocket) |
| **Push Notifications** | Firebase Cloud Messaging (FCM) + Firebase Admin SDK |
| **Frontend** | Next.js |
| **Styling** | Tailwind CSS |

## Getting Started

### Prerequisites

- Node.js ≥ 18
- An [Alchemy](https://www.alchemy.com/) account (free tier works) — you need a **WebSocket** endpoint for Ethereum mainnet
- A [Firebase](https://console.firebase.google.com/) project with Cloud Messaging enabled

### 1. Clone the repository

```bash
git clone https://github.com/Goktugberke/vinu_demo.git
cd vinu_demo
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `ETH_WSS_URL` | Alchemy WebSocket URL (e.g. `wss://eth-mainnet.g.alchemy.com/v2/YOUR_KEY`) |
| `USDT_CONTRACT_ADDRESS` | Already set to mainnet USDT: `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| `USDT_DECIMALS` | `6` (USDT uses 6 decimals) |
| `MIN_TRANSFER_USDT` | `100000` (threshold in human-readable USDT) |
| `FIREBASE_PROJECT_ID` | Your Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin SDK service account email |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK private key (with `\n` line breaks) |
| `FCM_TOPIC` | FCM topic name (default: `usdt-large-transfers`) |

Start the backend:

```bash
npm run start:dev
```

The backend will start listening on `http://localhost:3000` and immediately connect to Ethereum mainnet via WebSocket to monitor USDT Transfer events.

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web app API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web app ID |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | FCM VAPID key (from Firebase Console → Cloud Messaging → Web Push certificates) |
| `NEXT_PUBLIC_BACKEND_URL` | Backend URL (default: `http://localhost:3000`) |

> **Important:** Make sure `firebase-messaging-sw.js` in `public/` has the same Firebase config values as your `.env.local`.

Start the frontend:

```bash
npm run dev
```

The frontend runs on `http://localhost:3001`.

### 4. Usage

1. Open `http://localhost:3001` in your browser
2. Click **"Enable Notifications"** and allow browser notifications
3. The app will automatically subscribe to the FCM topic via the backend
4. When a transfer ≥ 100,000 USDT happens on Ethereum mainnet, you'll receive a push notification with:
   - Sender address
   - Receiver address
   - Transfer amount (in USDT)
   - Transaction hash (clickable link to Etherscan)

## ⚙️ How It Works

1. **BlockchainService** connects to Ethereum mainnet via Alchemy WebSocket and listens for `Transfer(address,address,uint256)` events on the USDT contract.
2. When a transfer event arrives, the raw `value` is compared against the threshold (`100,000 × 10^6` to account for USDT's 6 decimals).
3. If the transfer meets the threshold, **NotificationsService** sends an FCM message to the configured topic using Firebase Admin SDK.
4. The **Next.js frontend** receives the notification via Firebase Client SDK:
   - **Foreground:** `onMessage` callback updates the UI in real-time
   - **Background:** Service worker shows a system-level browser notification
5. All notifications are persisted in `localStorage` so they survive page refreshes.