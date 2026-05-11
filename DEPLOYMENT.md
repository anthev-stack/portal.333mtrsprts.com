# Deploying the 333 Motorsport Staff Portal

This document describes a production-style deployment on a Vultr VPS with GitHub, Docker, PostgreSQL, Nginx, and Let’s Encrypt.

## Prerequisites

- Vultr instance (Ubuntu 22.04+ recommended) with SSH access
- Domain `portal.333mtrsprts.com` pointing to the server’s public IP
- GitHub repository containing this project

## 1. Server setup

Install Docker Engine and Docker Compose plugin (see Docker’s official docs for Ubuntu). Clone the repository:

```bash
git clone https://github.com/YOUR_ORG/portal.333mtrsprts.com.git
cd portal.333mtrsprts.com
cp .env.example .env
```

Edit `.env` and set:

- `DATABASE_URL` — use the same credentials as `docker-compose.yml` or your managed Postgres
- `JWT_SECRET` — at least 32 random characters
- `NEXT_PUBLIC_APP_URL` — `https://portal.333mtrsprts.com`

**Never commit `.env`.**

## 2. Database migrations and seed (first run)

With Postgres running (see Docker Compose below):

```bash
docker compose run --rm app sh -c "npx prisma migrate deploy && npm run db:seed"
```

Default seed accounts (change passwords immediately):

- Admin: `admin@333mtrsprts.com` / `ChangeMeAdmin123!`
- Staff: `cameron@333mtrsprts.com` / `ChangeMeStaff123!`

## 3. Run with Docker Compose

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
export NEXT_PUBLIC_APP_URL="https://portal.333mtrsprts.com"
docker compose up -d --build
```

The `app` service runs `prisma migrate deploy` before starting Next.js.

For uploads, mount a persistent volume at `./public/uploads` if you extend the compose file.

## 4. Nginx reverse proxy

- Terminate TLS with Let’s Encrypt (e.g. `certbot --nginx`)
- Proxy to `127.0.0.1:3000` (or the Docker-published port)
- See `deploy/nginx-portal.conf.example` for header and body-size settings

## 5. GitHub Actions (outline)

Typical steps:

1. Run `npm ci`, `npx prisma generate`, `npm run lint`, `npm run build` on pull requests
2. On `main`, SSH to Vultr and `git pull`, `docker compose up -d --build`

Store `JWT_SECRET` and deployment SSH keys as encrypted repository secrets.

## 6. Email for password resets

`src/lib/email.ts` logs reset links in development. Wire a provider (Resend, SES, SMTP) before go-live so administrators’ “Email reset” actions reach staff **external** addresses only.

## 7. Hardening checklist

- Rotate seeded passwords; enforce strong passwords via policy
- Move rate limiting to Redis (e.g. Upstash) for multi-instance setups
- Back up Postgres regularly; test restores
- Restrict SSH; enable firewall allowing 80/443 only as needed
