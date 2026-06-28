# Band Invoice

A small, polished invoice generator for bands. **You** (the admin) create a
prefilled, tokenized link for each gig and send it to a bandmate. They unlock it
with a shared password, fill in only their own details, generate a clean
one-page PDF, and hand it off to their own email app — **the app never touches
anyone's email account.**

- **Stack:** Next.js 14 (App Router) · React · TypeScript · Tailwind CSS ·
  `@react-pdf/renderer` · Zod
- **Storage:** simple JSON file (`./data/gigs.json`) — easy to swap for a DB
- **Auth:** server-side passwords, HMAC-signed session cookies, rate limiting
- **Admin dashboard:** create/revoke links and track who has submitted per gig
- **No Gmail API, no OAuth, no email permissions**

---

## How it works

```
Admin (/admin)                Bandmate (/i/<token>?k=...)
─────────────                 ──────────────────────────
sign in with ADMIN_PASSWORD   1. open link → auto-unlocked (no typing)
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

# 4. Edit .env.local — set BAND_PASSWORD, ADMIN_PASSWORD, SESSION_SECRET, base URL

# 5. Run it
npm run dev          # http://localhost:3000
```

Then:

1. Go to **/admin**, sign in with `ADMIN_PASSWORD`, and create a link.
2. Send the link to a bandmate.
3. They open it, type the `BAND_PASSWORD`, fill in their details, and send you
   the invoice.

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
| `ADMIN_PASSWORD`       | yes      | Your password for `/admin` (link creation)           |
| `SESSION_SECRET`       | yes      | Secret used to sign session cookies (32+ random bytes) |
| `NEXT_PUBLIC_BASE_URL` | prod     | Public base URL used to build share links            |
| `UPSTASH_REDIS_REST_URL`   | prod | Upstash Redis REST URL (enables the Redis store)   |
| `UPSTASH_REDIS_REST_TOKEN` | prod | Upstash Redis REST token                           |
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

- **Server-side auth.** The shared and admin passwords are checked on the server
  (constant-time compare). The bandmate form HTML and gig details are **not sent
  until the password is verified** — the `/i/<token>` page renders only the
  password gate otherwise.
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
│  ├─ admin/page.tsx              # admin login + create/list links (client)
│  ├─ i/[token]/
│  │  ├─ page.tsx                 # server gate: 404 / password / form
│  │  ├─ PasswordGate.tsx         # shared-password screen (client)
│  │  └─ InvoiceForm.tsx          # prefilled form + PDF + email handoff (client)
│  └─ api/
│     ├─ admin/login/route.ts     # POST admin password → cookie
│     ├─ admin/links/route.ts     # POST create link · GET list (admin only)
│     ├─ auth/login/route.ts      # POST shared password → cookie
│     └─ invoice/[token]/pdf/route.ts  # POST → server-rendered PDF
└─ lib/
   ├─ config.ts                   # validated env access
   ├─ types.ts                    # Gig / BandmateInput
   ├─ store.ts                    # JSON file store (swap for a DB)
   ├─ auth.ts                     # signed cookies + password compare
   ├─ ratelimit.ts                # in-memory rate limiter
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
vercel env add ADMIN_PASSWORD
vercel env add BAND_PASSWORD
vercel env add SESSION_SECRET            # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
vercel env add NEXT_PUBLIC_BASE_URL      # e.g. https://your-app.vercel.app

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
