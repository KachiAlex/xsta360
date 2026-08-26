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
```

## Environment
Copy `.env.example` to `.env.local` and fill in:
- `DATABASE_URL` — Postgres connection string
- `SESSION_SECRET` — 32+ char random string (JWT signing)
- `APP_URL` — public base URL
- `RESEND_API_KEY` — optional; if unset, reminder emails log to console
- `EMAIL_FROM` — from address for transactional email
- `CRON_SECRET` — shared secret for the `/api/cron/reminders` endpoint

## Seed data
```bash
pnpm db:push   # create tables first
pnpm db:seed   # creates demo org + rep + leads matching the mockup
```
Login: `tunde@kreatix.com` / `password123`

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
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/reminders
```
On Vercel, add a cron job in `vercel.json`. On other platforms, use an external scheduler (e.g. cron-job.org) every 5-10 minutes.

## Deployment
1. Provision Postgres (Neon, Supabase, or self-hosted).
2. Set all env vars (see above).
3. `pnpm db:push` to create tables.
4. `pnpm build && pnpm start` (or deploy to Vercel).
5. Set up the reminder cron (see above).
6. Optionally `pnpm db:seed` for demo data.

## Next.js 16 notes
- Middleware is now **Proxy** (`proxy.ts`, not `middleware.ts`).
- `cookies()` is async (`await cookies()`).
- `params` and `searchParams` in pages are **Promises** (must `await`).
- Server Actions use `useActionState` (React 19).
