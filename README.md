# WONDERvoice

A small, polished invoice platform for bands. Signed-in users create
prefilled, tokenized links for each gig and send them to bandmates. Bandmates
unlock a link with a shared password, fill in only their own details, generate
a clean one-page PDF, and hand it off to their own email app — **the app never
touches anyone's email account.**

- **Stack:** Next.js 15 (App Router) · React · TypeScript · Tailwind CSS ·
  `@react-pdf/renderer` · Zod
- **Storage:** Upstash Redis in production, JSON files in dev
- **Auth:** Google sign-in for bookkeeping users (allowlist managed by the
  super admin); bandmate links stay anonymous (shared password / unlock key),
  HMAC-signed session cookies, rate limiting
- **Multi-user:** each user has their own links and submissions
- **Local library mode:** run the same app on your own computer to organize
  every invoice into a folder you control (e.g. inside Google Drive)

---

## How it works

```
User (/admin)                 Bandmate (/i/<token>?k=...)
─────────────                 ──────────────────────────
sign in with Google           1. open link → auto-unlocked (no typing)
enter gig details             2. see prefilled form (gig details locked in)
create link  ────────────►    3. fill in their own details
copy + send link              4. Generate invoice → PDF (server-rendered)
                              5. Download PDF
                              6. Open Gmail / mail app (To: you, Cc: them)
                              7. Attach the PDF manually + send
```

The gig details live server-side, keyed by an unguessable token in the URL — the
URL contains **no editable invoice data**. When a bandmate generates an invoice,
a **minimal** record (name, email, invoice #, amount, timestamp) is saved so you
can track submissions; their address, tax number and notes are **never written to
disk** and live only in the PDF.

### Unlocking the link

Each share link carries a **per-link unlock key** (`?k=...`) — an HMAC unique to
that gig. The server verifies it and silently swaps it for a session cookie, so
bandmates don't type anything. This is safe to put in the URL because:

- It's **per-link**: a leaked link only exposes that one gig (and you can revoke
  it by deleting the gig), unlike the global shared password.
- The **global `BAND_PASSWORD` never appears in any URL**, so it can't end up in
  access logs, browser history, or link previews.

If a link is opened without a valid key, it falls back to the typed
`BAND_PASSWORD` gate. (See "Why not put the password in the URL?" below.)

---

## Setup

Requires Node 18.17+ (built and tested on Node 22).

```bash
# 1. Install dependencies
npm install

# 2. Create your env file
cp .env.example .env.local

# 3. Generate a session secret and paste it into .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Edit .env.local — set BAND_PASSWORD, SESSION_SECRET, base URL,
#    GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, SUPER_ADMIN_EMAIL

# 5. Run it
npm run dev          # http://localhost:3000
```

### Google OAuth client

The bookkeeping side signs in with Google. One-time setup in
[Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Create a project (or reuse one) → **APIs & Services → Credentials** →
   **Create credentials → OAuth client ID → Web application**.
2. Add **Authorized redirect URIs** for every host you run on:
   - `http://localhost:3000/api/auth/google/callback` (dev)
   - `https://your-domain/api/auth/google/callback` (production)
3. Copy the client ID/secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Then:

1. Go to **/admin** and sign in with the Google account set as
   `SUPER_ADMIN_EMAIL`. Create a link.
2. Send the link to a bandmate.
3. They open it, get auto-unlocked (or type the `BAND_PASSWORD`), fill in their
   details, and send you the invoice.

### Multiple users

The super admin sees an **Authorized users** card on `/admin`. Add a friend's
Google email there and they can sign in and run their own invoice links —
their gigs, links and submissions are completely separate from yours. Remove
them and they're locked out immediately (their sync token is revoked too).
Anyone signing in with an email that isn't allowed sees a "not authorized"
screen and gets no session.

### Local invoice library (`pnpm local`)

The same codebase doubles as a **local invoice organizer** that keeps every
invoice as a PDF in a folder on *your* machine — point it at a folder inside
Google Drive/Dropbox and you get cloud backup on your own terms. Invoices
generated through your links are pulled down automatically; you can also
upload arbitrary invoice PDFs by hand.

1. On the deployed site, open `/admin` → **Local sync** → **Generate sync
   token** and copy the `mis_…` token (shown once).
2. On your computer, in a checkout of this repo, add to `.env.local`:
   ```bash
   REMOTE_SYNC_URL="https://your-app.vercel.app"
   REMOTE_SYNC_TOKEN="mis_..."
   # BAND_PASSWORD / SESSION_SECRET can be dummy values in local mode
   ```
3. Run `pnpm local` → opens on `http://127.0.0.1:3999` and redirects to
   **/library**. On first run it asks you to pick your invoice folder —
   browse or type a path (new folders are created for you); change it later
   via the "Change" link in the header. Setting `INVOICE_DIR` in `.env.local`
   also works and is used until you pick one in the app.
4. Press **Sync now** to pull new invoices (the app also auto-syncs every 5
   minutes). Invoices are filed as
   `Inbound|Outbound/<year>/<event-date event-name>/<filename>.pdf`; manual
   uploads without an event go to `Inbound/_uploads/<year>/`. The
   `manifest.json` index and `contacts.json` live inside the folder, so they
   travel with it. PDFs dropped into the folder by hand show up under "Found
   in folder" for one-click indexing.

The library is a full bookkeeping view:

- **Inbound & outbound** — invoices submitted through your links (or uploaded)
  are Inbound; **New outbound invoice** generates a PDF from your business to
  a client (set "Your business details" once in the app), filed under
  Outbound, with a prefilled email draft to send it.
- **Invoice links from the app** — **New invoice link** creates bandmate links
  on your server through the sync token, no browser sign-in needed.
- **Contacts** — a contact card is auto-created for every sender/client;
  filter the library by contact, direction, or paid status.
- **Fulfillment** — attach a payment receipt (any file type) to an invoice
  row; it's stored next to the invoice PDF as `Receipt - …` and the row is
  marked paid. Rows can also be marked paid without a receipt, and inbound
  rows have a "Mark emailed" toggle to track whether the sender emailed the
  invoice in.

The server keeps a generated PDF (flagged pending, 30-day expiry) only until
your local app confirms it has been written to your folder — then it's deleted
from the server. The local pages and `/api/local/*` routes only exist when
`LOCAL_MODE=1` and never on Vercel; the local server binds to `127.0.0.1`.

The server URL and sync token can also be entered directly in the app (the
"Connect to your server" card) instead of `.env.local` — that's how the
desktop app is configured, since it has no env file.

### Desktop app (Electron)

The library also ships as a double-clickable desktop app — the same Next.js
app in local mode, wrapped in a thin Electron shell that boots the server on a
random loopback port and opens a window. Nothing about the deployed site
changes; to the server the app is just another sync client.

```bash
pnpm app:build        # → electron/dist/WONDERvoice-1.0.0-arm64.dmg (+ x64, zip)
pnpm app:dev          # dev shell against a running `pnpm local`
```

To hand it to a friend, they need: the dmg, and their own sync token
(generated on the website under /admin → Local sync after you add them as a
user). First launch on macOS: the app is unsigned, so **right-click → Open**
to get past Gatekeeper (one time only). On first run the app asks for their
invoice folder (native folder dialog) and the server URL + token — no env
files, no terminal. App data lives in `~/Library/Application Support/WONDERvoice`.

All Electron code is isolated in `electron/` with its own dependencies; the
root project and the Vercel deployment are untouched by it.

### Production

```bash
npm run build
npm run start
```

Set `NEXT_PUBLIC_BASE_URL` to your real domain so generated links are correct.

---

## Environment variables

| Variable               | Required | Purpose                                              |
| ---------------------- | -------- | ---------------------------------------------------- |
| `BAND_PASSWORD`        | yes      | Shared password every bandmate types to unlock a link |
| `SESSION_SECRET`       | yes      | Secret used to sign session cookies (32+ random bytes) |
| `GOOGLE_CLIENT_ID`     | yes      | Google OAuth web client ID (bookkeeping sign-in)     |
| `GOOGLE_CLIENT_SECRET` | yes      | Google OAuth client secret                           |
| `SUPER_ADMIN_EMAIL`    | yes      | Google account that manages the user allowlist       |
| `NEXT_PUBLIC_BASE_URL` | prod     | Public base URL used to build share links + OAuth redirect |
| `UPSTASH_REDIS_REST_URL`   | prod | Upstash Redis REST URL (enables the Redis store)   |
| `UPSTASH_REDIS_REST_TOKEN` | prod | Upstash Redis REST token                           |
| `LOCAL_MODE`           | local    | `1` → run as the local invoice library               |
| `INVOICE_DIR`          | no       | Invoice folder default; usually picked in the app instead |
| `REMOTE_SYNC_URL`      | local    | Deployed server the local app pulls invoices from    |
| `REMOTE_SYNC_TOKEN`    | local    | Personal `mis_…` token generated on `/admin`         |
| `BUSINESS_NAME`        | no       | Your business name — prefills the admin form         |
| `BUSINESS_CONTACT`     | no       | Contact person — prefills the admin form             |
| `BUSINESS_ADDRESS`     | no       | Your address (use `\n` for line breaks)              |
| `BUSINESS_PHONE`       | no       | Your phone number                                    |
| `BUSINESS_EMAIL`       | no       | Your business email (where invoices are sent)        |

> **Storage auto-detect:** if `UPSTASH_REDIS_REST_URL` is set, the app uses
> Upstash Redis; otherwise it falls back to the local JSON file. So local dev
> needs nothing extra, and production just needs the two Upstash vars.

---

## Security notes

- **Server-side auth.** Bookkeeping users authenticate via the Google OAuth
  code flow (random `state` cookie, constant-time compare, identity fetched
  from Google's `userinfo` endpoint, `email_verified` required) and are only
  admitted if on the allowlist — which is re-checked on **every** request, so
  removing a user locks them out immediately. The bandmate shared password is
  checked on the server (constant-time compare); the bandmate form HTML and gig
  details are **not sent until the password is verified** — the `/i/<token>`
  page renders only the password gate otherwise.
- **Per-user isolation.** Every gig is owned by the user who created it; the
  API refuses to list or revoke another user's links, and sync endpoints 404 on
  foreign invoice ids.
- **Sync tokens.** The local app authenticates with a personal 32-random-byte
  bearer token. Only its SHA-256 is stored; lookups are by hash. Regenerating
  or removing a user revokes it.
- **Tokenized links.** Tokens are 24 random bytes (base64url). No invoice data is
  carried in the URL.
- **Per-link unlock keys, not the global password.** The `?k=` value is an HMAC
  derived per-link. The shared `BAND_PASSWORD` is never placed in a URL.
- **Sessions.** Auth state is an HMAC-signed, `httpOnly`, `sameSite=lax` cookie
  (8-hour TTL). `secure` is enabled automatically in production.
- **Rate limiting.** Password attempts are throttled per-IP (in-memory fixed
  window): admin 5 / 5 min, bandmate 8 / 5 min. For multi-instance deployments,
  back this with Redis/Upstash.
- **Input validation.** All inputs are validated with Zod on the client *and* the
  server. If the admin locks the amount, the server overrides whatever the
  bandmate submits.
- **Data minimisation.** Admin-created gig details are persisted, plus a minimal
  per-submission record for tracking — **bandmate name, email, invoice number,
  amount, and timestamp only**. Address, tax number, payment method and notes are
  *not* stored; they exist only in the generated PDF. Revoking (deleting) a gig
  removes its submission records too.

---

## Why not put the shared password in the URL?

It's tempting to add `?pw=BAND_PASSWORD` so nobody types anything — but that's the
least safe option:

- Your share link **already** contains a secret (the token). Adding the password
  collapses the two factors into one — the link alone grants access.
- URLs leak into **server/proxy/CDN access logs, browser history, `Referer`
  headers, and chat link previews**. A leaked *token* burns one gig; a leaked
  **global password burns every link** until you rotate it everywhere.

The **per-link unlock key** (`?k=...`) gives the same zero-typing UX without those
downsides: it's unique per gig, revocable, and the global password stays out of
every URL. That's what this app uses.

## ⚠️ Limitation: attaching the PDF to Gmail automatically

**Browsers and Gmail deliberately cannot pre-attach a file to an outgoing email
from a web link.** Neither `mailto:` nor the Gmail web compose URL
(`https://mail.google.com/mail/?view=cm&...`) supports an attachment parameter —
this is a privacy/security restriction, not something a different library or
trick gets around. (The only ways to truly auto-attach are the Gmail API + OAuth
or sending the mail from your own server — both explicitly ruled out here.)

**The safest practical alternative — and what this app does:**

1. Generate the PDF **server-side** and give the bandmate a one-tap **Download**
   button (correct filename, e.g. `Invoice - Jane Doe - Summer Fest - 2026-06-28.pdf`).
2. Offer a prefilled email with one tap:
   - **Open in Gmail** → Gmail web compose, prefilled **To / Cc / Subject / Body**.
   - **Open default mail app** → `mailto:` for the Gmail mobile app or any other
     client.
3. Show a clear, unmissable instruction to **attach the downloaded PDF using the
   paperclip button, then send.**

The email is prefilled to go to **both** you (To) and the bandmate (Cc), so
everyone keeps a copy:

```
To:      <your email>
Cc:      <bandmate's email>
Subject: Invoice - <Bandmate Name> - <Event Name>
Body:    Hi, attached is my invoice for <Event Name> on <Date>. Thanks, <Name>
```

> On mobile, the flow is: tap **Download** (saves to Files/Downloads) → tap
> **Open in Gmail / mail app** → tap the paperclip → pick the just-downloaded
> PDF → send.

---

## Project structure

```
src/
├─ app/
│  ├─ layout.tsx                  # root layout, mobile viewport
│  ├─ page.tsx                    # landing / pointer to /admin
│  ├─ globals.css                 # Tailwind + base styles
│  ├─ admin/                      # Google sign-in + create/list links,
│  │                              #   user management, sync token (client)
│  ├─ library/                    # local-mode invoice library UI
│  ├─ i/[token]/
│  │  ├─ page.tsx                 # server gate: 404 / password / form
│  │  ├─ PasswordGate.tsx         # shared-password screen (client)
│  │  └─ InvoiceForm.tsx          # prefilled form + PDF + email handoff (client)
│  └─ api/
│     ├─ auth/google/…            # Google OAuth flow (login + callback)
│     ├─ auth/logout/route.ts     # POST → clear user session
│     ├─ auth/login/route.ts      # POST shared band password → cookie
│     ├─ admin/links/route.ts     # create / list / revoke links (per user)
│     ├─ admin/users/route.ts     # allowlist management (super admin)
│     ├─ admin/sync-token/route.ts# personal sync token for the local app
│     ├─ sync/…                   # Bearer-token API the local app pulls from
│     ├─ local/…                  # local-mode-only library + sync-pull routes
│     └─ invoice/[token]/pdf/route.ts  # POST → server-rendered PDF
└─ lib/
   ├─ config.ts                   # validated env access
   ├─ types.ts                    # Gig / AllowedUser / PendingInvoice / …
   ├─ store.ts                    # storage facade (Redis or JSON backend)
   ├─ auth.ts                     # signed cookies, user sessions, allowlist check
   ├─ sync-auth.ts                # Bearer sync-token resolution
   ├─ library.ts                  # local folder database (manifest + files)
   ├─ ratelimit.ts                # rate limiter (Redis or in-memory)
   ├─ validation.ts               # Zod schemas
   ├─ format.ts                   # money/date/filename helpers
   ├─ email-links.ts              # mailto + Gmail compose builders
   └─ pdf.tsx                     # @react-pdf/renderer invoice document
```

---

## Deploying to Vercel

Vercel's filesystem is read-only/ephemeral, so the app uses **Upstash Redis** in
production (auto-detected from env). Steps:

### 1. Create an Upstash Redis database

Easiest via the Vercel Marketplace (it wires the env vars in for you):

- Vercel dashboard → **Storage** → **Marketplace** → **Upstash** → create a Redis
  database and connect it to your project. This injects `UPSTASH_REDIS_REST_URL`
  and `UPSTASH_REDIS_REST_TOKEN` automatically.

(Or create a free DB at [upstash.com](https://upstash.com) and copy the two REST
values into the env vars below yourself.)

### 2. Deploy with the Vercel CLI

```bash
npm i -g vercel        # install the CLI
vercel login           # log into YOUR Vercel account
vercel link            # link this folder to a Vercel project

# Add the secrets (run each, paste the value, choose Production — and Preview if
# you want preview deploys to work):
vercel env add BAND_PASSWORD
vercel env add SESSION_SECRET            # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
vercel env add NEXT_PUBLIC_BASE_URL      # e.g. https://your-app.vercel.app
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
vercel env add SUPER_ADMIN_EMAIL

# If you did NOT use the Marketplace integration, also add:
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN

vercel --prod          # build & deploy to production
```

> After the first deploy you'll get the real domain. Set `NEXT_PUBLIC_BASE_URL`
> to it (re-run `vercel env add` / update it in the dashboard) and redeploy so
> generated share links use the correct host.

### Adding another storage backend

The app depends only on the five functions in `src/lib/store.ts`
(`getGig`, `saveGig`, `listGigs`, `addSubmission`, `deleteGig`). To use Postgres,
SQLite (Turso), etc., add a `store-<x>.ts` implementing those and branch to it in
`store.ts`. For self-hosting on a VPS/Railway/Fly.io with a persistent disk, the
JSON store works as-is — just don't set the Upstash vars.
```
