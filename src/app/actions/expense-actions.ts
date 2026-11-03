"use server";

import { revalidatePath } from "next/cache";
import {
  createExpenseCategory,
  deleteUnusedExpenseCategory,
  setExpenseCategoryActiveStatus,
} from "@/lib/expense-category-service";
import {
  authorizedConfirmPendingExpense,
  authorizedCreateExpense,
  authorizedCreateReimbursementClaim,
  authorizedRecordLedgerAdjustment,
  authorizedReverseOrVoidExpense,
  authorizedSettleReimbursementPayout,
} from "@/lib/expense-reimbursement-service";
import { formatRupiah } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedActor } from "@/lib/session";

export interface ExpenseActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

function revalidateFinancePaths(): void {
  revalidatePath("/pengeluaran");
  revalidatePath("/anggaran");
  revalidatePath("/laporan");
  revalidatePath("/reimbursement");
  revalidatePath("/iuran");
  revalidatePath("/");
}

export async function createExpenseAction(
  _prevState: ExpenseActionState | undefined,
  formData: FormData
): Promise<ExpenseActionState> {
  const actor = await requireAuthenticatedActor();
  const title = String(formData.get("title") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const categoryId = String(formData.get("categoryId") ?? "");
  const fundingSource = String(formData.get("fundingSource") ?? "DIRECT_CASH");
  const advancedByMemberIdRaw = String(
    formData.get("advancedByMemberId") ?? ""
  ).trim();
  const confirmStatus = String(formData.get("confirmStatus") ?? "CONFIRMED");
  const expenseDate = String(formData.get("expenseDate") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const idempotencyKey =
    String(formData.get("idempotencyKey") ?? "").trim() ||
    `EXP:${actor.memberId}:${Date.now()}`;

  try {
    const result = await authorizedCreateExpense(prisma, actor, {
      title,
      amount,
      categoryId,
      fundingSource,
      advancedByMemberId:
        fundingSource === "MEMBER_ADVANCE" ? advancedByMemberIdRaw : null,
      confirmImmediately: confirmStatus === "CONFIRMED",
      expenseDate: expenseDate || undefined,
      note: note || undefined,
      idempotencyKey,
    });

    revalidateFinancePaths();

    if (result.wasDuplicateRequest) {
      return {
        status: "success",
        message: "Transaksi pengeluaran ini sudah tercatat sebelumnya (idempotent).",
      };
    }

    if (fundingSource === "MEMBER_ADVANCE") {
      return {
        status: "success",
        message:
          confirmStatus === "CONFIRMED"
            ? `Pengeluaran talangan "${result.expense.title}" (${formatRupiah(result.expense.amount)}) tercatat dan klaim reimbursement diterbitkan tanpa mengurangi saldo kas DANA.`
            : `Pengeluaran talangan PENDING "${result.expense.title}" (${formatRupiah(result.expense.amount)}) berhasil dicatat.`,
      };
    }

    return {
      status: "success",
      message:
        confirmStatus === "CONFIRMED"
          ? `Pengeluaran kas langsung "${result.expense.title}" (${formatRupiah(result.expense.amount)}) berhasil dikonfirmasi dan saldo DANA diperbarui.`
          : `Pengeluaran PENDING "${result.expense.title}" (${formatRupiah(result.expense.amount)}) dicatat (belum mengurangi saldo kas DANA).`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal mencatat pengeluaran kas.",
    };
  }
}

export async function confirmPendingExpenseAction(
  _prevState: ExpenseActionState | undefined,
  formData: FormData
): Promise<ExpenseActionState> {
  const actor = await requireAuthenticatedActor();
  const expenseId = String(formData.get("expenseId") ?? "");

  try {
    const result = await authorizedConfirmPendingExpense(prisma, actor, {
      expenseId,
    });

    revalidateFinancePaths();

    return {
      status: "success",
      message: `Pengeluaran "${result.expense.title}" (${formatRupiah(result.expense.amount)}) berhasil dikonfirmasi.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal mengonfirmasi pengeluaran.",
    };
  }
}

export async function reverseOrVoidExpenseAction(
  _prevState: ExpenseActionState | undefined,
  formData: FormData
): Promise<ExpenseActionState> {
  const actor = await requireAuthenticatedActor();
  const expenseId = String(formData.get("expenseId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  try {
    const result = await authorizedReverseOrVoidExpense(prisma, actor, {
      expenseId,
      reason,
    });

    revalidateFinancePaths();

    return {
      status: "success",
      message: result.reversalCashMovement
        ? `Pengeluaran "${result.expense.title}" dibatalkan secara auditable dan saldo kas DANA sebesar ${formatRupiah(result.expense.amount)} telah dipulihkan melalui jurnal penyesuaian.`
        : `Pengeluaran "${result.expense.title}" telah dibatalkan secara auditable tanpa menghapus histori buku kas.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal membatalkan pengeluaran.",
    };
  }
}

export async function createExpenseCategoryAction(
  _prevState: ExpenseActionState | undefined,
  formData: FormData
): Promise<ExpenseActionState> {
  const actor = await requireAuthenticatedActor();
  const name = String(formData.get("name") ?? "");
  const parentIdRaw = String(formData.get("parentId") ?? "").trim();

  try {
    const category = await createExpenseCategory(prisma, actor, {
      name,
      parentId: parentIdRaw || null,
    });

    revalidateFinancePaths();

    return {
      status: "success",
      message: `Kategori "${category.name}" berhasil ditambahkan.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal menambahkan kategori pengeluaran.",
    };
  }
}

export async function toggleExpenseCategoryStatusAction(
  _prevState: ExpenseActionState | undefined,
  formData: FormData
): Promise<ExpenseActionState> {
  const actor = await requireAuthenticatedActor();
  const categoryId = String(formData.get("categoryId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";

  try {
    const category = await setExpenseCategoryActiveStatus(prisma, actor, {
      categoryId,
      isActive,
    });

    revalidateFinancePaths();

    return {
      status: "success",
      message: `Kategori "${category.name}" berhasil ${category.isActive ? "diaktifkan kembali" : "dinonaktifkan"} (histori transaksi tetap utuh).`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal memperbarui status kategori.",
    };
  }
}

export async function deleteUnusedExpenseCategoryAction(
  _prevState: ExpenseActionState | undefined,
  formData: FormData
): Promise<ExpenseActionState> {
  const actor = await requireAuthenticatedActor();
  const categoryId = String(formData.get("categoryId") ?? "");

  try {
    await deleteUnusedExpenseCategory(prisma, actor, {
      categoryId,
    });

    revalidateFinancePaths();

    return {
      status: "success",
      message: "Kategori kosong berhasil dihapus.",
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal menghapus kategori pengeluaran.",
    };
  }
}

export async function createReimbursementClaimAction(
  _prevState: ExpenseActionState | undefined,
  formData: FormData
): Promise<ExpenseActionState> {
  const actor = await requireAuthenticatedActor();
  const expenseId = String(formData.get("expenseId") ?? "");

  try {
    const result = await authorizedCreateReimbursementClaim(prisma, actor, {
      expenseId,
    });

    revalidateFinancePaths();

    if (result.wasDuplicateRequest) {
      return {
        status: "success",
        message: "Klaim reimbursement untuk pengeluaran ini sudah tersedia.",
      };
    }

    return {
      status: "success",
      message: `Klaim reimbursement untuk "${result.expense.title}" (${formatRupiah(result.reimbursement.totalAmount)}) berhasil diterbitkan.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal menerbitkan klaim reimbursement.",
    };
  }
}

export async function settleReimbursementPayoutAction(
  _prevState: ExpenseActionState | undefined,
  formData: FormData
): Promise<ExpenseActionState> {
  const actor = await requireAuthenticatedActor();
  const reimbursementId = String(formData.get("reimbursementId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const note = String(formData.get("note") ?? "").trim();
  const paidAt = String(formData.get("paidAt") ?? "").trim();
  const idempotencyKey =
    String(formData.get("idempotencyKey") ?? "").trim() ||
    `REIMB-PAY:${reimbursementId}:${Date.now()}`;

  try {
    const result = await authorizedSettleReimbursementPayout(prisma, actor, {
      reimbursementId,
      amount,
      note: note || undefined,
      paidAt: paidAt || undefined,
      idempotencyKey,
    });

    revalidateFinancePaths();

    if (result.wasDuplicateRequest) {
      return {
        status: "success",
        message: "Pencairan reimbursement ini sudah tercatat sebelumnya (idempotent).",
      };
    }

    return {
      status: "success",
      message:
        result.remainingDebtAmount === 0
          ? `Pencairan penuh sebesar ${formatRupiah(result.payout.amount)} berhasil dikonfirmasi dari kas DANA. Klaim reimbursement kini berstatus LUNAS.`
          : `Pencairan parsial sebesar ${formatRupiah(result.payout.amount)} berhasil dikonfirmasi dari kas DANA. Sisa kewajiban: ${formatRupiah(result.remainingDebtAmount)}.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal mencairkan dana reimbursement.",
    };
  }
}

export async function recordLedgerAdjustmentAction(
  _prevState: ExpenseActionState | undefined,
  formData: FormData
): Promise<ExpenseActionState> {
  const actor = await requireAuthenticatedActor();
  const direction = String(formData.get("direction") ?? "IN");
  const category = String(formData.get("category") ?? "OPENING_BALANCE");
  const amount = Number(formData.get("amount") ?? 0);
  const description = String(formData.get("description") ?? "");
  const idempotencyKey =
    String(formData.get("idempotencyKey") ?? "").trim() ||
    `ADJ:${actor.memberId}:${Date.now()}`;

  try {
    const mov = await authorizedRecordLedgerAdjustment(prisma, actor, {
      direction,
      category,
      amount,
      description,
      idempotencyKey,
    });

    revalidateFinancePaths();

    return {
      status: "success",
      message: `Mutasi ${mov.category === "OPENING_BALANCE" ? "Saldo Awal" : "Penyesuaian Kas"} (${mov.direction === "IN" ? "+" : "-"}${formatRupiah(mov.amount)}) berhasil dicatat ke buku besar.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal mencatat penyesuaian buku besar kas.",
    };
  }
}

