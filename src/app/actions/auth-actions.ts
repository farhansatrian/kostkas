"use server";

import { redirect } from "next/navigation";
import { authenticateMemberCredentials } from "@/lib/auth";
import { bootstrapInitialMember } from "@/lib/bootstrap-service";
import { prisma } from "@/lib/prisma";
import { destroyCurrentSession, setSessionCookie } from "@/lib/session";

export interface AuthFormState {
  error?: string;
}

export async function bootstrapInitialAccountAction(
  _prevState: AuthFormState | undefined,
  formData: FormData
): Promise<AuthFormState> {
  const setupToken = String(formData.get("setupToken") ?? "").trim();
  const memberName = String(formData.get("memberName") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!setupToken) {
    return { error: "Token setup inisialisasi awal (INITIAL_SETUP_TOKEN) wajib diisi." };
  }
  if (!memberName || memberName.length < 2) {
    return { error: "Nama lengkap anggota minimal 2 karakter." };
  }
  if (!username || username.length < 3) {
    return { error: "Username minimal 3 karakter." };
  }
  if (password.length < 8) {
    return { error: "Password minimal 8 karakter." };
  }
  if (password !== confirmPassword) {
    return { error: "Konfirmasi password tidak cocok dengan password yang dimasukkan." };
  }

  try {
    await bootstrapInitialMember(prisma, {
      name: memberName,
      username,
      plainPassword: password,
      setupToken,
    });

    const result = await authenticateMemberCredentials(prisma, {
      username,
      password,
    });
    await setSessionCookie(result.sessionToken, result.expiresAt);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal membuat akun pertama. Silakan coba lagi.";
    return { error: message };
  }

  redirect("/");
}

export async function loginAction(
  _prevState: AuthFormState | undefined,
  formData: FormData
): Promise<AuthFormState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const result = await authenticateMemberCredentials(prisma, {
      username,
      password,
    });
    await setSessionCookie(result.sessionToken, result.expiresAt);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal masuk. Periksa kembali kredensial Anda.";
    return { error: message };
  }

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}

