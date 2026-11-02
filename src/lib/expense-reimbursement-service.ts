import { z } from "zod";
import type {
  CashMovement,
  Expense,
  PrismaClient,
  Reimbursement,
} from "../generated/prisma/client";
import { assertAuthenticatedActor, type AuthenticatedActor } from "./auth";
import {
  formatPeriodLabel,
  getCurrentYearMonthPeriod,
  shiftYearMonthPeriod,
} from "./contribution-service";
import {
  type ExpenseCategoryGroup,
  type ExpenseCategoryItem,
  listExpenseCategories,
} from "./expense-category-service";
import {
  confirmPendingExpense,
  ensureReimbursementForAdvanceExpense,
  getCashLedgerSummary,
  getTotalConfirmedOperatingExpenses,
  recordDirectCashExpense,
  recordLedgerEntry,
  recordMemberAdvanceExpense,
  recordPendingMemberAdvanceExpense,
  reverseOrVoidExpense,
  settleReimbursementPayout,
} from "./financial-service";
import { getJakartaPeriodBounds } from "./reporting-service";

export const CreateExpenseInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Deskripsi pengeluaran minimal 3 karakter.")
      .max(120, "Deskripsi pengeluaran maksimal 120 karakter."),
    amount: z.coerce
      .number()
      .int("Nominal pengeluaran harus bilangan bulat Rupiah.")
      .positive("Nominal pengeluaran harus lebih dari Rp0.")
      .max(100_000_000, "Nominal pengeluaran terlalu besar."),
    categoryId: z.string().uuid("Pilih kategori pengeluaran yang valid."),
    fundingSource: z.enum(["DIRECT_CASH", "MEMBER_ADVANCE"]),
    advancedByMemberId: z
      .string()
      .uuid("Pilih anggota penanggung dana talangan yang valid.")
      .optional()
      .nullable(),
    confirmImmediately: z.boolean().default(true),
    allowNegativeBalance: z.boolean().default(false),
    expenseDate: z.union([z.date(), z.string().trim().min(1)]).optional(),
    cashAccountId: z.string().uuid().optional(),
    idempotencyKey: z.string().trim().min(6, "Idempotency key diperlukan."),
    note: z
      .string()
      .trim()
      .max(200, "Catatan tambahan maksimal 200 karakter.")
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.fundingSource === "MEMBER_ADVANCE" && !val.advancedByMemberId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["advancedByMemberId"],
        message:
          "Pilih anggota yang menalangi pembayaran untuk pengeluaran talangan anggota.",
      });
    }
  });

export const ConfirmPendingExpenseInputSchema = z.object({
  expenseId: z.string().uuid("ID pengeluaran tidak valid."),
  allowNegativeBalance: z.boolean().default(false),
});

export const ReverseOrVoidExpenseInputSchema = z.object({
  expenseId: z.string().uuid("ID pengeluaran tidak valid."),
  reason: z
    .string()
    .trim()
    .min(3, "Alasan koreksi/pembatalan minimal 3 karakter.")
    .max(160, "Alasan koreksi/pembatalan maksimal 160 karakter."),
});

export const CreateReimbursementClaimInputSchema = z.object({
  expenseId: z.string().uuid("ID pengeluaran talangan tidak valid."),
});

export const SettleReimbursementPayoutInputSchema = z.object({
  reimbursementId: z.string().uuid("ID klaim reimbursement tidak valid."),
  amount: z.coerce
    .number()
    .int("Nominal pencairan harus bilangan bulat Rupiah.")
    .positive("Nominal pencairan harus lebih dari Rp0.")
    .max(100_000_000, "Nominal pencairan terlalu besar."),
  cashAccountId: z.string().uuid().optional(),
  allowNegativeBalance: z.boolean().default(false),
  idempotencyKey: z.string().trim().min(6, "Idempotency key diperlukan."),
  paidAt: z.union([z.date(), z.string().trim().min(1)]).optional(),
  note: z
    .string()
    .trim()
    .max(180, "Catatan pencairan maksimal 180 karakter.")
    .optional(),
});

export const RecordLedgerAdjustmentInputSchema = z.object({
  direction: z.enum(["IN", "OUT"]),
  category: z.enum(["OPENING_BALANCE", "ADJUSTMENT"]),
  amount: z.coerce
    .number()
    .int("Nominal penyesuaian harus bilangan bulat Rupiah.")
    .positive("Nominal penyesuaian harus lebih dari Rp0."),
  description: z
    .string()
    .trim()
    .min(3, "Keterangan penyesuaian minimal 3 karakter.")
    .max(160, "Keterangan penyesuaian maksimal 160 karakter."),
  idempotencyKey: z.string().trim().min(6, "Idempotency key diperlukan."),
});

function parseDateInput(raw: Date | string | undefined, fallback = new Date()): Date {
  if (!raw) return fallback;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      throw new Error("Format tanggal transaksi tidak valid.");
    }
    return raw;
  }
  const parsed = new Date(raw.includes("T") ? raw : `${raw}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Format tanggal transaksi tidak valid.");
  }
  return parsed;
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

async function resolveDefaultCashAccount(
  db: PrismaClient,
  explicitCashAccountId?: string
) {
  const cashAccount = explicitCashAccountId
    ? await db.cashAccount.findUnique({
        where: { id: explicitCashAccountId },
        include: { custodianMember: true },
      })
    : await db.cashAccount.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        include: { custodianMember: true },
      });

  if (!cashAccount) {
    throw new Error("Akun kas operasional DANA belum tersedia.");
  }
  return cashAccount;
}

/**
 * Mencatat pengeluaran baru (DIRECT_CASH atau MEMBER_ADVANCE) dengan validasi Zod & otorisasi server-side.
 */
export async function authorizedCreateExpense(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<{
  expense: Expense;
  reimbursement: Reimbursement | null;
  cashMovement: CashMovement | null;
  wasDuplicateRequest: boolean;
}> {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = CreateExpenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data pengeluaran tidak valid."
    );
  }

  const data = parsed.data;
  const expenseDate = parseDateInput(data.expenseDate);

  const category = await db.expenseCategory.findUnique({
    where: { id: data.categoryId },
    include: { parent: true },
  });

  if (!category) {
    throw new Error("Kategori pengeluaran tidak ditemukan.");
  }
  if (!category.isActive || (category.parent && !category.parent.isActive)) {
    throw new Error(
      "Kategori pengeluaran yang dipilih sudah dinonaktifkan. Pilih kategori yang aktif."
    );
  }

  if (data.fundingSource === "DIRECT_CASH") {
    const cashAccount = await resolveDefaultCashAccount(db, data.cashAccountId);
    const res = await recordDirectCashExpense(db, {
      categoryId: category.id,
      cashAccountId: cashAccount.id,
      title: data.title,
      amount: data.amount,
      idempotencyKey: data.idempotencyKey,
      confirmImmediately: data.confirmImmediately,
      allowNegativeBalance: data.allowNegativeBalance,
      recordedByMemberId: validActor.memberId,
      expenseDate,
      note: data.note,
    });
    return {
      expense: res.expense,
      reimbursement: null,
      cashMovement: res.cashMovement,
      wasDuplicateRequest: res.wasDuplicateRequest,
    };
  }

  const advancedByMember = await db.member.findUnique({
    where: { id: data.advancedByMemberId! },
  });

  if (!advancedByMember || advancedByMember.leftAt !== null) {
    throw new Error(
      "Anggota penanggung dana talangan tidak ditemukan atau sudah tidak aktif."
    );
  }

  if (!data.confirmImmediately) {
    const res = await recordPendingMemberAdvanceExpense(db, {
      categoryId: category.id,
      advancedByMemberId: advancedByMember.id,
      title: data.title,
      amount: data.amount,
      idempotencyKey: data.idempotencyKey,
      recordedByMemberId: validActor.memberId,
      expenseDate,
      note: data.note,
    });
    return {
      expense: res.expense,
      reimbursement: null,
      cashMovement: null,
      wasDuplicateRequest: res.wasDuplicateRequest,
    };
  }

  const res = await recordMemberAdvanceExpense(db, {
    categoryId: category.id,
    advancedByMemberId: advancedByMember.id,
    title: data.title,
    amount: data.amount,
    idempotencyKey: data.idempotencyKey,
    recordedByMemberId: validActor.memberId,
    expenseDate,
    note: data.note,
  });
  return {
    expense: res.expense,
    reimbursement: res.reimbursement,
    cashMovement: null,
    wasDuplicateRequest: res.wasDuplicateRequest,
  };
}

/**
 * Mengonfirmasi pengeluaran berstatus PENDING menjadi CONFIRMED.
 */
export async function authorizedConfirmPendingExpense(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
) {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = ConfirmPendingExpenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Permintaan konfirmasi tidak valid."
    );
  }

  const cashAccount = await resolveDefaultCashAccount(db);

  return confirmPendingExpense(db, {
    expenseId: parsed.data.expenseId,
    cashAccountId: cashAccount.id,
    actorMemberId: validActor.memberId,
    allowNegativeBalance: parsed.data.allowNegativeBalance,
  });
}

/**
 * Membatalkan atau mengoreksi transaksi pengeluaran secara auditable tanpa menghapus histori database.
 */
export async function authorizedReverseOrVoidExpense(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
) {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = ReverseOrVoidExpenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data pembatalan pengeluaran tidak valid."
    );
  }

  return reverseOrVoidExpense(db, {
    expenseId: parsed.data.expenseId,
    reason: parsed.data.reason,
    actorMemberId: validActor.memberId,
  });
}

/**
 * Membuat atau menghubungkan klaim Reimbursement dari transaksi MEMBER_ADVANCE secara idempotent.
 */
export async function authorizedCreateReimbursementClaim(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
) {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = CreateReimbursementClaimInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "ID pengeluaran tidak valid."
    );
  }

  return ensureReimbursementForAdvanceExpense(db, {
    expenseId: parsed.data.expenseId,
    actorMemberId: validActor.memberId,
  });
}

/**
 * Mencairkan penggantian dana talangan (Reimbursement) secara penuh atau parsial dari akun kas DANA.
 */
export async function authorizedSettleReimbursementPayout(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
) {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = SettleReimbursementPayoutInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data pencairan reimbursement tidak valid."
    );
  }

  const cashAccount = await resolveDefaultCashAccount(
    db,
    parsed.data.cashAccountId
  );

  return settleReimbursementPayout(db, {
    reimbursementId: parsed.data.reimbursementId,
    cashAccountId: cashAccount.id,
    amount: parsed.data.amount,
    idempotencyKey: parsed.data.idempotencyKey,
    allowNegativeBalance: parsed.data.allowNegativeBalance,
    actorMemberId: validActor.memberId,
    paidAt: parseDateInput(parsed.data.paidAt),
    note: parsed.data.note,
  });
}

/**
 * Mencatat saldo awal (OPENING_BALANCE) atau koreksi kas (ADJUSTMENT) secara sah.
 */
export async function authorizedRecordLedgerAdjustment(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
) {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = RecordLedgerAdjustmentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data penyesuaian kas tidak valid."
    );
  }

  const cashAccount = await resolveDefaultCashAccount(db);

  if (parsed.data.direction === "OUT") {
    const ledger = await getCashLedgerSummary(db, cashAccount.id);
    if (ledger.actualBalance < parsed.data.amount) {
      throw new Error(
        `Saldo kas DANA tidak mencukupi untuk penyesuaian keluar Rp${parsed.data.amount.toLocaleString("id-ID")}.`
      );
    }
  }

  return recordLedgerEntry(db, {
    cashAccountId: cashAccount.id,
    direction: parsed.data.direction,
    category: parsed.data.category,
    amount: parsed.data.amount,
    description: parsed.data.description,
    idempotencyKey: parsed.data.idempotencyKey,
    status: "CONFIRMED",
    actorMemberId: validActor.memberId,
  });
}

export interface ExpenseLedgerRow {
  id: string;
  title: string;
  amount: number;
  fundingSource: "DIRECT_CASH" | "MEMBER_ADVANCE";
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  expenseDate: Date;
  confirmedAt: Date | null;
  note: string | null;
  category: {
    id: string;
    name: string;
    parentName: string | null;
    displayLabel: string;
    isActive: boolean;
  };
  recordedByName: string;
  paidOrAdvancedByLabel: string;
  advancedByMember: {
    id: string;
    name: string;
  } | null;
  reimbursement: {
    id: string;
    totalAmount: number;
    settledAmount: number;
    remainingAmount: number;
    status: "OUTSTANDING" | "PARTIALLY_SETTLED" | "SETTLED" | "CANCELLED";
  } | null;
  cashMovementId: string | null;
}

export interface ExpensesPageData {
  filters: {
    period: string;
    categoryId: string;
    memberId: string;
    fundingSource: string;
    status: string;
  };
  availablePeriods: Array<{ value: string; label: string }>;
  cashAccount: {
    id: string;
    code: string;
    name: string;
    provider: string;
    custodianName: string;
    actualBalance: number;
    confirmedInflowTotal: number;
    confirmedOutflowTotal: number;
  };
  summary: {
    totalConfirmedOperatingExpense: number;
    confirmedDirectCashExpenseTotal: number;
    confirmedMemberAdvanceExpenseTotal: number;
    pendingExpenseTotal: number;
    pendingExpenseCount: number;
    outstandingReimbursementTotal: number;
  };
  expenses: ExpenseLedgerRow[];
  categories: {
    flatCategories: ExpenseCategoryItem[];
    groups: ExpenseCategoryGroup[];
  };
  activeMembers: Array<{ id: string; name: string }>;
}

/**
 * Mengambil seluruh data halaman Pengeluaran (/pengeluaran) dengan filter periode, kategori, anggota, sumber dana, dan status.
 */
export async function getExpensesPageData(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawFilters?: {
    period?: string;
    categoryId?: string;
    memberId?: string;
    fundingSource?: string;
    status?: string;
  }
): Promise<ExpensesPageData> {
  await verifyActiveActorInDb(db, actor);

  const currentPeriod = getCurrentYearMonthPeriod();
  const period =
    rawFilters?.period &&
    (rawFilters.period === "ALL" || /^\d{4}-(0[1-9]|1[0-2])$/.test(rawFilters.period))
      ? rawFilters.period
      : "ALL";
  const categoryId = rawFilters?.categoryId?.trim() || "ALL";
  const memberId = rawFilters?.memberId?.trim() || "ALL";
  const fundingSource =
    rawFilters?.fundingSource &&
    ["ALL", "DIRECT_CASH", "MEMBER_ADVANCE"].includes(rawFilters.fundingSource)
      ? rawFilters.fundingSource
      : "ALL";
  const status =
    rawFilters?.status &&
    ["ALL", "CONFIRMED", "PENDING", "REJECTED"].includes(rawFilters.status)
      ? rawFilters.status
      : "ALL";

  const [cashAccount, categoriesData, activeMembers, outstandingReimbursements] =
    await Promise.all([
      resolveDefaultCashAccount(db),
      listExpenseCategories(db, actor),
      db.member.findMany({
        where: { leftAt: null },
        select: { id: true, name: true },
        orderBy: [{ joinedAt: "asc" }, { name: "asc" }],
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
    ]);

  const ledgerSummary = await getCashLedgerSummary(db, cashAccount.id);

  // Jika filter kategori adalah kategori induk, sertakan subkategorinya juga
  let categoryFilterIds: string[] | undefined;
  if (categoryId !== "ALL") {
    const childIds = categoriesData.flatCategories
      .filter((c) => c.id === categoryId || c.parentId === categoryId)
      .map((c) => c.id);
    categoryFilterIds = childIds.length > 0 ? childIds : [categoryId];
  }

  let dateRangeFilter: { gte: Date; lt: Date } | undefined;
  if (period !== "ALL") {
    const { startUtc, endUtc } = getJakartaPeriodBounds(period);
    dateRangeFilter = { gte: startUtc, lt: endUtc };
  }

  const rawExpenses = await db.expense.findMany({
    where: {
      ...(dateRangeFilter ? { expenseDate: dateRangeFilter } : {}),
      ...(categoryFilterIds ? { categoryId: { in: categoryFilterIds } } : {}),
      ...(fundingSource !== "ALL"
        ? { fundingSource: fundingSource as "DIRECT_CASH" | "MEMBER_ADVANCE" }
        : {}),
      ...(status !== "ALL"
        ? { status: status as "PENDING" | "CONFIRMED" | "REJECTED" }
        : {}),
      ...(memberId !== "ALL"
        ? {
            OR: [
              { recordedByMemberId: memberId },
              { advancedByMemberId: memberId },
            ],
          }
        : {}),
    },
    include: {
      category: {
        include: {
          parent: {
            select: { name: true },
          },
        },
      },
      recordedByMember: {
        select: { id: true, name: true },
      },
      advancedByMember: {
        select: { id: true, name: true },
      },
      cashAccount: {
        include: {
          custodianMember: {
            select: { name: true },
          },
        },
      },
      reimbursement: true,
      cashMovement: {
        select: { id: true },
      },
    },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
  });

  let confirmedDirectCashExpenseTotal = 0;
  let confirmedMemberAdvanceExpenseTotal = 0;
  let pendingExpenseTotal = 0;
  let pendingExpenseCount = 0;

  const expenses: ExpenseLedgerRow[] = rawExpenses.map((exp) => {
    if (exp.status === "CONFIRMED") {
      if (exp.fundingSource === "DIRECT_CASH") {
        confirmedDirectCashExpenseTotal += exp.amount;
      } else {
        confirmedMemberAdvanceExpenseTotal += exp.amount;
      }
    } else if (exp.status === "PENDING") {
      pendingExpenseTotal += exp.amount;
      pendingExpenseCount += 1;
    }

    const parentName = exp.category.parent?.name ?? null;
    const displayLabel = parentName
      ? `${parentName} — ${exp.category.name}`
      : exp.category.name;

    const paidOrAdvancedByLabel =
      exp.fundingSource === "DIRECT_CASH"
        ? `Kas ${exp.cashAccount?.provider ?? "DANA"} (${exp.cashAccount?.custodianMember?.name ?? cashAccount.custodianMember?.name ?? "Farhan"})`
        : `Talangan ${exp.advancedByMember?.name ?? "Anggota"}`;

    return {
      id: exp.id,
      title: exp.title,
      amount: exp.amount,
      fundingSource: exp.fundingSource,
      status: exp.status,
      expenseDate: exp.expenseDate,
      confirmedAt: exp.confirmedAt,
      note: exp.note,
      category: {
        id: exp.category.id,
        name: exp.category.name,
        parentName,
        displayLabel,
        isActive: exp.category.isActive,
      },
      recordedByName: exp.recordedByMember?.name ?? "Sistem",
      paidOrAdvancedByLabel,
      advancedByMember: exp.advancedByMember
        ? { id: exp.advancedByMember.id, name: exp.advancedByMember.name }
        : null,
      reimbursement: exp.reimbursement
        ? {
            id: exp.reimbursement.id,
            totalAmount: exp.reimbursement.totalAmount,
            settledAmount: exp.reimbursement.settledAmount,
            remainingAmount: Math.max(
              0,
              exp.reimbursement.totalAmount - exp.reimbursement.settledAmount
            ),
            status: exp.reimbursement.status,
          }
        : null,
      cashMovementId: exp.cashMovement?.id ?? null,
    };
  });

  const outstandingReimbursementTotal = outstandingReimbursements.reduce(
    (sum, r) => sum + Math.max(0, r.totalAmount - r.settledAmount),
    0
  );

  const periodSet = new Set<string>([
    shiftYearMonthPeriod(currentPeriod, -2),
    shiftYearMonthPeriod(currentPeriod, -1),
    currentPeriod,
    shiftYearMonthPeriod(currentPeriod, 1),
  ]);
  for (const exp of rawExpenses) {
    const y = exp.expenseDate.getUTCFullYear();
    const m = String(exp.expenseDate.getUTCMonth() + 1).padStart(2, "0");
    periodSet.add(`${y}-${m}`);
  }

  const availablePeriods = [
    { value: "ALL", label: "Semua Periode" },
    ...Array.from(periodSet)
      .sort()
      .reverse()
      .map((p) => ({ value: p, label: formatPeriodLabel(p) })),
  ];

  return {
    filters: {
      period,
      categoryId,
      memberId,
      fundingSource,
      status,
    },
    availablePeriods,
    cashAccount: {
      id: cashAccount.id,
      code: cashAccount.code,
      name: cashAccount.name,
      provider: cashAccount.provider,
      custodianName: cashAccount.custodianMember?.name ?? "Farhan",
      actualBalance: ledgerSummary.actualBalance,
      confirmedInflowTotal: ledgerSummary.confirmedInflowTotal,
      confirmedOutflowTotal: ledgerSummary.confirmedOutflowTotal,
    },
    summary: {
      totalConfirmedOperatingExpense:
        confirmedDirectCashExpenseTotal + confirmedMemberAdvanceExpenseTotal,
      confirmedDirectCashExpenseTotal,
      confirmedMemberAdvanceExpenseTotal,
      pendingExpenseTotal,
      pendingExpenseCount,
      outstandingReimbursementTotal,
    },
    expenses,
    categories: categoriesData,
    activeMembers,
  };
}

export interface ReimbursementPayoutItem {
  id: string;
  amount: number;
  paidAt: Date;
  note: string | null;
  disbursedByName: string;
  cashAccountName: string;
}

export interface ReimbursementClaimRow {
  id: string;
  expenseId: string;
  expenseTitle: string;
  expenseDate: Date;
  expenseCategoryLabel: string;
  recordedByName: string;
  beneficiaryMember: {
    id: string;
    name: string;
  };
  totalAmount: number;
  settledAmount: number;
  remainingAmount: number;
  status: "OUTSTANDING" | "PARTIALLY_SETTLED" | "SETTLED" | "CANCELLED";
  createdAt: Date;
  payouts: ReimbursementPayoutItem[];
}

export interface UnclaimedAdvanceExpenseItem {
  id: string;
  title: string;
  amount: number;
  status: "PENDING" | "CONFIRMED";
  expenseDate: Date;
  categoryLabel: string;
  advancedByMemberName: string;
  recordedByName: string;
}

export interface ReimbursementsPageData {
  filters: {
    status: string;
    memberId: string;
  };
  cashAccount: {
    id: string;
    code: string;
    name: string;
    provider: string;
    custodianName: string;
    actualBalance: number;
  };
  summary: {
    totalAdvanceAmount: number;
    totalSettledAmount: number;
    totalOutstandingObligation: number;
    outstandingClaimsCount: number;
    settledClaimsCount: number;
    unclaimedAdvanceExpensesCount: number;
    totalConfirmedOperatingExpense: number;
  };
  reimbursements: ReimbursementClaimRow[];
  unclaimedAdvanceExpenses: UnclaimedAdvanceExpenseItem[];
  activeMembers: Array<{ id: string; name: string }>;
}

/**
 * Mengambil seluruh data halaman Reimbursement (/reimbursement) beserta riwayat pencairan dana dari kas DANA.
 */
export async function getReimbursementsPageData(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawFilters?: {
    status?: string;
    memberId?: string;
  }
): Promise<ReimbursementsPageData> {
  await verifyActiveActorInDb(db, actor);

  const status =
    rawFilters?.status &&
    ["ALL", "OUTSTANDING", "PARTIALLY_SETTLED", "SETTLED", "CANCELLED"].includes(
      rawFilters.status
    )
      ? rawFilters.status
      : "ALL";
  const memberId = rawFilters?.memberId?.trim() || "ALL";

  const [
    cashAccount,
    activeMembers,
    rawReimbursements,
    rawUnclaimedAdvances,
    totalConfirmedOperatingExpense,
  ] = await Promise.all([
    resolveDefaultCashAccount(db),
    db.member.findMany({
      where: { leftAt: null },
      select: { id: true, name: true },
      orderBy: [{ joinedAt: "asc" }, { name: "asc" }],
    }),
    db.reimbursement.findMany({
      where: {
        ...(status !== "ALL"
          ? {
              status: status as
                | "OUTSTANDING"
                | "PARTIALLY_SETTLED"
                | "SETTLED"
                | "CANCELLED",
            }
          : {}),
        ...(memberId !== "ALL" ? { beneficiaryMemberId: memberId } : {}),
      },
      include: {
        beneficiaryMember: {
          select: { id: true, name: true },
        },
        expense: {
          include: {
            category: {
              include: {
                parent: {
                  select: { name: true },
                },
              },
            },
            recordedByMember: {
              select: { name: true },
            },
          },
        },
        payouts: {
          include: {
            cashAccount: {
              select: { name: true, provider: true },
            },
            cashMovement: {
              include: {
                actorMember: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: { paidAt: "asc" },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    db.expense.findMany({
      where: {
        fundingSource: "MEMBER_ADVANCE",
        status: { in: ["PENDING", "CONFIRMED"] },
        reimbursement: null,
        ...(memberId !== "ALL" ? { advancedByMemberId: memberId } : {}),
      },
      include: {
        category: {
          include: {
            parent: { select: { name: true } },
          },
        },
        advancedByMember: {
          select: { name: true },
        },
        recordedByMember: {
          select: { name: true },
        },
      },
      orderBy: [{ expenseDate: "desc" }],
    }),
    getTotalConfirmedOperatingExpenses(db),
  ]);

  const ledgerSummary = await getCashLedgerSummary(db, cashAccount.id);

  let totalAdvanceAmount = 0;
  let totalSettledAmount = 0;
  let totalOutstandingObligation = 0;
  let outstandingClaimsCount = 0;
  let settledClaimsCount = 0;

  const reimbursements: ReimbursementClaimRow[] = rawReimbursements.map(
    (reimb) => {
      const remainingAmount = Math.max(
        0,
        reimb.totalAmount - reimb.settledAmount
      );

      if (reimb.status !== "CANCELLED") {
        totalAdvanceAmount += reimb.totalAmount;
        totalSettledAmount += reimb.settledAmount;
      }

      if (
        reimb.status === "OUTSTANDING" ||
        reimb.status === "PARTIALLY_SETTLED"
      ) {
        totalOutstandingObligation += remainingAmount;
        outstandingClaimsCount += 1;
      } else if (reimb.status === "SETTLED") {
        settledClaimsCount += 1;
      }

      const parentName = reimb.expense.category.parent?.name ?? null;
      const expenseCategoryLabel = parentName
        ? `${parentName} — ${reimb.expense.category.name}`
        : reimb.expense.category.name;

      return {
        id: reimb.id,
        expenseId: reimb.expense.id,
        expenseTitle: reimb.expense.title,
        expenseDate: reimb.expense.expenseDate,
        expenseCategoryLabel,
        recordedByName: reimb.expense.recordedByMember?.name ?? "Sistem",
        beneficiaryMember: {
          id: reimb.beneficiaryMember.id,
          name: reimb.beneficiaryMember.name,
        },
        totalAmount: reimb.totalAmount,
        settledAmount: reimb.settledAmount,
        remainingAmount,
        status: reimb.status,
        createdAt: reimb.createdAt,
        payouts: reimb.payouts.map((p) => ({
          id: p.id,
          amount: p.amount,
          paidAt: p.paidAt,
          note: p.note,
          disbursedByName:
            p.cashMovement?.actorMember?.name ??
            cashAccount.custodianMember?.name ??
            "Farhan",
          cashAccountName: `${p.cashAccount.provider} (${p.cashAccount.name})`,
        })),
      };
    }
  );

  const unclaimedAdvanceExpenses: UnclaimedAdvanceExpenseItem[] =
    rawUnclaimedAdvances
      .filter((e) => e.status === "PENDING" || e.status === "CONFIRMED")
      .map((e) => {
        const parentName = e.category.parent?.name ?? null;
        return {
          id: e.id,
          title: e.title,
          amount: e.amount,
          status: e.status as "PENDING" | "CONFIRMED",
          expenseDate: e.expenseDate,
          categoryLabel: parentName
            ? `${parentName} — ${e.category.name}`
            : e.category.name,
          advancedByMemberName: e.advancedByMember?.name ?? "Anggota",
          recordedByName: e.recordedByMember?.name ?? "Sistem",
        };
      });

  return {
    filters: {
      status,
      memberId,
    },
    cashAccount: {
      id: cashAccount.id,
      code: cashAccount.code,
      name: cashAccount.name,
      provider: cashAccount.provider,
      custodianName: cashAccount.custodianMember?.name ?? "Farhan",
      actualBalance: ledgerSummary.actualBalance,
    },
    summary: {
      totalAdvanceAmount,
      totalSettledAmount,
      totalOutstandingObligation,
      outstandingClaimsCount,
      settledClaimsCount,
      unclaimedAdvanceExpensesCount: unclaimedAdvanceExpenses.length,
      totalConfirmedOperatingExpense,
    },
    reimbursements,
    unclaimedAdvanceExpenses,
    activeMembers,
  };
}
