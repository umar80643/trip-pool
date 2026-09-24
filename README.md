# TripPool 

A trip-planning app for groups — plan the trip, find places to stay and eat, discover top
attractions, and settle up shared expenses at the end. Settle Up is one feature among several:
it nets out every group member's balance and computes the minimum number of transactions
needed for everyone to get square, instead of showing a tangle of individual IOUs. 

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · PostgreSQL + Prisma ·
NextAuth (credentials) · Socket.io · Recharts · Vitest

## Getting started

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL and NEXTAUTH_SECRET
npx prisma migrate dev --name init
npm run seed              # optional: demo users + a sample group
npm run dev               # http://localhost:3000
```

Generate a `NEXTAUTH_SECRET` with `openssl rand -base64 32`.

Demo login (after `npm run seed`): `alice@example.com` / `password123` (also `bob@`, `carol@`).

## Project layout

```
prisma/schema.prisma        Database schema (see below)
prisma/seed.ts              Demo data
src/lib/money.ts            Integer-cents helpers (dollars<->cents, equal/weighted split math)
src/lib/splits.ts           Turns an expense + split mode into per-user cent amounts
src/lib/debt-simplification.ts   THE core algorithm — computeBalances + simplifyDebts
src/lib/places.ts            Explore data source: Nominatim geocoding + Overpass POI search
src/lib/itinerary.ts         Pure date-range/ordering helpers for the itinerary
src/lib/rate-limit.ts        In-memory rate limiter for login/signup/invite-accept
src/lib/tokens.ts            Cryptographically random tokens (invites, password reset, email verification)
src/lib/mailer.ts            Stub transactional email sender — single hook point for a real provider
src/lib/api-guard.ts         Auth/authorization helpers used by every API route
src/lib/realtime-emit.ts     Broadcasts events from API routes to the Socket.io server
src/lib/socket-client.ts     Client-side hook: useGroupRealtime(groupId, handlers)
src/server/dev-server.js     Custom Node server hosting Next.js + Socket.io together
src/app/api/**               REST-ish API routes (Next.js route handlers)
src/app/**                   Pages (login, signup, dashboard, group detail)
src/components/**            UI: dialogs, balances view, members panel, navbar, explore view, chat view, itinerary view, packing view
tests/**                     Vitest unit tests (run with `npm test`)
```

## Explore: stays, restaurants & top places to visit

Each trip (`Group`) can have a destination (`destinationName`/`destinationLat`/`destinationLon`).
Once set, the **Explore** tab on the group page searches OpenStreetMap for:

- **Places to stay** — hotels, guest houses, hostels, motels, apartments
- **Restaurants** — restaurants, cafes, fast food, pubs, bars
- **Top places to visit** — attractions, museums, galleries, viewpoints, historic sites,
  capped at 10 and ranked with places that have a Wikipedia/Wikidata tag (a proxy for
  "notable") ahead of undocumented ones, then by distance

This intentionally avoids Airbnb (no public listings-search API exists) and Google Places
(needs a billed API key). Geocoding uses Nominatim, POI search uses Overpass — both free,
keyless OpenStreetMap services. See `src/lib/places.ts` for the query logic and
`GET /api/groups/:groupId/explore?category=stay|restaurant|attraction` for the endpoint.
Members can bookmark results; bookmarks are stored in `SavedPlace` and synced live to the
group like everything else (`place:saved` / `place:removed` socket events).

If you outgrow OSM's rate limits or want ratings/photos, swap the fetch calls in
`src/lib/places.ts` for a keyed provider (Google Places, Foursquare, etc.) — the rest of the
app only depends on the `Place` type it returns, so nothing else needs to change.

## Trip chat

A simple group chat per trip (`ChatMessage` model), live via the same Socket.io connection
used everywhere else (`chat:message` event). `GET /api/groups/:groupId/chat` returns the most
recent 50 messages in chronological order; pass `?before=<ISO timestamp>` to page further back.
`POST` sends a message (max 2000 chars) and broadcasts it to everyone currently in the group's
realtime room. See `src/components/ChatView.tsx` for the UI (auto-scroll, load-earlier, optimistic
draft that's restored if sending fails).

## Itinerary

Each trip has optional `startDate`/`endDate` (`PATCH /api/groups/:groupId/dates`); once set, the
**Itinerary** tab (now the default landing tab for a trip) shows one day-tab per calendar day
(`src/lib/itinerary.ts` computes the day list and validates the range — max 366 days, end can't
be before start). Members add items to a day (title, optional time and notes, optionally linked
to something already saved from Explore), reorder them with up/down within the day, and delete
them. Everything syncs live via `itinerary:created`/`itinerary:updated`/`itinerary:deleted`
socket events, same pattern as chat and explore.

## Packing list

Two lists per trip: **Shared** (anyone can add/check off — "First aid kit") and **Your list**
(personal items only you, or a group admin, can edit or check off — `PackingItem.assignedToId`
distinguishes the two). `GET /api/groups/:groupId/packing` only ever returns shared items plus
the requesting member's own personal ones — other members' personal lists are never sent to the
client at all, not just hidden in the UI. This includes the realtime layer: `packing:created`/
`updated`/`deleted` are only broadcast to the group's socket room for *shared* items — a personal
item's content never goes out over the socket to other members, even as a discarded payload. See
`src/components/PackingView.tsx`.

## Account recovery & email verification

- **Email verification**: signup generates a 24-hour token (`EmailVerificationToken`) and
  "sends" (see below) a link to `/verify-email/:token`, which confirms it and sets
  `User.emailVerifiedAt`. Unverified users see a resend banner on the dashboard
  (`EmailVerificationBanner` → `POST /api/auth/verify-email/resend`).
- **Password reset**: `/forgot-password` → `POST /api/auth/password-reset/request` generates a
  1-hour token (`PasswordResetToken`) and "sends" a link to `/reset-password/:token` →
  `POST /api/auth/password-reset/confirm` sets a new password. Both the request and resend
  endpoints always return the same generic message regardless of whether the email exists, to
  avoid leaking which addresses are registered.
- All of login, signup, verification-resend, and password-reset are rate-limited
  (`src/lib/rate-limit.ts`) — the reset-request endpoint is limited by IP *and* by account, so
  an attacker can't spam one victim's inbox from many source IPs.
- **Email is stubbed** (`src/lib/mailer.ts`) — it logs the message (including the link) to the
  server console instead of actually sending anything. Wire up a real provider (Resend,
  Postmark, SES, etc.) by replacing the body of `sendMail()`; nothing else needs to change.
- **Known limitation**: sessions are JWTs (`src/lib/auth.ts`), which can't be individually
  revoked server-side. Resetting a password doesn't sign the user out of other devices —
  switching to database-backed sessions would fix that if it matters for your use case.

## Security

A few things worth knowing if you're taking this further:

- **Socket.io connections are authenticated.** `src/server/dev-server.js` verifies the NextAuth
  session cookie on connect and re-checks group membership before letting a socket join a
  group's room, so live data (chat, expenses, saved places) can't leak to an unauthenticated
  or non-member client. The `activity` (presence) broadcast uses the authenticated session's
  name, not a client-supplied one, so it can't be used to spoof another member.
- **Invite tokens are cryptographically random** (`src/lib/tokens.ts`, 32 random bytes,
  base64url), not a `cuid()` — a cuid is collision-resistant, not designed to resist guessing,
  which matters for a bearer token that grants group access.
- **Rate limiting** on login (per email+IP), signup, and invite acceptance (`src/lib/rate-limit.ts`)
  to slow down credential stuffing and invite-token guessing. It's an in-memory fixed-window
  limiter — fine for this app's single-instance custom server, but swap it for a shared store
  (e.g. Redis) if you ever scale to multiple instances.
- **Baseline security headers** (`next.config.js`) — `X-Frame-Options`, `X-Content-Type-Options`,
  a `Referrer-Policy`, a `Permissions-Policy` that only allows geolocation for this origin (used
  by Explore's "Near me" search), a `Content-Security-Policy`, and (production only) HSTS.
  The CSP is environment-aware: dev allows `unsafe-eval`/`ws:` for webpack's hot reload, prod is
  stricter (`wss:` only, HSTS added). `script-src` still needs `'unsafe-inline'` for Next's
  hydration bootstrap script — tightening that to a nonce-based policy means touching
  `middleware.ts`, which is deliberately left alone here given CVE-2025-29927 (see below);
  worth a proper pass if this app is ever a real target.
- **Keep Next.js patched.** This app self-hosts via a custom server (`src/server/dev-server.js`)
  and uses `middleware.ts` to gate `/dashboard`, `/groups`, `/invite` — that combination was
  affected by CVE-2025-29927, a critical middleware-bypass vulnerability, fixed in 14.2.25.
  We're pinned to 14.2.35 (latest 14.x). Every API route also independently re-checks the
  session server-side (`requireUserId`/`requireGroupMember` in `src/lib/api-guard.ts`), so even
  a middleware bypass wouldn't expose group data — but don't rely on that as your only layer,
  and keep dependencies current (`npm audit`).
- **Not yet done, worth considering:** nonce-based CSP (drop `script-src 'unsafe-inline'`),
  moving rate-limit state to Redis for multi-instance deployments, 2FA, and periodic
  `npm audit` / Next.js major-version upgrades as the 14.x line reaches end of active
  maintenance.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request: install →
`prisma generate` → `npm run typecheck` (`tsc --noEmit`) → `npm run lint` → `npm test` → an
informational `npm audit` (non-blocking — see the Security section above for why). Runs are
cancelled automatically if superseded by a newer push to the same branch/PR.

## The debt-simplification algorithm

`src/lib/debt-simplification.ts` implements the greedy min-cash-flow heuristic described in
the brief: split members into creditors/debtors, sort each descending, repeatedly match the
largest debtor with the largest creditor, settle `min(debt, credit)`, and repeat. It produces
at most `n-1` transactions for `n` participants.

Two things it adds beyond the reference implementation:

- **`assertValidBalances`** — validates every balance is an integer number of cents and that
  they sum to exactly zero before doing anything else. If they don't, that's a bug upstream in
  how balances were computed (e.g. from a partial write), and `simplifyDebts` throws a
  `BalanceSumError` rather than silently producing a wrong settlement plan.
- **`computeBalances`** — turns raw expenses + splits + *confirmed* settlements into the
  `Balance[]` the algorithm consumes, so the algorithm itself stays a pure function that's easy
  to test in isolation.

### Tests (`npm test`)

`tests/debt-simplification.test.ts` covers every edge case called out in the brief:

- all balances zero → no settlements
- one creditor / multiple debtors, and the reverse
- balances that don't sum to zero → throws `BalanceSumError`
- non-integer cents → throws
- a 10–15 person **randomized stress test** (25 trials) asserting settlement count ≤ n−1 and
  that every settlement set nets each person back to their original balance exactly

`tests/splits.test.ts` covers equal/exact/percentage/shares splitting, including that a
$10.00 / 3-way equal split distributes the leftover cent deterministically ([334, 333, 333])
rather than losing it to floating-point rounding.

Run just these with:

```bash
npm test
```

## Money handling

Every amount is an integer number of cents, end to end — in the database (`Int` columns),
in the algorithm, and in transit over the API. `src/lib/money.ts` is the only place that
converts to/from a decimal string, and only for display or parsing raw form input. Never do
arithmetic on the formatted string form.

## Real-time sync

Expense/settlement/member changes broadcast over Socket.io to everyone viewing that group
(`src/lib/realtime-emit.ts` on the server, `useGroupRealtime` on the client). This requires a
**long-lived Node process** — `src/server/dev-server.js` hosts the Next.js request handler and
the Socket.io server side-by-side on one HTTP server.

**Deployment implication:** Vercel's default deployment model runs API routes as ephemeral
serverless functions, which can't hold a persistent WebSocket connection. To keep real-time
working in production you have two options:

1. Deploy the whole app (Next.js + custom server) to a platform that runs a persistent Node
   process — Railway, Render, Fly.io, a plain VM, etc. — using `npm run build && npm start`.
2. Keep the Next.js app on Vercel for everything else, and swap Socket.io for a hosted
   real-time service (Pusher or Ably, both mentioned as options in the brief) that Vercel's
   serverless functions can publish to over a plain HTTP request instead of holding a socket
   open themselves.

This is a design decision flagged for you rather than silently baked in.

## Deploying (option 1: single Node host)

```bash
npm run build
DATABASE_URL=... NEXTAUTH_URL=... NEXTAUTH_SECRET=... npm start
```

Provision Postgres via Neon or Supabase, put the connection string in `DATABASE_URL`, and run
`npx prisma migrate deploy` against it before starting the app.

## What's stubbed vs. wired up

- **Auth:** email/password (credentials) is fully wired. Magic-link email auth is not — the
  invite-by-email flow creates a token but doesn't send an email; hook a provider like Resend
  or Postmark into `POST /api/groups/[groupId]/invites` where the comment marks the spot.
- **Everything else in the brief** — groups, invites (link + email-restricted), all four split
  modes, edit/delete permissions (payer or admin), the debt-simplification engine with its
  simplified/detailed toggle, mark-as-paid with receiver confirmation, historical ledger,
  real-time sync, and the cross-group dashboard with category/time charts — is implemented.
