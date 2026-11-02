import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";
import { assertAuthenticatedActor, type AuthenticatedActor } from "./auth";
import {
  formatPeriodLabel,
  getCurrentYearMonthPeriod,
  shiftYearMonthPeriod,
  stripChargePrefixFromNote,
} from "./contribution-service";

export const JAKARTA_TIMEZONE = "Asia/Jakarta";

export const ReportPeriodSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format periode laporan harus YYYY-MM.");

export const ExportTypeSchema = z.enum([
  "summary",
  "cash-ledger",
  "contributions",
  "expenses",
  "reimbursements",
]);

export type FinancialExportType = z.infer<typeof ExportTypeSchema>;

/**
 * Menghitung batas waktu awal (inklusif) dan akhir (eksklusif) suatu periode YYYY-MM
 * menggunakan zona waktu Asia/Jakarta (UTC+07:00) secara presisi.
 */
export function getJakartaPeriodBounds(period: string): {
  period: string;
  startUtc: Date;
  endUtc: Date;
} {
  const parsed = ReportPeriodSchema.safeParse(period);
  if (!parsed.success) {
    throw new Error("Format periode harus YYYY-MM (contoh: 2026-11).");
  }

  const [yearStr, monthStr] = parsed.data.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const startIso = `${year}-${String(month).padStart(2, "0")}-01T00:00:00.000+07:00`;
  const endIso = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000+07:00`;

  return {
    period: parsed.data,
    startUtc: new Date(startIso),
    endUtc: new Date(endIso),
  };
}

/**
 * Memformat Date menjadi string tanggal & waktu dengan zona waktu Asia/Jakarta.
 */
export function formatJakartaDate(date: Date, includeTime = false): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      : {}),
  }).format(date);
}

/**
 * Mengamankan nilai sel CSV dari serangan Spreadsheet Formula Injection (CSV Injection)
 * sesuai standar OWASP (awalan =, +, -, @, tab, atau CR pada teks di-prefix dengan apostrof ').
 */
export function sanitizeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '""';
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(Math.trunc(value)) : "0";
  }

  const raw = String(value);
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(raw);
  const safeText = needsFormulaGuard ? `'${raw}` : raw;
  const escaped = safeText.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function buildCsvDocument(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): string {
  const headerLine = headers.map((h) => sanitizeCsvCell(h)).join(",");
  const bodyLines = rows.map((row) =>
    row.map((cell) => sanitizeCsvCell(cell)).join(",")
  );
  return [headerLine, ...bodyLines].join("\r\n") + "\r\n";
}

async function verifyActiveActorInDb(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined
): Promise<AuthenticatedActor> {
  const validActor = assertAuthenticatedActor(actor);
  const member = await db.member.findUnique({
    where: { id: validActor.memberId },
    select: { id: true, leftAt: true },
  });
  if (!member || member.leftAt !== null) {
    throw new Error("Akses ditolak: anggota sudah tidak aktif.");
  }
  return validActor;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  categoryName: string;
  parentName: string | null;
  displayLabel: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface MemberObligationSummaryItem {
  memberId: string;
  memberName: string;
  isActiveMember: boolean;
  regularBilled: number;
  additionalBilled: number;
  totalBilled: number;
  paidAllocated: number;
  unpaidRemaining: number;
  status: "LUNAS" | "CICILAN" | "BELUM_BAYAR" | "TANPA_TAGIHAN";
}

export interface PeriodCashMovementItem {
  id: string;
  occurredAt: Date;
  dateLabel: string;
  direction: "IN" | "OUT";
  category:
    | "OPENING_BALANCE"
    | "CONTRIBUTION_PAYMENT"
    | "DIRECT_EXPENSE"
    | "REIMBURSEMENT_PAYOUT"
    | "ADJUSTMENT";
  categoryLabel: string;
  description: string;
  actorName: string;
  amount: number;
  runningBalance: number;
}

export interface FinancialReportData {
  period: string;
  periodLabel: string;
  selectedYear: number;
  selectedMonth: number;
  timezone: string;
  availablePeriods: Array<{ value: string; label: string }>;
  cashAccount: {
    id: string;
    code: string;
    name: string;
    provider: string;
    custodianName: string;
    currentTotalActualBalance: number;
  };
  // 1. Tagihan & Piutang Anggota
  memberReceivables: {
    totalBilledAmount: number;
    totalAllocatedAmount: number;
    totalUnpaidReceivableAmount: number;
    allTimeUnpaidReceivableAmount: number;
    memberObligations: MemberObligationSummaryItem[];
  };
  // 2. Penerimaan Kas Aktual & Posisi Saldo Periode
  actualCashInflow: {
    openingBalance: number;
    periodOpeningEntryTotal: number;
    confirmedContributionInflow: number;
    adjustmentInflow: number;
    totalCashInflow: number;
    closingBalance: number;
  };
  // 3. Beban Operasional (tanpa menghitung dua kali reimbursement payout)
  operatingExpenses: {
    directOperatingExpense: number;
    memberAdvanceOperatingExpense: number;
    totalOperatingExpense: number;
    pendingExpenseAmount: number;
    pendingExpenseCount: number;
    categoryBreakdown: CategoryBreakdownItem[];
  };
  // 4. Pengeluaran Kas Aktual
  actualCashOutflow: {
    directExpenseCashOutflow: number;
    reimbursementPayoutCashOutflow: number;
    adjustmentOutflow: number;
    totalCashOutflow: number;
  };
  // 5. Kewajiban Reimbursement
  reimbursementObligations: {
    periodNewAdvanceTotal: number;
    periodSettledPayoutTotal: number;
    totalOutstandingReimbursement: number;
    outstandingClaimsCount: number;
  };
  periodCashMovements: PeriodCashMovementItem[];
}

/**
 * Mengambil laporan finansial lengkap untuk suatu periode (YYYY-MM) dari PostgreSQL
 * dengan pemisahan tegas antara piutang iuran, kas masuk aktual, beban operasional,
 * kas keluar aktual, dan kewajiban reimbursement.
 */
export async function getFinancialReportData(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawPeriod?: string,
  options?: { cashAccountId?: string }
): Promise<FinancialReportData> {
  await verifyActiveActorInDb(db, actor);

  const fallbackPeriod = getCurrentYearMonthPeriod();
  const targetPeriod =
    rawPeriod && ReportPeriodSchema.safeParse(rawPeriod).success
      ? rawPeriod.trim()
      : fallbackPeriod;

  const { startUtc, endUtc } = getJakartaPeriodBounds(targetPeriod);
  const [yearStr, monthStr] = targetPeriod.split("-");

  const [
    cashAccount,
    members,
    periodCharges,
    allUnpaidCharges,
    periodExpenses,
    outstandingReimbursements,
    periodNewReimbursements,
    periodReimbursementPayouts,
  ] = await Promise.all([
    options?.cashAccountId
      ? db.cashAccount.findUnique({
          where: { id: options.cashAccountId },
          include: { custodianMember: true },
        })
      : db.cashAccount.findFirst({
          where: { isActive: true },
          include: { custodianMember: true },
          orderBy: { createdAt: "asc" },
        }),
    db.member.findMany({
      orderBy: [{ joinedAt: "asc" }, { name: "asc" }],
    }),
    db.contributionCharge.findMany({
      where: {
        period: targetPeriod,
        status: { not: "CANCELLED" },
      },
      orderBy: [{ kind: "asc" }, { sequence: "asc" }],
    }),
    db.contributionCharge.findMany({
      where: {
        status: { in: ["UNPAID", "PARTIALLY_PAID"] },
      },
      select: {
        amount: true,
        allocatedAmount: true,
      },
    }),
    db.expense.findMany({
      where: {
        expenseDate: {
          gte: startUtc,
          lt: endUtc,
        },
      },
      include: {
        category: {
          include: {
            parent: { select: { name: true } },
          },
        },
        recordedByMember: { select: { name: true } },
        advancedByMember: { select: { name: true } },
      },
      orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }],
    }),
    db.reimbursement.findMany({
      where: {
        status: { in: ["OUTSTANDING", "PARTIALLY_SETTLED"] },
      },
      select: {
        totalAmount: true,
        settledAmount: true,
      },
    }),
    db.reimbursement.findMany({
      where: {
        status: { not: "CANCELLED" },
        expense: {
          expenseDate: {
            gte: startUtc,
            lt: endUtc,
          },
        },
      },
      select: {
        totalAmount: true,
      },
    }),
    db.reimbursementPayout.findMany({
      where: {
        paidAt: {
          gte: startUtc,
          lt: endUtc,
        },
      },
      select: {
        amount: true,
      },
    }),
  ]);

  if (!cashAccount) {
    throw new Error("Akun kas utama DANA belum tersedia di database.");
  }

  // Ambil seluruh CashMovement CONFIRMED untuk akun kas ini secara kronologis
  const allConfirmedMovements = await db.cashMovement.findMany({
    where: {
      cashAccountId: cashAccount.id,
      status: "CONFIRMED",
    },
    include: {
      actorMember: { select: { name: true } },
      payment: { include: { member: { select: { name: true } } } },
    },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
  });

  let openingBalance = 0;
  let periodOpeningEntryTotal = 0;
  let confirmedContributionInflow = 0;
  let adjustmentInflow = 0;
  let directExpenseCashOutflow = 0;
  let reimbursementPayoutCashOutflow = 0;
  let adjustmentOutflow = 0;
  let currentTotalActualBalance = 0;

  const rawPeriodMovements: typeof allConfirmedMovements = [];

  for (const mov of allConfirmedMovements) {
    const signed = mov.direction === "IN" ? mov.amount : -mov.amount;
    currentTotalActualBalance += signed;

    if (mov.occurredAt < startUtc) {
      openingBalance += signed;
    } else if (mov.occurredAt >= startUtc && mov.occurredAt < endUtc) {
      if (mov.category === "OPENING_BALANCE") {
        // Saldo awal yang dicatat di dalam periode menambah posisi saldo awal periode
        openingBalance += signed;
        periodOpeningEntryTotal += signed;
      } else {
        rawPeriodMovements.push(mov);
        if (mov.direction === "IN") {
          if (mov.category === "CONTRIBUTION_PAYMENT") {
            confirmedContributionInflow += mov.amount;
          } else {
            adjustmentInflow += mov.amount;
          }
        } else {
          if (mov.category === "DIRECT_EXPENSE") {
            directExpenseCashOutflow += mov.amount;
          } else if (mov.category === "REIMBURSEMENT_PAYOUT") {
            reimbursementPayoutCashOutflow += mov.amount;
          } else {
            adjustmentOutflow += mov.amount;
          }
        }
      }
    }
  }

  const totalCashInflow = confirmedContributionInflow + adjustmentInflow;
  const totalCashOutflow =
    directExpenseCashOutflow +
    reimbursementPayoutCashOutflow +
    adjustmentOutflow;
  const closingBalance = openingBalance + totalCashInflow - totalCashOutflow;

  const categoryLabels: Record<string, string> = {
    OPENING_BALANCE: "Saldo Awal",
    CONTRIBUTION_PAYMENT: "Pembayaran Iuran",
    DIRECT_EXPENSE: "Pengeluaran Kas Langsung",
    REIMBURSEMENT_PAYOUT: "Pencairan Reimbursement",
    ADJUSTMENT: "Penyesuaian Kas",
  };

  let runningTracker = openingBalance;
  const periodCashMovements: PeriodCashMovementItem[] = rawPeriodMovements.map(
    (mov) => {
      runningTracker += mov.direction === "IN" ? mov.amount : -mov.amount;
      return {
        id: mov.id,
        occurredAt: mov.occurredAt,
        dateLabel: formatJakartaDate(mov.occurredAt),
        direction: mov.direction,
        category: mov.category,
        categoryLabel: categoryLabels[mov.category] ?? mov.category,
        description: stripChargePrefixFromNote(mov.description),
        actorName:
          mov.payment?.member.name ?? mov.actorMember?.name ?? "Sistem",
        amount: mov.amount,
        runningBalance: runningTracker,
      };
    }
  );

  // 3. Beban Operasional (Expense CONFIRMED vs PENDING)
  let directOperatingExpense = 0;
  let memberAdvanceOperatingExpense = 0;
  let pendingExpenseAmount = 0;
  let pendingExpenseCount = 0;

  const categoryAccumulator = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      parentName: string | null;
      displayLabel: string;
      amount: number;
      transactionCount: number;
    }
  >();

  for (const exp of periodExpenses) {
    if (exp.status === "CONFIRMED") {
      if (exp.fundingSource === "DIRECT_CASH") {
        directOperatingExpense += exp.amount;
      } else {
        memberAdvanceOperatingExpense += exp.amount;
      }

      const parentName = exp.category.parent?.name ?? null;
      const displayLabel = parentName
        ? `${parentName} — ${exp.category.name}`
        : exp.category.name;

      const existing = categoryAccumulator.get(exp.categoryId);
      if (existing) {
        existing.amount += exp.amount;
        existing.transactionCount += 1;
      } else {
        categoryAccumulator.set(exp.categoryId, {
          categoryId: exp.categoryId,
          categoryName: exp.category.name,
          parentName,
          displayLabel,
          amount: exp.amount,
          transactionCount: 1,
        });
      }
    } else if (exp.status === "PENDING") {
      pendingExpenseAmount += exp.amount;
      pendingExpenseCount += 1;
    }
  }

  const totalOperatingExpense =
    directOperatingExpense + memberAdvanceOperatingExpense;

  const categoryBreakdown: CategoryBreakdownItem[] = Array.from(
    categoryAccumulator.values()
  )
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({
      ...item,
      percentage:
        totalOperatingExpense > 0
          ? Math.round((item.amount / totalOperatingExpense) * 100)
          : 0,
    }));

  // 1. Tagihan & Piutang Anggota
  let totalBilledAmount = 0;
  let totalAllocatedAmount = 0;
  for (const ch of periodCharges) {
    totalBilledAmount += ch.amount;
    totalAllocatedAmount += ch.allocatedAmount;
  }
  const totalUnpaidReceivableAmount = Math.max(
    0,
    totalBilledAmount - totalAllocatedAmount
  );

  const allTimeUnpaidReceivableAmount = allUnpaidCharges.reduce(
    (sum, c) => sum + Math.max(0, c.amount - c.allocatedAmount),
    0
  );

  const memberObligations: MemberObligationSummaryItem[] = members
    .filter((m) => {
      const hasChargesInPeriod = periodCharges.some((c) => c.memberId === m.id);
      return m.leftAt === null || hasChargesInPeriod;
    })
    .map((m) => {
      const mCharges = periodCharges.filter((c) => c.memberId === m.id);
      const regularBilled = mCharges
        .filter((c) => c.kind === "REGULAR")
        .reduce((s, c) => s + c.amount, 0);
      const additionalBilled = mCharges
        .filter((c) => c.kind === "ADDITIONAL")
        .reduce((s, c) => s + c.amount, 0);
      const totalBilled = regularBilled + additionalBilled;
      const paidAllocated = mCharges.reduce((s, c) => s + c.allocatedAmount, 0);
      const unpaidRemaining = Math.max(0, totalBilled - paidAllocated);

      let status: MemberObligationSummaryItem["status"] = "TANPA_TAGIHAN";
      if (totalBilled > 0) {
        if (unpaidRemaining === 0) {
          status = "LUNAS";
        } else if (paidAllocated > 0) {
          status = "CICILAN";
        } else {
          status = "BELUM_BAYAR";
        }
      }

      return {
        memberId: m.id,
        memberName: m.name,
        isActiveMember: m.leftAt === null,
        regularBilled,
        additionalBilled,
        totalBilled,
        paidAllocated,
        unpaidRemaining,
        status,
      };
    });

  // 5. Kewajiban Reimbursement
  const periodNewAdvanceTotal = periodNewReimbursements.reduce(
    (s, r) => s + r.totalAmount,
    0
  );
  const periodSettledPayoutTotal = periodReimbursementPayouts.reduce(
    (s, p) => s + p.amount,
    0
  );
  const totalOutstandingReimbursement = outstandingReimbursements.reduce(
    (s, r) => s + Math.max(0, r.totalAmount - r.settledAmount),
    0
  );

  const currentPeriod = getCurrentYearMonthPeriod();
  const periodSet = new Set<string>([
    shiftYearMonthPeriod(currentPeriod, -2),
    shiftYearMonthPeriod(currentPeriod, -1),
    currentPeriod,
    shiftYearMonthPeriod(currentPeriod, 1),
    targetPeriod,
  ]);

  const availablePeriods = Array.from(periodSet)
    .sort()
    .reverse()
    .map((p) => ({ value: p, label: formatPeriodLabel(p) }));

  return {
    period: targetPeriod,
    periodLabel: formatPeriodLabel(targetPeriod),
    selectedYear: Number(yearStr),
    selectedMonth: Number(monthStr),
    timezone: JAKARTA_TIMEZONE,
    availablePeriods,
    cashAccount: {
      id: cashAccount.id,
      code: cashAccount.code,
      name: cashAccount.name,
      provider: cashAccount.provider,
      custodianName: cashAccount.custodianMember?.name ?? "Farhan",
      currentTotalActualBalance,
    },
    memberReceivables: {
      totalBilledAmount,
      totalAllocatedAmount,
      totalUnpaidReceivableAmount,
      allTimeUnpaidReceivableAmount,
      memberObligations,
    },
    actualCashInflow: {
      openingBalance,
      periodOpeningEntryTotal,
      confirmedContributionInflow,
      adjustmentInflow,
      totalCashInflow,
      closingBalance,
    },
    operatingExpenses: {
      directOperatingExpense,
      memberAdvanceOperatingExpense,
      totalOperatingExpense,
      pendingExpenseAmount,
      pendingExpenseCount,
      categoryBreakdown,
    },
    actualCashOutflow: {
      directExpenseCashOutflow,
      reimbursementPayoutCashOutflow,
      adjustmentOutflow,
      totalCashOutflow,
    },
    reimbursementObligations: {
      periodNewAdvanceTotal,
      periodSettledPayoutTotal,
      totalOutstandingReimbursement,
      outstandingClaimsCount: outstandingReimbursements.length,
    },
    periodCashMovements,
  };
}

/**
 * Mengekspor laporan keuangan ke format CSV standar (kompatibel Excel & Google Sheets)
 * sesuai filter periode dan jenis dataset, terlindung dari formula injection,
 * serta hanya dapat diakses oleh anggota yang sudah login.
 */
export async function exportFinancialReportCsv(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: {
    period?: string;
    type?: string;
    cashAccountId?: string;
  }
): Promise<{
  filename: string;
  csvContent: string;
  period: string;
  exportType: FinancialExportType;
}> {
  await verifyActiveActorInDb(db, actor);

  const exportTypeParsed = ExportTypeSchema.safeParse(
    rawInput.type ?? "summary"
  );
  if (!exportTypeParsed.success) {
    throw new Error("Jenis ekspor CSV tidak valid.");
  }
  const exportType = exportTypeParsed.data;

  const report = await getFinancialReportData(db, actor, rawInput.period, {
    cashAccountId: rawInput.cashAccountId,
  });
  const { startUtc, endUtc } = getJakartaPeriodBounds(report.period);

  if (exportType === "summary") {
    const headers = [
      "Periode",
      "Kategori Metrik",
      "Komponen Laporan",
      "Nominal (IDR)",
      "Keterangan",
    ];
    const rows: Array<Array<string | number>> = [
      [
        report.period,
        "1. Posisi Saldo & Kas Masuk",
        "Saldo Awal Periode",
        report.actualCashInflow.openingBalance,
        "Akumulasi kas terkonfirmasi sebelum periode + saldo awal",
      ],
      [
        report.period,
        "1. Posisi Saldo & Kas Masuk",
        "Penerimaan Iuran Terkonfirmasi",
        report.actualCashInflow.confirmedContributionInflow,
        "Pembayaran iuran anggota yang sudah masuk ke kas DANA",
      ],
      [
        report.period,
        "1. Posisi Saldo & Kas Masuk",
        "Penyesuaian Kas Masuk (Adjustment IN)",
        report.actualCashInflow.adjustmentInflow,
        "Jurnal penyesuaian masuk",
      ],
      [
        report.period,
        "1. Posisi Saldo & Kas Masuk",
        "Total Arus Kas Masuk",
        report.actualCashInflow.totalCashInflow,
        "Total penerimaan kas aktual pada periode",
      ],
      [
        report.period,
        "2. Pengeluaran Kas Aktual",
        "Belanja Operasional Langsung (Kas DANA)",
        report.actualCashOutflow.directExpenseCashOutflow,
        "Pengeluaran yang langsung memotong kas DANA",
      ],
      [
        report.period,
        "2. Pengeluaran Kas Aktual",
        "Pencairan Reimbursement (Pelunasan Talangan)",
        report.actualCashOutflow.reimbursementPayoutCashOutflow,
        "Pelunasan utang talangan anggota dari kas DANA",
      ],
      [
        report.period,
        "2. Pengeluaran Kas Aktual",
        "Penyesuaian Kas Keluar (Adjustment OUT)",
        report.actualCashOutflow.adjustmentOutflow,
        "Jurnal penyesuaian keluar",
      ],
      [
        report.period,
        "2. Pengeluaran Kas Aktual",
        "Total Arus Kas Keluar",
        report.actualCashOutflow.totalCashOutflow,
        "Total pengeluaran kas aktual dari DANA",
      ],
      [
        report.period,
        "3. Saldo Akhir Periode",
        "Saldo Akhir Kas (Closing Balance)",
        report.actualCashInflow.closingBalance,
        "Saldo Awal + Total Kas Masuk - Total Kas Keluar",
      ],
      [
        report.period,
        "4. Beban Operasional (Akrual/Riil)",
        "Beban Operasional Kas Langsung",
        report.operatingExpenses.directOperatingExpense,
        "Pengeluaran CONFIRMED sumber DIRECT_CASH",
      ],
      [
        report.period,
        "4. Beban Operasional (Akrual/Riil)",
        "Beban Operasional Talangan Anggota",
        report.operatingExpenses.memberAdvanceOperatingExpense,
        "Pengeluaran CONFIRMED sumber MEMBER_ADVANCE",
      ],
      [
        report.period,
        "4. Beban Operasional (Akrual/Riil)",
        "Total Biaya Operasional Periode",
        report.operatingExpenses.totalOperatingExpense,
        "Tidak menghitung dua kali pencairan reimbursement",
      ],
      [
        report.period,
        "5. Piutang & Kewajiban",
        "Total Tagihan Iuran Periode",
        report.memberReceivables.totalBilledAmount,
        "Kuota tagihan rutin + tambahan periode",
      ],
      [
        report.period,
        "5. Piutang & Kewajiban",
        "Total Tagihan Iuran Belum Dibayar (Periode Ini)",
        report.memberReceivables.totalUnpaidReceivableAmount,
        "Sisa piutang iuran anggota pada periode ini",
      ],
      [
        report.period,
        "5. Piutang & Kewajiban",
        "Total Reimbursement Masih Terutang (Outstanding)",
        report.reimbursementObligations.totalOutstandingReimbursement,
        "Kewajiban kas kepada anggota yang belum dicairkan",
      ],
    ];

    return {
      filename: `kostkas-ringkasan-laporan-${report.period}.csv`,
      csvContent: buildCsvDocument(headers, rows),
      period: report.period,
      exportType,
    };
  }

  if (exportType === "cash-ledger") {
    const headers = [
      "Tanggal (Asia/Jakarta)",
      "Arah",
      "Kategori Mutasi",
      "Deskripsi",
      "Aktor / Anggota",
      "Nominal (IDR)",
      "Saldo Berjalan (IDR)",
    ];
    const rows = report.periodCashMovements.map((mov) => [
      mov.dateLabel,
      mov.direction,
      mov.categoryLabel,
      mov.description,
      mov.actorName,
      mov.amount,
      mov.runningBalance,
    ]);

    return {
      filename: `kostkas-cash-ledger-${report.period}.csv`,
      csvContent: buildCsvDocument(headers, rows),
      period: report.period,
      exportType,
    };
  }

  if (exportType === "contributions") {
    const payments = await db.payment.findMany({
      where: {
        OR: [
          {
            paidAt: {
              gte: startUtc,
              lt: endUtc,
            },
          },
          {
            allocations: {
              some: {
                charge: {
                  period: report.period,
                },
              },
            },
          },
        ],
      },
      include: {
        member: { select: { name: true } },
        allocations: {
          include: {
            charge: { select: { period: true, title: true } },
          },
        },
      },
      orderBy: [{ paidAt: "asc" }],
    });

    const headers = [
      "Tanggal Bayar (Asia/Jakarta)",
      "Nama Anggota",
      "Status Pembayaran",
      "Nominal Pembayaran (IDR)",
      "Alokasi Tagihan",
      "Catatan",
    ];
    const rows = payments.map((p) => [
      formatJakartaDate(p.paidAt),
      p.member.name,
      p.status,
      p.amount,
      p.allocations
        .map((a) => `${a.charge.title} (${a.charge.period}: Rp${a.amount})`)
        .join("; "),
      stripChargePrefixFromNote(p.note),
    ]);

    return {
      filename: `kostkas-pembayaran-iuran-${report.period}.csv`,
      csvContent: buildCsvDocument(headers, rows),
      period: report.period,
      exportType,
    };
  }

  if (exportType === "expenses") {
    const expenses = await db.expense.findMany({
      where: {
        expenseDate: {
          gte: startUtc,
          lt: endUtc,
        },
      },
      include: {
        category: {
          include: {
            parent: { select: { name: true } },
          },
        },
        recordedByMember: { select: { name: true } },
        advancedByMember: { select: { name: true } },
      },
      orderBy: [{ expenseDate: "asc" }],
    });

    const headers = [
      "Tanggal Pengeluaran (Asia/Jakarta)",
      "Kategori",
      "Deskripsi Pengeluaran",
      "Sumber Dana",
      "Status",
      "Penanggung / Sumber",
      "Dicatat Oleh",
      "Nominal (IDR)",
      "Catatan",
    ];

    const rows = expenses.map((e) => {
      const catLabel = e.category.parent
        ? `${e.category.parent.name} - ${e.category.name}`
        : e.category.name;
      const sourceHolder =
        e.fundingSource === "DIRECT_CASH"
          ? `Kas ${report.cashAccount.provider}`
          : e.advancedByMember?.name ?? "Anggota";
      return [
        formatJakartaDate(e.expenseDate),
        catLabel,
        e.title,
        e.fundingSource,
        e.status,
        sourceHolder,
        e.recordedByMember?.name ?? "Sistem",
        e.amount,
        e.note ?? "",
      ];
    });

    return {
      filename: `kostkas-pengeluaran-${report.period}.csv`,
      csvContent: buildCsvDocument(headers, rows),
      period: report.period,
      exportType,
    };
  }

  // exportType === "reimbursements"
  const reimbursements = await db.reimbursement.findMany({
    where: {
      OR: [
        {
          expense: {
            expenseDate: {
              gte: startUtc,
              lt: endUtc,
            },
          },
        },
        {
          payouts: {
            some: {
              paidAt: {
                gte: startUtc,
                lt: endUtc,
              },
            },
          },
        },
        {
          status: { in: ["OUTSTANDING", "PARTIALLY_SETTLED"] },
        },
      ],
    },
    include: {
      beneficiaryMember: { select: { name: true } },
      expense: { select: { title: true, expenseDate: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const headers = [
    "Tanggal Pengeluaran (Asia/Jakarta)",
    "Anggota Penalang",
    "Deskripsi Talangan",
    "Status Klaim",
    "Total Talangan (IDR)",
    "Sudah Dicairkan (IDR)",
    "Sisa Kewajiban (IDR)",
  ];
  const rows = reimbursements.map((r) => [
    formatJakartaDate(r.expense.expenseDate),
    r.beneficiaryMember.name,
    r.expense.title,
    r.status,
    r.totalAmount,
    r.settledAmount,
    Math.max(0, r.totalAmount - r.settledAmount),
  ]);

  return {
    filename: `kostkas-reimbursement-${report.period}.csv`,
    csvContent: buildCsvDocument(headers, rows),
    period: report.period,
    exportType,
  };
}
