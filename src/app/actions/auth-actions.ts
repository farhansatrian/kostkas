"use server";

import { redirect } from "next/navigation";
import { authenticateMemberCredentials } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { destroyCurrentSession, setSessionCookie } from "@/lib/session";

export interface AuthFormState {
  error?: string;
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

