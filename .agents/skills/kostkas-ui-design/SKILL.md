---
name: kostkas-ui-design
description: Panduan sistem desain UI/UX KostKas bergaya minimalist finance SaaS (Executive Ledger) yang bersih, profesional, content-first, dan responsif dengan palet off-white, charcoal, dan deep teal. Gunakan skill ini setiap kali merancang atau mengubah halaman, komponen, buku kas, tabel transaksi, maupun navigasi di aplikasi KostKas.
---

# KostKas UI Design System (`kostkas-ui-design`)

Skill ini mendefinisikan standar desain visual, arsitektur informasi, dan interaksi untuk **KostKas** — aplikasi pengelolaan uang kas bersama penghuni kost. Seluruh halaman dan komponen wajib mengutamakan kejelasan konten (*content-first*), ketenangan visual (*restraint*), dan presisi tipografi layaknya aplikasi *finance SaaS* yang matang.

---

## 1. Filosofi & Prinsip Desain

1. **Minimalist & Content-First**:
   - Biarkan angka keuangan, status anggota, dan riwayat transaksi berbicara langsung tanpa gangguan dekorasi.
   - **Hindari *Card-in-Card Syndrome***: Jangan membungkus setiap elemen kecil di dalam kartu terpisah. Gunakan pengelompokan ruang (*whitespace*) dan garis pemisah tipis (*hairline dividers* `1px solid`) di atas satu permukaan yang tenang.
   - **Tanpa Dekorasi Generik**: Jangan menggunakan gradien dekoratif, bayangan tebal (`shadow-lg`), *all-caps eyebrow* yang berlebihan, emoji sebagai ikon UI, atau deretan badge warna-warni di setiap seksi.
2. **Hierarki Finansial yang Tegas (*Executive Ledger*)**:
   - **Saldo Kas Aktual DANA** adalah titik fokus utama (*visual anchor*) di halaman ringkasan.
   - Metrik pendukung (Iuran Diterima, Total Arus Kas Keluar, dan Reimbursement Terutang) disusun sejajar dan proporsional di bawah saldo utama.
   - Jangan menampilkan penjelasan teknis developer, *roadmap* fitur, atau teks instruksional yang berulang di antarmuka pengguna.
3. **Satu Penanda `DEMO` yang Tenang**:
   - Selama menggunakan data simulasi, tampilkan **hanya satu** indikator `Mode Demo` di tingkat aplikasi/header. Jangan mengulang badge `DEMO` di setiap kartu atau tabel.
4. **Navigasi yang Jujur & Disiplin**:
   - **Desktop**: Gunakan sidebar vertikal yang tenang dan bersih. Tampilkan hanya navigasi yang benar-benar aktif; jangan memenuhi sidebar dengan daftar menu mati yang belum diimplementasikan.
   - **Mobile**: Gunakan header ringkas yang nyaman disentuh. Jangan memaksakan *bottom navigation bar* atau *horizontal scrolling pills* apabila baru ada satu halaman yang aktif.
   - Struktur rute modul masa depan (Iuran, Pengeluaran, Reimbursement, Anggaran, Laporan, Pengaturan) tetap disiapkan secara rapi di kode konfigurasi untuk tahap pengembangan berikutnya.

---

## 2. Design Tokens (Warna, Tipografi, & Ruang)

### A. Palet Warna Inti
- **Canvas Background**: `#F8FAFA` (`bg-[#F8FAFA]`) — *Cool off-white* yang lembut di mata.
- **Primary Surface**: `#FFFFFF` (`bg-white`) — Permukaan utama untuk *Executive Ledger* dan daftar data.
- **Subtle Surface**: `#F1F5F9` (`bg-slate-100/70`) — Latar halus untuk indikator aktif atau bar progres.
- **Primary Text (Charcoal)**: `#0F172A` (`text-slate-900`) — Judul, nominal utama, dan nama entitas.
- **Secondary Text**: `#475569` (`text-slate-600`) — Label metrik, keterangan kategori, dan tanggal.
- **Muted Text**: `#64748B` (`text-slate-500`) — Informasi pendukung sekunder (tetap memenuhi kontras aksesibilitas WCAG AA).
- **Primary Accent (Deep Teal)**: `#0F766E` (`text-teal-700`, `bg-teal-700`) — Aksen identitas utama, indikator navigasi aktif, dan bar progres pengumpulan iuran.
- **Hairline Border**: `#E2E8F0` (`border-slate-200`) — Garis pembatas `1px` antar bagian dan baris transaksi.

### B. Warna Semantik Terkontrol
- **Arus Masuk / Status Lunas**: `text-emerald-700` (`#047857`) dengan indikator titik `bg-emerald-600`.
- **Status Menunggu / Kewajiban Terutang / Mode Demo**: `text-amber-800` (`#92400E`) dengan latar lembut `bg-amber-50/80 border-amber-200/80`.
- **Arus Keluar**: Gunakan `text-slate-900` dengan tanda minus (`-Rp105.000`) agar tabel transaksi tetap tenang dan tidak penuh warna merah yang mengesankan error.

### C. Sistem Tipografi
- **Font Family**:
  - Sans-serif sistem modern (`--font-geist-sans`) untuk seluruh teks antarmuka dan angka utama.
  - Monospace (`--font-geist-mono`) hanya bila diperlukan untuk penanda status ringkas.
- **Aturan Angka (`tabular-nums`)**:
  - Wajib menerapkan class `tabular-nums` pada seluruh nominal Rupiah, persentase, dan tanggal agar sejajar secara vertikal.
- **Skala Tipografi**:
  - **Saldo Kas Utama (Hero)**: `text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 tabular-nums`
  - **Metrik Ringkasan (KPI)**: `text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 tabular-nums`
  - **Judul Halaman**: `text-lg sm:text-xl font-semibold tracking-tight text-slate-900`
  - **Judul Seksi**: `text-sm font-semibold text-slate-900` (*Sentence case*, bukan *ALL CAPS*)
  - **Isi Tabel / Baris Data**: `text-sm text-slate-900` (utama) dan `text-xs text-slate-500` (sub-baris)

---

## 3. Arsitektur Informasi Dashboard (*Executive Ledger*)

Halaman utama Dashboard (`src/app/page.tsx`) hanya boleh menampilkan **6 informasi inti**:

1. **Total Saldo Kas DANA** (informasi paling utama, beserta keterangan pemegang akun DANA dan saldo awal bulan lalu).
2. **Ringkasan Iuran Diterima Bulan Ini** (realisasi dibanding target bulanan).
3. **Ringkasan Total Arus Kas Keluar Bulan Ini** (memisahkan belanja operasional langsung dan pencairan reimbursement).
4. **Total Reimbursement yang Masih Terutang** (kewajiban klaim anggota yang menunggu pencairan).
5. **Status Iuran Anggota Secara Ringkas** (daftar anggota aktif, nominal iuran, dan status Lunas/Menunggu).
6. **Maksimal 5 Transaksi Terbaru** (daftar kronologis yang bersih tanpa kode ID teknis yang mengganggu).

> **Catatan Arsitektur**: Rincian alokasi anggaran per kategori, detail pengajuan reimbursement, dan pengaturan anggota/tarif ditempatkan pada halaman modul tersendiri di tahap implementasi berikutnya.

---

## 4. Standar Responsivitas & Aksesibilitas

- **Viewport wajib lulus uji**: `1440px` (Desktop), `768px` (Tablet), `390px` (Mobile modern), dan `375px` (Mobile ringkas).
- **Zero Horizontal Overflow**: Pastikan tidak ada elemen yang meluber ke samping (`overflow-x`) pada layar `375px`.
- **Semantic HTML**: Gunakan elemen `<aside>`, `<header>`, `<nav>`, `<main>`, `<section>`, `<dl>/<dt>/<dd>`, dan `<table>`/`<ul>` secara tepat dengan kontras teks minimal standar AA.
