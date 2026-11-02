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

