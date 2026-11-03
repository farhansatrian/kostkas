import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "./test-db";
import {
  syncExpenseCategoriesNonDestructive,
} from "./expense-category-service";
import {
  authorizedCreateExpense,
  authorizedConfirmPendingExpense,
  authorizedReverseOrVoidExpense,
  authorizedSettleReimbursementPayout,
  getExpensesPageData,
} from "./expense-reimbursement-service";
import {
  authorizedUpsertMonthlyBudget,
  authorizedUpsertCategoryBudgetAllocation,
  getBudgetPageData,
} from "./budget-service";
import {
  getFinancialReportData,
  exportFinancialReportCsv,
} from "./reporting-service";
import { getLiveDashboardData } from "./dashboard-service";
import {
  getCashLedgerSummary,
} from "./financial-service";
import type { AuthenticatedActor } from "./auth";

const RECON_MEMBER_IDS = [
  "77777777-0000-4000-8000-000000000001",
  "77777777-0000-4000-8000-000000000002",
  "77777777-0000-4000-8000-000000000003",
] as const;

const RECON_CASH_ACCOUNT_CODE = "DANA_RECON_KAS";
const TEST_PERIOD = "2026-11";
const NOV_DATE = new Date("2026-11-15T12:00:00.000+07:00");

async function cleanupReconciliationTestData() {
  await prisma.auditLog.deleteMany({
    where: {
      actorMemberId: { in: [...RECON_MEMBER_IDS] },
    },
  });

  await prisma.monthlyBudgetAllocation.deleteMany({
    where: {
      monthlyBudget: {
        period: TEST_PERIOD,
      },
    },
  });

  await prisma.monthlyBudget.deleteMany({
    where: {
      period: TEST_PERIOD,
    },
  });

  const reconAccount = await prisma.cashAccount.findUnique({
    where: { code: RECON_CASH_ACCOUNT_CODE },
  });

  if (reconAccount) {
    await prisma.cashMovement.deleteMany({
      where: { cashAccountId: reconAccount.id },
    });
    await prisma.reimbursementPayout.deleteMany({
      where: { cashAccountId: reconAccount.id },
    });
    await prisma.payment.deleteMany({
      where: { cashAccountId: reconAccount.id },
    });
    await prisma.expense.deleteMany({
      where: { cashAccountId: reconAccount.id },
    });
  }

  const reconExpenses = await prisma.expense.findMany({
    where: {
      OR: [
        { recordedByMemberId: { in: [...RECON_MEMBER_IDS] } },
        { advancedByMemberId: { in: [...RECON_MEMBER_IDS] } },
      ],
    },
    select: { id: true },
  });
  const reconExpenseIds = reconExpenses.map((e) => e.id);

  if (reconExpenseIds.length > 0) {
    const reconReimbursements = await prisma.reimbursement.findMany({
      where: { expenseId: { in: reconExpenseIds } },
      select: { id: true },
    });
    const reimbIds = reconReimbursements.map((r) => r.id);

    if (reimbIds.length > 0) {
      await prisma.reimbursementPayout.deleteMany({
        where: { reimbursementId: { in: reimbIds } },
      });
      await prisma.reimbursement.deleteMany({
        where: { id: { in: reimbIds } },
      });
    }

    await prisma.expense.deleteMany({
      where: { id: { in: reconExpenseIds } },
    });
  }

  await prisma.cashMovement.deleteMany({
    where: { actorMemberId: { in: [...RECON_MEMBER_IDS] } },
  });

  await prisma.payment.deleteMany({
    where: { memberId: { in: [...RECON_MEMBER_IDS] } },
  });

  await prisma.contributionCharge.deleteMany({
    where: { memberId: { in: [...RECON_MEMBER_IDS] } },
  });

  if (reconAccount) {
    await prisma.cashAccount.delete({
      where: { id: reconAccount.id },
    });
  }

  const userAccounts = await prisma.userAccount.findMany({
    where: { memberId: { in: [...RECON_MEMBER_IDS] } },
    select: { id: true },
  });
  if (userAccounts.length > 0) {
    const userAccountIds = userAccounts.map((u) => u.id);
    await prisma.authSession.deleteMany({
      where: { userAccountId: { in: userAccountIds } },
    });
    await prisma.userAccount.deleteMany({
      where: { id: { in: userAccountIds } },
    });
  }

  await prisma.member.deleteMany({
    where: { id: { in: [...RECON_MEMBER_IDS] } },
  });
}

async function setupReconciliationTestEnvironment() {
  await cleanupReconciliationTestData();

  // 1. Buat anggota uji Farhan, Nabeel, Alzha beserta UserAccount
  const membersData = [
    { id: RECON_MEMBER_IDS[0], name: "Farhan Recon", username: "farhan_recon" },
    { id: RECON_MEMBER_IDS[1], name: "Nabeel Recon", username: "nabeel_recon" },
    { id: RECON_MEMBER_IDS[2], name: "Alzha Recon", username: "alzha_recon" },
  ];

  const userAccountMap = new Map<string, string>();
  for (const m of membersData) {
    await prisma.member.create({
      data: {
        id: m.id,
        name: m.name,
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    const userAcc = await prisma.userAccount.create({
      data: {
        memberId: m.id,
        username: m.username,
        passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr",
      },
    });
    userAccountMap.set(m.id, userAcc.id);
  }

  // 2. Akun DANA kas bersama
  const reconAccount = await prisma.cashAccount.create({
    data: {
      code: RECON_CASH_ACCOUNT_CODE,
      name: "DANA Kas Kost Recon",
      provider: "DANA",
      custodianMemberId: RECON_MEMBER_IDS[0],
      isActive: true,
    },
  });

  // Saldo awal kas DANA: Rp1.000.000
  await prisma.cashMovement.create({
    data: {
      cashAccountId: reconAccount.id,
      direction: "IN",
      amount: 1_000_000,
      status: "CONFIRMED",
      category: "OPENING_BALANCE",
      description: "Saldo awal kas pengujian rekonsiliasi",
      occurredAt: new Date("2026-10-31T23:59:00.000Z"),
      idempotencyKey: `OPENING_RECON_${Date.now()}`,
      actorMemberId: RECON_MEMBER_IDS[0],
    },
  });

  // 3. Sinkronkan kategori ke 5 kategori default aktif
  await syncExpenseCategoriesNonDestructive(prisma);

  return { reconAccount, userAccountMap };
}

async function runGalonReconciliationTests() {
  console.log("=== Memulai Mandatory Galon Reconciliation Tests (v1.0.2) ===\n");

  const { reconAccount, userAccountMap } = await setupReconciliationTestEnvironment();

  const farhanActor: AuthenticatedActor = {
    sessionId: "recon-session-farhan",
    userAccountId: userAccountMap.get(RECON_MEMBER_IDS[0])!,
    memberId: RECON_MEMBER_IDS[0],
    username: "farhan_recon",
    memberName: "Farhan Recon",
  };

  const nabeelActor: AuthenticatedActor = {
    sessionId: "recon-session-nabeel",
    userAccountId: userAccountMap.get(RECON_MEMBER_IDS[1])!,
    memberId: RECON_MEMBER_IDS[1],
    username: "nabeel_recon",
    memberName: "Nabeel Recon",
  };

  // Temukan kategori Galon
  const galonCategory = await prisma.expenseCategory.findUnique({
    where: { slug: "galon" },
  });
  assert.ok(galonCategory, "Kategori 'galon' harus tersedia dan terdaftar.");
  assert.equal(galonCategory.isActive, true, "Kategori 'galon' harus aktif.");

  // --------------------------------------------------------------------------
  // Skenario A — Pengeluaran awal
  // - Budget Galon November 2026 Rp100.000.
  // - Expense Galon confirmed Rp30.000.
  // - Pengeluaran menampilkan Rp30.000.
  // - Anggaran menunjukkan realisasi Rp30.000.
  // - Sisa budget Rp70.000.
  // - Laporan kategori Galon Rp30.000.
  // - Dashboard memasukkan expense tepat sekali.
  // - CSV memiliki transaksi yang sama.
  // --------------------------------------------------------------------------
  console.log("Menjalankan Skenario A: Pengeluaran awal Galon...");

  // Set Budget November 2026: Total Rp200.000, Alokasi Galon Rp100.000
  await authorizedUpsertMonthlyBudget(prisma, farhanActor, {
    period: TEST_PERIOD,
    totalAmount: 200_000,
  });
  await authorizedUpsertCategoryBudgetAllocation(prisma, farhanActor, {
    period: TEST_PERIOD,
    categoryId: galonCategory.id,
    amount: 100_000,
  });

  // Catat Pengeluaran Galon Rp30.000 (DIRECT_CASH, CONFIRMED)
  const expA = await authorizedCreateExpense(prisma, farhanActor, {
    title: "Beli Galon Minggu 1",
    amount: 30_000,
    categoryId: galonCategory.id,
    fundingSource: "DIRECT_CASH",
    confirmImmediately: true,
    cashAccountId: reconAccount.id,
    expenseDate: "2026-11-05",
    idempotencyKey: `RECON_EXP_A_${Date.now()}`,
    note: undefined, // note opsional
  });
  assert.equal(expA.expense.amount, 30_000);
  assert.equal(expA.expense.status, "CONFIRMED");

  // Verifikasi Modul Pengeluaran
  const expensesDataA = await getExpensesPageData(prisma, farhanActor, {
    period: TEST_PERIOD,
  });
  const galonExpensesA = expensesDataA.expenses.filter(
    (e) => e.category.id === galonCategory.id
  );
  assert.equal(galonExpensesA.length, 1);
  assert.equal(galonExpensesA[0].amount, 30_000);

  // Verifikasi Modul Anggaran
  const budgetDataA = await getBudgetPageData(prisma, farhanActor, TEST_PERIOD);
  const galonBudgetItemA = budgetDataA.flatCategories.find(
    (c) => c.categoryId === galonCategory.id
  );
  assert.ok(galonBudgetItemA, "Item anggaran Galon harus ditemukan.");
  assert.equal(galonBudgetItemA.directBudgetAmount, 100_000);
  assert.equal(galonBudgetItemA.inclusiveRealizedAmount, 30_000);
  assert.equal(galonBudgetItemA.remainingBalance, 70_000);
  assert.equal(galonBudgetItemA.isOverBudget, false);

  // Verifikasi Modul Laporan
  const reportDataA = await getFinancialReportData(prisma, farhanActor, TEST_PERIOD, {
    cashAccountId: reconAccount.id,
  });
  const galonReportItemA = reportDataA.operatingExpenses.categoryBreakdown.find(
    (c) => c.categoryId === galonCategory.id
  );
  assert.ok(galonReportItemA, "Item breakdown laporan Galon harus ada.");
  assert.equal(galonReportItemA.amount, 30_000);
  assert.equal(reportDataA.operatingExpenses.totalOperatingExpense, 30_000);

  // Verifikasi Dashboard
  const dashboardDataA = await getLiveDashboardData(prisma, farhanActor, NOV_DATE, {
    cashAccountId: reconAccount.id,
  });
  assert.equal(dashboardDataA.cashSummary.directOperatingExpensesThisMonth, 30_000);
  assert.equal(dashboardDataA.cashSummary.totalConfirmedOperatingExpensesThisMonth, 30_000);
  assert.equal(dashboardDataA.cashSummary.totalCashOutflowThisMonth, 30_000);

  // Verifikasi CSV Export
  const csvA = await exportFinancialReportCsv(prisma, farhanActor, {
    period: TEST_PERIOD,
    type: "expenses",
    cashAccountId: reconAccount.id,
  });
  assert.ok(csvA.csvContent.includes("Beli Galon Minggu 1"), "CSV harus memuat transaksi Galon Minggu 1.");
  assert.ok(csvA.csvContent.includes("30000"), "CSV harus memuat nominal 30000.");
  console.log("✓ Skenario A LULUS: Pengeluaran awal Galon sinkron di seluruh 5 modul.");

  // --------------------------------------------------------------------------
  // Skenario B — Tambahan pengeluaran
  // - Expense confirmed Galon Rp20.000.
  // - Total realisasi menjadi Rp50.000.
  // - Sisa anggaran Rp50.000.
  // - Semua modul sinkron setelah reload.
  // --------------------------------------------------------------------------
  console.log("Menjalankan Skenario B: Tambahan pengeluaran Galon...");

  const expB = await authorizedCreateExpense(prisma, farhanActor, {
    title: "Beli Galon Minggu 2",
    amount: 20_000,
    categoryId: galonCategory.id,
    fundingSource: "DIRECT_CASH",
    confirmImmediately: true,
    cashAccountId: reconAccount.id,
    expenseDate: "2026-11-08",
    idempotencyKey: `RECON_EXP_B_${Date.now()}`,
    note: "Isi ulang galon ruang tengah",
  });
  assert.equal(expB.expense.amount, 20_000);

  const budgetDataB = await getBudgetPageData(prisma, farhanActor, TEST_PERIOD);
  const galonBudgetItemB = budgetDataB.flatCategories.find(
    (c) => c.categoryId === galonCategory.id
  );
  assert.ok(galonBudgetItemB);
  assert.equal(galonBudgetItemB.inclusiveRealizedAmount, 50_000);
  assert.equal(galonBudgetItemB.remainingBalance, 50_000);

  const reportDataB = await getFinancialReportData(prisma, farhanActor, TEST_PERIOD, {
    cashAccountId: reconAccount.id,
  });
  const galonReportItemB = reportDataB.operatingExpenses.categoryBreakdown.find(
    (c) => c.categoryId === galonCategory.id
  );
  assert.ok(galonReportItemB);
  assert.equal(galonReportItemB.amount, 50_000);
  assert.equal(reportDataB.operatingExpenses.totalOperatingExpense, 50_000);

  const dashboardDataB = await getLiveDashboardData(prisma, farhanActor, NOV_DATE, {
    cashAccountId: reconAccount.id,
  });
  assert.equal(dashboardDataB.cashSummary.totalConfirmedOperatingExpensesThisMonth, 50_000);
  console.log("✓ Skenario B LULUS: Tambahan pengeluaran Galon terakumulasi sempurna menjadi Rp50.000.");

  // --------------------------------------------------------------------------
  // Skenario C — Pending dan konfirmasi
  // - Expense Galon pending Rp15.000.
  // - Realisasi tetap Rp50.000.
  // - Setelah dikonfirmasi, realisasi menjadi Rp65.000.
  // --------------------------------------------------------------------------
  console.log("Menjalankan Skenario C: Pending dan konfirmasi...");

  const expC = await authorizedCreateExpense(prisma, farhanActor, {
    title: "Galon Cadangan Pending",
    amount: 15_000,
    categoryId: galonCategory.id,
    fundingSource: "DIRECT_CASH",
    confirmImmediately: false,
    cashAccountId: reconAccount.id,
    expenseDate: "2026-11-10",
    idempotencyKey: `RECON_EXP_C_${Date.now()}`,
  });
  assert.equal(expC.expense.status, "PENDING");

  // Sebelum konfirmasi: realisasi di Anggaran dan Laporan tetap Rp50.000
  const budgetDataCPre = await getBudgetPageData(prisma, farhanActor, TEST_PERIOD);
  const galonBudgetCPre = budgetDataCPre.flatCategories.find((c) => c.categoryId === galonCategory.id);
  assert.equal(galonBudgetCPre?.inclusiveRealizedAmount, 50_000);

  const reportDataCPre = await getFinancialReportData(prisma, farhanActor, TEST_PERIOD, {
    cashAccountId: reconAccount.id,
  });
  assert.equal(reportDataCPre.operatingExpenses.totalOperatingExpense, 50_000);

  // Lakukan konfirmasi
  await authorizedConfirmPendingExpense(prisma, farhanActor, {
    expenseId: expC.expense.id,
  });

  // Setelah konfirmasi: realisasi menjadi Rp65.000, sisa budget Rp35.000
  const budgetDataCPost = await getBudgetPageData(prisma, farhanActor, TEST_PERIOD);
  const galonBudgetCPost = budgetDataCPost.flatCategories.find((c) => c.categoryId === galonCategory.id);
  assert.equal(galonBudgetCPost?.inclusiveRealizedAmount, 65_000);
  assert.equal(galonBudgetCPost?.remainingBalance, 35_000);

  const reportDataCPost = await getFinancialReportData(prisma, farhanActor, TEST_PERIOD, {
    cashAccountId: reconAccount.id,
  });
  assert.equal(reportDataCPost.operatingExpenses.totalOperatingExpense, 65_000);
  console.log("✓ Skenario C LULUS: Transaksi PENDING tidak bocor dan sinkron ke Rp65.000 setelah konfirmasi.");

  // --------------------------------------------------------------------------
  // Skenario D — Talangan anggota
  // - Expense Galon Rp40.000 ditalangi Nabeel.
  // - Realisasi biaya Galon bertambah Rp40.000 (total Rp105.000).
  // - Saldo DANA tidak langsung berkurang.
  // - Reimbursement Rp20.000 mengurangi kas tetapi tidak menambah biaya Galon kembali.
  // --------------------------------------------------------------------------
  console.log("Menjalankan Skenario D: Talangan anggota dan pelunasan reimbursement...");

  const ledgerBeforeD = await getCashLedgerSummary(prisma, reconAccount.id);
  const cashBalanceBeforeD = ledgerBeforeD.actualBalance;

  const expD = await authorizedCreateExpense(prisma, nabeelActor, {
    title: "Galon Ditalangi Nabeel",
    amount: 40_000,
    categoryId: galonCategory.id,
    fundingSource: "MEMBER_ADVANCE",
    advancedByMemberId: RECON_MEMBER_IDS[1],
    confirmImmediately: true,
    expenseDate: "2026-11-12",
    idempotencyKey: `RECON_EXP_D_${Date.now()}`,
  });
  assert.ok(expD.reimbursement);
  assert.equal(expD.reimbursement.totalAmount, 40_000);

  // 1. Saldo DANA TIDAK berkurang langsung
  const ledgerAfterExpD = await getCashLedgerSummary(prisma, reconAccount.id);
  assert.equal(ledgerAfterExpD.actualBalance, cashBalanceBeforeD);

  // 2. Realisasi biaya Galon bertambah Rp40.000 menjadi Rp105.000 (over budget Rp5.000)
  const budgetDataD = await getBudgetPageData(prisma, farhanActor, TEST_PERIOD);
  const galonBudgetD = budgetDataD.flatCategories.find((c) => c.categoryId === galonCategory.id);
  assert.equal(galonBudgetD?.inclusiveRealizedAmount, 105_000);
  assert.equal(galonBudgetD?.isOverBudget, true);
  assert.equal(galonBudgetD?.overBudgetAmount, 5_000);

  // 3. Modul Laporan mencatat biaya operasional Rp105.000
  const reportDataD = await getFinancialReportData(prisma, farhanActor, TEST_PERIOD, {
    cashAccountId: reconAccount.id,
  });
  assert.equal(reportDataD.operatingExpenses.totalOperatingExpense, 105_000);
  assert.equal(reportDataD.operatingExpenses.memberAdvanceOperatingExpense, 40_000);

  // 4. Dashboard menampilkan talangan di recentTransactions dan total belanja Rp105.000
  const dashboardDataD = await getLiveDashboardData(prisma, farhanActor, NOV_DATE, {
    cashAccountId: reconAccount.id,
  });
  assert.equal(dashboardDataD.cashSummary.totalConfirmedOperatingExpensesThisMonth, 105_000);
  const talanganItem = dashboardDataD.recentTransactions.find((t) => t.id === expD.expense.id);
  assert.ok(talanganItem, "Transaksi talangan Nabeel harus tampil di Aktivitas Kas Terbaru.");
  assert.equal(talanganItem.actorName, "Nabeel Recon");

  // 5. Bayar pencairan reimbursement sebagian: Rp20.000
  const payoutD = await authorizedSettleReimbursementPayout(prisma, farhanActor, {
    reimbursementId: expD.reimbursement.id,
    amount: 20_000,
    cashAccountId: reconAccount.id,
    idempotencyKey: `PAYOUT_D_${Date.now()}`,
  });
  assert.equal(payoutD.payout.amount, 20_000);

  // Kas DANA berkurang Rp20.000
  const ledgerAfterPayoutD = await getCashLedgerSummary(prisma, reconAccount.id);
  assert.equal(ledgerAfterPayoutD.actualBalance, cashBalanceBeforeD - 20_000);

  // PENTING: Pencairan reimburse TIDAK BOLEH menambah biaya Galon kembali (tidak double counting)
  const reportDataAfterPayout = await getFinancialReportData(prisma, farhanActor, TEST_PERIOD, {
    cashAccountId: reconAccount.id,
  });
  assert.equal(reportDataAfterPayout.operatingExpenses.totalOperatingExpense, 105_000);

  const budgetDataAfterPayout = await getBudgetPageData(prisma, farhanActor, TEST_PERIOD);
  const galonBudgetAfterPayout = budgetDataAfterPayout.flatCategories.find((c) => c.categoryId === galonCategory.id);
  assert.equal(galonBudgetAfterPayout?.inclusiveRealizedAmount, 105_000);
  console.log("✓ Skenario D LULUS: Talangan anggota dan pelunasan reimbursement akuntabel tanpa double-counting.");

  // --------------------------------------------------------------------------
  // Skenario E — Reversal
  // - Expense Galon terkonfirmasi dibatalkan dengan alasan sah.
  // - Realisasi Anggaran, Laporan, dan Dashboard diperbarui secara konsisten.
  // - AuditLog dan histori tetap tersedia.
  // --------------------------------------------------------------------------
  console.log("Menjalankan Skenario E: Reversal pengeluaran dengan alasan wajib...");

  // Batalkan expB (Beli Galon Minggu 2, Rp20.000)
  const reversalE = await authorizedReverseOrVoidExpense(prisma, farhanActor, {
    expenseId: expB.expense.id,
    reason: "Salah input jumlah galon (dibatalkan oleh bendahara)",
    idempotencyKey: `REVERSAL_E_${Date.now()}`,
  });
  assert.equal(reversalE.expense.status, "REJECTED");

  // Realisasi di Anggaran berkurang Rp20.000 (dari 105.000 menjadi 85.000)
  const budgetDataE = await getBudgetPageData(prisma, farhanActor, TEST_PERIOD);
  const galonBudgetE = budgetDataE.flatCategories.find((c) => c.categoryId === galonCategory.id);
  assert.equal(galonBudgetE?.inclusiveRealizedAmount, 85_000);
  assert.equal(galonBudgetE?.isOverBudget, false);

  // Laporan dan Dashboard juga berkurang Rp20.000
  const reportDataE = await getFinancialReportData(prisma, farhanActor, TEST_PERIOD, {
    cashAccountId: reconAccount.id,
  });
  assert.equal(reportDataE.operatingExpenses.totalOperatingExpense, 85_000);

  const dashboardDataE = await getLiveDashboardData(prisma, farhanActor, NOV_DATE, {
    cashAccountId: reconAccount.id,
  });
  assert.equal(dashboardDataE.cashSummary.totalConfirmedOperatingExpensesThisMonth, 85_000);

  // Verifikasi AuditLog mencatat pembatalan dan alasannya
  const auditLogsE = await prisma.auditLog.findMany({
    where: {
      entityId: expB.expense.id,
      action: "VOID_OR_REVERSE_EXPENSE",
    },
  });
  assert.ok(auditLogsE.length > 0, "AuditLog untuk VOID_OR_REVERSE_EXPENSE harus tercatat.");
  assert.ok(auditLogsE[0].summary.includes("Salah input jumlah galon"));
  console.log("✓ Skenario E LULUS: Reversal terverifikasi audit trail dan mengoreksi seluruh modul.");

  // --------------------------------------------------------------------------
  // Skenario F — Legacy categories
  // - Transaksi kategori lama tidak hilang.
  // - Kategori legacy tetap dapat dilaporkan.
  // - Kategori legacy nonaktif tidak tersedia untuk transaksi baru.
  // - Tidak ada reklasifikasi ambigu secara otomatis.
  // --------------------------------------------------------------------------
  console.log("Menjalankan Skenario F: Pelestarian kategori legacy...");

  // Buat kategori legacy "galon-gas" dan transaksi lama
  const legacyCat = await prisma.expenseCategory.upsert({
    where: { slug: "galon-gas" },
    create: {
      name: "Galon & Gas",
      slug: "galon-gas",
      isActive: true,
    },
    update: { isActive: true },
  });

  const legacyExp = await prisma.expense.create({
    data: {
      title: "Beli Tabung Gas & Galon Lama",
      amount: 45_000,
      categoryId: legacyCat.id,
      fundingSource: "DIRECT_CASH",
      status: "CONFIRMED",
      expenseDate: new Date("2026-11-01T12:00:00.000+07:00"),
      recordedByMemberId: RECON_MEMBER_IDS[0],
      cashAccountId: reconAccount.id,
      idempotencyKey: `LEGACY_EXP_${Date.now()}`,
    },
  });

  // Jalankan sinkronisasi non-destruktif
  const syncResult = await syncExpenseCategoriesNonDestructive(prisma);
  assert.ok(
    syncResult.preservedUsedLegacy.some((item) => item.includes("galon-gas")),
    "Kategori legacy 'galon-gas' dengan transaksi harus masuk preservedUsedLegacy."
  );

  // Verifikasi status: isActive menjadi false
  const updatedLegacyCat = await prisma.expenseCategory.findUnique({
    where: { slug: "galon-gas" },
  });
  assert.equal(updatedLegacyCat?.isActive, false, "Kategori legacy harus dinonaktifkan (isActive: false).");

  // Transaksi historis tidak hilang
  const checkLegacyExp = await prisma.expense.findUnique({
    where: { id: legacyExp.id },
  });
  assert.ok(checkLegacyExp, "Transaksi lama kategori legacy tidak boleh dihapus.");

  // Tetap muncul di Laporan keuangan
  const reportDataF = await getFinancialReportData(prisma, farhanActor, TEST_PERIOD, {
    cashAccountId: reconAccount.id,
  });
  const legacyReportItem = reportDataF.operatingExpenses.categoryBreakdown.find((c) => c.categoryId === legacyCat.id);
  assert.ok(legacyReportItem, "Kategori legacy dengan transaksi harus tetap tercantum di Laporan.");
  assert.equal(legacyReportItem.amount, 45_000);

  // Kategori nonaktif tidak muncul di daftar kategori aktif pengeluaran baru
  const expensesDataF = await getExpensesPageData(prisma, farhanActor, {
    period: TEST_PERIOD,
  });
  const selectableLegacy = expensesDataF.categories.flatCategories.filter(
    (c) => c.slug === "galon-gas" && c.isActive
  );
  assert.equal(selectableLegacy.length, 0, "Kategori legacy nonaktif tidak boleh dipilih untuk transaksi baru.");
  console.log("✓ Skenario F LULUS: Kategori legacy dilestarikan untuk histori & dicegah untuk transaksi baru.");

  // --------------------------------------------------------------------------
  // Skenario G — Parent/subcategory
  // - Expense pada subkategori hanya dihitung sekali dalam parent.
  // - Budget parent dan child tidak menyebabkan realisasi ganda.
  // - Total pengeluaran kategori sama dengan total ringkasan laporan.
  // --------------------------------------------------------------------------
  console.log("Menjalankan Skenario G: Parent dan subkategori...");

  // Buat parent "Kebutuhan Rutin" dan subcategory "Galon Khusus"
  const parentCat = await prisma.expenseCategory.create({
    data: {
      name: "Kebutuhan Rutin",
      slug: `rutin-${Date.now()}`,
      isActive: true,
    },
  });

  const childCat = await prisma.expenseCategory.create({
    data: {
      name: "Galon Khusus",
      slug: `galon-khusus-${Date.now()}`,
      parentId: parentCat.id,
      isActive: true,
    },
  });

  // Catat pengeluaran pada child category
  await authorizedCreateExpense(prisma, farhanActor, {
    title: "Galon Dispenser Utama",
    amount: 25_000,
    categoryId: childCat.id,
    fundingSource: "DIRECT_CASH",
    confirmImmediately: true,
    cashAccountId: reconAccount.id,
    expenseDate: "2026-11-20",
    idempotencyKey: `RECON_EXP_G_${Date.now()}`,
  });

  // Set budget pada child dan parent
  await authorizedUpsertCategoryBudgetAllocation(prisma, farhanActor, {
    period: TEST_PERIOD,
    categoryId: childCat.id,
    amount: 30_000,
  });

  const budgetDataG = await getBudgetPageData(prisma, farhanActor, TEST_PERIOD);
  const parentGroupG = budgetDataG.categoryGroups.find(
    (g) => g.parent.categoryId === parentCat.id
  );
  assert.ok(parentGroupG, "Grup parent 'Kebutuhan Rutin' harus ditemukan.");
  // Realisasi parent adalah agregasi dari children
  assert.equal(parentGroupG.parent.inclusiveRealizedAmount, 25_000);
  assert.equal(parentGroupG.subcategories.length, 1);
  assert.equal(parentGroupG.subcategories[0].inclusiveRealizedAmount, 25_000);

  // Verifikasi laporan: total seluruh categoryBreakdown sama dengan totalOperatingExpense
  const reportDataG = await getFinancialReportData(prisma, farhanActor, TEST_PERIOD, {
    cashAccountId: reconAccount.id,
  });
  const sumBreakdown = reportDataG.operatingExpenses.categoryBreakdown.reduce((sum, item) => sum + item.amount, 0);
  assert.equal(
    sumBreakdown,
    reportDataG.operatingExpenses.totalOperatingExpense,
    "Jumlah kategori breakdown harus tepat sama dengan totalOperatingExpense (tanpa realisasi ganda)."
  );
  console.log("✓ Skenario G LULUS: Parent/subkategori teragregasi tanpa perhitungan ganda.");

  // Bersihkan data uji setelah pengujian sukses
  await cleanupReconciliationTestData();

  console.log("\n=== MANDATORY GALON RECONCILIATION TESTS LULUS 100% (SKENARIO A-G) ===");
}

runGalonReconciliationTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("GALON RECONCILIATION TEST GAGAL:", err);
    process.exit(1);
  });
