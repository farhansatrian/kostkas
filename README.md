# KostKas

> **Sistem Pengelolaan Uang Kas Bersama Penghuni Kost yang Transparan, Akuntabel, dan Rapi**

[![Live Deployment](https://img.shields.io/badge/Production-Live-0d9488?style=flat-square&logo=googlechrome&logoColor=white)](https://vm-kebonkacang.supercomfy.dev/)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.4.3-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-7.10.1-2d3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Alpine_Host-2496ed?style=flat-square&logo=docker)](https://www.docker.com/)

**KostKas** adalah aplikasi web modern untuk mengelola keuangan kas bersama penghuni kost secara terpusat, transparan, dan akuntabel. Aplikasi ini menerapkan prinsip akuntansi kas riil (*cash flow ledger*) yang memisahkan secara tegas antara uang masuk dari iuran rutin, belanja kebutuhan kost, dan dana talangan anggota (*reimbursement*), sehingga terbebas dari kesalahan penghitungan ganda (*double-counting*).

🔗 **Akses Production Live**: [https://vm-kebonkacang.supercomfy.dev/](https://vm-kebonkacang.supercomfy.dev/)

---

## 🌟 Fitur & Modul Utama

1. **Ringkasan Kas (Executive Ledger Dashboard)**
   - Menampilkan posisi **Saldo Kas Aktual** (rekening DANA Kas operasional) secara *real-time*.
   - Metrik perbandingan arus kas bulanan: Total Iuran Masuk, Total Kas Keluar, dan Kewajiban Reimbursement Terutang.
   - Visualisasi ringkas alokasi belanja per kategori dan status pembayaran iuran anggota.

2. **Pencatatan Iuran Bulanan (Monthly Contributions)**
   - Perhitungan kuota tagihan bulanan otomatis berdasarkan tarif dinamis per anggota.
   - Pencatatan pembayaran iuran (penuh atau cicilan/parsial) dengan konfirmasi mutasi masuk.
   - Riwayat kontribusi yang terisolasi antar-periode tanpa mengubah histori lama saat tarif diperbarui.

3. **Pengeluaran Kas Operasional (Expense Management)**
   - Pencatatan belanja kebutuhan bersama kost dengan **5 kategori default utama (v1.0.2)** yang ringkas dan bebas ribet:
     - 💧 **Galon**
     - ⚡ **Listrik**
     - 📶 **Wi-Fi**
     - 🧼 **Alat Mandi**
     - 📦 **Lainnya**
   - Mendukung kategori kustom pengguna dan struktur subkategori fleksibel.
   - Dua metode pendanaan: **Kas Langsung (DANA)** atau **Talangan Anggota (Member Advance)**.
   - Fitur pembatalan (*void/reversal*) transaksi terkonfirmasi dengan kewajiban mencantumkan alasan audit trail.

4. **Klaim & Pencairan Reimbursement (Reimbursement Payouts)**
   - Otomatis menerbitkan kewajiban kas saat anggota menalangi belanja kebutuhan bersama.
   - Pencairan dana kas (penuh atau parsial) langsung ke anggota yang bersangkutan.
   - Proteksi konkurensi database (`SELECT ... FOR UPDATE`) untuk mencegah *over-settlement*.
   - **Anti Double-Counting**: Pelunasan reimbursement mengurangi saldo kas aktual tanpa menggandakan beban biaya operasional kost.

5. **Perencanaan Anggaran Bulanan (Budgeting)**
   - Penetapan pagu anggaran per kategori setiap bulan.
   - Pemantauan realisasi belanja riil vs pagu secara otomatis dengan visualisasi status aman atau *over-budget*.

6. **Laporan Keuangan & Rekapitulasi (Financial Reporting & CSV Export)**
   - Laporan arus kas komprehensif: Saldo Awal + Kas Masuk - Kas Keluar = Saldo Akhir.
   - Filter periode tahun-bulan dinamis dengan konsistensi penutupan periode (*closing balance* bulan lalu menjadi *opening balance* bulan ini).
   - Ekspor laporan ke format **CSV** yang terlindung dari kerentanan *Spreadsheet Formula Injection* (eksekusi formula `=, +, -, @`).

7. **Hak Akses Setara & Autentikasi Pengguna (Members & Auth)**
   - Seluruh anggota kost memiliki hak operasional yang **setara** untuk mencatat transaksi dan melihat transparansi kas.
   - Autentikasi aman berbasis sesi database dengan cookie `HTTP-only` dan token terenkripsi.
   - Fitur ganti password dengan invalidasi otomatis seluruh sesi aktif lain.

8. **Pengaturan & Audit Trail (Settings & Audit Log)**
   - Pengaturan rekening kas operasional, pemegang kas, dan tarif iuran bulanan.
   - Fitur rekonsiliasi saldo kas tercatat dengan mutasi riil DANA.
   - Catatan riwayat audit lengkap (*Audit Log*) dengan paginasi database untuk setiap tindakan administratif dan finansial.

9. **Keamanan Inisialisasi Pertama (First-Time Web Setup)**
   - Inisialisasi akun administrator/anggota pertama diproteksi oleh `INITIAL_SETUP_TOKEN` server-side menggunakan perbandingan *timing-safe*.
   - Penguncian *advisory lock* PostgreSQL mencegah *race condition* saat setup. Sistem otomatis terkunci secara permanen begitu akun pertama berhasil didaftarkan.

10. **Cadangan & Pemulihan Bencana (Automated Backup & Restore)**
    - Skrip cadangan database PostgreSQL otomatis terkompresi gzip (`scripts/db-backup.sh`).
    - Skrip pemulihan darurat (*disaster recovery*) dengan pengaman *fail-closed* (`scripts/db-restore.sh`).

---

## 🏗️ Arsitektur & Teknologi

| Komponen | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) | React 19, Server Components, Server Actions |
| **Bahasa** | [TypeScript](https://www.typescriptlang.org/) | Strict mode, anti-`any`, kuat secara tipe data |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) | Minimalist Finance SaaS (*off-white*, *charcoal*, & aksen *deep teal*) |
| **Database** | [PostgreSQL 17](https://www.postgresql.org/) | Menggunakan image ringan `postgres:17-alpine` |
| **ORM** | [Prisma 7.10.1](https://www.prisma.io/) | Schema deklaratif, migrasi SQL transaksional |
| **Kontainerisasi** | [Docker](https://www.docker.com/) & Docker Compose | Multi-stage build hemat resource, Alpine Linux base |
| **Image Registry** | GitHub Container Registry (GHCR) | Deployment otomatis via GitHub Actions CI/CD |

---

## 🖥️ Infrastruktur & Spesifikasi Deployment

Aplikasi saat ini telah aktif berjalan pada server Virtual Machine (VM) khusus milik kost dengan spesifikasi hemat resource:

- **Host OS**: Alpine Linux 3.21 (x86_64 / AMD64)
- **Kapasitas Host**: 2 vCPU, RAM 1 GB (952 MB), Disk 10 GB
- **Alamat Domain Publik**: [https://vm-kebonkacang.supercomfy.dev/](https://vm-kebonkacang.supercomfy.dev/)
- **Port Binding Aplikasi**: `0.0.0.0:3000` (diteruskan oleh reverse proxy/gateway platform)
- **Keamanan Database**: PostgreSQL berjalan pada jaringan privat internal Docker (*zero public exposure*).
- **Manajemen Memori (Total < 704 MB)**:
  - Container Next.js: Limit RAM 448 MB (Reservation 192 MB)
  - Container PostgreSQL: Limit RAM 256 MB (Reservation 96 MB, *tuned shared_buffers 64MB*)
  - Sisa ~248 MB dialokasikan untuk kernel buffer Alpine OS agar terhindar dari *Out-Of-Memory (OOM) Killer*.

---

## 🚀 Menjalankan Proyek di Lingkungan Lokal (Development)

### Prasyarat
- **Node.js** v20.x atau lebih baru
- **npm** v10.x atau lebih baru
- **PostgreSQL 17** (dapat menggunakan instance lokal atau Docker)

### 1. Klon Repository & Instal Dependensi
```bash
git clone https://github.com/ahansn/kostkas.git
cd kostkas
npm install
```

### 2. Konfigurasi Environment Variable
Salin file konfigurasi contoh dan sesuaikan variabel koneksi database:
```bash
cp .env.example .env
```

Isi variabel penting pada `.env`:
```env
DATABASE_URL="postgresql://kostkas:kostkas_dev_secret@localhost:5433/kostkas_db"
TEST_DATABASE_URL="postgresql://kostkas:kostkas_test_secret@localhost:5433/kostkas_test_db"
AUTH_SECRET="buat_string_rahasia_acak_minimal_32_karakter"
INITIAL_SETUP_TOKEN="token_rahasia_setup_awal_minimal_16_karakter"
COOKIE_SECURE="false" # set true pada production HTTPS
```

### 3. Migrasi Database & Setup Master Data
```bash
# Jalankan migrasi schema ke PostgreSQL
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate

# (Opsional) Jalankan data inisialisasi awal
npm run db:seed
```

### 4. Jalankan Development Server
```bash
npm run dev
```
Akses antarmuka aplikasi melalui browser di [http://localhost:3000](http://localhost:3000).

---

## 🧪 Rangkaian Pengujian & Quality Gates

KostKas menerapkan standar kualitas kode yang ketat sebelum rilis production:

```bash
# 1. Pengecekan Type Safety TypeScript
npx tsc --noEmit

# 2. Pengecekan Gaya Kode & Linting (ESLint Flat Config)
npm run lint

# 3. Menjalankan Seluruh Rangkaian Automated Tests (8 Test Suites)
npm run test:all

# 4. Verifikasi Kompilasi Production Next.js & Utility CSS Tailwind v4
npm run build
```

### Ringkasan Automated Test Suites (`npm run test:all`):
- `test:db`: 10 skenario integritas keuangan dasar, cicilan, dan arus kas ledger.
- `test:m5`: Autentikasi bcrypt, sesi jose, otorisasi hak akses, dan pembayaran iuran.
- `test:m6`: Pengeluaran kas, reimbursement, konkurensi pencairan ganda, dan pembatalan transaksi.
- `test:m7`: Pagu anggaran, deteksi over-budget, neraca laporan keuangan, dan ekspor CSV.
- `test:m8`: Pengerasan keamanan, brute-force protection, timing attack, dan paginasi audit log.
- `test:m10`: Pengujian fail-closed first-time setup token dan advisory concurrency lock.
- `test:reconciliation`: 7 skenario rekonsiliasi transaksi Galon (A–G) lintas seluruh modul.
- `test:category-migration`: 7 skenario verifikasi migrasi non-destruktif, pelestarian kategori kustom, idempotency sejati, dan pengujian rollback transaksi PostgreSQL.

---

## 📦 Skrip Cadangan & Pemulihan Database (Production)

KostKas dilengkapi skrip operasional khusus untuk backup dan restore tanpa memerlukan akses GUI:

```bash
# Membuat cadangan database terkompresi gzip (tersimpan di folder backups/)
npm run db:backup
# atau
./scripts/db-backup.sh

# Memulihkan database dari arsip cadangan (memerlukan konfirmasi CONFIRM_RESTORE=YES)
CONFIRM_RESTORE=YES npm run db:restore backups/kostkas_backup_YYYYMMDD_HHMMSS.sql.gz
```

> **Catatan Operasional VM**: Skrip backup dijalankan tanpa alokasi pseudo-TTY (`-T`) untuk mencegah korupsi stream biner kompresi gzip.

---

## 📄 Lisensi & Kontribusi

Proyek ini dikembangkan secara privat untuk pengelolaan operasional kas kost. Hak cipta dilindungi undang-undang. Seluruh kontribusi kode dikelola melalui alur kerja Git pull request dan verifikasi otomatis antarmuka AI Agent.
