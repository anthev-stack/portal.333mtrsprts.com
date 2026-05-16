# Deploying the 333 Motorsport Staff Portal

This document describes a production-style deployment on a Vultr VPS with GitHub, Docker, PostgreSQL, Nginx, and Let’s Encrypt.

## Prerequisites

- Vultr instance (Ubuntu 22.04+ recommended) with SSH access
- Domain `portal.333mtrsprts.com` pointing to the server’s public IP
- GitHub repository containing this project

## Production (Vultr) — `/opt/portal`

App directory on the server:

```text
/opt/portal
```

Ensure `.env` exists here with `POSTGRES_PASSWORD`, `JWT_SECRET`, and other secrets (see `.env.example`). **Never commit `.env`.**

### Deploy / update (pull `main`, rebuild, run)

```bash
cd /opt/portal
git pull origin main
export NEXT_PUBLIC_APP_URL=https://portal.333mtrsprts.com
docker compose -f docker-compose.prod.yml build --build-arg NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

The image runs `prisma migrate deploy` before Next.js starts (see `Dockerfile` `CMD`). `NEXT_PUBLIC_APP_URL` must be set at **build** time so the client bundle gets the correct public URL.

Profile photos are stored under `public/uploads` and served via `/uploads/…` (rewritten to an authenticated API route). The prod compose file mounts a **`portal_uploads`** volume so uploads survive container rebuilds.

### First-time seed (optional)

```bash
cd /opt/portal
docker compose -f docker-compose.prod.yml --profile seed run --rm seed
```

Default seed accounts (change passwords immediately):

- Admin: `admin@333mtrsprts.com` / `ChangeMeAdmin123!`
- Staff: `cameron@333mtrsprts.com` / `ChangeMeStaff123!`

## Local / dev clone (reference)

Install Docker Engine and Docker Compose plugin. Clone the repository (any path):

```bash
git clone https://github.com/YOUR_ORG/portal.333mtrsprts.com.git
cd portal.333mtrsprts.com
cp .env.example .env
```

Edit `.env` and set:

- `DATABASE_URL` — use the same credentials as `docker-compose.yml` or your managed Postgres
- `JWT_SECRET` — at least 32 random characters
- `NEXT_PUBLIC_APP_URL` — `https://portal.333mtrsprts.com` (production) or `http://localhost:3000` (local)

## Database migrations and seed (development compose)

With Postgres running via `docker-compose.yml`:

```bash
docker compose run --rm app sh -c "npx prisma migrate deploy && npm run db:seed"
```

## Run locally with Docker Compose (`docker-compose.yml`)

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
export NEXT_PUBLIC_APP_URL="http://localhost:3000"
docker compose up -d --build
```

For uploads, mount a persistent volume at `./public/uploads` if you extend the compose file.

## Nginx reverse proxy

- Terminate TLS with Let’s Encrypt (e.g. `certbot --nginx`)
- Proxy to `127.0.0.1:3000` (or the Docker-published port)
- See `deploy/nginx-portal.conf.example` for header and body-size settings

## GitHub Actions (outline)

Typical steps:

1. Run `npm ci`, `npx prisma generate`, `npm run lint`, `npm run build` on pull requests
2. On `main`, SSH to Vultr, `cd /opt/portal`, then the **Production** pull/build/up commands above

Store `JWT_SECRET` and deployment SSH keys as encrypted repository secrets.

## Email for password resets

`src/lib/email.ts` logs reset links in development. Wire a provider (Resend, SES, SMTP) before go-live so administrators’ “Email reset” actions reach staff **external** addresses only.

## Hardening checklist

- Rotate seeded passwords; enforce strong passwords via policy
- Move rate limiting to Redis (e.g. Upstash) for multi-instance setups
- Back up Postgres regularly; test restores
- Restrict SSH; enable firewall allowing 80/443 only as needed
