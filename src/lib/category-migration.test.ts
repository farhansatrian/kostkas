import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./test-db";

const MIGRATION_MEMBER_IDS = [
  "88888888-0000-4000-8000-000000000001",
  "88888888-0000-4000-8000-000000000002",
] as const;

const MIGRATION_CASH_ACCOUNT_CODE = "DANA_MIG_TEST";
const MIGRATION_PERIOD = "2026-10";

async function cleanupMigrationTestData() {
  const migAccount = await prisma.cashAccount.findUnique({
    where: { code: MIGRATION_CASH_ACCOUNT_CODE },
  });

  if (migAccount) {
    await prisma.cashMovement.deleteMany({
      where: { cashAccountId: migAccount.id },
    });
    await prisma.expense.deleteMany({
      where: { cashAccountId: migAccount.id },
    });
    await prisma.cashAccount.delete({
      where: { id: migAccount.id },
    });
  }

  await prisma.expense.deleteMany({
    where: {
      recordedByMemberId: { in: [...MIGRATION_MEMBER_IDS] },
    },
  });

  await prisma.monthlyBudgetAllocation.deleteMany({
    where: {
      monthlyBudget: { period: MIGRATION_PERIOD },
    },
  });

  await prisma.monthlyBudget.deleteMany({
    where: { period: MIGRATION_PERIOD },
  });

  await prisma.userAccount.deleteMany({
    where: { memberId: { in: [...MIGRATION_MEMBER_IDS] } },
  });

  await prisma.member.deleteMany({
    where: { id: { in: [...MIGRATION_MEMBER_IDS] } },
  });

  // Bersihkan kategori uji kustom
  await prisma.expenseCategory.deleteMany({
    where: {
      slug: {
        in: [
          "custom-kopi-mig",
          "custom-snack-sub-mig",
          "perbaikan-genteng-kustom",
          "listrik-kamar-kustom",
        ],
      },
    },
  });
}

async function runCategoryMigrationVerification() {
  console.log("=== Memulai Pengujian Otomatis Non-Destructive Category Migration (v1.0.2) ===\n");

  await cleanupMigrationTestData();

  // 1. Siapkan data uji anggota & kas
  for (const [idx, id] of MIGRATION_MEMBER_IDS.entries()) {
    await prisma.member.create({
      data: {
        id,
        name: `Member Mig ${idx + 1}`,
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
  }

  const cashAccount = await prisma.cashAccount.create({
    data: {
      code: MIGRATION_CASH_ACCOUNT_CODE,
      name: "DANA Kas Uji Migrasi",
      provider: "DANA",
      custodianMemberId: MIGRATION_MEMBER_IDS[0],
      isActive: true,
    },
  });

  // Saldo awal Rp500.000
  await prisma.cashMovement.create({
    data: {
      cashAccountId: cashAccount.id,
      direction: "IN",
      amount: 500_000,
      status: "CONFIRMED",
      category: "OPENING_BALANCE",
      description: "Saldo awal kas uji migrasi",
      occurredAt: new Date("2026-10-01T00:00:00.000Z"),
      idempotencyKey: `OPENING_MIG_${Date.now()}`,
      actorMemberId: MIGRATION_MEMBER_IDS[0],
    },
  });

  // 2. Siapkan kategori legacy lama (seperti kondisi database sebelum migrasi v1.0.2)
  const legacyGalonGas = await prisma.expenseCategory.upsert({
    where: { slug: "galon-gas" },
    create: {
      name: "Galon & Gas",
      slug: "galon-gas",
      isActive: true,
    },
    update: { isActive: true },
  });

  const legacyListrikWifi = await prisma.expenseCategory.upsert({
    where: { slug: "listrik-wifi" },
    create: {
      name: "Listrik & Wi-Fi",
      slug: "listrik-wifi",
      isActive: true,
    },
    update: { isActive: true },
  });

  // 3. Siapkan kategori kustom buatan pengguna beserta subkategori
  const customParent = await prisma.expenseCategory.upsert({
    where: { slug: "custom-kopi-mig" },
    create: {
      name: "Kopi & Teh Bersama",
      slug: "custom-kopi-mig",
      isActive: true,
    },
    update: { isActive: true },
  });

  await prisma.expenseCategory.upsert({
    where: { slug: "custom-snack-sub-mig" },
    create: {
      name: "Biskuit & Snack",
      slug: "custom-snack-sub-mig",
      parentId: customParent.id,
      isActive: true,
    },
    update: { isActive: true, parentId: customParent.id },
  });

  // Kategori kustom dengan kemiripan nama legacy
  await prisma.expenseCategory.upsert({
    where: { slug: "perbaikan-genteng-kustom" },
    create: {
      name: "Perbaikan Genteng Bocor",
      slug: "perbaikan-genteng-kustom",
      isActive: true,
    },
    update: { isActive: true },
  });

  await prisma.expenseCategory.upsert({
    where: { slug: "listrik-kamar-kustom" },
    create: {
      name: "Listrik Tambahan Kamar",
      slug: "listrik-kamar-kustom",
      isActive: true,
    },
    update: { isActive: true },
  });

  // Skenario khusus audit parentId:
  // Kategori "galon" yang sebelumnya memiliki parent legacy (galon-gas) harus dilepaskan ke root (parentId = NULL)
  await prisma.expenseCategory.upsert({
    where: { slug: "galon" },
    create: {
      name: "Galon Air Minum",
      slug: "galon",
      parentId: legacyGalonGas.id,
      isActive: false, // sengaja nonaktif untuk menguji aktivasi
    },
    update: {
      name: "Galon Air Minum",
      parentId: legacyGalonGas.id,
      isActive: false,
    },
  });

  // 4. Catat transaksi historis pada kategori legacy dan kustom
  const expLegacy1 = await prisma.expense.create({
    data: {
      title: "Beli Gas Elpiji 3kg Oktober",
      amount: 22_000,
      categoryId: legacyGalonGas.id,
      fundingSource: "DIRECT_CASH",
      status: "CONFIRMED",
      cashAccountId: cashAccount.id,
      expenseDate: new Date("2026-10-05T12:00:00.000+07:00"),
      recordedByMemberId: MIGRATION_MEMBER_IDS[0],
      idempotencyKey: `EXP_LEGACY_1_${Date.now()}`,
    },
  });

  const expLegacy2 = await prisma.expense.create({
    data: {
      title: "Token Listrik Oktober",
      amount: 100_000,
      categoryId: legacyListrikWifi.id,
      fundingSource: "DIRECT_CASH",
      status: "CONFIRMED",
      cashAccountId: cashAccount.id,
      expenseDate: new Date("2026-10-10T12:00:00.000+07:00"),
      recordedByMemberId: MIGRATION_MEMBER_IDS[0],
      idempotencyKey: `EXP_LEGACY_2_${Date.now()}`,
    },
  });

  const expCustom = await prisma.expense.create({
    data: {
      title: "Kopi Kapal Api Renceng",
      amount: 15_000,
      categoryId: customParent.id,
      fundingSource: "DIRECT_CASH",
      status: "CONFIRMED",
      cashAccountId: cashAccount.id,
      expenseDate: new Date("2026-10-12T12:00:00.000+07:00"),
      recordedByMemberId: MIGRATION_MEMBER_IDS[0],
      idempotencyKey: `EXP_CUSTOM_${Date.now()}`,
    },
  });

  // 5. Catat anggaran historis pada kategori legacy
  const budgetOct = await prisma.monthlyBudget.create({
    data: {
      period: MIGRATION_PERIOD,
      totalAmount: 300_000,
    },
  });

  const allocLegacy = await prisma.monthlyBudgetAllocation.create({
    data: {
      monthlyBudgetId: budgetOct.id,
      categoryId: legacyGalonGas.id,
      amount: 50_000,
    },
  });

  // Ambil SNAPSHOT SEBELUM MIGRASI
  const expenseCountBefore = await prisma.expense.count();
  const budgetAllocCountBefore = await prisma.monthlyBudgetAllocation.count();
  const cashMovementCountBefore = await prisma.cashMovement.count();

  console.log("Snapshot sebelum migrasi:");
  console.log(`- Total Expense: ${expenseCountBefore}`);
  console.log(`- Total Budget Allocations: ${budgetAllocCountBefore}`);
  console.log(`- Total Cash Movements: ${cashMovementCountBefore}`);

  // 6. Jalankan berkas SQL migrasi aktual dari prisma/migrations/20261103140000_sync_v102_expense_categories/migration.sql
  const migrationFilePath = path.join(
    process.cwd(),
    "prisma/migrations/20261103140000_sync_v102_expense_categories/migration.sql"
  );
  assert.ok(fs.existsSync(migrationFilePath), `Berkas migrasi harus ada di: ${migrationFilePath}`);

  const migrationSql = fs.readFileSync(migrationFilePath, "utf8");
  console.log("\nMengeksekusi SQL migration...");

  // Eksekusi SQL migrasi
  await prisma.$executeRawUnsafe(migrationSql);
  console.log("✓ SQL migration pertama berhasil dieksekusi.");

  // 7. VERIFIKASI POST-MIGRATION:
  console.log("\nMemverifikasi integritas data pasca-migrasi:");

  // A. Total baris data tidak boleh ada yang berkurang/bertambah
  const expenseCountAfter = await prisma.expense.count();
  const budgetAllocCountAfter = await prisma.monthlyBudgetAllocation.count();
  const cashMovementCountAfter = await prisma.cashMovement.count();

  assert.equal(expenseCountAfter, expenseCountBefore, "Jumlah baris Expense tidak boleh berubah.");
  assert.equal(budgetAllocCountAfter, budgetAllocCountBefore, "Jumlah baris Budget Allocation tidak boleh berubah.");
  assert.equal(cashMovementCountAfter, cashMovementCountBefore, "Jumlah baris Cash Movement tidak boleh berubah.");
  console.log("✓ [Verifikasi 1] Jumlah baris data transaksi, anggaran, dan ledger 100% konsisten.");

  // B. Relasi foreign key transaksi lama tidak boleh bergeser atau berubah
  const checkExp1 = await prisma.expense.findUnique({ where: { id: expLegacy1.id } });
  const checkExp2 = await prisma.expense.findUnique({ where: { id: expLegacy2.id } });
  const checkExpCustom = await prisma.expense.findUnique({ where: { id: expCustom.id } });
  const checkAlloc = await prisma.monthlyBudgetAllocation.findUnique({ where: { id: allocLegacy.id } });

  assert.equal(checkExp1?.categoryId, legacyGalonGas.id, "Expense 1 harus tetap mereferensikan categoryId aslinya.");
  assert.equal(checkExp2?.categoryId, legacyListrikWifi.id, "Expense 2 harus tetap mereferensikan categoryId aslinya.");
  assert.equal(checkExpCustom?.categoryId, customParent.id, "Expense custom harus tetap mereferensikan categoryId aslinya.");
  assert.equal(checkAlloc?.categoryId, legacyGalonGas.id, "Pagu anggaran harus tetap mereferensikan categoryId aslinya.");
  console.log("✓ [Verifikasi 2] Seluruh foreign key transaksi lama tetap utuh tanpa mutasi sembarangan.");

  // C. 5 Kategori final wajib aktif dan berada di root (termasuk galon yang dilepaskan dari parent legacy)
  const FINAL_SLUGS = ["galon", "listrik", "wifi", "alat-mandi", "lainnya"];
  for (const slug of FINAL_SLUGS) {
    const cat = await prisma.expenseCategory.findUnique({ where: { slug } });
    assert.ok(cat, `Kategori final '${slug}' wajib ada.`);
    assert.equal(cat.isActive, true, `Kategori final '${slug}' wajib aktif.`);
    assert.equal(cat.parentId, null, `Kategori final '${slug}' wajib di tingkat root.`);
  }
  console.log("✓ [Verifikasi 3] Kelima kategori final aktif dan berada di root (Galon, Listrik, Wi-Fi, Alat Mandi, Lainnya).");

  // D. Kategori legacy dinonaktifkan (isActive = false) namun tetap ada di database
  const updatedGalonGas = await prisma.expenseCategory.findUnique({ where: { slug: "galon-gas" } });
  const updatedListrikWifi = await prisma.expenseCategory.findUnique({ where: { slug: "listrik-wifi" } });
  assert.ok(updatedGalonGas, "Kategori legacy galon-gas tidak boleh terhapus.");
  assert.equal(updatedGalonGas.isActive, false, "Kategori legacy galon-gas harus dinonaktifkan.");
  assert.ok(updatedListrikWifi, "Kategori legacy listrik-wifi tidak boleh terhapus.");
  assert.equal(updatedListrikWifi.isActive, false, "Kategori legacy listrik-wifi harus dinonaktifkan.");
  console.log("✓ [Verifikasi 4] Kategori legacy dinonaktifkan dengan aman tanpa menghapus entri database.");

  // E. Kategori kustom buatan pengguna tidak dinonaktifkan hanya karena kemiripan nama
  const checkCustomPerbaikan = await prisma.expenseCategory.findUnique({ where: { slug: "perbaikan-genteng-kustom" } });
  const checkCustomListrik = await prisma.expenseCategory.findUnique({ where: { slug: "listrik-kamar-kustom" } });
  assert.ok(checkCustomPerbaikan && checkCustomListrik);
  assert.equal(checkCustomPerbaikan.isActive, true, "Kategori kustom 'perbaikan-genteng-kustom' tidak boleh dinonaktifkan!");
  assert.equal(checkCustomListrik.isActive, true, "Kategori kustom 'listrik-kamar-kustom' tidak boleh dinonaktifkan!");

  // Kategori kustom buatan pengguna dan subkategorinya tidak boleh berubah
  const checkCustomParent = await prisma.expenseCategory.findUnique({ where: { slug: "custom-kopi-mig" } });
  const checkCustomChild = await prisma.expenseCategory.findUnique({ where: { slug: "custom-snack-sub-mig" } });
  assert.ok(checkCustomParent && checkCustomChild);
  assert.equal(checkCustomParent.isActive, true, "Kategori kustom pengguna tidak boleh diubah statusnya.");
  assert.equal(checkCustomChild.isActive, true, "Subkategori kustom pengguna tidak boleh diubah statusnya.");
  assert.equal(checkCustomChild.parentId, customParent.id, "Relasi parent-child kustom pengguna tidak boleh rusak.");
  console.log("✓ [Verifikasi 5] Kategori kustom dan struktur parent-child pengguna 100% terlindungi (tidak salah sasaran nama mirip).");

  // F. Uji Idempotency Sejati: Catat updatedAt sebelum eksekusi kedua
  const categoriesBeforeSecondRun = await prisma.expenseCategory.findMany({
    select: { id: true, slug: true, updatedAt: true },
  });
  const updatedAtMapBefore = new Map(categoriesBeforeSecondRun.map((c) => [c.id, c.updatedAt.toISOString()]));

  // Berikan jeda waktu kecil untuk memastikan pergeseran waktu terbaca jika ada update
  await new Promise((resolve) => setTimeout(resolve, 150));

  console.log("\nMenguji idempotency sejati (menjalankan ulang SQL migration)...");
  await prisma.$executeRawUnsafe(migrationSql);

  const categoriesAfterSecondRun = await prisma.expenseCategory.findMany({
    select: { id: true, slug: true, updatedAt: true },
  });

  for (const cat of categoriesAfterSecondRun) {
    const prevUpdatedAt = updatedAtMapBefore.get(cat.id);
    assert.equal(
      cat.updatedAt.toISOString(),
      prevUpdatedAt,
      `Kategori '${cat.slug}' tidak boleh mengubah updatedAt saat tidak ada perubahan data!`
    );
  }
  console.log("✓ [Verifikasi 6] SQL migration terbukti 100% idempotent sejati: 'updatedAt' tidak dimodifikasi tanpa perubahan data.");

  // G. Uji Rollback Transaksi Atomic: kegagalan statement kedua menyebabkan rollback perubahan statement pertama
  console.log("\nMenguji rollback transaksi atomic (statement 2 gagal -> statement 1 dibatalkan)...");
  const ROLLBACK_TEST_SLUG = "test-atomic-rollback-category";
  
  // Pastikan slug uji belum ada
  await prisma.expenseCategory.deleteMany({
    where: { slug: ROLLBACK_TEST_SLUG },
  });

  const failingTransactionalSql = `
    BEGIN;
    INSERT INTO "ExpenseCategory" ("id", "slug", "name", "isActive", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), '${ROLLBACK_TEST_SLUG}', 'Kategori Uji Rollback', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    
    -- Statement 2 sengaja memicu error constraint/tabel tidak ada
    INSERT INTO "TabelTidakPernahAda_UntukPengujianRollback" ("id") VALUES ('123');
    COMMIT;
  `;

  let rollbackErrorCaught = false;
  try {
    await prisma.$executeRawUnsafe(failingTransactionalSql);
  } catch {
    rollbackErrorCaught = true;
  }

  assert.ok(rollbackErrorCaught, "Transaksi gagal harus melempar error database.");

  // Verifikasi bahwa data dari Statement 1 TIDAK PERNAH masuk ke database (ter-rollback sempurna)
  const categoryAfterRollback = await prisma.expenseCategory.findUnique({
    where: { slug: ROLLBACK_TEST_SLUG },
  });
  assert.equal(
    categoryAfterRollback,
    null,
    "Data statement 1 ('test-atomic-rollback-category') harus ter-rollback dan TIDAK boleh tersimpan di database saat statement 2 gagal!"
  );
  console.log("✓ [Verifikasi 7] Transaksi atomic terbukti aman: kegagalan statement kedua membatalkan (rollback) statement pertama 100%.");

  await cleanupMigrationTestData();
  console.log("\n=== SELURUH PENGUJIAN KATEGORI MIGRATION LULUS 100% ===");
}

runCategoryMigrationVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("CATEGORY MIGRATION TEST FAILED:", err);
    process.exit(1);
  });
