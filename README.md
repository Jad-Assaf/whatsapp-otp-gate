# WhatsApp OTP Gate for Shopify Hydrogen

This repository contains a production‑ready Vercel application that enforces a one‑time password (OTP) gate on a Shopify Hydrogen cart.  The backend is implemented with **Next.js 14** (App Router) and deployed on Vercel.  The gate blocks checkout until the user verifies a code delivered through WhatsApp.  It integrates with the **Meta WhatsApp Cloud API**, a **PostgreSQL database** (for example, Aiven) and Shopify’s **Storefront API**.

## How it works

1. A buyer clicks **Checkout** on your Hydrogen cart (before being redirected to Shopify’s native checkout).
2. Your Hydrogen UI opens a modal asking for the buyer’s WhatsApp number.  You invoke the `/api/otp/start` endpoint with `{cartId, phone}`.
3. The backend normalizes the phone number, checks rate limits and generates a 6‑digit code.  The code is hashed with HMAC‑SHA256 (never stored in plain text) and persisted in a PostgreSQL table with a **5 minute TTL** and an initial **45 second resend cooldown**.  It then calls the WhatsApp Cloud API to send a template message containing the code.  According to Meta’s documentation, authentication templates are used to deliver one‑time passcodes (usually **4–8 digit** codes) and must follow specific restrictions: no media, URLs or emojis, and a short parameter length【849226719754963†L590-L604】.  Templates often look like “`{{1}} is your verification code`”【849226719754963†L612-L619】.
4. Your UI collects the code from the buyer and calls `/api/otp/verify` with `{cartId, code}`.  If the code matches and hasn’t expired, the backend marks the cart as verified, deletes the OTP row from the database and issues a signed JWT.  The JWT is also stored in a secure HTTP‑only cookie so that subsequent requests can be authenticated.
5. Finally, your UI calls `/api/checkout-url` with `{cartId}`.  The backend verifies the JWT, ensures the cart has been marked as verified by looking up the `verified` table, and then queries Shopify’s Storefront API for the cart’s **checkoutUrl**.  Shopify recommends requesting the checkout URL only when the buyer is ready to complete the order; the URL redirects through Shopify’s web checkout and should not be cached【237957259981077†L2455-L2463】.  The endpoint returns the checkout URL, and the client redirects the user to complete payment.

## Project structure

```
.
├── app
│   ├── api
│   │   ├── otp
│   │   │   ├── start
│   │   │   │   └── route.ts       # POST /api/otp/start
│   │   │   └── verify
│   │   │       └── route.ts       # POST /api/otp/verify
│   │   └── checkout-url
│   │       └── route.ts           # POST /api/checkout-url
│   └── health
│       └── route.ts               # GET /health
├── lib
│   ├── auth.ts                   # JWT signing/verification helpers
│   ├── db.ts                     # PostgreSQL connection pool
│   ├── store.ts                  # Database access helpers for OTP, verification and locking
│   ├── logger.ts                 # JSON logger with Asia/Beirut timestamps
│   ├── otp.ts                    # OTP generation and hashing
│   ├── phone.ts                  # Normalize phone numbers to E.164
│   ├── rateLimit.ts              # Fixed‑window rate limiting using PostgreSQL
│   └── shopify.ts                # Minimal Storefront API client
├── package.json
├── tsconfig.json
├── next.config.js
└── README.md (this file)
```

## Environment variables

Create a `.env` file (or configure the values in Vercel) with the following keys:

```ini
NODE_ENV=production
PORT=3000

# Allowed CORS origins (comma‑separated).  Include your Hydrogen app URLs.
ALLOWED_ORIGINS=https://961souq.com,https://www.961souq.com,https://your-dev-host

# Secret used to hash OTPs and sign JWTs.  Use a strong random value.
HMAC_SECRET=replace_with_strong_secret

# WhatsApp Cloud API configuration
META_PHONE_NUMBER_ID=123456789012345
META_TOKEN=EAAXXXXXXXXXXXX   # System User token with whatsapp_business_messaging permissions

# Shopify Storefront API configuration
SHOPIFY_STOREFRONT_API_URL=https://<shop>.myshopify.com/api/2025-04/graphql.json
SHOPIFY_STOREFRONT_API_TOKEN=shpat_or_storefront_token

# PostgreSQL / Aiven configuration
# Provide a full connection string for your Postgres database.  If using Aiven,
# the console will provide an AIVEN_DB_URL.  You can set either
DATABASE_URL=postgres://username:password@host:26257/dbname
AIVEN_DB_URL=
```

**Important:** never commit your secrets to version control.  Use Vercel’s environment variables UI to store them securely.

## Database setup

This project uses a relational database (PostgreSQL) to store OTP challenges, verification flags, rate‑limit counters and lock records.  You can host the database anywhere (Aiven, Supabase, Heroku, AWS RDS, etc.) as long as you provide the connection string via `DATABASE_URL` or `AIVEN_DB_URL` in your environment variables.  The schema consists of four tables:

```sql
-- Holds one row per cart containing the current OTP challenge.  Delete rows upon verification or expiration.
CREATE TABLE IF NOT EXISTS otp (
  cart_id      TEXT PRIMARY KEY,
  phone_e164   TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  resend_at    TIMESTAMPTZ NOT NULL,
  request_ip   TEXT NOT NULL
);

-- Records successful verifications.  A row exists while the cart is allowed to proceed to checkout.  Expired rows should be purged periodically.
CREATE TABLE IF NOT EXISTS verified (
  cart_id      TEXT PRIMARY KEY,
  phone_e164   TEXT NOT NULL,
  verified_at  TIMESTAMPTZ NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL
);

-- Rate limiting counters keyed by arbitrary strings (IP or phone).  Each row stores the current count and when it resets.
CREATE TABLE IF NOT EXISTS rate_limit (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL
);

-- Locks carts temporarily after too many invalid attempts.
CREATE TABLE IF NOT EXISTS lock (
  cart_id      TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL
);
```

If you’re using Aiven, you can create these tables via the Aiven console or by connecting to the database with psql and running the statements above.  The application will not auto‑provision tables for you; missing tables will result in runtime errors.

## WhatsApp template setup

1. **Create a WhatsApp Business App** in the Meta Developer dashboard and obtain a **System User token** with the `whatsapp_business_messaging` permission.
2. Locate your **phone number ID** (not the WABA ID) from the WhatsApp settings in the Facebook dashboard.
3. Create an **authentication template** named `otp3` in **English (US)**.  This template should include:

   - Two **body** parameters: the first for the OTP code and the second for the buyer’s phone number.  For example, the body text might read:

     ```
     Your verification code is {{1}}. To continue your order, reply with the code.  You can also reach us at {{2}}.
     ```

   - A **URL button** (index `0`, sub‑type `url`) whose parameter will be the OTP code.  WhatsApp will substitute this parameter into the dynamic part of your template’s URL.

   - A **Copy Code button** (index `1`, sub‑type `copy_code`) whose parameter is again the OTP code.  This adds a “Copy code” button to the message so the user can easily copy the code to their clipboard.

   The template must be approved before use.  Authentication templates are designed specifically for one‑time passcodes and must follow Meta’s restrictions: codes should be 4–8 digits, no media, no URLs or emojis in the body, and short parameters【849226719754963†L590-L604】.  Example templates often read “`{{1}} is your verification code`”【849226719754963†L612-L619】.
4. In a development environment, the WhatsApp Cloud API is in **test mode**.  Only numbers that you explicitly add to the “Allowed recipients” list can receive messages.  Add your own phone number under **Send and receive messages → Manage phone number list** in the WhatsApp configuration page.

## Endpoints

All endpoints enforce CORS based on `ALLOWED_ORIGINS` and return JSON.  HTTP‑only cookies are used to store the JWT on successful verification.

### `POST /api/otp/start`

Starts an OTP challenge.

- **Request body:** `{ cartId: string, phone: string }`
- **Normalization:** The phone number is normalized to E.164 using `libphonenumber-js`.  Invalid numbers are rejected.
- **Rate limits:** IP and phone are limited to **3 requests/minute** and **10 requests/hour**.  Excessive requests return HTTP 429.
- **OTP generation:** A new 6‑digit code is generated and hashed with HMAC‑SHA256.  The record is persisted in the `otp` database table with columns `{ cart_id, phone_e164, code_hash, attempts, created_at, expires_at, resend_at, request_ip }`.  Records expire after 5 minutes (the API enforces expiry and cleans up on retrieval).
- **Cooldown:** Sending a new code is blocked for 45 seconds (`resendAt`).  If an attempt is made before the cooldown expires, the API returns HTTP 429 with `{ challengeId, resendAt }`.
- **Response:** On success, returns `{ challengeId, resendAt }` with HTTP 200.

### `POST /api/otp/verify`

Verifies the user‑submitted code.

- **Request body:** `{ cartId: string, code: string }`
- **Rate limits:** IP‑based rate limiting to prevent brute force.  Too many requests return HTTP 429.
- **Locking:** Each OTP allows up to **5 attempts**.  After 5 invalid attempts the cart is locked for 15 minutes (HTTP 423).
- **Expiry:** Codes expire after 5 minutes (HTTP 410 if expired).
- **Verification:** Uses constant‑time comparison via `crypto.timingSafeEqual`.  On success, deletes the OTP record and inserts a row into the `verified` table for the cart with the buyer’s phone number.  The verification record is valid for 30 minutes.
- **Response:** Returns `{ token }` and sets a cookie `otp_token` with the JWT (HTTP‑only, Secure, SameSite=Strict).  If invalid, returns HTTP 401.

### `POST /api/checkout-url`

Returns the Shopify checkout URL **only** if the cart has been verified.

- **Authentication:** Expects the JWT in the `otp_token` cookie or an `Authorization: Bearer <token>` header.  Tokens are validated and must contain the same `cartId` as the request.
- **Verification flag:** Looks up the `verified` record for the cart in the database.  If no verification record exists or it has expired, the endpoint returns HTTP 403.
- **Fetch checkout URL:** Queries Shopify’s Storefront API for the cart’s `checkoutUrl` via `cart(id) { checkoutUrl }`.  Shopify’s documentation notes that the checkout URL should be requested only when the buyer is ready to navigate to checkout and can be re‑requested if it becomes stale【237957259981077†L2455-L2463】.
- **Response:** `{ checkoutUrl }` with HTTP 200.

### `GET /health`

Simple health check returning `{ ok: true }`.

## Hydrogen integration

In your Hydrogen cart UI, call the OTP endpoints as follows.  Replace `https://<vercel-app>` with your deployed Vercel URL.

```js
// Start OTP challenge
async function startOtp(cartId, phone) {
  const res = await fetch('https://<vercel-app>/api/otp/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartId, phone })
  });
  if (!res.ok) throw new Error('Failed to start OTP');
  return res.json(); // { challengeId, resendAt }
}

// Verify OTP
async function verifyOtp(cartId, code) {
  const res = await fetch('https://<vercel-app>/api/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // include cookie
    body: JSON.stringify({ cartId, code })
  });
  if (!res.ok) throw new Error('Invalid or expired code');
  return res.json(); // { token }
}

// Get checkout URL
async function getCheckoutUrl(cartId) {
  const res = await fetch('https://<vercel-app>/api/checkout-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ cartId })
  });
  if (!res.ok) throw new Error('Not verified');
  const { checkoutUrl } = await res.json();
  window.location.href = checkoutUrl;
}
```

## Running locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file (see [Environment variables](#environment-variables)) with your credentials.

3. Start the development server:

   ```bash
   npm run dev
   ```

   The API will be available at `http://localhost:3000`.

4. Use a tool like **ngrok** or Vercel’s preview deployments to expose your local server for WhatsApp callbacks (if you plan to handle callbacks; this project only sends messages).

## Deployment on Vercel

1. Push this repository to your Git provider (GitHub/GitLab).  Import it into Vercel as a **Next.js** project.
2. Configure the environment variables in the Vercel dashboard under **Settings → Environment Variables**.  Make sure to include all secrets listed above.
3. Deploy.  Vercel will build the project and expose your API endpoints at `https://<your-vercel-domain>/api/...`.

## Curl examples

Start a challenge:

```bash
curl -X POST https://<vercel-app>/api/otp/start \
  -H 'Content-Type: application/json' \
  -d '{"cartId":"gid://shopify/Cart/...","phone":"+96170123456"}'
```

Verify a code (replace `<code>` with the received 6‑digit number):

```bash
curl -X POST https://<vercel-app>/api/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"cartId":"gid://shopify/Cart/...","code":"<code>"}' \
  -c cookies.txt -b cookies.txt
```

Retrieve checkout URL (requires cookie or token):

```bash
curl -X POST https://<vercel-app>/api/checkout-url \
  -H 'Content-Type: application/json' \
  -d '{"cartId":"gid://shopify/Cart/..."}' \
  -b cookies.txt
```

## Notes

- **No client‑side bypass:** The only way to retrieve the checkout URL is via the `/api/checkout-url` endpoint after verifying the OTP.  Direct calls to Shopify are never exposed to the client.
- **Stateless client:** OTP state, resend cooldowns, attempt counts and verification flags are persisted in the database.  The client only holds a short‑lived JWT in a secure cookie.
- **Security:** OTPs are never logged or stored in plain text.  Hashing is performed with HMAC‑SHA256 using a secret from your environment.  Rate limiting and cooldowns prevent abuse.  JWTs are signed with the same secret and include the cart ID and phone number.
- **Privacy:** Phone numbers are persisted only for the lifetime of the OTP (5 minutes) and the verification flag (30 minutes).  Logs contain the phone number in E.164 format solely for debugging.
- **Timezone:** All logs are timestamped in the Asia/Beirut timezone.
- **Internationalization:** Phone numbers are normalized to the E.164 format using `libphonenumber-js`.

## Further improvements

- **HMAC signature for requests:** You can include a shared secret header on incoming Hydrogen requests (`X-Hydrogen-Signature`) and validate it server‑side using `HMAC_SECRET` to prevent forged calls.
- **Cart snapshot:** To detect if a cart changes after verification, you could hash the cart contents at `/api/otp/start` and store it in the OTP record.  On `/api/checkout-url`, recompute the hash via the Storefront API and force re‑verification if the contents differ.
- **Multi‑language templates:** Create additional templates (e.g. `ar`) and pass the appropriate language code based on the user’s locale.

---

Feel free to adapt this implementation to suit your needs.  Contributions and suggestions are welcome!