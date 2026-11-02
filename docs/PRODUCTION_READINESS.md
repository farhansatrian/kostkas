# KostKas — Panduan & Kesiapan Produksi Virtual Machine (`PRODUCTION_READINESS.md`)

Dokumen ini adalah panduan kesiapan deployment dan operasional aplikasi **KostKas** pada **Virtual Machine (VM) milik kost**.

---

## 1. Arsitektur & Topologi VM

Aplikasi KostKas dirancang secara *lightweight*, *self-contained*, dan hemat resource agar dapat berjalan stabil pada VM dengan spesifikasi minimal (1 vCPU, 1 GB RAM):

```
                       [ Internet / Jaringan Kost ]
                                    │
                                    ▼ (Port 80 / 443)
                        [ Reverse Proxy: Caddy / Nginx ]
                                    │ (Reverse Proxy ke Port 3000)
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │                   Docker Compose Stack                  │
       │                                                         │
       │  ┌──────────────────────┐      ┌─────────────────────┐  │
       │  │   Next.js 16 App     │      │   PostgreSQL 17     │  │
       │  │   Node.js 22 Runtime │ ──── │   Alpine Container  │  │
       │  │   (Port 3000)        │      │   (Port 5432 inter) │  │
       │  └──────────────────────┘      └──────────┬──────────┘  │
       │                                           │             │
       │                                    kostkas_pgdata       │
       │                                    (Docker Volume)      │
       └─────────────────────────────────────────────────────────┘
```

---

## 2. Checklist Kesiapan Produksi (Production Readiness)

- [x] **Database Isolation**: Database testing (`kostkas_test_db`) terisolasi penuh dari database operasional (`kostkas_db`).
- [x] **Fail-Closed Security**: Pengujian otomatis menolak berjalan jika diarahkan ke database selain database testing.
- [x] **Autentikasi & Sesi**:
  - Algoritma hashing bcrypt dengan cost factor 12.
  - Sesi database ditandatangani menggunakan JWT (`jose` HS256) dengan verifikasi ganda di PostgreSQL.
  - Cookie HttpOnly, SameSite=Lax, Secure di environment production.
  - Invalidation otomatis seluruh sesi lain saat terjadi perubahan password.
  - Proteksi brute-force login (maksimal 5 percobaan gagal per 15 menit).
  - Mitigasi timing-attack pada pengecekan akun non-existent.
- [x] **HTTP Security Headers**:
  - `X-Frame-Options: DENY` (anti-clickjacking).
  - `X-Content-Type-Options: nosniff` (anti-MIME-sniffing).
  - `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- [x] **Pemisahan Konsep Keuangan & Buku Besar**:
  - Saldo kas diturunkan strictly dari `CashMovement` berstatus `CONFIRMED`.
  - Pelunasan reimbursement tidak menggandakan biaya operasional.
  - Concurrency lock (`SELECT ... FOR UPDATE`) mencegah pengeluaran melebihi saldo kas atau over-settlement.
- [x] **Pencadangan & Pemulihan (Backup & Disaster Recovery)**:
  - Skrip `scripts/db-backup.sh` dengan kompresi gzip dan retensi 14 hari.
  - Skrip `scripts/db-restore.sh` dengan konfirmasi `CONFIRM_RESTORE=YES`.
- [x] **Kerapian Git & Rahasia**:
  - `.gitignore` mengabaikan seluruh file rahasia (`.env`, `.env.*`), dump database (`*.sql.gz`, `*.dump`), dan folder `backups/`.
  - Tidak ada data pribadi penghuni kost atau kredensial yang tersimpan di kode sumber publik.

---

## 3. Langkah Deployment ke VM Kost

### 1. Prasyarat VM
- Sistem Operasi: **Ubuntu 24.04 LTS / Debian 12**.
- Paket: `git`, `docker.io`, `docker-compose-plugin`, `curl`.

### 2. Kloning Repositori & Konfigurasi Lingkungan
```bash
git clone https://github.com/username/kostkas.git /opt/kostkas
cd /opt/kostkas
cp .env.example .env
```

Isi variabel `.env` di VM dengan nilai produksi yang aman:
```env
NEXT_PUBLIC_APP_NAME="KostKas"
NEXT_PUBLIC_APP_ENV="production"
NODE_ENV="production"

POSTGRES_USER="kostkas_app"
POSTGRES_PASSWORD="PASSWORD_ACAK_SANGAT_KUAT_DAN_PANJANG"
POSTGRES_DB="kostkas_db"
POSTGRES_PORT="5433"

DATABASE_URL="postgresql://kostkas_app:PASSWORD_ACAK_SANGAT_KUAT_DAN_PANJANG@127.0.0.1:5433/kostkas_db?schema=public"
AUTH_SECRET="KUNCI_ACAK_MINIMAL_64_KARAKTER_HEX_ATAU_BASE64"
```

### 3. Jalankan Database & Migrasi Prisma
```bash
docker compose up -d
npx prisma migrate deploy
npm run db:seed
```

### 4. Build & Jalankan Aplikasi
```bash
npm run build
npm run start
```
*(Atau jalankan melalui service systemd / PM2 / Docker)*.

### 5. Konfigurasi Reverse Proxy (Contoh: Caddy)
File `/etc/caddy/Caddyfile`:
```caddy
kas.kostkita.local {
    reverse_proxy 127.0.0.1:3000
}
```
Caddy secara otomatis mengelola sertifikat TLS/HTTPS jika domain terhubung ke internet.

---

## 4. Pemantauan & Health Check

Periksa status database dan kontainer:
```bash
docker compose ps
docker exec kostkas-db pg_isready -U kostkas_app -d kostkas_db
```

Periksa log aplikasi secara berkala:
```bash
journalctl -u kostkas -f
```

