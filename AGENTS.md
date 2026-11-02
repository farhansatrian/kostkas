<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# KostKas — Panduan & Standar Pengembangan AI Agent (`AGENTS.md`)

Dokumen ini adalah sumber kebenaran utama (*single source of truth*) bagi AI Agent yang membantu pengembangan **KostKas**. Setiap perubahan kode, arsitektur, dan antarmuka wajib mematuhi aturan di bawah ini.

---

## 1. Konteks Domain & Integritas Keuangan KostKas

- **Tujuan Aplikasi**: Sistem pengelolaan uang kas bersama yang transparan, rapi, dan akuntabel untuk penghuni kost.
- **Anggota & Tarif Dinamis**:
  - Anggota awal: **Farhan**, **Nabeel**, dan **Alzha**.
  - Tarif iuran awal: **Rp150.000 per anggota per bulan** (target pengumpulan awal Rp450.000/bulan untuk 3 anggota).
  - **Aturan Kritis**: Jumlah anggota maupun nominal tarif iuran **harus bersifat dinamis (configurable)**. Jangan pernah menulis logika bisnis yang mengunci (*hardcode*) angka `3` anggota atau `150000` sebagai konstanta permanen yang tidak bisa diubah di masa depan.
- **Hak Akses Setara (*Equal Access*)**:
  - Seluruh anggota memiliki hak akses fitur yang **setara**. Jangan membuat pembatasan fitur operasional yang menghalangi anggota untuk melihat rincian maupun mencatat transaksi.
- **Rekening Kas Operasional**:
  - **Farhan** memegang akun **DANA** khusus kas kost sebagai dompet penyimpanan dana kas bersama.
- **Pemisahan Konsep & Akuntansi Keuangan**:
  - Bedakan secara tegas antara:
    1. **Saldo Kas Aktual**: Posisi uang riil di akun DANA Kas (`Saldo Awal Bulan Lalu + Iuran Diterima Bulan Ini - Total Arus Kas Keluar Bulan Ini`).
    2. **Target Iuran Bulanan**: Kuota iuran rutin (`jumlah_anggota_aktif × tarif_iuran_per_bulan`), **bukan** saldo kas aktual.
    3. **Realisasi Pembayaran Iuran**: Total iuran anggota yang benar-benar sudah masuk ke kas pada periode berjalan.
    4. **Pengeluaran Operasional Langsung**: Belanja kebutuhan kost yang dibayar langsung dari saldo kas.
    5. **Reimbursement (Talangan Anggota)**:
       - *Reimbursement Terutang*: Pengeluaran yang ditalangi anggota dan belum dicairkan dari kas (merupakan kewajiban/utang kas, belum mengurangi saldo kas aktual).
       - *Pelunasan Reimbursement*: Pencairan kas untuk mengganti dana talangan anggota (mengurangi saldo kas, namun **jangan dihitung dua kali sebagai biaya operasional kedua**).
  - Pastikan seluruh nominal, rincian transaksi, dan tanggal bersifat konsisten secara matematis dan kronologis (tidak menampilkan tanggal masa depan untuk transaksi yang sudah terjadi).
- **Modul Utama Sistem**:
  1. Ringkasan Dashboard (*Executive Ledger*)
  2. Pencatatan Iuran Bulanan (*Monthly Dues*)
  3. Pencatatan Pengeluaran Kas (*Expenses*)
  4. Pengajuan & Pencairan *Reimbursement*
  5. Perencanaan Anggaran Bulanan (*Budgeting*)
  6. Laporan & Rekapitulasi Keuangan (*Financial Reports*)
  7. Pengaturan Anggota & Tarif (*Settings*)
- **Target Deployment**:
  - Aplikasi nantinya akan di-deploy ke **Virtual Machine (VM) milik kost**. Jaga agar arsitektur tetap ringan, *self-contained*, dan hemat resource.

---

## 2. Standar Teknis & Penulisan Kode (*Coding Standards*)

- **Tech Stack**:
  - Framework: **Next.js (App Router)** di dalam direktori `src/`
  - Bahasa: **TypeScript** (`strict: true` — hindari penggunaan `any`)
  - Styling: **Tailwind CSS v4**
  - Linting: **ESLint CLI** (`npm run lint` menjalankan `eslint` Flat Config, **bukan** `next lint`)
- **Struktur Direktori**:
  - `src/app/` — Routing, layout, dan halaman utama App Router.
  - `src/components/` — Komponen UI modular yang dapat digunakan kembali (seperti `AppShell`).
  - `src/data/` atau `src/lib/` — Tipe data TypeScript, konfigurasi modul, fungsi utilitas (`formatRupiah`), dan data simulasi (`DEMO`).
- **Kejujuran Status Fitur & Kerapian UI (*Feature Honesty & Restraint*)**:
  - Saat menggunakan data simulasi, tampilkan **satu penanda `DEMO`** yang jelas namun tenang (tidak berulang di setiap kartu atau seksi).
  - Jangan menampilkan catatan teknis internal developer atau status *roadmap* di dalam antarmuka pengguna.
  - Jangan memenuhi sidebar atau halaman dengan menu/tombol yang belum berfungsi. Struktur navigasi untuk modul masa depan disiapkan di level kode/konfigurasi, sementara antarmuka hanya menampilkan navigasi yang benar-benar aktif secara jujur dan bersih.
- **Format Mata Uang & Tanggal**:
  - Gunakan format standar Rupiah Indonesia (`Rp150.000`, tanpa desimal `,00` kecuali diperlukan secara khusus) melalui helper `Intl.NumberFormat('id-ID', ...)` dan selalu gunakan `tabular-nums`.
- **Desain Antarmuka (UI/UX)**:
  - Wajib membaca dan mengikuti panduan desain di `.agents/skills/kostkas-ui-design/SKILL.md` serta prinsip `.agents/skills/frontend-design/SKILL.md` dan `.agents/skills/web-design-guidelines/SKILL.md`.

---

## 3. Keamanan & Privasi Data (*Security Rules*)

- **Larangan Data & Kredensial Asli**:
  - **DILARANG** menulis kredensial asli, PIN, password, API key, nomor telepon pribadi, atau mutasi rekening asli ke dalam kode sumber.
  - Gunakan hanya data fiktif bertanda `DEMO` selama fase pengembangan UI/fondasi.
- **Manajemen Environment Variables**:
  - Semua variabel rahasia wajib disimpan di `.env.local` (atau `.env`) yang diabaikan oleh Git.
  - Sediakan `.env.example` berisi nama variabel dengan nilai *placeholder* yang aman sebagai dokumentasi.
- **Integrasi Pihak Ketiga**:
  - Jangan mengintegrasikan SDK/API DANA, payment gateway, atau layanan eksternal apa pun tanpa instruksi langsung dari pemilik proyek.

---

## 4. Alur Kerja Git & Operasional Agent

- **Repository Git**:
  - Pertahankan folder `.git/`, file `.gitattributes`, dan branch `main` yang sudah ada.
  - **DILARANG** membuat repository Git baru (`git init`) atau mengubah konfigurasi remote tanpa izin.
- **Kendali Penuh oleh Developer**:
  - **DILARANG** menjalankan `git commit`, `git push`, atau proses deployment secara otomatis. Developer akan meninjau diff dan melakukan commit/push secara mandiri melalui **GitHub Desktop**.
- **Verifikasi Wajib**:
  - Setiap selesai melakukan perubahan kode, Agent wajib menjalankan:
    1. `npm run lint` (memastikan 0 error & 0 warning ESLint)
    2. `npm run build` (memastikan TypeScript type-check & production build berhasil)
