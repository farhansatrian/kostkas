export type MemberDueStatus = "LUNAS" | "MENUNGGU";

export interface KostMemberDue {
  id: string;
  name: string;
  isCashHolder?: boolean;
  monthlyDueAmount: number;
  paidAmount: number;
  status: MemberDueStatus;
  paidDateLabel: string;
}

export type TransactionType =
  | "IURAN_MASUK"
  | "PENGELUARAN_OPERASIONAL"
  | "PELUNASAN_REIMBURSE";

export interface CashTransaction {
  id: string;
  dateLabel: string;
  title: string;
  type: TransactionType;
  typeLabel: string;
  memberName: string;
  amount: number;
  flow: "IN" | "OUT";
}

export interface ReimbursementItem {
  id: string;
  requester: string;
  itemTitle: string;
  dateLabel: string;
  amount: number;
  status: "DICAIRKAN" | "TERUTANG";
  note: string;
}

export interface BudgetAllocation {
  id: string;
  categoryName: string;
  allocatedAmount: number;
  incurredExpenseAmount: number;
  description: string;
}

export interface NavigationModuleItem {
  id: string;
  label: string;
  href: string;
  implemented: boolean;
}

export interface KostKasDemoData {
  isDemo: true;
  periodLabel: string;
  asOfDateLabel: string;
  config: {
    activeMemberCount: number;
    monthlyDuePerMember: number;
    cashAccountProvider: string;
    cashAccountHolder: string;
  };
  cashSummary: {
    previousMonthCarryOver: number;
    monthlyTargetDues: number;
    collectedDuesThisMonth: number;
    directOperatingExpensesThisMonth: number;
    reimbursementSettlementsThisMonth: number;
    totalCashOutflowThisMonth: number;
    actualCashBalance: number;
    pendingReimbursementTotal: number;
    pendingReimbursementCount: number;
  };
  memberDues: KostMemberDue[];
  recentTransactions: CashTransaction[];
  reimbursements: ReimbursementItem[];
  budgets: BudgetAllocation[];
  navigationModules: NavigationModuleItem[];
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
 * Daftar struktur modul aplikasi KostKas.
 * Hanya modul dengan `implemented: true` yang ditampilkan sebagai menu interaktif
 * agar navigasi tetap bersih dan jujur terhadap fitur yang tersedia.
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
    implemented: false,
  },
  {
    id: "expenses",
    label: "Pengeluaran",
    href: "/pengeluaran",
    implemented: false,
  },
  {
    id: "reimbursements",
    label: "Reimbursement",
    href: "/reimbursement",
    implemented: false,
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

const memberDuesList: KostMemberDue[] = [
  {
    id: "MBR-01",
    name: "Farhan",
    isCashHolder: true,
    monthlyDueAmount: 150_000,
    paidAmount: 150_000,
    status: "LUNAS",
    paidDateLabel: "01 Nov 2026",
  },
  {
    id: "MBR-02",
    name: "Nabeel",
    monthlyDueAmount: 150_000,
    paidAmount: 150_000,
    status: "LUNAS",
    paidDateLabel: "01 Nov 2026",
  },
  {
    id: "MBR-03",
    name: "Alzha",
    monthlyDueAmount: 150_000,
    paidAmount: 0,
    status: "MENUNGGU",
    paidDateLabel: "Belum dibayar",
  },
];

const monthlyDuePerMember = 150_000;
const activeMemberCount = memberDuesList.length;

// Target iuran rutin bulanan (3 x Rp150.000 = Rp450.000) — bukan saldo kas aktual
const monthlyTargetDues = activeMemberCount * monthlyDuePerMember;

// Realisasi pembayaran iuran yang sudah masuk ke kas bulan ini (Farhan + Nabeel)
const collectedDuesThisMonth = memberDuesList.reduce(
  (sum, member) => sum + member.paidAmount,
  0
); // Rp300.000

// Saldo kas akhir bulan lalu yang dibawa ke awal bulan berjalan
const previousMonthCarryOver = 320_000;

// Pengeluaran operasional langsung dari kas (Token Listrik Rp105.000 + Galon & Sabun Rp48.000)
const directOperatingExpensesThisMonth = 153_000;

// Pelunasan utang reimbursement anggota dari kas (bukan biaya operasional kedua)
const reimbursementSettlementsThisMonth = 35_000;

// Total arus kas keluar dari rekening DANA Kas bulan ini
const totalCashOutflowThisMonth =
  directOperatingExpensesThisMonth + reimbursementSettlementsThisMonth; // Rp188.000

// Posisi Saldo Kas Aktual di rekening DANA Kas
// Rp320.000 + Rp300.000 - Rp188.000 = Rp432.000
const actualCashBalance =
  previousMonthCarryOver +
  collectedDuesThisMonth -
  totalCashOutflowThisMonth;

const reimbursementsList: ReimbursementItem[] = [
  {
    id: "RMB-02",
    requester: "Alzha",
    itemTitle: "Plastik sampah & karbol kamar mandi",
    dateLabel: "02 Nov 2026",
    amount: 25_000,
    status: "TERUTANG",
    note: "Talangan anggota, menunggu pencairan dari DANA Kas",
  },
  {
    id: "RMB-01",
    requester: "Nabeel",
    itemTitle: "Lampu LED 12W lorong depan",
    dateLabel: "02 Nov 2026",
    amount: 35_000,
    status: "DICAIRKAN",
    note: "Talangan periode sebelumnya, telah dilunasi dari DANA Kas",
  },
];

const pendingReimbursements = reimbursementsList.filter(
  (item) => item.status === "TERUTANG"
);
const pendingReimbursementTotal = pendingReimbursements.reduce(
  (sum, item) => sum + item.amount,
  0
); // Rp25.000

export const DEMO_DASHBOARD_DATA: KostKasDemoData = {
  isDemo: true,
  periodLabel: "November 2026",
  asOfDateLabel: "02 Nov 2026",
  config: {
    activeMemberCount,
    monthlyDuePerMember,
    cashAccountProvider: "DANA",
    cashAccountHolder: "Farhan",
  },
  cashSummary: {
    previousMonthCarryOver,
    monthlyTargetDues,
    collectedDuesThisMonth,
    directOperatingExpensesThisMonth,
    reimbursementSettlementsThisMonth,
    totalCashOutflowThisMonth,
    actualCashBalance,
    pendingReimbursementTotal,
    pendingReimbursementCount: pendingReimbursements.length,
  },
  memberDues: memberDuesList,
  recentTransactions: [
    {
      id: "TRX-05",
      dateLabel: "02 Nov 2026",
      title: "Pelunasan reimburse lampu lorong",
      type: "PELUNASAN_REIMBURSE",
      typeLabel: "Pelunasan Reimburse",
      memberName: "Nabeel",
      amount: 35_000,
      flow: "OUT",
    },
    {
      id: "TRX-04",
      dateLabel: "02 Nov 2026",
      title: "Isi ulang 2 galon & sabun cuci",
      type: "PENGELUARAN_OPERASIONAL",
      typeLabel: "Pengeluaran Kas",
      memberName: "Farhan",
      amount: 48_000,
      flow: "OUT",
    },
    {
      id: "TRX-03",
      dateLabel: "01 Nov 2026",
      title: "Iuran kas November",
      type: "IURAN_MASUK",
      typeLabel: "Iuran Bulanan",
      memberName: "Nabeel",
      amount: 150_000,
      flow: "IN",
    },
    {
      id: "TRX-02",
      dateLabel: "01 Nov 2026",
      title: "Token listrik bersama",
      type: "PENGELUARAN_OPERASIONAL",
      typeLabel: "Pengeluaran Kas",
      memberName: "Farhan",
      amount: 105_000,
      flow: "OUT",
    },
    {
      id: "TRX-01",
      dateLabel: "01 Nov 2026",
      title: "Iuran kas November",
      type: "IURAN_MASUK",
      typeLabel: "Iuran Bulanan",
      memberName: "Farhan",
      amount: 150_000,
      flow: "IN",
    },
  ],
  reimbursements: reimbursementsList,
  // Disiapkan untuk halaman modul Anggaran berikutnya (tanpa double-counting pelunasan reimburse)
  budgets: [
    {
      id: "BDG-01",
      categoryName: "Listrik Bersama",
      allocatedAmount: 200_000,
      incurredExpenseAmount: 105_000,
      description: "Token listrik area umum dan pompa air",
    },
    {
      id: "BDG-02",
      categoryName: "Air Minum & Dapur",
      allocatedAmount: 120_000,
      incurredExpenseAmount: 30_000,
      description: "Isi ulang air galon bersama",
    },
    {
      id: "BDG-03",
      categoryName: "Kebersihan & Rumah Tangga",
      allocatedAmount: 80_000,
      incurredExpenseAmount: 43_000,
      description: "Sabun cuci (Rp18.000) & perlengkapan kamar mandi via klaim Alzha (Rp25.000)",
    },
    {
      id: "BDG-04",
      categoryName: "Dana Cadangan",
      allocatedAmount: 50_000,
      incurredExpenseAmount: 0,
      description: "Cadangan perawatan ringan fasilitas kost",
    },
  ],
  navigationModules: APP_NAVIGATION_MODULES,
};
