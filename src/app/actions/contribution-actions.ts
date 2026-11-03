"use server";

import { revalidatePath } from "next/cache";
import {
  authorizedConfirmPendingPayment,
  authorizedCreateAdditionalCharges,
  authorizedGenerateRegularCharges,
  authorizedRecordContributionPayment,
  authorizedUpsertContributionPolicy,
} from "@/lib/contribution-service";
import { formatRupiah } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedActor } from "@/lib/session";

export interface ContributionActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

function revalidateContributionPaths(): void {
  revalidatePath("/iuran");
  revalidatePath("/laporan");
  revalidatePath("/anggaran");
  revalidatePath("/pengeluaran");
  revalidatePath("/reimbursement");
  revalidatePath("/anggota");
  revalidatePath("/");
}

export async function generateRegularChargesAction(
  _prevState: ContributionActionState | undefined,
  formData: FormData
): Promise<ContributionActionState> {
  const actor = await requireAuthenticatedActor();
  const period = String(formData.get("period") ?? "");

  try {
    const result = await authorizedGenerateRegularCharges(prisma, actor, {
      period,
    });

    revalidateContributionPaths();

    return {
      status: "success",
      message: `Tagihan rutin periode ${result.period} untuk ${result.charges.length} anggota aktif (${formatRupiah(result.totalBilledAmount)}) siap dikelola.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal menerbitkan tagihan rutin.",
    };
  }
}

export async function createAdditionalChargesAction(
  _prevState: ContributionActionState | undefined,
  formData: FormData
): Promise<ContributionActionState> {
  const actor = await requireAuthenticatedActor();
  const period = String(formData.get("period") ?? "");
  const title = String(formData.get("title") ?? "");
  const amountPerMember = Number(formData.get("amountPerMember") ?? 0);
  const batchIdempotencyKey = String(
    formData.get("batchIdempotencyKey") ?? ""
  );

  try {
    const result = await authorizedCreateAdditionalCharges(prisma, actor, {
      period,
      title,
      amountPerMember,
      batchIdempotencyKey,
    });

    revalidateContributionPaths();

    return {
      status: "success",
      message: `Tagihan tambahan "${title}" (${formatRupiah(result.totalBilledAmount)}) berhasil ditambahkan untuk ${result.charges.length} anggota aktif.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal membuat tagihan tambahan.",
    };
  }
}

export async function upsertPolicyAction(
  _prevState: ContributionActionState | undefined,
  formData: FormData
): Promise<ContributionActionState> {
  const actor = await requireAuthenticatedActor();
  const effectiveFromPeriod = String(
    formData.get("effectiveFromPeriod") ?? ""
  );
  const name = String(formData.get("name") ?? "");
  const amountPerMember = Number(formData.get("amountPerMember") ?? 0);

  try {
    const policy = await authorizedUpsertContributionPolicy(prisma, actor, {
      effectiveFromPeriod,
      name,
      amountPerMember,
    });

    revalidateContributionPaths();

    return {
      status: "success",
      message: `Kebijakan tarif "${policy.name}" (${formatRupiah(policy.amountPerMember)}/anggota) efektif mulai periode ${policy.effectiveFromPeriod} berhasil disimpan.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal menyimpan kebijakan tarif.",
    };
  }
}

export async function recordPaymentAction(
  _prevState: ContributionActionState | undefined,
  formData: FormData
): Promise<ContributionActionState> {
  const actor = await requireAuthenticatedActor();
  const chargeId = String(formData.get("chargeId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const confirmationMode = String(
    formData.get("confirmationMode") ?? "CONFIRMED"
  );
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const note = String(formData.get("note") ?? "").trim() || undefined;

  const confirmImmediately = confirmationMode === "CONFIRMED";

  try {
    const result = await authorizedRecordContributionPayment(prisma, actor, {
      chargeId,
      amount,
      confirmImmediately,
      idempotencyKey,
      note,
    });

    revalidateContributionPaths();

    if (result.wasDuplicateRequest) {
      return {
        status: "success",
        message:
          "Permintaan pembayaran ini sudah pernah diproses sebelumnya (idempotent — tidak ada duplikasi).",
      };
    }

    if (!confirmImmediately) {
      return {
        status: "success",
        message: `Pembayaran ${formatRupiah(result.payment.amount)} dicatat sebagai Menunggu Konfirmasi (belum menambah saldo kas DANA).`,
      };
    }

    return {
      status: "success",
      message: `Pembayaran ${formatRupiah(result.payment.amount)} berhasil dikonfirmasi dan masuk ke saldo kas DANA.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal mencatat pembayaran iuran.",
    };
  }
}

export async function confirmPendingPaymentAction(
  _prevState: ContributionActionState | undefined,
  formData: FormData
): Promise<ContributionActionState> {
  const actor = await requireAuthenticatedActor();
  const paymentId = String(formData.get("paymentId") ?? "");
  const targetChargeId = String(formData.get("targetChargeId") ?? "");

  try {
    const result = await authorizedConfirmPendingPayment(prisma, actor, {
      paymentId,
      targetChargeId,
    });

    revalidateContributionPaths();

    return {
      status: "success",
      message: `Pembayaran ${formatRupiah(result.payment.amount)} berhasil dikonfirmasi secara atomic ke tagihan dan buku besar kas DANA.`,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Gagal mengonfirmasi pembayaran.",
    };
  }
}

