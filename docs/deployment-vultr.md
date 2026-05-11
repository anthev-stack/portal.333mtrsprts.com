# Deploy the portal on Vultr (GitHub + Docker + domain)

This guide assumes **Ubuntu 22.04 LTS** on a Vultr **Cloud Compute** instance, **Docker Compose** for the app + Postgres, and **Caddy** on the host for HTTPS. Adjust sizes and regions to your needs.

## 1. Create the Vultr server

1. Vultr dashboard → **Deploy New Server**.
2. **Cloud Compute** (Shared or Optimized is fine to start).
3. **Region** close to your users.
4. **Image**: Ubuntu 22.04 LTS.
5. **SSH keys**: add your public key (recommended; no password login).
6. **Hostname**: e.g. `portal` (optional).
7. Deploy and note the **public IPv4**.

## 2. DNS for `portal.333mtrsprts.com`

At your DNS host (where `333mtrsprts.com` is managed):

| Type | Name   | Value              | TTL  |
|------|--------|--------------------|------|
| A    | portal | `<Vultr server IP>` | 300 |

Wait for propagation (often minutes; can be longer).

For **email** (SMTP on the same box or elsewhere), you will add **MX**, **SPF**, **DKIM**, **DMARC** later (see section 8).

## 3. Push the project to GitHub

On your PC (once):

```bash
cd /path/to/portal.333mtrsprts.com
git init   # if not already a repo
git remote add origin https://github.com/YOUR_ORG/portal.333mtrsprts.com.git
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main
```

- Use a **private** repository if the codebase should not be public.
- **Never commit** `.env` or real secrets; only `.env.example` belongs in Git.

## 4. First-time server setup (SSH)

```bash
ssh root@YOUR_SERVER_IP
```

Update and install basics:

```bash
apt update && apt upgrade -y
apt install -y git ca-certificates curl
```

### Install Docker (official convenience script)

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

### Install Docker Compose plugin (if not bundled)

```bash
docker compose version
```

If missing: follow [Docker Compose install](https://docs.docker.com/compose/install/linux/).

### Optional: non-root Docker user

```bash
usermod -aG docker $USER
# log out and SSH back in
```

## 5. Clone the repo on the server

**Private repo** — use a **deploy key** (read-only):

1. GitHub repo → **Settings → Deploy keys → Add deploy key**.
2. On the server: `ssh-keygen -t ed25519 -f ~/.ssh/github_portal -N ""`
3. Paste `~/.ssh/github_portal.pub` into GitHub.
4. Clone:

```bash
mkdir -p /opt && cd /opt
GIT_SSH_COMMAND='ssh -i ~/.ssh/github_portal -o IdentitiesOnly=yes' \
  git clone git@github.com:YOUR_ORG/portal.333mtrsprts.com.git portal
cd portal
```

**Public repo**: `git clone https://github.com/YOUR_ORG/portal.333mtrsprts.com.git /opt/portal`

## 6. Production environment file

Create `/opt/portal/.env` on the server (not in Git). `docker-compose.prod.yml` builds `DATABASE_URL` from **`POSTGRES_PASSWORD`** — use a long random password (letters and numbers are simplest so the URL stays valid).

```env
# App URL (must match what users type in the browser)
NEXT_PUBLIC_APP_URL=https://portal.333mtrsprts.com

# Strong random secret (32+ chars)
JWT_SECRET=paste-a-long-random-string-here

# Postgres password for user "portal" (must match URL encoding if you use special chars)
POSTGRES_PASSWORD=your-long-random-db-password

# Outbound mail (portal + password reset) — see sections 7–8
SMTP_HOST=127.0.0.1
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=333 Motorsports <noreply@333mtrsprts.com>
```

Build args for **Next.js public URL** at image build time:

```bash
cd /opt/portal
export NEXT_PUBLIC_APP_URL=https://portal.333mtrsprts.com
docker compose -f docker-compose.prod.yml build --build-arg NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
docker compose -f docker-compose.prod.yml up -d
```

Migrations run automatically on container start (`Dockerfile` CMD).

## 7. HTTPS reverse proxy (Caddy)

Install Caddy on the host (not inside Docker) so it obtains Let’s Encrypt certificates:

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```caddy
portal.333mtrsprts.com {
    reverse_proxy 127.0.0.1:3000
}
```

Reload:

```bash
systemctl reload caddy
```

Ensure the app publishes **3000 on localhost only** (see `docker-compose.prod.yml`).

Open firewall:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## 8. Running your own SMTP on the same VPS (no extra SaaS fee)

**Yes, you can** run Postfix (and OpenDKIM) on the Vultr box and point the app’s `SMTP_HOST=127.0.0.1` at it.

**Trade-offs:**

- **Deliverability**: New IPs and self-hosted mail often land in spam until **PTR (reverse DNS)**, **SPF**, **DKIM**, and **DMARC** are correct and the IP has a good reputation. Vultr lets you set **reverse DNS** on the IPv4 to match your hostname (e.g. `mail.333mtrsprts.com`).
- **Port 25**: Some providers block outbound 25 by default; Vultr usually allows it for legitimate use, but check their policy. Inbound 25 is required if you ever want to **receive** mail on this server (not needed for the portal’s current “send only” flow).
- **Time**: Expect ongoing maintenance (updates, queues, abuse, blacklists).

**Minimal outbound-only path:**

1. Set hostname: `hostnamectl set-hostname mail.333mtrsprts.com` (or your chosen mail host name).
2. In Vultr: set **reverse DNS** for the VPS IP to that hostname.
3. Install **Postfix** (Internet Site), **OpenDKIM**, configure signing for `@333mtrsprts.com`.
4. DNS at your registrar:
   - **SPF** (example if only this server sends):  
     `TXT` @ `v=spf1 a:mail.333mtrsprts.com ~all`
   - **DKIM**: publish the public key TXT from OpenDKIM.
   - **DMARC** (start relaxed):  
     `TXT` `_dmarc` `v=DMARC1; p=none; rua=mailto:you@example.com`
5. Set app env: `SMTP_HOST=127.0.0.1`, `SMTP_PORT=25` or submission port you configure, and credentials if you use SASL for local submission.

**Easier alternative (often free tier):** [Resend](https://resend.com), SendGrid, Amazon SES, or your **Google Workspace / Microsoft 365** SMTP — less ops, usually better inbox placement. You can switch later by changing env vars only.

## 9. Uploads and persistence

- **Postgres data**: kept in the Docker volume `pgdata` (see compose file).
- **Uploaded files** (`public/uploads`): the default setup uses the container filesystem. **Recreations of the container without a volume lose uploads.** For production, add a **bind mount** or named volume for `/app/public/uploads` in `docker-compose.prod.yml` once you confirm the standalone image path (same as `public/uploads` under the app root in the container).

## 10. Deploy updates from GitHub

On the server:

```bash
cd /opt/portal
git pull
export NEXT_PUBLIC_APP_URL=https://portal.333mtrsprts.com
docker compose -f docker-compose.prod.yml build --build-arg NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
docker compose -f docker-compose.prod.yml up -d
```

Optional: **GitHub Actions** SSH into the server and run the same commands on push to `main`.

## 11. Checklist

- [ ] DNS `portal` → server IP  
- [ ] `.env` on server with strong `JWT_SECRET` and correct `DATABASE_URL`  
- [ ] `docker compose -f docker-compose.prod.yml up -d` healthy  
- [ ] Caddy (or nginx) TLS working  
- [ ] `NEXT_PUBLIC_APP_URL` matches live URL (rebuild if changed)  
- [ ] SMTP: either self-hosted Postfix + DNS auth, or external provider  
- [ ] Backups for Postgres volume (Vultr snapshots + logical `pg_dump`)

---

If you tell us your exact DNS provider and whether you prefer **Caddy** or **nginx + certbot**, the Caddyfile/nginx snippets can be narrowed to copy-paste blocks only.
