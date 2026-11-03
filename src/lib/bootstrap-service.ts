import crypto from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client";
import { hashPassword } from "./auth";

type PrismaClientOrTx =
  | PrismaClient
  | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Lima kategori pengeluaran default utama KostKas (v1.0.2):
 * 1. Galon
 * 2. Listrik
 * 3. Wi-Fi
 * 4. Alat Mandi
 * 5. Lainnya
 *
 * Datar tanpa subkategori wajib agar pencatatan operasional harian cepat dan efisien.
 */
export const FINAL_DEFAULT_EXPENSE_CATEGORIES = [
  { slug: "galon", name: "Galon" },
  { slug: "listrik", name: "Listrik" },
  { slug: "wifi", name: "Wi-Fi" },
  { slug: "alat-mandi", name: "Alat Mandi" },
  { slug: "lainnya", name: "Lainnya" },
] as const;

export const DEFAULT_EXPENSE_CATEGORIES = FINAL_DEFAULT_EXPENSE_CATEGORIES;

/**
 * Memvalidasi token setup inisialisasi awal secara server-side menggunakan perbandingan constant-time.
 * Mencegah serangan timing-attack dan memastikan token tidak pernah dibocorkan ke log.
 */
export function validateSetupToken(providedToken: string | undefined): void {
  const configuredToken = process.env.INITIAL_SETUP_TOKEN?.trim();

  // Pengaman fail-closed: jika token belum dikonfigurasi di server, bootstrap dilarang
  if (!configuredToken || configuredToken.length < 16) {
    throw new Error(
      "Inisialisasi akun dibatalkan: INITIAL_SETUP_TOKEN belum diatur atau kurang dari 16 karakter pada environment server."
    );
  }

  if (!providedToken || providedToken.trim() === "") {
    throw new Error(
      "Token setup inisialisasi awal wajib diisi. Masukkan token rahasia yang dikonfigurasi pada server."
    );
  }

  const configuredBuffer = Buffer.from(configuredToken);
  const providedBuffer = Buffer.from(providedToken.trim());

  if (
    configuredBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(configuredBuffer, providedBuffer)
  ) {
    throw new Error("Token setup inisialisasi awal tidak valid.");
  }
}

/**
 * Memastikan master data operasional awal tersedia (idempotent):
 * 1. Akun kas DANA Kas Kost
 * 2. Kebijakan tarif iuran rutin standar (Rp150.000 / anggota / bulan)
 * 3. Kategori pengeluaran harian yang ringkas (tanpa subkategori)
 */
export async function ensureSystemDefaults(
  client: PrismaClientOrTx
): Promise<void> {
  // 1. Akun Kas DANA bersama
  await client.cashAccount.upsert({
    where: { code: "DANA_KAS" },
    update: {},
    create: {
      code: "DANA_KAS",
      name: "DANA Kas Kost",
      provider: "DANA",
      isActive: true,
    },
  });

  // 2. Kebijakan Tarif Iuran Standar (dinamis, default Rp150.000)
  const currentPeriod = new Date().toISOString().slice(0, 7);
  await client.contributionPolicy.upsert({
    where: { code: "DEFAULT_MONTHLY_DUES" },
    update: {},
    create: {
      code: "DEFAULT_MONTHLY_DUES",
      name: "Iuran Rutin Bulanan",
      amountPerMember: 150000,
      effectiveFromPeriod: currentPeriod,
      isActive: true,
    },
  });

  // 3. Kategori Pengeluaran (5 kategori default utama)
  for (const category of DEFAULT_EXPENSE_CATEGORIES) {
    await client.expenseCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        isActive: true,
      },
      create: {
        slug: category.slug,
        name: category.name,
        isActive: true,
      },
    });
  }
}

/**
 * Menginisialisasi akun penghuni pertama pada database baru secara atomic dan aman terhadap konkurensi:
 * 1. Verifikasi one-time setup token secara timing-safe (fail-closed).
 * 2. Menggunakan PostgreSQL advisory lock (pg_advisory_xact_lock) di dalam transaksi.
 * 3. Memastikan tepat 1 request yang berhasil jika terdapat dua panggilan simultan.
 * 4. Menolak seluruh inisialisasi berikutnya secara permanen begitu akun pertama ada.
 */
export async function bootstrapInitialMember(
  prisma: PrismaClient,
  input: {
    name: string;
    username: string;
    plainPassword: string;
    setupToken: string;
  }
) {
  // Verifikasi token setup rahasia secara timing-safe
  validateSetupToken(input.setupToken);

  const normalizedUsername = input.username.trim().toLowerCase();
  const passwordHash = await hashPassword(input.plainPassword);

  return await prisma.$transaction(async (tx) => {
    // 1. Kunci advisory transaction lock eksklusif untuk mencegah race-condition pembuatan akun pertama
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('kostkas_bootstrap'))`;

    // 2. Periksa apakah sistem sudah memiliki akun terdaftar (didalam lock)
    const existingCount = await tx.userAccount.count();
    if (existingCount > 0) {
      throw new Error(
        "Inisialisasi akun awal ditolak: sistem sudah memiliki akun terdaftar."
      );
    }

    // 3. Siapkan master data operasional awal
    await ensureSystemDefaults(tx);

    // 4. Buat entitas Member pertama
    const member = await tx.member.create({
      data: {
        name: input.name.trim(),
        joinedAt: new Date(),
      },
    });

    // 5. Buat akun login terkait dengan hak akses setara
    const account = await tx.userAccount.create({
      data: {
        memberId: member.id,
        username: normalizedUsername,
        passwordHash,
        isActive: true,
      },
    });

    // 6. Catat log audit inisialisasi sistem
    await tx.auditLog.create({
      data: {
        action: "INITIAL_SYSTEM_BOOTSTRAP",
        entityType: "UserAccount",
        entityId: account.id,
        actorMemberId: member.id,
        actorName: member.name,
        summary: `Inisialisasi sistem KostKas dan pembuatan akun anggota pertama @${account.username} (${member.name})`,
        metadata: {
          username: account.username,
          memberName: member.name,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return { member, account };
  });
}
