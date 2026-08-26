# Xsta360

A sales management app for Sales & Marketing teams — manage leads, follow up on time, and close deals without anything going cold.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Postgres, and Drizzle ORM.

## Features

- **Today's Follow-Ups** — a dashboard that surfaces overdue and due-today reminders with heat dots and a stat strip (leads today, overdue, due today, 7-day win rate).
- **Pipeline board** — drag-and-drop Kanban with custom stages per organization.
- **Leads** — searchable/filterable list, detail view with a full history timeline (remarks, stage changes, reminders, assignments).
- **Remarks & reminders** — log a remark and set a follow-up in one tap; snooze or complete reminders.
- **Win/Loss tracking** — moving to Won/Lost is an explicit action; Lost requires a reason code.
- **Team management** — invite by email, change roles, remove members (admin only).
- **Source attribution** — lead count and conversion rate by source; per-rep performance report.
- **CSV import** — upload a CSV, map columns, bulk insert with per-row error reporting.
- **Embeddable lead capture form** — public endpoint that drops leads into your pipeline tagged `embedded_form`.
- **Email reminders** — cron-driven transactional emails via Resend (console fallback in dev).
- **Marketing homepage** — public landing page matching the design mockup.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in DATABASE_URL, SESSION_SECRET, etc.
pnpm db:push                 # create tables
pnpm db:seed                 # optional: demo data (login: tunde@kreatix.com / password123)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm start` | Serve production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:push` | Push schema to Postgres |
| `pnpm db:studio` | Drizzle Studio (DB GUI) |
| `pnpm db:seed` | Seed demo data |

## Environment variables

See [`.env.example`](./.env.example). Required: `DATABASE_URL`, `SESSION_SECRET`. Optional: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `CRON_SECRET`.

## Architecture

Multi-tenant: every table is scoped by `orgId`. Auth uses email/password with a JWT in an httpOnly cookie. Roles are `admin | manager | rep` on the membership row. All mutations go through server actions that re-verify the session and org scope, and emit audit events. See [AGENTS.md](./AGENTS.md) for full details.

## Deployment

1. Provision Postgres (Neon, Supabase, or self-hosted).
2. Set all environment variables.
3. `pnpm db:push` to create tables.
4. Deploy (Vercel or any Node host).
5. Set up a cron job hitting `/api/cron/reminders` every 5-10 minutes with `Authorization: Bearer $CRON_SECRET`.
