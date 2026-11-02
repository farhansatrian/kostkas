import type {
  CashMovement,
  ContributionCharge,
  ContributionPolicy,
  Expense,
  Payment,
  PrismaClient,
  Reimbursement,
  ReimbursementPayout,
} from "../generated/prisma/client";

export interface PeriodChargesResult {
  period: string;
  policyId: string | null;
  charges: ContributionCharge[];
  totalBilledAmount: number;
}

export interface ChargeBalanceSnapshot {
  chargeId: string;
  totalAmount: number;
  allocatedAmount: number;
  remainingAmount: number;
  status: ContributionCharge["status"];
}

export interface PaymentProcessResult {
  payment: Payment;
  wasDuplicateRequest: boolean;
  allocations: Array<{ chargeId: string; amount: number }>;
  updatedCharges: ChargeBalanceSnapshot[];
  cashMovement: CashMovement | null;
}

export interface DirectExpenseResult {
  expense: Expense;
  wasDuplicateRequest: boolean;
  cashMovement: CashMovement | null;
}

export interface MemberAdvanceExpenseResult {
  expense: Expense;
  reimbursement: Reimbursement;
  wasDuplicateRequest: boolean;
}

export interface ReimbursementSettlementResult {
  payout: ReimbursementPayout;
  reimbursement: Reimbursement;
  remainingDebtAmount: number;
  cashMovement: CashMovement;
  wasDuplicateRequest: boolean;
}

export interface CashLedgerSummary {
  cashAccountId: string;
  confirmedInflowTotal: number;
  confirmedOutflowTotal: number;
  actualBalance: number;
  confirmedMovementCount: number;
}

function assertPositiveInteger(amount: number, fieldName: string): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${fieldName} harus berupa bilangan bulat positif.`);
  }
}

/**
 * Mengambil kebijakan iuran aktif untuk periode tertentu (YYYY-MM).
 */
export async function getEffectiveContributionPolicy(
  db: PrismaClient,
  period: string
): Promise<ContributionPolicy | null> {
  return db.contributionPolicy.findFirst({
    where: {
      isActive: true,
      effectiveFromPeriod: { lte: period },
      OR: [
        { effectiveToPeriod: null },
        { effectiveToPeriod: { gte: period } },
      ],
    },
    orderBy: { effectiveFromPeriod: "desc" },
  });
}

/**
 * Membuat atau memperbarui kebijakan tarif iuran untuk periode efektif tertentu.
 * Tidak mengubah tagihan (ContributionCharge) yang sudah diterbitkan pada periode sebelumnya.
 */
export async function upsertContributionPolicy(
  db: PrismaClient,
  input: {
    code: string;
    name: string;
    amountPerMember: number;
    effectiveFromPeriod: string;
    effectiveToPeriod?: string | null;
    closePreviousPolicyCode?: string;
    actorMemberId?: string;
  }
): Promise<ContributionPolicy> {
  assertPositiveInteger(input.amountPerMember, "amountPerMember");

  return db.$transaction(async (tx) => {
    if (input.closePreviousPolicyCode) {
      await tx.contributionPolicy.updateMany({
        where: {
          code: input.closePreviousPolicyCode,
          effectiveToPeriod: null,
        },
        data: {
          effectiveToPeriod: previousMonthPeriod(input.effectiveFromPeriod),
        },
      });
    }

    const policy = await tx.contributionPolicy.upsert({
      where: { code: input.code },
      update: {
        name: input.name,
        amountPerMember: input.amountPerMember,
        effectiveFromPeriod: input.effectiveFromPeriod,
        effectiveToPeriod: input.effectiveToPeriod ?? null,
        isActive: true,
      },
      create: {
        code: input.code,
        name: input.name,
        amountPerMember: input.amountPerMember,
        effectiveFromPeriod: input.effectiveFromPeriod,
        effectiveToPeriod: input.effectiveToPeriod ?? null,
        isActive: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: input.actorMemberId ?? null,
        action: "UPSERT_CONTRIBUTION_POLICY",
        entityType: "ContributionPolicy",
        entityId: policy.id,
        summary: `Kebijakan iuran ${policy.code} (${policy.effectiveFromPeriod}) ditetapkan Rp${policy.amountPerMember}`,
      },
    });

    return policy;
  });
}

function previousMonthPeriod(period: string): string {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

/**
 * Menerbitkan tagihan iuran rutin bulanan (REGULAR) untuk seluruh anggota aktif.
 * Idempotent per (memberId, period, REGULAR, sequence=1).
 */
export async function generateRegularPeriodCharges(
  db: PrismaClient,
  input: {
    period: string;
    title?: string;
    dueDate?: Date;
    actorMemberId?: string;
    policyCode?: string;
    memberIds?: string[];
  }
): Promise<PeriodChargesResult> {
  return db.$transaction(async (tx) => {
    const policy = await tx.contributionPolicy.findFirst({
      where: {
        isActive: true,
        ...(input.policyCode ? { code: input.policyCode } : {}),
        effectiveFromPeriod: { lte: input.period },
        OR: [
          { effectiveToPeriod: null },
          { effectiveToPeriod: { gte: input.period } },
        ],
      },
      orderBy: { effectiveFromPeriod: "desc" },
    });

    if (!policy) {
      throw new Error(
        `Tidak ditemukan ContributionPolicy aktif untuk periode ${input.period}.`
      );
    }

    const activeMembers = await tx.member.findMany({
      where: {
        leftAt: null,
        ...(input.memberIds ? { id: { in: input.memberIds } } : {}),
      },
      orderBy: { joinedAt: "asc" },
    });

    const charges: ContributionCharge[] = [];

    for (const member of activeMembers) {
      const idempotencyKey = `REGULAR:${input.period}:${member.id}`;
      const existing = await tx.contributionCharge.findUnique({
        where: {
          memberId_period_kind_sequence: {
            memberId: member.id,
            period: input.period,
            kind: "REGULAR",
            sequence: 1,
          },
        },
      });

      if (existing) {
        charges.push(existing);
        continue;
      }

      const created = await tx.contributionCharge.create({
        data: {
          memberId: member.id,
          policyId: policy.id,
          period: input.period,
          kind: "REGULAR",
          sequence: 1,
          title: input.title ?? `Iuran Rutin ${input.period}`,
          amount: policy.amountPerMember,
          allocatedAmount: 0,
          status: "UNPAID",
          dueDate: input.dueDate ?? null,
          idempotencyKey,
        },
      });

      charges.push(created);
    }

    const totalBilledAmount = charges.reduce((sum, c) => sum + c.amount, 0);

    await tx.auditLog.create({
      data: {
        actorMemberId: input.actorMemberId ?? null,
        action: "GENERATE_REGULAR_CHARGES",
        entityType: "ContributionCharge",
        entityId: input.period,
        summary: `Menerbitkan ${charges.length} tagihan rutin periode ${input.period} dengan total Rp${totalBilledAmount}`,
      },
    });

    return {
      period: input.period,
      policyId: policy.id,
      charges,
      totalBilledAmount,
    };
  });
}

/**
 * Menerbitkan tagihan tambahan (ADDITIONAL) pada pertengahan bulan untuk seluruh anggota aktif
 * tanpa menghapus atau mengubah tagihan rutin awal.
 */
export async function createAdditionalPeriodCharges(
  db: PrismaClient,
  input: {
    period: string;
    amountPerMember: number;
    title: string;
    batchIdempotencyKey: string;
    dueDate?: Date;
    actorMemberId?: string;
    memberIds?: string[];
  }
): Promise<PeriodChargesResult> {
  assertPositiveInteger(input.amountPerMember, "amountPerMember");

  return db.$transaction(async (tx) => {
    const activeMembers = await tx.member.findMany({
      where: {
        leftAt: null,
        ...(input.memberIds ? { id: { in: input.memberIds } } : {}),
      },
      orderBy: { joinedAt: "asc" },
    });

    const charges: ContributionCharge[] = [];

    for (const member of activeMembers) {
      const itemIdempotencyKey = `ADDITIONAL:${input.batchIdempotencyKey}:${member.id}`;
      const existingByKey = await tx.contributionCharge.findUnique({
        where: { idempotencyKey: itemIdempotencyKey },
      });

      if (existingByKey) {
        charges.push(existingByKey);
        continue;
      }

      const lastAdditional = await tx.contributionCharge.findFirst({
        where: {
          memberId: member.id,
          period: input.period,
          kind: "ADDITIONAL",
        },
        orderBy: { sequence: "desc" },
      });

      const nextSequence = (lastAdditional?.sequence ?? 0) + 1;

      const created = await tx.contributionCharge.create({
        data: {
          memberId: member.id,
          policyId: null,
          period: input.period,
          kind: "ADDITIONAL",
          sequence: nextSequence,
          title: input.title,
          amount: input.amountPerMember,
          allocatedAmount: 0,
          status: "UNPAID",
          dueDate: input.dueDate ?? null,
          idempotencyKey: itemIdempotencyKey,
        },
      });

      charges.push(created);
    }

    const totalBilledAmount = charges.reduce((sum, c) => sum + c.amount, 0);

    await tx.auditLog.create({
      data: {
        actorMemberId: input.actorMemberId ?? null,
        action: "CREATE_ADDITIONAL_CHARGES",
        entityType: "ContributionCharge",
        entityId: input.batchIdempotencyKey,
        summary: `Tagihan tambahan "${input.title}" periode ${input.period} sebesar Rp${totalBilledAmount}`,
      },
    });

    return {
      period: input.period,
      policyId: null,
      charges,
      totalBilledAmount,
    };
  });
}

/**
 * Menghitung total tagihan (rutin + tambahan) dan sisa kewajiban pada suatu periode.
 */
export async function getPeriodObligationSummary(
  db: PrismaClient,
  period: string,
  options?: { memberIds?: string[] }
): Promise<{
  period: string;
  regularTotal: number;
  additionalTotal: number;
  totalBilled: number;
  totalAllocated: number;
  totalRemaining: number;
}> {
  const charges = await db.contributionCharge.findMany({
    where: {
      period,
      status: { not: "CANCELLED" },
      ...(options?.memberIds ? { memberId: { in: options.memberIds } } : {}),
    },
  });

  let regularTotal = 0;
  let additionalTotal = 0;
  let totalAllocated = 0;

  for (const charge of charges) {
    if (charge.kind === "REGULAR") {
      regularTotal += charge.amount;
    } else {
      additionalTotal += charge.amount;
    }
    totalAllocated += charge.allocatedAmount;
  }

  const totalBilled = regularTotal + additionalTotal;
  return {
    period,
    regularTotal,
    additionalTotal,
    totalBilled,
    totalAllocated,
    totalRemaining: totalBilled - totalAllocated,
  };
}

/**
 * Mencatat pembayaran iuran anggota (penuh atau parsial) dengan perlindungan idempotency.
 * - Jika `confirmImmediately = false`, pembayaran berstatus PENDING dan TIDAK menambah saldo kas.
 * - Jika `confirmImmediately = true`, pembayaran dialokasikan ke tagihan dan menambah saldo kas secara atomic.
 */
export async function recordContributionPayment(
  db: PrismaClient,
  input: {
    memberId: string;
    cashAccountId: string;
    amount: number;
    targetChargeIds: string[];
    idempotencyKey: string;
    confirmImmediately?: boolean;
    paidAt?: Date;
    actorMemberId?: string;
    note?: string;
  }
): Promise<PaymentProcessResult> {
  assertPositiveInteger(input.amount, "amount");

  return db.$transaction(async (tx) => {
    const existingPayment = await tx.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: {
        allocations: true,
        cashMovement: true,
      },
    });

    if (existingPayment) {
      const chargeIds = existingPayment.allocations.map((a) => a.chargeId);
      const charges = await tx.contributionCharge.findMany({
        where: { id: { in: chargeIds } },
      });

      return {
        payment: existingPayment,
        wasDuplicateRequest: true,
        allocations: existingPayment.allocations.map((a) => ({
          chargeId: a.chargeId,
          amount: a.amount,
        })),
        updatedCharges: charges.map((c) => ({
          chargeId: c.id,
          totalAmount: c.amount,
          allocatedAmount: c.allocatedAmount,
          remainingAmount: c.amount - c.allocatedAmount,
          status: c.status,
        })),
        cashMovement: existingPayment.cashMovement,
      };
    }

    const shouldConfirm = input.confirmImmediately ?? true;
    const now = input.paidAt ?? new Date();

    const payment = await tx.payment.create({
      data: {
        memberId: input.memberId,
        cashAccountId: input.cashAccountId,
        amount: input.amount,
        status: shouldConfirm ? "CONFIRMED" : "PENDING",
        paidAt: now,
        confirmedAt: shouldConfirm ? now : null,
        idempotencyKey: input.idempotencyKey,
        note: input.note ?? null,
      },
    });

    if (!shouldConfirm) {
      await tx.auditLog.create({
        data: {
          actorMemberId: input.actorMemberId ?? input.memberId,
          action: "RECORD_PENDING_PAYMENT",
          entityType: "Payment",
          entityId: payment.id,
          summary: `Pembayaran PENDING Rp${payment.amount} dicatat (belum menambah saldo kas)`,
        },
      });

      return {
        payment,
        wasDuplicateRequest: false,
        allocations: [],
        updatedCharges: [],
        cashMovement: null,
      };
    }

    const charges = await tx.contributionCharge.findMany({
      where: {
        id: { in: input.targetChargeIds },
        memberId: input.memberId,
      },
      orderBy: [{ period: "asc" }, { kind: "asc" }, { sequence: "asc" }],
    });

    if (charges.length === 0) {
      throw new Error("Tagihan tujuan alokasi pembayaran tidak ditemukan.");
    }

    let unallocated = input.amount;
    const allocations: Array<{ chargeId: string; amount: number }> = [];
    const updatedCharges: ChargeBalanceSnapshot[] = [];

    for (const charge of charges) {
      if (unallocated <= 0) break;
      const currentRemaining = charge.amount - charge.allocatedAmount;
      if (currentRemaining <= 0) continue;

      const allocationAmount = Math.min(unallocated, currentRemaining);
      unallocated -= allocationAmount;

      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          chargeId: charge.id,
          amount: allocationAmount,
        },
      });

      const newAllocated = charge.allocatedAmount + allocationAmount;
      const newRemaining = charge.amount - newAllocated;
      const newStatus: ContributionCharge["status"] =
        newRemaining === 0 ? "PAID" : "PARTIALLY_PAID";

      const updatedCharge = await tx.contributionCharge.update({
        where: { id: charge.id },
        data: {
          allocatedAmount: newAllocated,
          status: newStatus,
        },
      });

      allocations.push({
        chargeId: updatedCharge.id,
        amount: allocationAmount,
      });

      updatedCharges.push({
        chargeId: updatedCharge.id,
        totalAmount: updatedCharge.amount,
        allocatedAmount: updatedCharge.allocatedAmount,
        remainingAmount: updatedCharge.amount - updatedCharge.allocatedAmount,
        status: updatedCharge.status,
      });
    }

    if (unallocated > 0) {
      throw new Error(
        `Nominal pembayaran melebihi sisa tagihan sebesar Rp${unallocated}.`
      );
    }

    const cashMovement = await tx.cashMovement.create({
      data: {
        cashAccountId: input.cashAccountId,
        direction: "IN",
        category: "CONTRIBUTION_PAYMENT",
        amount: payment.amount,
        status: "CONFIRMED",
        occurredAt: now,
        description: input.note ?? "Pembayaran iuran anggota",
        actorMemberId: input.actorMemberId ?? input.memberId,
        paymentId: payment.id,
        idempotencyKey: `CM:PAYMENT:${payment.idempotencyKey}`,
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: input.actorMemberId ?? input.memberId,
        action: "CONFIRM_AND_ALLOCATE_PAYMENT",
        entityType: "Payment",
        entityId: payment.id,
        summary: `Pembayaran Rp${payment.amount} dikonfirmasi dan dialokasikan ke ${allocations.length} tagihan`,
      },
    });

    return {
      payment,
      wasDuplicateRequest: false,
      allocations,
      updatedCharges,
      cashMovement,
    };
  });
}

/**
 * Mencatat pengeluaran operasional yang dibayar langsung dari akun kas DANA.
 * Mengurangi saldo kas hanya setelah berstatus CONFIRMED.
 */
export async function recordDirectCashExpense(
  db: PrismaClient,
  input: {
    categoryId: string;
    cashAccountId: string;
    title: string;
    amount: number;
    idempotencyKey: string;
    confirmImmediately?: boolean;
    recordedByMemberId?: string;
    expenseDate?: Date;
    note?: string;
  }
): Promise<DirectExpenseResult> {
  assertPositiveInteger(input.amount, "amount");

  return db.$transaction(async (tx) => {
    const existing = await tx.expense.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { cashMovement: true },
    });

    if (existing) {
      return {
        expense: existing,
        wasDuplicateRequest: true,
        cashMovement: existing.cashMovement,
      };
    }

    const shouldConfirm = input.confirmImmediately ?? true;
    const now = input.expenseDate ?? new Date();

    const expense = await tx.expense.create({
      data: {
        categoryId: input.categoryId,
        cashAccountId: input.cashAccountId,
        title: input.title,
        amount: input.amount,
        fundingSource: "DIRECT_CASH",
        status: shouldConfirm ? "CONFIRMED" : "PENDING",
        recordedByMemberId: input.recordedByMemberId ?? null,
        expenseDate: now,
        confirmedAt: shouldConfirm ? now : null,
        idempotencyKey: input.idempotencyKey,
        note: input.note ?? null,
      },
    });

    let cashMovement: CashMovement | null = null;

    if (shouldConfirm) {
      cashMovement = await tx.cashMovement.create({
        data: {
          cashAccountId: input.cashAccountId,
          direction: "OUT",
          category: "DIRECT_EXPENSE",
          amount: expense.amount,
          status: "CONFIRMED",
          occurredAt: now,
          description: expense.title,
          actorMemberId: input.recordedByMemberId ?? null,
          expenseId: expense.id,
          idempotencyKey: `CM:EXPENSE:${expense.idempotencyKey}`,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorMemberId: input.recordedByMemberId ?? null,
        action: "RECORD_DIRECT_EXPENSE",
        entityType: "Expense",
        entityId: expense.id,
        summary: `Pengeluaran kas langsung "${expense.title}" sebesar Rp${expense.amount} (${expense.status})`,
      },
    });

    return {
      expense,
      wasDuplicateRequest: false,
      cashMovement,
    };
  });
}

/**
 * Mencatat pengeluaran operasional yang ditalangi pribadi oleh anggota (MEMBER_ADVANCE).
 * Menghasilkan kewajiban Reimbursement tanpa mengurangi saldo kas DANA secara langsung.
 */
export async function recordMemberAdvanceExpense(
  db: PrismaClient,
  input: {
    categoryId: string;
    advancedByMemberId: string;
    title: string;
    amount: number;
    idempotencyKey: string;
    recordedByMemberId?: string;
    expenseDate?: Date;
    note?: string;
  }
): Promise<MemberAdvanceExpenseResult> {
  assertPositiveInteger(input.amount, "amount");

  return db.$transaction(async (tx) => {
    const existing = await tx.expense.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { reimbursement: true },
    });

    if (existing && existing.reimbursement) {
      return {
        expense: existing,
        reimbursement: existing.reimbursement,
        wasDuplicateRequest: true,
      };
    }

    const now = input.expenseDate ?? new Date();

    const expense = await tx.expense.create({
      data: {
        categoryId: input.categoryId,
        title: input.title,
        amount: input.amount,
        fundingSource: "MEMBER_ADVANCE",
        status: "CONFIRMED",
        advancedByMemberId: input.advancedByMemberId,
        recordedByMemberId:
          input.recordedByMemberId ?? input.advancedByMemberId,
        expenseDate: now,
        confirmedAt: now,
        idempotencyKey: input.idempotencyKey,
        note: input.note ?? null,
      },
    });

    const reimbursement = await tx.reimbursement.create({
      data: {
        expenseId: expense.id,
        beneficiaryMemberId: input.advancedByMemberId,
        totalAmount: expense.amount,
        settledAmount: 0,
        status: "OUTSTANDING",
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: input.recordedByMemberId ?? input.advancedByMemberId,
        action: "RECORD_MEMBER_ADVANCE_EXPENSE",
        entityType: "Reimbursement",
        entityId: reimbursement.id,
        summary: `Talangan anggota "${expense.title}" Rp${expense.amount} menghasilkan kewajiban reimbursement (tanpa potong saldo kas)`,
      },
    });

    return {
      expense,
      reimbursement,
      wasDuplicateRequest: false,
    };
  });
}

/**
 * Mencairkan penggantian dana talangan (Reimbursement) secara penuh atau parsial dari akun kas DANA.
 * Mengurangi saldo DANA dan mengurangi kewajiban reimbursement, TANPA membuat Expense operasional kedua.
 */
export async function settleReimbursementPayout(
  db: PrismaClient,
  input: {
    reimbursementId: string;
    cashAccountId: string;
    amount: number;
    idempotencyKey: string;
    actorMemberId?: string;
    paidAt?: Date;
    note?: string;
  }
): Promise<ReimbursementSettlementResult> {
  assertPositiveInteger(input.amount, "amount");

  return db.$transaction(async (tx) => {
    const existingPayout = await tx.reimbursementPayout.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: {
        reimbursement: true,
        cashMovement: true,
      },
    });

    if (existingPayout && existingPayout.cashMovement) {
      return {
        payout: existingPayout,
        reimbursement: existingPayout.reimbursement,
        remainingDebtAmount:
          existingPayout.reimbursement.totalAmount -
          existingPayout.reimbursement.settledAmount,
        cashMovement: existingPayout.cashMovement,
        wasDuplicateRequest: true,
      };
    }

    const reimbursement = await tx.reimbursement.findUnique({
      where: { id: input.reimbursementId },
      include: { expense: true },
    });

    if (!reimbursement) {
      throw new Error("Data kewajiban reimbursement tidak ditemukan.");
    }

    const currentOutstanding =
      reimbursement.totalAmount - reimbursement.settledAmount;

    if (input.amount > currentOutstanding) {
      throw new Error(
        `Nominal pencairan (Rp${input.amount}) melebihi sisa utang reimbursement (Rp${currentOutstanding}).`
      );
    }

    const now = input.paidAt ?? new Date();

    const payout = await tx.reimbursementPayout.create({
      data: {
        reimbursementId: reimbursement.id,
        cashAccountId: input.cashAccountId,
        amount: input.amount,
        paidAt: now,
        idempotencyKey: input.idempotencyKey,
        note: input.note ?? null,
      },
    });

    const newSettledAmount = reimbursement.settledAmount + input.amount;
    const remainingDebtAmount = reimbursement.totalAmount - newSettledAmount;
    const newStatus: Reimbursement["status"] =
      remainingDebtAmount === 0 ? "SETTLED" : "PARTIALLY_SETTLED";

    const updatedReimbursement = await tx.reimbursement.update({
      where: { id: reimbursement.id },
      data: {
        settledAmount: newSettledAmount,
        status: newStatus,
      },
    });

    const cashMovement = await tx.cashMovement.create({
      data: {
        cashAccountId: input.cashAccountId,
        direction: "OUT",
        category: "REIMBURSEMENT_PAYOUT",
        amount: payout.amount,
        status: "CONFIRMED",
        occurredAt: now,
        description:
          input.note ?? `Pelunasan reimburse: ${reimbursement.expense.title}`,
        actorMemberId: input.actorMemberId ?? null,
        reimbursementPayoutId: payout.id,
        idempotencyKey: `CM:REIMBURSE:${payout.idempotencyKey}`,
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: input.actorMemberId ?? null,
        action: "SETTLE_REIMBURSEMENT_PAYOUT",
        entityType: "Reimbursement",
        entityId: reimbursement.id,
        summary: `Pencairan reimburse Rp${payout.amount}, sisa utang Rp${remainingDebtAmount}`,
      },
    });

    return {
      payout,
      reimbursement: updatedReimbursement,
      remainingDebtAmount,
      cashMovement,
      wasDuplicateRequest: false,
    };
  });
}

/**
 * Mencatat saldo awal (OPENING_BALANCE) atau koreksi kas yang sah (ADJUSTMENT) pada buku besar.
 */
export async function recordLedgerEntry(
  db: PrismaClient,
  input: {
    cashAccountId: string;
    direction: "IN" | "OUT";
    category: "OPENING_BALANCE" | "ADJUSTMENT";
    amount: number;
    description: string;
    idempotencyKey: string;
    status?: "CONFIRMED" | "PENDING";
    occurredAt?: Date;
    actorMemberId?: string;
  }
): Promise<CashMovement> {
  assertPositiveInteger(input.amount, "amount");

  return db.$transaction(async (tx) => {
    const existing = await tx.cashMovement.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing) {
      return existing;
    }

    const movement = await tx.cashMovement.create({
      data: {
        cashAccountId: input.cashAccountId,
        direction: input.direction,
        category: input.category,
        amount: input.amount,
        status: input.status ?? "CONFIRMED",
        occurredAt: input.occurredAt ?? new Date(),
        description: input.description,
        actorMemberId: input.actorMemberId ?? null,
        idempotencyKey: input.idempotencyKey,
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: input.actorMemberId ?? null,
        action: `RECORD_${input.category}`,
        entityType: "CashMovement",
        entityId: movement.id,
        summary: `${input.category} (${input.direction}) sebesar Rp${movement.amount}: ${input.description}`,
      },
    });

    return movement;
  });
}

/**
 * Menghitung posisi saldo kas aktual berdasarkan seluruh CashMovement berstatus CONFIRMED.
 */
export async function getCashLedgerSummary(
  db: PrismaClient,
  cashAccountId: string
): Promise<CashLedgerSummary> {
  const confirmedMovements = await db.cashMovement.findMany({
    where: {
      cashAccountId,
      status: "CONFIRMED",
    },
  });

  let confirmedInflowTotal = 0;
  let confirmedOutflowTotal = 0;

  for (const movement of confirmedMovements) {
    if (movement.direction === "IN") {
      confirmedInflowTotal += movement.amount;
    } else {
      confirmedOutflowTotal += movement.amount;
    }
  }

  return {
    cashAccountId,
    confirmedInflowTotal,
    confirmedOutflowTotal,
    actualBalance: confirmedInflowTotal - confirmedOutflowTotal,
    confirmedMovementCount: confirmedMovements.length,
  };
}

/**
 * Menghitung total biaya operasional terkonfirmasi (baik dibayar langsung maupun ditalangi anggota)
 * tanpa menghitung dua kali pencairan reimbursement.
 */
export async function getTotalConfirmedOperatingExpenses(
  db: PrismaClient,
  filter?: { categoryId?: string; expenseIds?: string[] }
): Promise<number> {
  const aggregate = await db.expense.aggregate({
    where: {
      status: "CONFIRMED",
      ...(filter?.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter?.expenseIds ? { id: { in: filter.expenseIds } } : {}),
    },
    _sum: {
      amount: true,
    },
  });

  return aggregate._sum.amount ?? 0;
}
