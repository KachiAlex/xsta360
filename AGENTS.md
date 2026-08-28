<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Xsta360 — Project Guide

## What this is
A multi-tenant sales management app: leads, remarks, follow-up reminders, pipeline board, source attribution, and team management. Built from the PRD in the repo root.

## Stack
- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Tailwind CSS v4** (CSS-based `@theme` config in `src/app/globals.css`)
- **Postgres** + **Drizzle ORM** (`src/db/schema.ts`)
- **jose** for JWT session cookies, **bcryptjs** for passwords
- **zod** for validation, **nanoid** for tokens

## Commands
```bash
pnpm dev          # dev server (http://localhost:3000)
pnpm build        # production build
pnpm start        # serve production build
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm db:push      # push schema to DB (creates/updates tables)
pnpm db:studio    # drizzle studio (DB GUI)
pnpm db:seed      # seed demo data (see below)
pnpm db:seed-admin # seed superadmin + default plans (see below)
```

## Environment
Copy `.env.example` to `.env.local` and fill in:
- `DATABASE_URL` — Postgres connection string
- `SESSION_SECRET` — 32+ char random string (JWT signing)
- `APP_URL` — public base URL
- `RESEND_API_KEY` — optional; if unset, reminder emails log to console
- `EMAIL_FROM` — from address for transactional email
- `CRON_SECRET` — shared secret for the `/api/cron/reminders` and `/api/cron/billing` endpoints
- `PAYSTACK_SECRET_KEY` — Paystack secret key (sk_test_... or sk_live_...)
- `PAYSTACK_PUBLIC_KEY` — Paystack public key (pk_test_... or pk_live_...)

## Seed data
```bash
pnpm db:push   # create tables first
pnpm db:seed   # creates demo org + rep + leads matching the mockup
```
Login: `tunde@kreatix.com` / `password123`

## Superadmin (platform admin)
```bash
pnpm db:push       # create tables first
pnpm db:seed-admin # creates superadmin + default plans (Starter, Pro, Enterprise)
```
Superadmin login: `admin@kreatix.tech` / `Kreatix2026!`
Override via env: `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_NAME`
Superadmins access `/admin` — manage orgs, users, plans, subscriptions.
On server: `docker exec -e SKIP_SERVER_ONLY=1 xsta360-app-1 npx tsx src/db/seed-admin.ts`

## Billing (Paystack)
Hybrid per-seat pricing: base fee (₦1000/mo for admin) + per-seat (₦500/mo per additional member).
- Workspace admins pay via `/billing` → Paystack checkout
- Authorization code saved for recurring charges (no card details stored)
- Monthly cron: `curl -H "Authorization: Bearer $CRON_SECRET" http://xsta360.67-211-210-8.sslip.io/api/cron/billing`
- Webhook: `POST /api/webhooks/paystack` (set webhook URL in Paystack dashboard)
- Paystack dashboard: https://dashboard.paystack.com

## Architecture
- **Multi-tenant**: every table has `orgId`; all queries filter by the session's org.
- **Auth**: email/password → JWT in httpOnly cookie (`src/lib/session.ts`). DAL in `src/lib/dal.ts` (`verifySession`, `requireAuth`, `requireRole`, `can`).
- **Roles**: `admin | manager | rep` on the membership row.
- **Server Actions**: `src/app/actions/` — every action re-verifies the session + org scope.
- **Proxy** (Next 16 middleware): `src/proxy.ts` — optimistic auth redirects for protected routes.
- **Audit log**: `audit_events` table; `src/lib/audit.ts` `logEvent()` helper called on every mutation.

## Key directories
```
src/
  app/
    (auth)/        — login + signup (public)
    (app)/         — dashboard, pipeline, leads, reports, settings (protected)
    actions/       — server actions (auth, leads, team, org, import)
    api/
      cron/reminders/  — reminder email delivery (hit by external cron)
      embed/           — public embeddable form endpoint
  components/
    ui/            — primitives (Button, Badge, Modal, Panel, Field, HeatDot)
    app/           — app-specific (Sidebar, Topbar, AddLeadModal, LogRemarkModal, PipelineBoard, ...)
  db/
    schema.ts      — full Drizzle schema
    index.ts       — db client
    seed.ts        — demo data
  lib/
    session.ts     — JWT cookie session
    dal.ts         — data access layer (auth + roles)
    audit.ts       — event logging
    queries.ts     — org-scoped helpers (stages, members, lost reasons)
    dashboard.ts   — Today's Follow-Ups + stat strip queries
    leads.ts       — leads list query
    lead-detail.ts — lead detail + history timeline
    pipeline.ts    — kanban board query
    reports.ts     — source attribution + per-rep stats
    email.ts       — transactional email (Resend or console)
```

## Reminder cron
The `/api/cron/reminders` route scans due reminders and sends emails. Hit it with:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://xsta360.67-211-210-8.sslip.io/api/cron/reminders
```
Set up an external scheduler (e.g. cron-job.org) to hit this every 5-10 minutes.

## Server deployment (Docker)

The app runs in Docker on `67.211.210.8` with Postgres + Next.js containers.

**Architecture:**
- `xsta360-db-1` — Postgres 16 (internal Docker network only)
- `xsta360-app-1` — Next.js app (exposed on `127.0.0.1:3009`)
- Host nginx reverse proxy → `http://xsta360.67-211-210-8.sslip.io`

**URL:** http://xsta360.67-211-210-8.sslip.io
**Login:** tunde@kreatix.com / password123

**Server files:**
- `/opt/xsta360/` — project repo (cloned from GitHub)
- `/opt/xsta360/.env` — environment variables (secrets, not in git)
- `/etc/nginx/sites-available/xsta360` — nginx config

**Deploy/update workflow:**
```bash
ssh root@67.211.210.8
cd /opt/xsta360
git pull
docker compose build
docker compose up -d
# Check logs:
docker logs xsta360-app-1 -f
```

**Run seed (if needed):**
```bash
docker exec -e SKIP_SERVER_ONLY=1 xsta360-app-1 npx tsx src/db/seed.ts
```

## Vercel frontend setup

To deploy the frontend on Vercel (connecting to the server's Postgres):

1. Import the repo from https://github.com/KachiAlex/xsta360 in Vercel
2. Set environment variables in Vercel:
   - `DATABASE_URL` = `postgresql://xsta360:281a0e36d2886003bf8b46f22ed1cea0527a1cfd5f2ffd21@67.211.210.8:5432/xsta360`
   - `SESSION_SECRET` = (same as server)
   - `APP_URL` = your Vercel URL
   - `CRON_SECRET` = (same as server)
3. Deploy

**Note:** For Vercel to reach the server's Postgres, port 5432 must be exposed externally. Currently it's bound to `127.0.0.1` only. To expose it:
- Change the docker-compose `db` service ports to `"0.0.0.0:5432:5432"` (or a custom port)
- Or use a tool like `socat` / SSH tunnel
- Or use a managed Postgres (Neon/Supabase) and point both the server and Vercel to it

**Alternative (recommended):** Run the full app on the server (current setup) and use Vercel only for the marketing homepage. The app at `http://xsta360.67-211-210-8.sslip.io` is already fully functional.

## Next.js 16 notes
- Middleware is now **Proxy** (`proxy.ts`, not `middleware.ts`).
- `cookies()` is async (`await cookies()`).
- `params` and `searchParams` in pages are **Promises** (must `await`).
- Server Actions use `useActionState` (React 19).

## Mobile app (Android, Capacitor)

The Android app is a thin Capacitor wrapper around the deployed web app. It loads from the VPS server (`http://xsta360.67-211-210-8.sslip.io`), so all backend/database calls go to the same server as the web app.

**Architecture:**
- `capacitor.config.ts` — Capacitor config (appId: `com.xsta360.app`)
- `out/index.html` — local splash screen (animated logo, 3s, then redirects to VPS `/login`)
- `android/` — native Android project (Gradle)

**Splash screen flow:**
1. App launches → native dark splash (`#1e2a22`) shows instantly
2. `out/index.html` loads → animated XSTA360 logo with pulsing amber dot + loading bar
3. After 3 seconds → fades out → redirects to `http://xsta360.67-211-210-8.sslip.io/login`
4. All subsequent navigation happens on the live web app

**Commands:**
```bash
pnpm mobile:copy     # copy out/ → android assets
pnpm mobile:sync     # copy + update native plugins
pnpm mobile:open     # open in Android Studio
pnpm mobile:build    # copy + sync + build debug APK
pnpm mobile:release   # copy + sync + build release APK
```

**Build APK:**
```bash
pnpm mobile:build
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

**Prerequisites:**
- Android SDK at `C:\Users\opdli\AppData\Local\Android\Sdk`
- `android/local.properties` with `sdk.dir` pointing to it (gitignored)
- Java 17+ (bundled with Android Studio)
