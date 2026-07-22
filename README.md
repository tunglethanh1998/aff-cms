# Aff CMS

Monorepo for an Affiliate CMS: NestJS API, Next.js admin web, and PostgreSQL.

## Stack

- **API:** NestJS + Prisma + JWT auth
- **Web:** Next.js (App Router)
- **DB:** PostgreSQL (Docker)
- **TikTok:** Login Kit OAuth, Display API (metrics), Content Posting API (Inbox draft)

## Features

- **CMS Auth** — email/password login; role currently `ADMIN` only
- **TikTok accounts** — connect via OAuth (no manual metrics entry)
  - Sync avatar, display name, username, followers, video count, likes
  - Aggregate views / comments / likes from `video.list`
- **Draft video** — upload video and push to **TikTok Inbox** (`/v2/post/publish/inbox/video/init/`)
  - Creator finishes edit/post inside the TikTok app notification flow

## Prerequisites

- Node.js 20+
- Docker / Docker Compose
- npm 10+
- TikTok Developer App with products/scopes approved (see below)

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Environment
cp .env.example .env
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local
# Edit apps/api/.env — set JWT_SECRET, TikTok keys, TOKEN_ENCRYPTION_KEY

# 3. Start Postgres (host port 55432 by default)
npm run db:up

# 4. Migrate + seed admin
npm run prisma:migrate
npm run prisma:seed

# 5. Start API + Web (separate terminals)
npm run dev:api
npm run dev:web
```

- Web: http://localhost:3000  
- API: http://localhost:3001  
- Health: http://localhost:3001/health  
- Postgres: `localhost:55432`

### Default admin

From seed / env:

- Email: `admin@affcms.local` (or `ADMIN_EMAIL`)
- Password: `admin123456` (or `ADMIN_PASSWORD`)

## TikTok Developer setup

1. Create an app at [TikTok for Developers](https://developers.tiktok.com/).
2. Enable products:
   - **Login Kit**
   - **TikTok API** (Display API — user info / video list)
   - **Content Posting API** — Upload to TikTok (Inbox draft)
3. Redirect URI (Web — TikTok không cho localhost):
   ```text
   https://exposure-specials-father-differently.trycloudflare.com/tiktok/oauth/callback
   ```
   - Điền **giống nhau** ở App Info Web + Login Kit Web + `TIKTOK_REDIRECT_URI`
   - Giữ tunnel: `cloudflared tunnel --url http://localhost:3001`
   - Nếu host tunnel đổi, cập nhật lại portal + `.env`
4. Request scopes:
   - `user.info.basic`
   - `user.info.profile`
   - `user.info.stats`
   - `video.list`
   - `video.upload`
5. Copy `Client Key` / `Client Secret` into `apps/api/.env` as `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`.

### Connect + draft flow

1. Log in to the CMS as admin.
2. Open **TikTok accounts** → **Connect TikTok** → authorize in TikTok.
3. Callback hits the API, stores encrypted tokens, syncs metrics, redirects to `/accounts`.
4. Open an account → choose a video → **Send to TikTok Inbox**.
5. On the phone TikTok app, open the inbox notification to finish the draft.

## Workspace layout

```
apps/
  api/   # NestJS + Prisma (auth, tiktok oauth/sync/draft)
  web/   # Next.js admin UI
packages/
  # shared packages (future)
```

## Main API routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | no | Admin login → JWT |
| GET | `/auth/me` | JWT | Current admin |
| GET | `/tiktok/oauth/start` | JWT | Returns TikTok authorize URL |
| GET | `/tiktok/oauth/callback` | no | OAuth callback (redirect to web) |
| GET | `/tiktok/accounts` | JWT | List connected accounts |
| POST | `/tiktok/accounts/:id/sync` | JWT | Refresh metrics + video list from TikTok |
| GET | `/tiktok/accounts/:id/videos` | JWT | Paginated synced videos (`page`, `limit`, `q`) |
| DELETE | `/tiktok/accounts/:id` | JWT | Unlink account |
| GET | `/tiktok/accounts/:id/drafts` | JWT | Draft job history |
| POST | `/tiktok/accounts/:id/drafts` | JWT | multipart `video` (+ optional `caption`) → Inbox |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run db:up` | Start Postgres |
| `npm run db:down` | Stop Postgres |
| `npm run prisma:migrate` | Apply Prisma migrations |
| `npm run prisma:seed` | Seed admin user |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run dev:api` | Start NestJS in watch mode |
| `npm run dev:web` | Start Next.js dev server |

## Limits / notes

- TikTok app must be approved for the scopes above; unaudited apps may only work with test users.
- Videos are fetched via TikTok `video.list` (cursor + `max_count` only; no hashtag/mention filters), stored in Postgres, then paginated/searched in the CMS.
- TikTok `video.query` only filters by known `video_ids` — not by text/hashtag. CMS search (`q`) runs on synced title/description.
- Account-level views/comments/likes are aggregated from that synced video list.
- Inbox draft does **not** publish publicly — the creator must complete posting in TikTok.
- OAuth uses PKCE (`code_challenge` = hex SHA256 of `code_verifier`) plus an in-memory `state` (fine for local/single instance).
- Access/refresh tokens are encrypted at rest with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`).
