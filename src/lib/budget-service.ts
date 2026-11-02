import { z } from "zod";
import type {
  MonthlyBudget,
  MonthlyBudgetAllocation,
  PrismaClient,
} from "../generated/prisma/client";
import { assertAuthenticatedActor, type AuthenticatedActor } from "./auth";
import {
  formatPeriodLabel,
  getCurrentYearMonthPeriod,
  shiftYearMonthPeriod,
} from "./contribution-service";
import { getCashLedgerSummary } from "./financial-service";
import { getJakartaPeriodBounds, ReportPeriodSchema } from "./reporting-service";

export const UpsertMonthlyBudgetSchema = z.object({
  period: ReportPeriodSchema,
  totalAmount: z.coerce
    .number()
    .int("Total anggaran bulanan harus bilangan bulat Rupiah.")
    .min(0, "Total anggaran tidak boleh negatif.")
    .max(500_000_000, "Nominal anggaran terlalu besar."),
  note: z
    .string()
    .trim()
    .max(180, "Catatan anggaran maksimal 180 karakter.")
    .optional(),
});

export const UpsertCategoryBudgetSchema = z.object({
  period: ReportPeriodSchema,
  categoryId: z.string().uuid("Pilih kategori pengeluaran yang valid."),
  amount: z.coerce
    .number()
    .int("Anggaran kategori harus bilangan bulat Rupiah.")
    .min(0, "Anggaran kategori tidak boleh negatif.")
    .max(500_000_000, "Nominal anggaran terlalu besar."),
  note: z
    .string()
    .trim()
    .max(160, "Catatan alokasi maksimal 160 karakter.")
    .optional(),
});

async function verifyActiveActorInDb(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined
): Promise<AuthenticatedActor> {
  const validActor = assertAuthenticatedActor(actor);
  const member = await db.member.findUnique({
    where: { id: validActor.memberId },
    select: { id: true, name: true, leftAt: true },
  });
  if (!member || member.leftAt !== null) {
    throw new Error("Akses ditolak: anggota sudah tidak aktif.");
  }
  return validActor;
}

export type BudgetAlertLevel =
  | "SAFE"
  | "NEAR_LIMIT"
  | "OVER_BUDGET"
  | "UNBUDGETED";

export interface CategoryBudgetComparisonItem {
  categoryId: string;
  categoryName: string;
  parentId: string | null;
  parentName: string | null;
  displayLabel: string;
  isActive: boolean;
  directBudgetAmount: number;
  effectiveBudgetAmount: number;
  directRealizedAmount: number;
  inclusiveRealizedAmount: number;
  remainingBalance: number;
  remainingAvailableAmount: number;
  overBudgetAmount: number;
  usagePercentage: number;
  isOverBudget: boolean;
  alertLevel: BudgetAlertLevel;
}

export interface ParentCategoryBudgetGroup {
  parent: CategoryBudgetComparisonItem;
  subcategories: CategoryBudgetComparisonItem[];
}

export interface BudgetPageData {
  period: string;
  periodLabel: string;
  availablePeriods: Array<{ value: string; label: string }>;
  cashAccount: {
    id: string;
    name: string;
    provider: string;
    custodianName: string;
    actualCashBalance: number;
  };
  monthlyBudget: {
    id: string | null;
    period: string;
    configuredTotalAmount: number;
    allocatedCategoriesTotal: number;
    effectiveTotalBudget: number;
    totalRealizedAmount: number;
    directCashRealizedAmount: number;
    memberAdvanceRealizedAmount: number;
    remainingBalance: number;
    remainingAvailableAmount: number;
    overBudgetAmount: number;
    usagePercentage: number;
    isOverBudget: boolean;
    alertLevel: BudgetAlertLevel;
    note: string | null;
    updatedByName: string | null;
    updatedAt: Date | null;
  };
  categoryGroups: ParentCategoryBudgetGroup[];
  flatCategories: CategoryBudgetComparisonItem[];
}

function computeAlertLevel(
  budgetAmount: number,
  realizedAmount: number
): BudgetAlertLevel {
  if (budgetAmount <= 0) {
    return realizedAmount > 0 ? "OVER_BUDGET" : "UNBUDGETED";
  }
  if (realizedAmount > budgetAmount) {
    return "OVER_BUDGET";
  }
  const pct = (realizedAmount / budgetAmount) * 100;
  if (pct >= 80) {
    return "NEAR_LIMIT";
  }
  return "SAFE";
}

/**
 * Menetapkan atau mengubah plafon total anggaran bulanan untuk suatu periode (YYYY-MM).
 * Tidak menciptakan CashMovement dan tidak mengubah histori periode sebelumnya.
 */
export async function authorizedUpsertMonthlyBudget(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<MonthlyBudget> {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = UpsertMonthlyBudgetSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data anggaran bulanan tidak valid."
    );
  }

  const { period, totalAmount, note } = parsed.data;

  return db.$transaction(async (tx) => {
    const existing = await tx.monthlyBudget.findUnique({
      where: { period },
    });

    const saved = await tx.monthlyBudget.upsert({
      where: { period },
      update: {
        totalAmount,
        note: note ?? existing?.note ?? null,
        updatedById: validActor.memberId,
      },
      create: {
        period,
        totalAmount,
        note: note ?? null,
        updatedById: validActor.memberId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: validActor.memberId,
        actorName: validActor.memberName,
        action: existing ? "UPDATE_MONTHLY_BUDGET" : "CREATE_MONTHLY_BUDGET",
        entityType: "MonthlyBudget",
        entityId: saved.id,
        summary: `${existing ? "Memperbarui" : "Menetapkan"} plafon anggaran periode ${period} sebesar Rp${totalAmount.toLocaleString("id-ID")}`,
        metadata: {
          period,
          previousTotalAmount: existing?.totalAmount ?? null,
          newTotalAmount: totalAmount,
        },
      },
    });

    return saved;
  });
}

/**
 * Menetapkan atau mengubah anggaran per kategori/subkategori pengeluaran pada periode tertentu
 * dengan jejak audit (AuditLog).
 */
export async function authorizedUpsertCategoryBudgetAllocation(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<MonthlyBudgetAllocation> {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = UpsertCategoryBudgetSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data alokasi anggaran kategori tidak valid."
    );
  }

  const { period, categoryId, amount, note } = parsed.data;

  return db.$transaction(async (tx) => {
    const category = await tx.expenseCategory.findUnique({
      where: { id: categoryId },
      include: { parent: true },
    });

    if (!category) {
      throw new Error("Kategori pengeluaran tidak ditemukan.");
    }

    let monthlyBudget = await tx.monthlyBudget.findUnique({
      where: { period },
    });

    if (!monthlyBudget) {
      monthlyBudget = await tx.monthlyBudget.create({
        data: {
          period,
          totalAmount: amount,
          updatedById: validActor.memberId,
        },
      });
    }

    const existingAlloc = await tx.monthlyBudgetAllocation.findUnique({
      where: {
        monthlyBudgetId_categoryId: {
          monthlyBudgetId: monthlyBudget.id,
          categoryId: category.id,
        },
      },
    });

    const savedAlloc = await tx.monthlyBudgetAllocation.upsert({
      where: {
        monthlyBudgetId_categoryId: {
          monthlyBudgetId: monthlyBudget.id,
          categoryId: category.id,
        },
      },
      update: {
        amount,
        note: note ?? existingAlloc?.note ?? null,
      },
      create: {
        monthlyBudgetId: monthlyBudget.id,
        categoryId: category.id,
        amount,
        note: note ?? null,
      },
    });

    const catLabel = category.parent
      ? `${category.parent.name} — ${category.name}`
      : category.name;

    await tx.auditLog.create({
      data: {
        actorMemberId: validActor.memberId,
        actorName: validActor.memberName,
        action: existingAlloc
          ? "UPDATE_CATEGORY_BUDGET"
          : "CREATE_CATEGORY_BUDGET",
        entityType: "MonthlyBudgetAllocation",
        entityId: savedAlloc.id,
        summary: `Menetapkan anggaran kategori "${catLabel}" (${period}) sebesar Rp${amount.toLocaleString("id-ID")}`,
        metadata: {
          period,
          categoryId: category.id,
          categoryName: catLabel,
          previousAmount: existingAlloc?.amount ?? null,
          newAmount: amount,
        },
      },
    });

    return savedAlloc;
  });
}

/**
 * Mengambil evaluasi anggaran bulanan vs realisasi pengeluaran CONFIRMED secara real-time,
 * bebas perhitungan ganda antara kategori induk & subkategori, dan bebas perhitungan ganda reimbursement.
 */
export async function getBudgetPageData(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawPeriod?: string
): Promise<BudgetPageData> {
  await verifyActiveActorInDb(db, actor);

  const currentPeriod = getCurrentYearMonthPeriod();
  const targetPeriod =
    rawPeriod && ReportPeriodSchema.safeParse(rawPeriod).success
      ? rawPeriod.trim()
      : currentPeriod;

  const { startUtc, endUtc } = getJakartaPeriodBounds(targetPeriod);

  const [
    cashAccount,
    categories,
    monthlyBudgetRecord,
    allBudgetPeriods,
    confirmedPeriodExpenses,
  ] = await Promise.all([
    db.cashAccount.findFirst({
      where: { isActive: true },
      include: { custodianMember: true },
      orderBy: { createdAt: "asc" },
    }),
    db.expenseCategory.findMany({
      include: {
        parent: { select: { id: true, name: true } },
      },
      orderBy: [{ name: "asc" }],
    }),
    db.monthlyBudget.findUnique({
      where: { period: targetPeriod },
      include: {
        updatedBy: { select: { name: true } },
        allocations: true,
      },
    }),
    db.monthlyBudget.findMany({
      select: { period: true },
    }),
    db.expense.findMany({
      where: {
        status: "CONFIRMED",
        expenseDate: {
          gte: startUtc,
          lt: endUtc,
        },
      },
      select: {
        id: true,
        categoryId: true,
        amount: true,
        fundingSource: true,
      },
    }),
  ]);

  if (!cashAccount) {
    throw new Error("Akun kas operasional DANA belum tersedia.");
  }

  const ledgerSummary = await getCashLedgerSummary(db, cashAccount.id);

  // Petakan anggaran langsung per categoryId
  const directBudgetMap = new Map<string, number>();
  if (monthlyBudgetRecord) {
    for (const alloc of monthlyBudgetRecord.allocations) {
      directBudgetMap.set(alloc.categoryId, alloc.amount);
    }
  }

  // Petakan realisasi langsung per categoryId dari Expense CONFIRMED saja
  // (ReimbursementPayout TIDAK PERNAH masuk ke sini sehingga tidak ada double-counting)
  const directRealizedMap = new Map<string, number>();
  let totalRealizedAmount = 0;
  let directCashRealizedAmount = 0;
  let memberAdvanceRealizedAmount = 0;

  for (const exp of confirmedPeriodExpenses) {
    totalRealizedAmount += exp.amount;
    if (exp.fundingSource === "DIRECT_CASH") {
      directCashRealizedAmount += exp.amount;
    } else {
      memberAdvanceRealizedAmount += exp.amount;
    }
    directRealizedMap.set(
      exp.categoryId,
      (directRealizedMap.get(exp.categoryId) ?? 0) + exp.amount
    );
  }

  const parentCategories = categories.filter((c) => c.parentId === null);
  const childCategoriesByParent = new Map<string, typeof categories>();
  for (const cat of categories) {
    if (cat.parentId) {
      const list = childCategoriesByParent.get(cat.parentId) ?? [];
      list.push(cat);
      childCategoriesByParent.set(cat.parentId, list);
    }
  }

  function buildCategoryItem(
    cat: (typeof categories)[number],
    directBudget: number,
    effectiveBudget: number,
    directRealized: number,
    inclusiveRealized: number
  ): CategoryBudgetComparisonItem {
    const remainingBalance = effectiveBudget - inclusiveRealized;
    const remainingAvailableAmount = Math.max(0, remainingBalance);
    const overBudgetAmount = Math.max(0, inclusiveRealized - effectiveBudget);
    const usagePercentage =
      effectiveBudget > 0
        ? Math.round((inclusiveRealized / effectiveBudget) * 100)
        : inclusiveRealized > 0
          ? 100
          : 0;
    const isOverBudget =
      effectiveBudget > 0
        ? inclusiveRealized > effectiveBudget
        : inclusiveRealized > 0;

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      parentId: cat.parentId,
      parentName: cat.parent?.name ?? null,
      displayLabel: cat.parent ? `${cat.parent.name} — ${cat.name}` : cat.name,
      isActive: cat.isActive,
      directBudgetAmount: directBudget,
      effectiveBudgetAmount: effectiveBudget,
      directRealizedAmount: directRealized,
      inclusiveRealizedAmount: inclusiveRealized,
      remainingBalance,
      remainingAvailableAmount,
      overBudgetAmount,
      usagePercentage,
      isOverBudget,
      alertLevel: computeAlertLevel(effectiveBudget, inclusiveRealized),
    };
  }

  let allocatedCategoriesTotal = 0;
  const categoryGroups: ParentCategoryBudgetGroup[] = [];
  const flatCategories: CategoryBudgetComparisonItem[] = [];

  for (const parent of parentCategories) {
    const children = childCategoriesByParent.get(parent.id) ?? [];
    const subItems: CategoryBudgetComparisonItem[] = [];

    let childrenBudgetSum = 0;
    let childrenRealizedSum = 0;

    for (const child of children) {
      const cBudget = directBudgetMap.get(child.id) ?? 0;
      const cRealized = directRealizedMap.get(child.id) ?? 0;
      childrenBudgetSum += cBudget;
      childrenRealizedSum += cRealized;

      const subItem = buildCategoryItem(
        child,
        cBudget,
        cBudget,
        cRealized,
        cRealized
      );
      subItems.push(subItem);
    }

    const pDirectBudget = directBudgetMap.get(parent.id) ?? 0;
    const pDirectRealized = directRealizedMap.get(parent.id) ?? 0;

    // Hindari perhitungan ganda antara induk dan subkategori:
    // Jika induk memiliki plafon anggaran yang menaungi subkategori, gunakan nilai terbesar antara plafon induk vs jumlah subkategori.
    const pEffectiveBudget = Math.max(pDirectBudget, childrenBudgetSum);
    const pInclusiveRealized = pDirectRealized + childrenRealizedSum;

    allocatedCategoriesTotal += pEffectiveBudget;

    const parentItem = buildCategoryItem(
      parent,
      pDirectBudget,
      pEffectiveBudget,
      pDirectRealized,
      pInclusiveRealized
    );

    categoryGroups.push({
      parent: parentItem,
      subcategories: subItems,
    });

    flatCategories.push(parentItem, ...subItems);
  }

  const configuredTotalAmount = monthlyBudgetRecord?.totalAmount ?? 0;
  const effectiveTotalBudget =
    configuredTotalAmount > 0 ? configuredTotalAmount : allocatedCategoriesTotal;

  const remainingBalance = effectiveTotalBudget - totalRealizedAmount;
  const remainingAvailableAmount = Math.max(0, remainingBalance);
  const overBudgetAmount = Math.max(
    0,
    totalRealizedAmount - effectiveTotalBudget
  );
  const usagePercentage =
    effectiveTotalBudget > 0
      ? Math.round((totalRealizedAmount / effectiveTotalBudget) * 100)
      : totalRealizedAmount > 0
        ? 100
        : 0;
  const isOverBudget =
    effectiveTotalBudget > 0
      ? totalRealizedAmount > effectiveTotalBudget
      : false;

  const periodSet = new Set<string>([
    shiftYearMonthPeriod(currentPeriod, -2),
    shiftYearMonthPeriod(currentPeriod, -1),
    currentPeriod,
    shiftYearMonthPeriod(currentPeriod, 1),
    targetPeriod,
    ...allBudgetPeriods.map((b) => b.period),
  ]);

  const availablePeriods = Array.from(periodSet)
    .sort()
    .reverse()
    .map((p) => ({ value: p, label: formatPeriodLabel(p) }));

  return {
    period: targetPeriod,
    periodLabel: formatPeriodLabel(targetPeriod),
    availablePeriods,
    cashAccount: {
      id: cashAccount.id,
      name: cashAccount.name,
      provider: cashAccount.provider,
      custodianName: cashAccount.custodianMember?.name ?? "Farhan",
      actualCashBalance: ledgerSummary.actualBalance,
    },
    monthlyBudget: {
      id: monthlyBudgetRecord?.id ?? null,
      period: targetPeriod,
      configuredTotalAmount,
      allocatedCategoriesTotal,
      effectiveTotalBudget,
      totalRealizedAmount,
      directCashRealizedAmount,
      memberAdvanceRealizedAmount,
      remainingBalance,
      remainingAvailableAmount,
      overBudgetAmount,
      usagePercentage,
      isOverBudget,
      alertLevel: computeAlertLevel(effectiveTotalBudget, totalRealizedAmount),
      note: monthlyBudgetRecord?.note ?? null,
      updatedByName: monthlyBudgetRecord?.updatedBy?.name ?? null,
      updatedAt: monthlyBudgetRecord?.updatedAt ?? null,
    },
    categoryGroups,
    flatCategories,
  };
}

