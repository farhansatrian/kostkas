import type { PrismaClient } from "../generated/prisma/client";

export interface AppPreferencesConfig {
  kostName: string;
  dateFormat: string;
  currencyCode: string;
  timezone: string;
}

export async function getKostAppPreferences(
  db: PrismaClient
): Promise<AppPreferencesConfig> {
  try {
    const pref = await db.appPreference.findUnique({
      where: { id: "default" },
    });
    return {
      kostName: pref?.kostName ?? "KostKas",
      dateFormat: pref?.dateFormat ?? "dd MMM yyyy",
      currencyCode: pref?.currencyCode ?? "IDR",
      timezone: pref?.timezone ?? "Asia/Jakarta",
    };
  } catch {
    return {
      kostName: "KostKas",
      dateFormat: "dd MMM yyyy",
      currencyCode: "IDR",
      timezone: "Asia/Jakarta",
    };
  }
}

