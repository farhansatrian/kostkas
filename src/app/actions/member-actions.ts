"use server";

import { revalidatePath } from "next/cache";
import {
  createMemberWithAccount,
  deactivateMember,
  reactivateMember,
} from "@/lib/member-service";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedActor } from "@/lib/session";

export interface ActionFeedbackState {
  status: "idle" | "success" | "error";
  message?: string;
}

export async function createMemberAction(
  _prevState: ActionFeedbackState | undefined,
  formData: FormData
): Promise<ActionFeedbackState> {
  const actor = await requireAuthenticatedActor();

  const name = String(formData.get("name") ?? "");
  const username = String(formData.get("username") ?? "");
  const initialPassword = String(formData.get("initialPassword") ?? "");

  try {
    const result = await createMemberWithAccount(prisma, actor, {
      name,
      username,
      initialPassword,
    });

    revalidatePath("/anggota");
    revalidatePath("/iuran");
    revalidatePath("/");

    return {
      status: "success",
      message: `Anggota ${result.member.name} (@${result.username}) berhasil ditambahkan.`,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Gagal menambahkan anggota baru.";
    return {
      status: "error",
      message,
    };
  }
}

export async function deactivateMemberAction(
  _prevState: ActionFeedbackState | undefined,
  formData: FormData
): Promise<ActionFeedbackState> {
  const actor = await requireAuthenticatedActor();
  const targetMemberId = String(formData.get("targetMemberId") ?? "");

  try {
    const updated = await deactivateMember(prisma, actor, {
      targetMemberId,
    });

    revalidatePath("/anggota");
    revalidatePath("/iuran");
    revalidatePath("/");

    return {
      status: "success",
      message: `Keanggotaan ${updated.name} berhasil dinonaktifkan. Histori transaksi tetap tersimpan.`,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal menonaktifkan anggota.";
    return {
      status: "error",
      message,
    };
  }
}

export async function reactivateMemberAction(
  _prevState: ActionFeedbackState | undefined,
  formData: FormData
): Promise<ActionFeedbackState> {
  const actor = await requireAuthenticatedActor();
  const targetMemberId = String(formData.get("targetMemberId") ?? "");

  try {
    const updated = await reactivateMember(prisma, actor, targetMemberId);

    revalidatePath("/anggota");
    revalidatePath("/iuran");
    revalidatePath("/");

    return {
      status: "success",
      message: `Keanggotaan ${updated.name} berhasil diaktifkan kembali.`,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal mengaktifkan kembali anggota.";
    return {
      status: "error",
      message,
    };
  }
}

