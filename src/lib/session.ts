import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import {
  SESSION_COOKIE_NAME,
  type AuthenticatedActor,
  revokeDatabaseSession,
  validateDatabaseSessionToken,
} from "./auth";

/**
 * Mengambil aktor anggota yang sedang login pada siklus request Next.js berjalan.
 */
export const getCurrentActor = cache(
  async (): Promise<AuthenticatedActor | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return null;
    }
    return validateDatabaseSessionToken(prisma, token);
  }
);

/**
 * Memastikan halaman/komponen Server hanya diakses oleh anggota aktif yang sudah login.
 * Jika belum login atau sesi tidak valid, otomatis dialihkan ke `/login`.
 */
export async function requireAuthenticatedActor(): Promise<AuthenticatedActor> {
  const actor = await getCurrentActor();
  if (!actor) {
    redirect("/login");
  }
  return actor;
}

/**
 * Menyimpan token sesi ke dalam HttpOnly cookie pada server.
 */
export async function setSessionCookie(
  sessionToken: string,
  expiresAt: Date
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/**
 * Mencabut sesi di database dan menghapus cookie sesi dari browser.
 */
export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await revokeDatabaseSession(prisma, token);
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

