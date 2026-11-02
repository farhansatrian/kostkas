import type { PrismaClient } from "../generated/prisma/client";
import { assertAuthenticatedActor, type AuthenticatedActor } from "./auth";
import {
  formatPeriodLabel,
  getCurrentYearMonthPeriod,
  stripChargePrefixFromNote,
} from "./contribution-service";
import {
  getCashLedgerSummary,
  getEffectiveContributionPolicy,
} from "./financial-service";
import { APP_NAVIGATION_MODULES, formatShortDateId } from "./navigation";
import { getJakartaPeriodBounds } from "./reporting-service";

export interface LiveMemberDueItem {
  id: string;
  name: string;
  billedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: "LUNAS" | "CICILAN" | "MENUNGGU" | "BELUM_DITERBITKAN";
  statusLabel: string;
  detailLabel: string;
}

export interface LiveRecentTransaction {
  id: string;
  dateLabel: string;
  title: string;
  categoryLabel: string;
  actorName: string;
  amount: number;
  flow: "IN" | "OUT";
}

export async function getLiveDashboardData(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  now: Date = new Date()
) {
  assertAuthenticatedActor(actor);

  const currentPeriod = getCurrentYearMonthPeriod(now);
  const { startUtc: periodStart, endUtc: nextPeriodStart } =
    getJakartaPeriodBounds(currentPeriod);

  const [
    cashAccount,
    activeMembers,
    effectivePolicy,
    periodCharges,
    outstandingReimbursements,
    confirmedPeriodExpensesAgg,
    appPref,
  ] = await Promise.all([
    db.cashAccount.findFirst({
      where: { isActive: true },
      include: { custodianMember: true },
      orderBy: { createdAt: "asc" },
    }),
    db.member.findMany({
      where: { leftAt: null },
      orderBy: { joinedAt: "asc" },
    }),
    getEffectiveContributionPolicy(db, currentPeriod),
    db.contributionCharge.findMany({
      where: {
        period: currentPeriod,
        status: { not: "CANCELLED" },
      },
      include: {
        allocations: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    db.reimbursement.findMany({
      where: {
        status: { in: ["OUTSTANDING", "PARTIALLY_SETTLED"] },
      },
      include: {
        beneficiaryMember: true,
        expense: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.expense.aggregate({
      where: {
        status: "CONFIRMED",
        expenseDate: {
          gte: periodStart,
          lt: nextPeriodStart,
        },
      },
      _sum: {
        amount: true,
      },
    }),
    db.appPreference.findUnique({
      where: { id: "default" },
    }),
  ]);

  let actualCashBalance = 0;
  let previousMonthCarryOver = 0;
  let collectedDuesThisMonth = 0;
  let directOperatingExpensesThisMonth = 0;
  let reimbursementSettlementsThisMonth = 0;
  let totalCashOutflowThisMonth = 0;
  let recentTransactions: LiveRecentTransaction[] = [];

  if (cashAccount) {
    const [ledgerSummary, allConfirmedMovements] = await Promise.all([
      getCashLedgerSummary(db, cashAccount.id),
      db.cashMovement.findMany({
        where: {
          cashAccountId: cashAccount.id,
          status: "CONFIRMED",
        },
        include: {
          actorMember: true,
          payment: { include: { member: true } },
        },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    actualCashBalance = ledgerSummary.actualBalance;

    for (const mov of allConfirmedMovements) {
      const isBeforeCurrentMonth =
        mov.occurredAt < periodStart || mov.category === "OPENING_BALANCE";
      const isWithinCurrentMonth =
        mov.occurredAt >= periodStart &&
        mov.occurredAt < nextPeriodStart &&
        mov.category !== "OPENING_BALANCE";

      if (isBeforeCurrentMonth) {
        if (mov.direction === "IN") {
          previousMonthCarryOver += mov.amount;
        } else {
          previousMonthCarryOver -= mov.amount;
        }
      } else if (isWithinCurrentMonth) {
        if (
          mov.direction === "IN" &&
          mov.category === "CONTRIBUTION_PAYMENT"
        ) {
          collectedDuesThisMonth += mov.amount;
        } else if (mov.direction === "OUT") {
          totalCashOutflowThisMonth += mov.amount;
          if (mov.category === "DIRECT_EXPENSE") {
            directOperatingExpensesThisMonth += mov.amount;
          } else if (mov.category === "REIMBURSEMENT_PAYOUT") {
            reimbursementSettlementsThisMonth += mov.amount;
          }
        }
      }
    }

    recentTransactions = allConfirmedMovements.slice(0, 5).map((mov) => {
      const categoryLabels: Record<string, string> = {
        OPENING_BALANCE: "Saldo Awal",
        CONTRIBUTION_PAYMENT: "Iuran Anggota",
        DIRECT_EXPENSE: "Pengeluaran Kas",
        REIMBURSEMENT_PAYOUT: "Pelunasan Reimburse",
        ADJUSTMENT: "Penyesuaian Kas",
      };

      const actorName =
        mov.payment?.member.name ?? mov.actorMember?.name ?? "Sistem";

      return {
        id: mov.id,
        dateLabel: formatShortDateId(mov.occurredAt),
        title: stripChargePrefixFromNote(mov.description),
        categoryLabel: categoryLabels[mov.category] ?? mov.category,
        actorName,
        amount: mov.amount,
        flow: mov.direction,
      };
    });
  }

  const defaultDuePerMember = effectivePolicy?.amountPerMember ?? 150_000;

  // Hitung status iuran per anggota aktif untuk periode berjalan
  const memberDues: LiveMemberDueItem[] = activeMembers.map((member) => {
    const memberCharges = periodCharges.filter((c) => c.memberId === member.id);
    if (memberCharges.length === 0) {
      return {
        id: member.id,
        name: member.name,
        billedAmount: defaultDuePerMember,
        paidAmount: 0,
        remainingAmount: defaultDuePerMember,
        status: "BELUM_DITERBITKAN",
        statusLabel: "Belum diterbitkan",
        detailLabel: "Tagihan periode ini belum dibuat",
      };
    }

    const billedAmount = memberCharges.reduce((s, c) => s + c.amount, 0);
    const paidAmount = memberCharges.reduce((s, c) => s + c.allocatedAmount, 0);
    const remainingAmount = Math.max(0, billedAmount - paidAmount);

    if (remainingAmount === 0 && billedAmount > 0) {
      const latestAlloc = memberCharges
        .flatMap((c) => c.allocations)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      return {
        id: member.id,
        name: member.name,
        billedAmount,
        paidAmount,
        remainingAmount: 0,
        status: "LUNAS",
        statusLabel: "Lunas",
        detailLabel: latestAlloc
          ? `Dibayar ${formatShortDateId(latestAlloc.createdAt)}`
          : "Telah dilunasi",
      };
    }

    if (paidAmount > 0) {
      return {
        id: member.id,
        name: member.name,
        billedAmount,
        paidAmount,
        remainingAmount,
        status: "CICILAN",
        statusLabel: "Cicilan",
        detailLabel: `Masuk Rp${paidAmount.toLocaleString("id-ID")} · Sisa Rp${remainingAmount.toLocaleString("id-ID")}`,
      };
    }

    return {
      id: member.id,
      name: member.name,
      billedAmount,
      paidAmount: 0,
      remainingAmount: billedAmount,
      status: "MENUNGGU",
      statusLabel: "Menunggu",
      detailLabel: "Belum dibayar",
    };
  });

  const totalBilledPeriod = periodCharges.reduce((s, c) => s + c.amount, 0);
  const totalAllocatedPeriod = periodCharges.reduce(
    (s, c) => s + c.allocatedAmount,
    0
  );
  const monthlyTargetDues =
    totalBilledPeriod > 0
      ? totalBilledPeriod
      : activeMembers.length * defaultDuePerMember;

  // Gunakan nilai alokasi iuran periode berjalan atau kas masuk iuran bulan ini
  const realizedDuesForPeriod =
    totalAllocatedPeriod > 0 ? totalAllocatedPeriod : collectedDuesThisMonth;

  const paidMembersCount = memberDues.filter(
    (m) => m.status === "LUNAS"
  ).length;

  const pendingReimbursementTotal = outstandingReimbursements.reduce(
    (sum, r) => sum + Math.max(0, r.totalAmount - r.settledAmount),
    0
  );

  const latestPendingReimbursement = outstandingReimbursements[0]
    ? {
        requester: outstandingReimbursements[0].beneficiaryMember.name,
        dateLabel: formatShortDateId(
          outstandingReimbursements[0].expense.expenseDate
        ),
      }
    : null;

  return {
    period: currentPeriod,
    periodLabel: formatPeriodLabel(currentPeriod),
    asOfDateLabel: formatShortDateId(now),
    hasGeneratedPeriodCharges: periodCharges.length > 0,
    config: {
      kostName: appPref?.kostName ?? "KostKas",
      dateFormat: appPref?.dateFormat ?? "dd MMM yyyy",
      activeMemberCount: activeMembers.length,
      monthlyDuePerMember: defaultDuePerMember,
      cashAccountProvider: cashAccount?.provider ?? "DANA",
      cashAccountHolder: cashAccount?.custodianMember?.name ?? "Farhan",
    },
    cashSummary: {
      previousMonthCarryOver,
      monthlyTargetDues,
      collectedDuesThisMonth: realizedDuesForPeriod,
      directOperatingExpensesThisMonth,
      reimbursementSettlementsThisMonth,
      totalCashOutflowThisMonth,
      totalConfirmedOperatingExpensesThisMonth:
        confirmedPeriodExpensesAgg._sum.amount ?? 0,
      actualCashBalance,
      pendingReimbursementTotal,
      pendingReimbursementCount: outstandingReimbursements.length,
    },
    latestPendingReimbursement,
    memberDues,
    paidMembersCount,
    recentTransactions,
    navigationModules: APP_NAVIGATION_MODULES,
  };
}

