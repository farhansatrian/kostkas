# KostKas

**KostKas** adalah aplikasi web pengelolaan uang kas bersama untuk penghuni kost. Aplikasi ini dirancang untuk mencatat iuran bulanan, pengeluaran operasional kas, *reimbursement* (penggantian dana talangan), perencanaan anggaran, dan laporan keuangan secara transparan.

> **Status Proyek Saat Ini — Tahap 1: Project Foundation (`DEMO`)**
> Antarmuka dashboard saat ini menggunakan desain **Executive Ledger** dan menampilkan **data simulasi (`DEMO`)**. Modul penyimpanan database, autentikasi, dan halaman modul lanjutan akan diaktifkan pada tahap berikutnya.

---

## Konteks & Integritas Keuangan KostKas

- **Anggota Awal**: Farhan, Nabeel, dan Alzha.
- **Iuran Awal**: `Rp150.000` per anggota per bulan (Target pengumpulan rutin awal `Rp450.000/bulan`).
- **Parameter Dinamis**: Jumlah anggota aktif dan tarif iuran bulanan dirancang agar dapat berubah sewaktu-waktu tanpa mengubah kode sumber.
- **Hak Akses Setara (*Equal Access*)**: Seluruh anggota kost memiliki hak akses fitur yang setara.
- **Rekening Kas Operasional**: Farhan memegang akun **DANA** khusus kas kost sebagai penampung dana kas bersama.
- **Pemisahan Konsep Keuangan**:
  - **Saldo Kas Aktual (`Rp432.000`)**: Posisi kas riil di rekening DANA Kas (`Saldo Awal Rp320.000 + Iuran Diterima Rp300.000 - Total Kas Keluar Rp188.000`).
  - **Target Iuran Bulanan (`Rp450.000`)**: Kuota iuran rutin bulanan, bukan merupakan saldo kas aktual.
  - **Arus Kas Keluar (`Rp188.000`)**: Dipisahkan secara jelas antara pengeluaran operasional langsung (`Rp153.000`) dan pelunasan *reimbursement* (`Rp35.000`) agar tidak terjadi penghitungan ganda (*double-counting*).
  - **Reimbursement Terutang (`Rp25.000`)**: Kewajiban talangan anggota yang menunggu pencairan dari kas.
- **Target Infrastruktur**: Akan di-deploy ke Virtual Machine (VM) milik kost.

---

## Teknologi yang Digunakan

- **Framework**: [Next.js](https://nextjs.org/) (App Router, direktori `src/`)
- **Bahasa**: [TypeScript](https://www.typescriptlang.org/) (`strict` mode)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (*Minimalist Finance SaaS* — palet *off-white*, *charcoal*, & aksen *deep teal*)
- **Kualitas Kode**: ESLint CLI (`eslint.config.mjs`)

---

## Struktur Direktori Utama

```text
kostkas/
├── .agents/
│   └── skills/
│       └── kostkas-ui-design/
│           └── SKILL.md            # Panduan sistem desain UI/UX bagi AI Agent
├── src/
│   ├── app/
│   │   ├── globals.css             # Konfigurasi global Tailwind CSS & variabel tema
│   │   ├── layout.tsx              # Root layout aplikasi
│   │   └── page.tsx                # Halaman utama Ringkasan Kas (Executive Ledger)
│   ├── components/
│   │   └── app-shell.tsx           # Layout navigasi responsif (Desktop Sidebar & Mobile Header)
│   └── data/
│       └── demo-dashboard.ts       # Tipe TypeScript, helper Rupiah, & data simulasi DEMO
├── .env.example                    # Contoh konfigurasi environment tanpa kredensial asli
├── .gitattributes                  # Konfigurasi atribut Git repository
├── .gitignore                      # Proteksi node_modules, build output, secrets, & DB lokal
├── AGENTS.md                       # Standar kode, aturan domain, & keamanan untuk AI Agent
├── eslint.config.mjs               # Konfigurasi ESLint Flat Config
├── next.config.ts                  # Konfigurasi Next.js
├── package.json                    # Daftar dependensi dan script npm
└── tsconfig.json                   # Konfigurasi kompilator TypeScript
```

---

## Cara Menjalankan di Localhost

1. **Pastikan Node.js (v20+) dan npm sudah terpasang**:
   ```bash
   node -v
   npm -v
   ```

2. **Instal dependensi** (jika belum terinstal):
   ```bash
   npm install
   ```

3. **Jalankan server pengembangan (*development server*)**:
   ```bash
   npm run dev
   ```

4. **Buka di browser**:
   Akses [http://localhost:3000](http://localhost:3000) untuk melihat dashboard KostKas.

---

## Perintah Verifikasi Kualitas Kode

- **Menjalankan Linter (ESLint CLI)**:
  ```bash
  npm run lint
  ```

- **Menjalankan Production Build**:
  ```bash
  npm run build
  ```
