import { z } from "zod";
import type { ExpenseCategory, PrismaClient } from "../generated/prisma/client";
import { assertAuthenticatedActor, type AuthenticatedActor } from "./auth";

export interface ExpenseCategoryItem {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  displayLabel: string;
  isActive: boolean;
  expenseCount: number;
  childrenCount: number;
}

export interface ExpenseCategoryGroup {
  parent: ExpenseCategoryItem;
  subcategories: ExpenseCategoryItem[];
}

export const CreateExpenseCategoryInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nama kategori minimal 2 karakter.")
    .max(80, "Nama kategori maksimal 80 karakter."),
  parentId: z
    .string()
    .trim()
    .uuid("ID kategori induk tidak valid.")
    .nullable()
    .optional(),
});

export const ToggleExpenseCategoryStatusInputSchema = z.object({
  categoryId: z.string().uuid("ID kategori tidak valid."),
  isActive: z.boolean(),
});

export const DeleteExpenseCategoryInputSchema = z.object({
  categoryId: z.string().uuid("ID kategori tidak valid."),
});

function slugifyCategoryName(rawName: string): string {
  const base = rawName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return base.length >= 2 ? base : `kategori-${Date.now()}`;
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

/**
 * Mengambil seluruh kategori & subkategori pengeluaran beserta jumlah transaksi terkait.
 */
export async function listExpenseCategories(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined
): Promise<{
  flatCategories: ExpenseCategoryItem[];
  groups: ExpenseCategoryGroup[];
}> {
  await verifyActiveActorInDb(db, actor);

  const records = await db.expenseCategory.findMany({
    include: {
      parent: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          expenses: true,
          children: true,
        },
      },
    },
    orderBy: [{ name: "asc" }],
  });

  const flatCategories: ExpenseCategoryItem[] = records.map((cat) => ({
    id: cat.id,
    slug: cat.slug,
    name: cat.name,
    parentId: cat.parentId,
    parentName: cat.parent?.name ?? null,
    displayLabel: cat.parent ? `${cat.parent.name} — ${cat.name}` : cat.name,
    isActive: cat.isActive,
    expenseCount: cat._count.expenses,
    childrenCount: cat._count.children,
  }));

  flatCategories.sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel, "id-ID")
  );

  const parents = flatCategories.filter((c) => c.parentId === null);
  const groups: ExpenseCategoryGroup[] = parents.map((parent) => ({
    parent,
    subcategories: flatCategories.filter((c) => c.parentId === parent.id),
  }));

  return {
    flatCategories,
    groups,
  };
}

/**
 * Menambahkan kategori utama atau subkategori baru secara dinamis.
 */
export async function createExpenseCategory(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<ExpenseCategory> {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = CreateExpenseCategoryInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data kategori tidak valid."
    );
  }

  const { name, parentId } = parsed.data;

  return db.$transaction(async (tx) => {
    let parentRecord: ExpenseCategory | null = null;
    if (parentId) {
      parentRecord = await tx.expenseCategory.findUnique({
        where: { id: parentId },
      });
      if (!parentRecord) {
        throw new Error("Kategori induk tidak ditemukan.");
      }
      if (parentRecord.parentId !== null) {
        throw new Error(
          "Subkategori hanya boleh dibuat di bawah kategori utama (maksimal 2 tingkat)."
        );
      }
    }

    const baseSlug = parentRecord
      ? `${parentRecord.slug}-${slugifyCategoryName(name)}`
      : slugifyCategoryName(name);

    let candidateSlug = baseSlug;
    let suffix = 2;
    while (
      await tx.expenseCategory.findUnique({ where: { slug: candidateSlug } })
    ) {
      candidateSlug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const created = await tx.expenseCategory.create({
      data: {
        slug: candidateSlug,
        name,
        parentId: parentRecord?.id ?? null,
        isActive: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: validActor.memberId,
        action: "CREATE_EXPENSE_CATEGORY",
        entityType: "ExpenseCategory",
        entityId: created.id,
        summary: parentRecord
          ? `Menambahkan subkategori "${created.name}" di bawah "${parentRecord.name}"`
          : `Menambahkan kategori pengeluaran "${created.name}"`,
      },
    });

    return created;
  });
}

/**
 * Menonaktifkan atau mengaktifkan kembali kategori pengeluaran tanpa merusak histori transaksi lama.
 */
export async function setExpenseCategoryActiveStatus(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<ExpenseCategory> {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = ToggleExpenseCategoryStatusInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Permintaan status kategori tidak valid."
    );
  }

  const { categoryId, isActive } = parsed.data;

  return db.$transaction(async (tx) => {
    const existing = await tx.expenseCategory.findUnique({
      where: { id: categoryId },
    });

    if (!existing) {
      throw new Error("Kategori pengeluaran tidak ditemukan.");
    }

    const updated = await tx.expenseCategory.update({
      where: { id: categoryId },
      data: { isActive },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: validActor.memberId,
        action: isActive
          ? "REACTIVATE_EXPENSE_CATEGORY"
          : "DEACTIVATE_EXPENSE_CATEGORY",
        entityType: "ExpenseCategory",
        entityId: updated.id,
        summary: `${isActive ? "Mengaktifkan" : "Menonaktifkan"} kategori pengeluaran "${updated.name}" (histori transaksi tetap utuh)`,
      },
    });

    return updated;
  });
}

/**
 * Menghapus kategori yang belum pernah dipakai transaksi sama sekali.
 * Jika kategori sudah digunakan oleh transaksi atau memiliki subkategori, penghapusan ditolak
 * agar histori transaksi tidak rusak (gunakan setExpenseCategoryActiveStatus untuk menonaktifkan).
 */
export async function deleteUnusedExpenseCategory(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<{ deletedId: string }> {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = DeleteExpenseCategoryInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "ID kategori tidak valid."
    );
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.expenseCategory.findUnique({
      where: { id: parsed.data.categoryId },
      include: {
        _count: {
          select: {
            expenses: true,
            children: true,
          },
        },
      },
    });

    if (!existing) {
      throw new Error("Kategori pengeluaran tidak ditemukan.");
    }

    if (existing._count.expenses > 0 || existing._count.children > 0) {
      throw new Error(
        "Kategori yang sudah dipakai transaksi atau memiliki subkategori tidak boleh dihapus agar histori tetap utuh. Silakan nonaktifkan kategori ini."
      );
    }

    await tx.expenseCategory.delete({
      where: { id: existing.id },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: validActor.memberId,
        action: "DELETE_UNUSED_EXPENSE_CATEGORY",
        entityType: "ExpenseCategory",
        entityId: existing.id,
        summary: `Menghapus kategori kosong "${existing.name}"`,
      },
    });

    return { deletedId: existing.id };
  });
}

export interface CategorySyncSummary {
  ensuredFinalCategories: string[];
  deactivatedUnusedLegacy: string[];
  preservedUsedLegacy: string[];
}

/**
 * Prosedur sinkronisasi non-destruktif struktur kategori KostKas (v1.0.2):
 * 1. Menjamin ketersediaan 5 kategori default aktif: Galon, Listrik, Wi-Fi, Alat Mandi, Lainnya.
 * 2. Kategori legacy (Galon & Gas, Listrik & Wi-Fi, Kebersihan & Dapur, Perbaikan, dsb):
 *    - Jika memiliki transaksi/alokasi historis: tetap dipertahankan utuh dan dinonaktifkan (isActive: false)
 *      agar pelaporan historis akurat namun tidak dapat dipilih untuk transaksi baru.
 *    - Jika belum pernah dipakai: dinonaktifkan secara aman.
 * 3. Idempotent dan transactional.
 */
export async function syncExpenseCategoriesNonDestructive(
  db: PrismaClient
): Promise<CategorySyncSummary> {
  const ensuredFinalCategories: string[] = [];
  const deactivatedUnusedLegacy: string[] = [];
  const preservedUsedLegacy: string[] = [];

  const FINAL_CATEGORIES = [
    { slug: "galon", name: "Galon" },
    { slug: "listrik", name: "Listrik" },
    { slug: "wifi", name: "Wi-Fi" },
    { slug: "alat-mandi", name: "Alat Mandi" },
    { slug: "lainnya", name: "Lainnya" },
  ];

  const LEGACY_SLUGS = [
    "galon-gas",
    "listrik-wifi",
    "kebersihan-dapur",
    "perbaikan",
    "tagihan-utilitas",
    "konsumsi-bersama",
    "kebersihan",
    "perawatan",
    "token-listrik",
    "air-galon",
    "kebutuhan-dapur",
    "kebersihan-kamar-mandi",
  ];

  await db.$transaction(async (tx) => {
    // 1. Pastikan 5 kategori final aktif
    for (const target of FINAL_CATEGORIES) {
      const existing = await tx.expenseCategory.findUnique({
        where: { slug: target.slug },
      });

      if (existing) {
        await tx.expenseCategory.update({
          where: { id: existing.id },
          data: {
            name: target.name,
            isActive: true,
            parentId: null,
          },
        });
        ensuredFinalCategories.push(target.name);
      } else {
        await tx.expenseCategory.create({
          data: {
            slug: target.slug,
            name: target.name,
            isActive: true,
            parentId: null,
          },
        });
        ensuredFinalCategories.push(target.name);
      }
    }

    // 2. Periksa dan nonaktifkan kategori legacy tanpa merusak data historis
    const legacyCategories = await tx.expenseCategory.findMany({
      where: {
        slug: { in: LEGACY_SLUGS },
      },
      include: {
        _count: {
          select: {
            expenses: true,
            budgetAllocations: true,
          },
        },
      },
    });

    for (const leg of legacyCategories) {
      const hasUsage =
        leg._count.expenses > 0 || leg._count.budgetAllocations > 0;
      if (leg.isActive) {
        await tx.expenseCategory.update({
          where: { id: leg.id },
          data: { isActive: false },
        });
      }

      if (hasUsage) {
        preservedUsedLegacy.push(
          `${leg.name} [${leg.slug}] (${leg._count.expenses} transaksi, ${leg._count.budgetAllocations} pagu)`
        );
      } else {
        deactivatedUnusedLegacy.push(`${leg.name} [${leg.slug}]`);
      }
    }
  });

  return {
    ensuredFinalCategories,
    deactivatedUnusedLegacy,
    preservedUsedLegacy,
  };
}


