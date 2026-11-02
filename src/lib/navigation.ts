export interface NavigationModuleItem {
  id: string;
  label: string;
  href: string;
  implemented: boolean;
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
 * Daftar struktur modul aplikasi KostKas.
 * Hanya modul dengan `implemented: true` yang ditampilkan pada navigasi aktif.
 */
export const APP_NAVIGATION_MODULES: NavigationModuleItem[] = [
  {
    id: "overview",
    label: "Ringkasan",
    href: "/",
    implemented: true,
  },
  {
    id: "dues",
    label: "Iuran",
    href: "/iuran",
    implemented: true,
  },
  {
    id: "members",
    label: "Anggota",
    href: "/anggota",
    implemented: true,
  },
  {
    id: "expenses",
    label: "Pengeluaran",
    href: "/pengeluaran",
    implemented: true,
  },
  {
    id: "reimbursements",
    label: "Reimbursement",
    href: "/reimbursement",
    implemented: true,
  },
  {
    id: "budgets",
    label: "Anggaran",
    href: "/anggaran",
    implemented: false,
  },
  {
    id: "reports",
    label: "Laporan",
    href: "/laporan",
    implemented: false,
  },
  {
    id: "settings",
    label: "Pengaturan",
    href: "/pengaturan",
    implemented: false,
  },
];

