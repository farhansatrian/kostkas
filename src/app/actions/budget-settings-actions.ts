"use server";

import { revalidatePath } from "next/cache";
import {
  authorizedUpsertCategoryBudgetAllocation,
  authorizedUpsertMonthlyBudget,
} from "@/lib/budget-service";
import { formatRupiah } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedActor } from "@/lib/session";
import {
  authorizedChangeOwnPassword,
  authorizedRecordReconciliationAdjustment,
  authorizedRevokeOtherActiveSessions,
  authorizedUpdateAppPreferences,
  authorizedUpdateCashAccountSettings,
  authorizedUpdateContributionTariffSetting,
} from "@/lib/settings-service";

export interface BudgetSettingsActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

function revalidateAllModules(): void {
  revalidatePath("/anggaran");
  revalidatePath("/laporan");
  revalidatePath("/pengaturan");
  revalidatePath("/pengeluaran");
  revalidatePath("/reimbursement");
  revalidatePath("/iuran");
  revalidatePath("/");
}

export async function upsertMonthlyBudgetAction(
  _prevState: BudgetSettingsActionState | undefined,
  formData: FormData
): Promise<BudgetSettingsActionState> {
  const actor = await requireAuthenticatedActor();
  const period = String(formData.get("period") ?? "");
  const totalAmount = Number(formData.get("totalAmount") ?? 0);
  const note = String(formData.get("note") ?? "").trim();

  try {
    const budget = await authorizedUpsertMonthlyBudget(prisma, actor, {
      period,
      totalAmount,
      note: note || undefined,
    });

    revalidateAllModules();

    return {
      status: "success",
      message: `Plafon anggaran bulanan periode ${budget.period} sebesar ${formatRupiah(budget.totalAmount)} berhasil disimpan.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal menyimpan anggaran bulanan.",
    };
  }
}

export async function upsertCategoryBudgetAction(
  _prevState: BudgetSettingsActionState | undefined,
  formData: FormData
): Promise<BudgetSettingsActionState> {
  const actor = await requireAuthenticatedActor();
  const period = String(formData.get("period") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const note = String(formData.get("note") ?? "").trim();

  try {
    const alloc = await authorizedUpsertCategoryBudgetAllocation(prisma, actor, {
      period,
      categoryId,
      amount,
      note: note || undefined,
    });

    revalidateAllModules();

    return {
      status: "success",
      message: `Alokasi anggaran kategori periode ${period} sebesar ${formatRupiah(alloc.amount)} berhasil disimpan.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal menyimpan alokasi anggaran kategori.",
    };
  }
}

export async function updateCashAccountSettingsAction(
  _prevState: BudgetSettingsActionState | undefined,
  formData: FormData
): Promise<BudgetSettingsActionState> {
  const actor = await requireAuthenticatedActor();
  const kostName = String(formData.get("kostName") ?? "");
  const accountName = String(formData.get("accountName") ?? "");
  const provider = String(formData.get("provider") ?? "DANA");
  const custodianMemberId = String(formData.get("custodianMemberId") ?? "");

  try {
    const res = await authorizedUpdateCashAccountSettings(prisma, actor, {
      kostName,
      accountName,
      provider,
      custodianMemberId,
    });

    revalidateAllModules();

    return {
      status: "success",
      message: `Pengaturan kas "${res.preference.kostName}" (${res.cashAccount.provider} — Pemegang kas: ${res.custodianName}) berhasil diperbarui.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal memperbarui pengaturan akun kas.",
    };
  }
}

export async function updateContributionTariffSettingAction(
  _prevState: BudgetSettingsActionState | undefined,
  formData: FormData
): Promise<BudgetSettingsActionState> {
  const actor = await requireAuthenticatedActor();
  const effectiveFromPeriod = String(
    formData.get("effectiveFromPeriod") ?? ""
  );
  const name = String(formData.get("name") ?? "");
  const amountPerMember = Number(formData.get("amountPerMember") ?? 0);

  try {
    const policy = await authorizedUpdateContributionTariffSetting(
      prisma,
      actor,
      {
        effectiveFromPeriod,
        name,
        amountPerMember,
      }
    );

    revalidateAllModules();

    return {
      status: "success",
      message: `Kebijakan tarif "${policy.name}" (${formatRupiah(policy.amountPerMember)}/anggota mulai ${policy.effectiveFromPeriod}) disimpan tanpa mengubah tagihan historis.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal memperbarui kebijakan tarif iuran.",
    };
  }
}

export async function changeOwnPasswordAction(
  _prevState: BudgetSettingsActionState | undefined,
  formData: FormData
): Promise<BudgetSettingsActionState> {
  const actor = await requireAuthenticatedActor();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmNewPassword = String(formData.get("confirmNewPassword") ?? "");

  try {
    await authorizedChangeOwnPassword(prisma, actor, {
      currentPassword,
      newPassword,
      confirmNewPassword,
    });

    revalidatePath("/pengaturan");

    return {
      status: "success",
      message: "Password akun Anda berhasil diperbarui.",
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal memperbarui password akun.",
    };
  }
}

export async function revokeOtherSessionsAction(): Promise<BudgetSettingsActionState> {
  const actor = await requireAuthenticatedActor();

  try {
    const res = await authorizedRevokeOtherActiveSessions(prisma, actor);
    revalidatePath("/pengaturan");

    return {
      status: "success",
      message:
        res.revokedCount > 0
          ? `${res.revokedCount} sesi login perangkat lain berhasil diakhiri.`
          : "Tidak ada sesi login aktif lain di luar sesi Anda saat ini.",
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal mengakhiri sesi login lain.",
    };
  }
}

export async function updateAppPreferencesAction(
  _prevState: BudgetSettingsActionState | undefined,
  formData: FormData
): Promise<BudgetSettingsActionState> {
  const actor = await requireAuthenticatedActor();
  const kostName = String(formData.get("kostName") ?? "");
  const dateFormat = String(formData.get("dateFormat") ?? "dd MMM yyyy");

  try {
    const pref = await authorizedUpdateAppPreferences(prisma, actor, {
      kostName,
      dateFormat,
    });

    revalidateAllModules();

    return {
      status: "success",
      message: `Preferensi tampilan (${pref.kostName}, format ${pref.dateFormat}, mata uang ${pref.currencyCode}, zona waktu ${pref.timezone}) berhasil disimpan.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal memperbarui preferensi aplikasi.",
    };
  }
}

export async function recordReconciliationAdjustmentAction(
  _prevState: BudgetSettingsActionState | undefined,
  formData: FormData
): Promise<BudgetSettingsActionState> {
  const actor = await requireAuthenticatedActor();
  const direction = String(formData.get("direction") ?? "IN");
  const amount = Number(formData.get("amount") ?? 0);
  const reason = String(formData.get("reason") ?? "");
  const idempotencyKey =
    String(formData.get("idempotencyKey") ?? "").trim() ||
    `RECON-ADJ:${actor.memberId}:${Date.now()}`;

  try {
    const mov = await authorizedRecordReconciliationAdjustment(prisma, actor, {
      direction,
      amount,
      reason,
      idempotencyKey,
    });

    revalidateAllModules();

    return {
      status: "success",
      message: `Jurnal penyesuaian rekonsiliasi (${mov.direction === "IN" ? "+" : "-"}${formatRupiah(mov.amount)}) berhasil dicatat ke buku besar dengan jejak audit.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal mencatat jurnal koreksi rekonsiliasi.",
    };
  }
}
