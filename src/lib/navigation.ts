export interface NavigationModuleItem {
  id: string;
  label: string;
  href: string;
  description?: string;
  implemented: boolean;
  group: "operasional" | "laporan" | "sistem";
}

export interface NavigationGroup {
  id: "operasional" | "laporan" | "sistem";
  title: string;
  items: NavigationModuleItem[];
}

/**
 * Memformat angka ke mata uang Rupiah (IDR) standar Indonesia tanpa desimal.
 */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace(/\s+/g, "");
}

/**
 * Memformat objek Date menjadi tanggal ringkas bahasa Indonesia (contoh: 02 Nov 2026).
 */
export function formatShortDateId(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * Daftar struktur modul aplikasi KostKas yang dikelompokkan secara logis:
 * 1. Operasional Kas (Aktivitas Harian)
 * 2. Perencanaan & Laporan (Evaluasi Keuangan)
 * 3. Pengaturan & Sistem (Data Anggota & Konfigurasi)
 */
export const APP_NAVIGATION_MODULES: NavigationModuleItem[] = [
  // 1. Operasional Kas
  {
    id: "overview",
    label: "Ringkasan",
    href: "/",
    description: "Buku kas & saldo kas aktual",
    group: "operasional",
    implemented: true,
  },
  {
    id: "dues",
    label: "Iuran Bulanan",
    href: "/iuran",
    description: "Pencatatan & status bayar iuran",
    group: "operasional",
    implemented: true,
  },
  {
    id: "expenses",
    label: "Pengeluaran",
    href: "/pengeluaran",
    description: "Belanja kas & talangan anggota",
    group: "operasional",
    implemented: true,
  },
  {
    id: "reimbursements",
    label: "Reimbursement",
    href: "/reimbursement",
    description: "Klaim & pencairan dana talangan",
    group: "operasional",
    implemented: true,
  },

  // 2. Perencanaan & Laporan
  {
    id: "reports",
    label: "Laporan Keuangan",
    href: "/laporan",
    description: "Rekapitulasi, grafik & cetak PDF",
    group: "laporan",
    implemented: true,
  },
  {
    id: "budgets",
    label: "Anggaran & Pagu",
    href: "/anggaran",
    description: "Target belanja & riwayat bulan lalu",
    group: "laporan",
    implemented: true,
  },

  // 3. Pengaturan & Sistem
  {
    id: "members",
    label: "Anggota Kost",
    href: "/anggota",
    description: "Daftar penghuni & kontak",
    group: "sistem",
    implemented: true,
  },
  {
    id: "settings",
    label: "Pengaturan Kas & Akun",
    href: "/pengaturan",
    description: "Tarif, rekening kas & audit",
    group: "sistem",
    implemented: true,
  },
];

export const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    id: "operasional",
    title: "Operasional Kas",
    items: APP_NAVIGATION_MODULES.filter((m) => m.group === "operasional"),
  },
  {
    id: "laporan",
    title: "Perencanaan & Laporan",
    items: APP_NAVIGATION_MODULES.filter((m) => m.group === "laporan"),
  },
  {
    id: "sistem",
    title: "Sistem & Pengaturan",
    items: APP_NAVIGATION_MODULES.filter((m) => m.group === "sistem"),
  },
];
