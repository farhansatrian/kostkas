import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { upsertMemberAccountCredentials } from "../src/lib/auth";

const SEED_MEMBERS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Farhan",
    username: "farhan",
    joinedAt: new Date("2026-10-01T00:00:00.000Z"),
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Nabeel",
    username: "nabeel",
    joinedAt: new Date("2026-10-01T00:00:00.000Z"),
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Alzha",
    username: "alzha",
    joinedAt: new Date("2026-10-01T00:00:00.000Z"),
  },
] as const;

const SEED_CATEGORIES = [
  {
    slug: "wifi",
    name: "Wi-Fi",
  },
  {
    slug: "token-listrik",
    name: "Token Listrik",
  },
  {
    slug: "air-galon",
    name: "Air Galon",
  },
  {
    slug: "kebersihan",
    name: "Kebersihan",
  },
  {
    slug: "perawatan",
    name: "Perawatan",
  },
  {
    slug: "lainnya",
    name: "Lainnya",
  },
] as const;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Seed development dibatalkan: dilarang menjalankan seed dummy pada environment production."
    );
  }

  console.log("[Seed] Memulai proses seed development KostKas (idempotent)...");

  // 1. Upsert 3 anggota awal contoh (Farhan, Nabeel, Alzha)
  const devInitialPassword = process.env.KOSTKAS_DEV_INITIAL_PASSWORD?.trim();
  for (const member of SEED_MEMBERS) {
    await prisma.member.upsert({
      where: { id: member.id },
      update: {
        name: member.name,
        joinedAt: member.joinedAt,
        leftAt: null,
      },
      create: {
        id: member.id,
        name: member.name,
        joinedAt: member.joinedAt,
        leftAt: null,
      },
    });

    if (devInitialPassword && devInitialPassword.length >= 8) {
      await upsertMemberAccountCredentials(prisma, {
        memberId: member.id,
        username: member.username,
        plainPassword: devInitialPassword,
        actorMemberId: SEED_MEMBERS[0].id,
      });
    }
  }

  const farhanId = SEED_MEMBERS[0].id;

  // 2. Upsert Akun Kas DANA dengan penanggung jawab awal Farhan (data simulasi aman)
  const cashAccount = await prisma.cashAccount.upsert({
    where: { code: "DANA_KAS_KOST" },
    update: {
      name: "DANA Kas Kost (Simulasi)",
      provider: "DANA",
      custodianMemberId: farhanId,
      isActive: true,
    },
    create: {
      code: "DANA_KAS_KOST",
      name: "DANA Kas Kost (Simulasi)",
      provider: "DANA",
      custodianMemberId: farhanId,
      isActive: true,
    },
  });

  // 3. Upsert Kebijakan Tarif Iuran Awal (Rp150.000/anggota/bulan, dinamis per periode)
  const initialPolicy = await prisma.contributionPolicy.upsert({
    where: { code: "POLICY-INITIAL-150K" },
    update: {
      name: "Tarif Iuran Rutin Awal",
      amountPerMember: 150_000,
      effectiveFromPeriod: "2026-10",
      effectiveToPeriod: null,
      isActive: true,
    },
    create: {
      code: "POLICY-INITIAL-150K",
      name: "Tarif Iuran Rutin Awal",
      amountPerMember: 150_000,
      effectiveFromPeriod: "2026-10",
      effectiveToPeriod: null,
      isActive: true,
    },
  });

  // 4. Upsert Kategori Pengeluaran Utama
  const categoryMap = new Map<string, string>();
  for (const cat of SEED_CATEGORIES) {
    const saved = await prisma.expenseCategory.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        parentId: null,
        isActive: true,
      },
      create: {
        slug: cat.slug,
        name: cat.name,
        parentId: null,
        isActive: true,
      },
    });
    categoryMap.set(cat.slug, saved.id);
  }

  // 5. Upsert Contoh Subkategori Dinamis (di bawah kategori Kebersihan)
  const kebersihanId = categoryMap.get("kebersihan");
  if (kebersihanId) {
    await prisma.expenseCategory.upsert({
      where: { slug: "kebersihan-kamar-mandi" },
      update: {
        name: "Sabun & Pembersih Kamar Mandi",
        parentId: kebersihanId,
        isActive: true,
      },
      create: {
        slug: "kebersihan-kamar-mandi",
        name: "Sabun & Pembersih Kamar Mandi",
        parentId: kebersihanId,
        isActive: true,
      },
    });
  }

  const memberCount = await prisma.member.count();
  const accountCount = await prisma.userAccount.count();
  const categoryCount = await prisma.expenseCategory.count();

  console.log("[Seed] Selesai tanpa duplikasi:");
  console.log(`  - Anggota terdaftar       : ${memberCount} orang`);
  console.log(`  - Akun login terhubung    : ${accountCount} akun`);
  console.log(`  - Akun kas utama          : ${cashAccount.code} (${cashAccount.name})`);
  console.log(
    `  - Kebijakan iuran aktif   : ${initialPolicy.code} (Rp${initialPolicy.amountPerMember.toLocaleString("id-ID")}/bulan)`
  );
  console.log(`  - Kategori & subkategori  : ${categoryCount} item`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Seed] Gagal: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
