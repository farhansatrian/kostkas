# KostKas — Panduan Deployment Produksi Alpine Linux VM "kebonkacang" (`PRODUCTION_DEPLOYMENT.md`)

Dokumen ini adalah panduan teknis operasional untuk mempersiapkan dan menjalankan aplikasi **KostKas** pada Virtual Machine (VM) **kebonkacang** berbasis **Alpine Linux** menggunakan Docker Compose.

---

## 1. Spesifikasi Infrastruktur Target Aktual

| Parameter | Spesifikasi Aktual | Keterangan Operasional |
| :--- | :--- | :--- |
| **VM Name** | `kebonkacang` | Nama identifikasi VM pada server platform |
| **OS Host** | **Alpine Linux 3.21.9** | Menggunakan package manager `apk` & init `OpenRC` |
| **vCPU** | 2 vCPU (AMD64 / x86_64) | Mendukung eksekusi image `linux/amd64` |
| **RAM** | **952 MB (1 GB)** | **Resource Ketat**: Gunakan prebuilt GHCR image (tanpa compile di host) |
| **Disk** | **Root 3.7 GB (~3.1 GB bebas)** | **Resource Ketat**: Log rotation & gunakan prebuilt image hemat disk |
| **IP Privat VM** | `10.211.84.117` | Antarmuka jaringan internal VM |
| **Domain Akses** | `vm-kebonkacang.supercomfy.dev` | Domain publik resmi yang disediakan platform |
| **Port Forwarding** | Port `3000` | Gateway dashboard platform meneruskan ke port 3000 VM |
| **Akses Publik** | HTTPS via Platform Gateway | TLS/SSL ditangani di level gateway/domain platform |

---

## 2. Arsitektur Jaringan & Aliran Trafik

```
  [ Klien: Browser HP / Laptop Anggota Kost ]
                      │
                      │ (HTTPS: https://vm-kebonkacang.supercomfy.dev)
                      ▼
  [ Platform Server / Edge Gateway ]
  - Terminasi TLS/HTTPS domain *.supercomfy.dev
  - Port forwarding trafik HTTP ke IP Privat VM port 3000
                      │
                      │ (Port 3000 via IP Privat 10.211.84.117)
                      ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ VM Host "kebonkacang" (Alpine Linux, 1 GB RAM, 10 GB Disk)            │
  │                                                                        │
  │  Antarmuka Jaringan Host (0.0.0.0:3000 / 10.211.84.117:3000)          │
  │                     │                                                  │
  │                     ▼                                                  │
  │  ┌──────────────────────────────────────────────────────────────────┐  │
  │  │ Docker Bridge Network: kostkas-prod-net (Isolasi Internal)       │  │
  │  │                                                                  │  │
  │  │  ┌──────────────────────────────┐   ┌──────────────────────────┐ │  │
  │  │  │ App: kostkas-prod-app        │   │ DB: kostkas-prod-db      │ │  │
  │  │  │ Next.js 16 (Standalone)      │──▶│ PostgreSQL 17 (Alpine)   │ │  │
  │  │  │ Non-root user (nextjs:1001)  │   │ Port 5432 (Internal net) │ │  │
  │  │  │ RAM Limit: 448 MB            │   │ RAM Limit: 256 MB        │ │  │
  │  │  │ V8 Heap Limit: 320 MB        │   │ Shared Buffers: 64 MB    │ │  │
  │  │  │ Port Host: 0.0.0.0:3000      │   │ Port Host: TIDAK DIEKSPOS│ │  │
  │  │  └──────────────┬───────────────┘   └─────────────┬────────────┘ │  │
  │  │                 │                                 │              │  │
  │  └─────────────────┼─────────────────────────────────┼──────────────┘  │
  │                    │                                 │                 │
  │              Healthcheck                   Volume PostgreSQL:          │
  │           (/api/health: 200)               kostkas_prod_pgdata         │
  └────────────────────────────────────────────────────────────────────────┘
```

### Prinsip Keamanan & Desain:
1. **Zero Database Exposure**: Port PostgreSQL (`5432`) **sama sekali tidak diekspos ke host maupun internet**. Hanya kontainer `app` yang dapat berkomunikasi dengan database melalui jaringan bridge `kostkas-prod-net`.
2. **Host Port Binding Flexibel**: Aplikasi mengikat port `${APP_BIND_IP:-0.0.0.0}:3000`, memungkinkan gateway dashboard meneruskan paket ke IP privat `10.211.84.117:3000`.
3. **Optimasi Memori Rendah (1 GB RAM)**:
   - Batas RAM Kontainer Next.js (`app`): **Maksimal 448 MB** (reservasi 180 MB).
   - Batas V8 Heap Node.js: `NODE_OPTIONS="--max-old-space-size=320"` (mencegah OOM Killer Linux).
   - Batas RAM PostgreSQL (`db`): **Maksimal 256 MB** (reservasi 96 MB).
   - Tuning parameter PostgreSQL: `shared_buffers=64MB`, `work_mem=4MB`, `max_connections=25`.
   - Total konsumsi kontainer maksimal **704 MB**, menyisakan ~300 MB untuk Alpine OS dan kernel buffers.
4. **Proteksi Kapasitas Disk (10 GB Disk)**:
   - Driver log kontainer dibatasi `max-size: 10m` dan `max-file: 3` (maksimal 30 MB log per kontainer).
   - Menggunakan image minimalis `node:22-alpine` dan `postgres:17-alpine`.
5. **CSRF & Server Actions Origin Whitelist**:
   - `next.config.ts` membatasi origin tepercaya secara ketat pada `vm-kebonkacang.supercomfy.dev` dan `localhost:3000` (wildcard `*.supercomfy.dev` dan IP mentah telah dihilangkan untuk keamanan maksimal).

---

## 3. Langkah-Langkah Verifikasi & Deployment di VM Alpine Linux

### Langkah 1: Hubungkan ke VM & Periksa Lingkungan
Buka terminal SSH ke VM `kebonkacang`:

```sh
# 1. Periksa arsitektur CPU (x86_64 atau aarch64/ARM64)
uname -m

# 2. Periksa kapasitas RAM aktual
free -m

# 3. Periksa ketersediaan ruang disk
df -h /
```

### Langkah 2: Pasang Docker Engine & Docker Compose di Alpine Linux
Jika Docker belum terpasang di Alpine VM:

```sh
# Update repository paket Alpine
apk update

# Pasang Docker, Docker Compose CLI, Git, curl, dan openssl
apk add docker docker-cli-compose git curl openssl

# Aktifkan dan jalankan service Docker dengan OpenRC
rc-update add docker boot
service docker start

# (Opsional) Tambahkan user non-root ke grup docker jika tidak menggunakan root
addgroup $USER docker
```

Verifikasi Docker:
```sh
docker version
docker compose version
```

### Langkah 3: Unduh Repositori KostKas
```sh
# Clone repositori ke direktori operasional
git clone https://github.com/farhansatrian/kostkas.git /opt/kostkas
cd /opt/kostkas
```

### Langkah 4: Konfigurasi Environment Produksi
Salin template konfigurasi:
```sh
cp .env.production.example .env.production
```

Buat nilai rahasia aman di terminal VM:
```sh
# 1. Password database PostgreSQL (minimal 32 karakter):
openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32; echo

# 2. Kunci AUTH_SECRET sesi login (minimal 64 karakter hex):
openssl rand -hex 32

# 3. Token rahasia inisialisasi akun pertama (INITIAL_SETUP_TOKEN):
openssl rand -hex 16
```

Buka dan isi `.env.production`:
```sh
nano .env.production
# atau: vi .env.production
```

Contoh konfigurasi akhir `.env.production`:
```env
NEXT_PUBLIC_APP_NAME="KostKas"
NEXT_PUBLIC_APP_ENV="production"
NEXT_PUBLIC_DEFAULT_MONTHLY_DUE="150000"

# Image GHCR Prebuilt (Di-build oleh GitHub Actions CI/CD)
KOSTKAS_IMAGE="ghcr.io/farhansatrian/kostkas:latest"

# Menerima trafik dari gateway dashboard pada IP privat 10.211.84.117:3000
APP_BIND_IP="0.0.0.0"

POSTGRES_USER="kostkas_admin"
POSTGRES_PASSWORD="<hasil_password_acak_database>"
POSTGRES_DB="kostkas_prod_db"

DATABASE_URL="postgresql://kostkas_admin:<hasil_password_acak_database>@db:5432/kostkas_prod_db?schema=public"
AUTH_SECRET="<hasil_auth_secret_64_karakter_hex>"
INITIAL_SETUP_TOKEN="<hasil_token_setup_32_karakter_hex>"
RUN_MIGRATIONS="true"
COOKIE_SECURE="true"
```

### Langkah 5: Pull Image Prebuilt dari GHCR & Jalankan Kontainer
Karena VM memiliki RAM terbatas (952 MB), kita menggunakan image yang sudah di-build di GitHub Actions (GHCR) sehingga VM tidak perlu melakukan kompilasi berat:

```sh
# 1. Pull prebuilt image dari GitHub Container Registry
docker compose --env-file .env.production -f compose.prod.yaml pull app

# 2. Jalankan PostgreSQL dan KostKas secara detached
docker compose --env-file .env.production -f compose.prod.yaml up -d
```

### Langkah 6: Verifikasi Status Kontainer & Healthcheck
```sh
# Periksa status kedua kontainer (status harus 'Up' dan db 'healthy')
docker compose -f compose.prod.yaml ps

# Periksa log startup kontainer app (harus menampilkan migrasi berhasil & server running)
docker compose -f compose.prod.yaml logs -f app
```

Uji respons healthcheck dari dalam VM:
```sh
curl -i http://127.0.0.1:3000/api/health
```

Ekspektasi keluaran:
```json
HTTP/1.1 200 OK
{"status":"healthy","database":"connected","timestamp":"...","uptimeSeconds":10,"latencyMs":2}
```

Uji respons via IP privat VM:
```sh
curl -i http://10.211.84.117:3000/api/health
```

---

## 4. Inisialisasi Akun Penghuni Pertama (First-Time Web Setup)

Setelah kontainer aktif dan port 3000 berhasil diteruskan oleh gateway dashboard:

1. Buka browser di laptop atau HP anggota kost:
   ```
   https://vm-kebonkacang.supercomfy.dev/login
   ```
2. Karena database produksi masih baru dan belum memiliki akun, sistem otomatis menampilkan formulir **Inisialisasi Sistem KostKas (Akun Pertama)**.
3. Masukkan:
   - **Token Setup Awal**: Nilai `INITIAL_SETUP_TOKEN` yang telah dibuat di `.env.production`.
   - **Nama Lengkap**: `Farhan` (selaku pemegang rekening kas DANA).
   - **Username**: `farhan`
   - **Password**: Password login kuat minimal 8 karakter.
4. Klik **"Buat Akun Pertama & Mulai"**.
5. Sistem secara otomatis dan atomic:
   - Memverifikasi token setup secara server-side (*timing-safe*).
   - Mengambil *advisory transaction lock* untuk mencegah pembuatan ganda.
   - Membuat akun Farhan dengan password terenkripsi bcrypt (12 rounds).
   - Menginisialisasi data kas DANA, tarif iuran dinamis (Rp150.000/bln), dan kategori pengeluaran kost harian (Galon & Gas, Kebersihan & Dapur, Listrik & Wi-Fi, Perbaikan, Lainnya).
   - Mengunci sistem bootstrap secara permanen (*fail-closed*).
6. Farhan kini dapat membuka menu **Anggota** (`/anggota`) untuk mendaftarkan penghuni kost lainnya (`Nabeel`, `Alzha`, dst.) dengan hak akses yang setara.

---

## 5. Prosedur Pemeliharaan Rutin pada Resource 1 GB / 10 GB

### 1. Memantau Penggunaan Memori & CPU Kontainer
```sh
docker stats --no-stream
```

### 2. Cadangan Database Harian (Backup)
Jalankan pencadangan kas kost menggunakan skrip bawaan:
```sh
cd /opt/kostkas
./scripts/db-backup.sh
```
Berkas `.sql.gz` otomatis tersimpan di `./backups/`.

Jadwalkan cron job harian pada Alpine Linux (`crontab -e`):
```cron
0 3 * * * cd /opt/kostkas && ./scripts/db-backup.sh >> /var/log/kostkas_backup.log 2>&1
```

### 3. Pembersihan Disk Berkala (Menjaga Kuota 10 GB)
Secara berkala bersihkan kontainer/image tak terpakai:
```sh
docker system prune -f
```

---

## 6. Prosedur Pembaruan Kode (Update & Rollback)

### Prosedur Update:
```sh
cd /opt/kostkas
git pull origin feature/database-foundation
docker compose -f compose.prod.yaml build
docker compose -f compose.prod.yaml up -d
docker system prune -f
```

### Prosedur Rollback Cepat:
```sh
cd /opt/kostkas
git checkout <commit_hash_stabil_sebelumnya>
docker compose -f compose.prod.yaml build
docker compose -f compose.prod.yaml up -d
```
