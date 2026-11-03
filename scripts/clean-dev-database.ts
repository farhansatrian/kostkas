import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { DEFAULT_EXPENSE_CATEGORIES } from "../src/lib/bootstrap-service";

async function cleanDevDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.includes("kostkas_db")) {
    throw new Error(
      `PEMBERSIHAN DIBATALKAN: DATABASE_URL harus mengarah ke kostkas_db (ditemukan: ${dbUrl})`
    );
  }

  console.log("=== MEMULAI PEMBERSIHAN DATABASE KOSTKAS (kostkas_db) ===");

  // 1. Hapus data transaksi testing/mock secara atomic
  await prisma.$transaction(async (tx) => {
    console.log("1. Menghapus data transaksi sementara & simulasi...");
    const deletedAlloc = await tx.paymentAllocation.deleteMany();
    console.log(`   - PaymentAllocation: ${deletedAlloc.count} baris dihapus`);

    const deletedMovements = await tx.cashMovement.deleteMany();
    console.log(`   - CashMovement: ${deletedMovements.count} baris dihapus`);

    const deletedPayouts = await tx.reimbursementPayout.deleteMany();
    console.log(`   - ReimbursementPayout: ${deletedPayouts.count} baris dihapus`);

    const deletedReimbursements = await tx.reimbursement.deleteMany();
    console.log(`   - Reimbursement: ${deletedReimbursements.count} baris dihapus`);

    const deletedExpenses = await tx.expense.deleteMany();
    console.log(`   - Expense: ${deletedExpenses.count} baris dihapus`);

    const deletedPayments = await tx.payment.deleteMany();
    console.log(`   - Payment: ${deletedPayments.count} baris dihapus`);

    const deletedCharges = await tx.contributionCharge.deleteMany();
    console.log(`   - ContributionCharge: ${deletedCharges.count} baris dihapus`);

    const deletedBudgetAlloc = await tx.monthlyBudgetAllocation.deleteMany();
    console.log(`   - MonthlyBudgetAllocation: ${deletedBudgetAlloc.count} baris dihapus`);

    const deletedBudgets = await tx.monthlyBudget.deleteMany();
    console.log(`   - MonthlyBudget: ${deletedBudgets.count} baris dihapus`);

    const deletedSessions = await tx.authSession.deleteMany();
    console.log(`   - AuthSession: ${deletedSessions.count} baris dihapus`);

    const deletedAudit = await tx.auditLog.deleteMany();
    console.log(`   - AuditLog: ${deletedAudit.count} baris dihapus`);
  });

  // 2. Bersihkan dan rapikan AppPreference (Hilangkan "KostKas Bersama Uji M7")
  console.log("2. Memperbarui AppPreference menjadi default bersih (KostKas)...");
  await prisma.appPreference.upsert({
    where: { id: "default" },
    update: {
      kostName: "KostKas",
      currencyCode: "IDR",
      timezone: "Asia/Jakarta",
      dateFormat: "dd MMM yyyy",
    },
    create: {
      id: "default",
      kostName: "KostKas",
      currencyCode: "IDR",
      timezone: "Asia/Jakarta",
      dateFormat: "dd MMM yyyy",
    },
  });

  // 3. Pastikan 3 Anggota Utama Tersedia (Farhan, Nabeel, Alzha)
  console.log("3. Menstandarkan data Anggota Utama (Farhan, Nabeel, Alzha)...");
  // Hapus anggota uji jika ada
  await prisma.member.deleteMany({
    where: {
      OR: [
        { name: { contains: "Uji" } },
        { name: { contains: "Test" } },
      ],
    },
  });

  const memberFarhan = await prisma.member.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: { name: "Farhan", leftAt: null },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Farhan",
      joinedAt: new Date("2026-10-01T00:00:00.000Z"),
    },
  });

  const memberNabeel = await prisma.member.upsert({
    where: { id: "00000000-0000-4000-8000-000000000002" },
    update: { name: "Nabeel", leftAt: null },
    create: {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Nabeel",
      joinedAt: new Date("2026-10-01T00:00:00.000Z"),
    },
  });

  const memberAlzha = await prisma.member.upsert({
    where: { id: "00000000-0000-4000-8000-000000000003" },
    update: { name: "Alzha", leftAt: null },
    create: {
      id: "00000000-0000-4000-8000-000000000003",
      name: "Alzha",
      joinedAt: new Date("2026-10-01T00:00:00.000Z"),
    },
  });

  // 4. Standarkan Akun Kas DANA
  console.log("4. Menstandarkan Akun Kas DANA (DANA Kas Kost)...");
  // Hapus akun kas uji
  await prisma.cashAccount.deleteMany({
    where: {
      OR: [
        { code: { startsWith: "TEST_" } },
        { name: { contains: "Uji" } },
      ],
    },
  });

  const danaKas = await prisma.cashAccount.upsert({
    where: { code: "DANA_KAS_KOST" },
    update: {
      name: "DANA Kas Kost",
      provider: "DANA",
      custodianMemberId: memberFarhan.id,
      isActive: true,
    },
    create: {
      code: "DANA_KAS_KOST",
      name: "DANA Kas Kost",
      provider: "DANA",
      custodianMemberId: memberFarhan.id,
      isActive: true,
    },
  });

  // Pastikan DANA_KAS alias konsisten jika ada
  await prisma.cashAccount.upsert({
    where: { code: "DANA_KAS" },
    update: {
      name: "DANA Kas Kost",
      provider: "DANA",
      custodianMemberId: memberFarhan.id,
      isActive: true,
    },
    create: {
      code: "DANA_KAS",
      name: "DANA Kas Kost",
      provider: "DANA",
      custodianMemberId: memberFarhan.id,
      isActive: true,
    },
  });

  // 5. Standarkan Kebijakan Tarif Iuran Rutin
  console.log("5. Menstandarkan Kebijakan Tarif Iuran Rutin (Rp150.000)...");
  await prisma.contributionPolicy.deleteMany({
    where: {
      OR: [
        { code: { startsWith: "TEST_" } },
        { name: { contains: "Uji" } },
      ],
    },
  });

  await prisma.contributionPolicy.upsert({
    where: { code: "POLICY-INITIAL-150K" },
    update: {
      name: "Tarif Iuran Bulanan",
      amountPerMember: 150_000,
      effectiveFromPeriod: "2026-10",
      effectiveToPeriod: null,
      isActive: true,
    },
    create: {
      code: "POLICY-INITIAL-150K",
      name: "Tarif Iuran Bulanan",
      amountPerMember: 150_000,
      effectiveFromPeriod: "2026-10",
      effectiveToPeriod: null,
      isActive: true,
    },
  });

  await prisma.contributionPolicy.upsert({
    where: { code: "DEFAULT_MONTHLY_DUES" },
    update: {
      name: "Tarif Iuran Bulanan",
      amountPerMember: 150_000,
      effectiveFromPeriod: "2026-10",
      effectiveToPeriod: null,
      isActive: true,
    },
    create: {
      code: "DEFAULT_MONTHLY_DUES",
      name: "Tarif Iuran Bulanan",
      amountPerMember: 150_000,
      effectiveFromPeriod: "2026-10",
      effectiveToPeriod: null,
      isActive: true,
    },
  });

  // 6. Standarkan Kategori Pengeluaran (5 kategori praktis tanpa subkategori)
  console.log("6. Menstandarkan Kategori Pengeluaran (5 kategori praktis)...");
  const validSlugs = DEFAULT_EXPENSE_CATEGORIES.map((c) => c.slug);
  await prisma.expenseCategory.deleteMany({
    where: {
      slug: { notIn: validSlugs },
    },
  });

  for (const cat of DEFAULT_EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, parentId: null, isActive: true },
      create: { slug: cat.slug, name: cat.name, parentId: null, isActive: true },
    });
  }

  // 7. Catat AuditLog inisialisasi bersih
  await prisma.auditLog.create({
    data: {
      action: "DATABASE_CLEANUP",
      entityType: "System",
      entityId: "system",
      actorMemberId: memberFarhan.id,
      actorName: memberFarhan.name,
      summary: "Pembersihan seluruh data testing dan inisialisasi master data bersih KostKas.",
      metadata: {
        timestamp: new Date().toISOString(),
        members: [memberFarhan.name, memberNabeel.name, memberAlzha.name],
        cashAccount: danaKas.name,
      },
    },
  });

  console.log("=== PEMBERSIHAN SELESAI DENGAN SUKSES ===");
}

cleanDevDatabase()
  .catch((err) => {
    console.error("Gagal membersihkan database:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

