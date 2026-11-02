import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  authenticateMemberCredentials,
  UnauthorizedError,
  upsertMemberAccountCredentials,
  validateDatabaseSessionToken,
} from "./auth";
import {
  authorizedUpsertCategoryBudgetAllocation,
  authorizedUpsertMonthlyBudget,
  getBudgetPageData,
} from "./budget-service";
import {
  authorizedCreateExpense,
  authorizedSettleReimbursementPayout,
} from "./expense-reimbursement-service";
import {
  generateRegularPeriodCharges,
  getCashLedgerSummary,
  recordContributionPayment,
  upsertContributionPolicy,
} from "./financial-service";
import { prisma } from "./prisma";
import {
  exportFinancialReportCsv,
  getFinancialReportData,
  sanitizeCsvCell,
} from "./reporting-service";
import {
  authorizedChangeOwnPassword,
  authorizedRecordReconciliationAdjustment,
  authorizedRevokeOtherActiveSessions,
  authorizedUpdateAppPreferences,
  authorizedUpdateCashAccountSettings,
  authorizedUpdateContributionTariffSetting,
  evaluateManualCashReconciliation,
  getSettingsPageData,
} from "./settings-service";

const M7_TEST_MEMBER_IDS = [
  "66666666-0000-4000-8000-000000000001",
  "66666666-0000-4000-8000-000000000002",
  "66666666-0000-4000-8000-000000000003",
] as const;

const M7_TEST_USERNAMES = [
  "test_m7_farhan",
  "test_m7_nabeel",
  "test_m7_alzha",
] as const;

const M7_CASH_ACCOUNT_CODE = "TEST_M7_DANA_ACCOUNT";
const M7_PERIOD_NOV = "2096-11";
const M7_PERIOD_DEC = "2096-12";
const M7_PARENT_CAT_SLUG = "test-m7-utilitas";
const M7_SUB_CAT_SLUG = "test-m7-wifi";

function generateEphemeralPassword(): string {
  return `EphemM7#${crypto.randomBytes(12).toString("hex")}`;
}

async function cleanupM7TestData(): Promise<void> {
  // Bersihkan MonthlyBudget & MonthlyBudgetAllocation untuk periode uji M7
  await prisma.monthlyBudget.deleteMany({
    where: { period: { in: [M7_PERIOD_NOV, M7_PERIOD_DEC] } },
  });

  const testCashAccount = await prisma.cashAccount.findUnique({
    where: { code: M7_CASH_ACCOUNT_CODE },
  });

  if (testCashAccount) {
    await prisma.cashMovement.deleteMany({
      where: { cashAccountId: testCashAccount.id },
    });
    await prisma.reimbursementPayout.deleteMany({
      where: { cashAccountId: testCashAccount.id },
    });
    await prisma.payment.deleteMany({
      where: { cashAccountId: testCashAccount.id },
    });
    await prisma.expense.deleteMany({
      where: { cashAccountId: testCashAccount.id },
    });
  }

  await prisma.cashMovement.deleteMany({
    where: { actorMemberId: { in: [...M7_TEST_MEMBER_IDS] } },
  });

  const testExpenses = await prisma.expense.findMany({
    where: {
      OR: [
        { recordedByMemberId: { in: [...M7_TEST_MEMBER_IDS] } },
        { advancedByMemberId: { in: [...M7_TEST_MEMBER_IDS] } },
      ],
    },
    select: { id: true },
  });
  const testExpenseIds = testExpenses.map((e) => e.id);

  if (testExpenseIds.length > 0) {
    const testReimbursements = await prisma.reimbursement.findMany({
      where: { expenseId: { in: testExpenseIds } },
      select: { id: true },
    });
    const reimbIds = testReimbursements.map((r) => r.id);

    if (reimbIds.length > 0) {
      await prisma.reimbursementPayout.deleteMany({
        where: { reimbursementId: { in: reimbIds } },
      });
      await prisma.reimbursement.deleteMany({
        where: { id: { in: reimbIds } },
      });
    }

    await prisma.expense.deleteMany({
      where: { id: { in: testExpenseIds } },
    });
  }

  await prisma.payment.deleteMany({
    where: { memberId: { in: [...M7_TEST_MEMBER_IDS] } },
  });

  await prisma.contributionCharge.deleteMany({
    where: {
      OR: [
        { memberId: { in: [...M7_TEST_MEMBER_IDS] } },
        { period: { in: [M7_PERIOD_NOV, M7_PERIOD_DEC] } },
      ],
    },
  });

  await prisma.contributionPolicy.deleteMany({
    where: {
      OR: [
        { effectiveFromPeriod: { in: [M7_PERIOD_NOV, M7_PERIOD_DEC] } },
        { code: { startsWith: "TEST_M7_" } },
      ],
    },
  });

  const m7Categories = await prisma.expenseCategory.findMany({
    where: { slug: { startsWith: "test-m7-" } },
    select: { id: true, parentId: true },
  });
  const childCatIds = m7Categories
    .filter((c) => c.parentId !== null)
    .map((c) => c.id);
  const parentCatIds = m7Categories
    .filter((c) => c.parentId === null)
    .map((c) => c.id);

  if (childCatIds.length > 0) {
    await prisma.expenseCategory.deleteMany({
      where: { id: { in: childCatIds } },
    });
  }
  if (parentCatIds.length > 0) {
    await prisma.expenseCategory.deleteMany({
      where: { id: { in: parentCatIds } },
    });
  }

  if (testCashAccount) {
    await prisma.cashAccount.delete({
      where: { id: testCashAccount.id },
    });
  }

  await prisma.auditLog.deleteMany({
    where: { actorMemberId: { in: [...M7_TEST_MEMBER_IDS] } },
  });

  await prisma.userAccount.deleteMany({
    where: { memberId: { in: [...M7_TEST_MEMBER_IDS] } },
  });

  await prisma.member.deleteMany({
    where: { id: { in: [...M7_TEST_MEMBER_IDS] } },
  });
}

async function runMilestone7Tests(): Promise<void> {
  console.log(
    "=== Memulai Pengujian Otomatis Milestone 7: Financial Reporting, Budgeting & Settings ===\n"
  );

  // Simpan snapshot AppPreference awal agar dipulihkan kembali setelah test selesai
  const originalPref = await prisma.appPreference.findUnique({
    where: { id: "default" },
  });

  await cleanupM7TestData();

  try {
    const testMembersConfig = [
      {
        id: M7_TEST_MEMBER_IDS[0],
        name: "Farhan Uji M7",
        username: M7_TEST_USERNAMES[0],
        password: generateEphemeralPassword(),
      },
      {
        id: M7_TEST_MEMBER_IDS[1],
        name: "Nabeel Uji M7",
        username: M7_TEST_USERNAMES[1],
        password: generateEphemeralPassword(),
      },
      {
        id: M7_TEST_MEMBER_IDS[2],
        name: "Alzha Uji M7",
        username: M7_TEST_USERNAMES[2],
        password: generateEphemeralPassword(),
      },
    ] as const;

    for (const m of testMembersConfig) {
      await prisma.member.create({
        data: {
          id: m.id,
          name: m.name,
          joinedAt: new Date("2026-10-01T00:00:00.000Z"),
        },
      });
      await upsertMemberAccountCredentials(prisma, {
        memberId: m.id,
        username: m.username,
        plainPassword: m.password,
        actorMemberId: testMembersConfig[0].id,
      });
    }

    const farhanLogin = await authenticateMemberCredentials(prisma, {
      username: testMembersConfig[0].username,
      password: testMembersConfig[0].password,
    });
    const farhanActor = await validateDatabaseSessionToken(
      prisma,
      farhanLogin.sessionToken
    );
    assert.ok(farhanActor, "Sesi login Farhan M7 harus valid");

    const nabeelLogin = await authenticateMemberCredentials(prisma, {
      username: testMembersConfig[1].username,
      password: testMembersConfig[1].password,
    });
    const nabeelActor = await validateDatabaseSessionToken(
      prisma,
      nabeelLogin.sessionToken
    );
    assert.ok(nabeelActor, "Sesi login Nabeel M7 harus valid");

    const testCashAccount = await prisma.cashAccount.create({
      data: {
        code: M7_CASH_ACCOUNT_CODE,
        name: "DANA Kas Kost Uji M7",
        provider: "DANA",
        custodianMemberId: farhanActor.memberId,
        isActive: true,
      },
    });

    const parentCat = await prisma.expenseCategory.create({
      data: {
        slug: M7_PARENT_CAT_SLUG,
        name: "Uji M7 Tagihan & Utilitas",
        isActive: true,
      },
    });

    const subCatWifi = await prisma.expenseCategory.create({
      data: {
        slug: M7_SUB_CAT_SLUG,
        name: "Uji M7 Wi-Fi",
        parentId: parentCat.id,
        isActive: true,
      },
    });

    // Tanggal di dalam periode 2096-11 (Asia/Jakarta)
    const dateNov05 = new Date("2096-11-05T10:00:00.000+07:00");
    const dateNov10 = new Date("2096-11-10T10:00:00.000+07:00");
    const dateNov15 = new Date("2096-11-15T10:00:00.000+07:00");
    // Tanggal di dalam periode 2096-12 (Asia/Jakarta)
    const dateDec05 = new Date("2096-12-05T10:00:00.000+07:00");

    // Saldo awal sebelum periode 2096-11 sebesar Rp100.000
    await prisma.cashMovement.create({
      data: {
        cashAccountId: testCashAccount.id,
        direction: "IN",
        category: "OPENING_BALANCE",
        amount: 100_000,
        status: "CONFIRMED",
        occurredAt: new Date("2096-10-31T12:00:00.000+07:00"),
        description: "Saldo awal kas DANA sebelum 2096-11",
        actorMemberId: farhanActor.memberId,
        idempotencyKey: "M7:OPENING:100K",
      },
    });

    // Kebijakan & tagihan iuran periode 2096-11 (3 anggota × Rp150.000 = Rp450.000)
    await upsertContributionPolicy(prisma, {
      code: "TEST_M7_POLICY_NOV",
      name: "Tarif Uji M7 November",
      amountPerMember: 150_000,
      effectiveFromPeriod: M7_PERIOD_NOV,
      actorMemberId: farhanActor.memberId,
    });

    const chargesNov = await generateRegularPeriodCharges(prisma, {
      period: M7_PERIOD_NOV,
      policyCode: "TEST_M7_POLICY_NOV",
      memberIds: [...M7_TEST_MEMBER_IDS],
      actorMemberId: farhanActor.memberId,
    });
    assert.equal(chargesNov.totalBilledAmount, 450_000);

    // Farhan membayar lunas Rp150.000 pada 2096-11 (Kas Masuk Aktual = Rp150.000)
    const farhanCharge = chargesNov.charges.find(
      (c) => c.memberId === farhanActor.memberId
    );
    assert.ok(farhanCharge);

    await recordContributionPayment(prisma, {
      memberId: farhanActor.memberId,
      cashAccountId: testCashAccount.id,
      amount: 150_000,
      targetChargeIds: [farhanCharge.id],
      idempotencyKey: "M7:PAY:FARHAN:150K",
      confirmImmediately: true,
      paidAt: dateNov05,
      actorMemberId: farhanActor.memberId,
      note: "=SUM(A1:A2) Iuran Farhan dengan uji karakter formula CSV",
    });

    // Pengeluaran langsung (DIRECT_CASH) Rp40.000 pada 2096-11
    await authorizedCreateExpense(prisma, farhanActor, {
      title: "Bayar Langsung Kas: Token Listrik",
      amount: 40_000,
      categoryId: parentCat.id,
      fundingSource: "DIRECT_CASH",
      confirmImmediately: true,
      cashAccountId: testCashAccount.id,
      expenseDate: dateNov10,
      idempotencyKey: "M7:EXP:DIRECT:40K",
    });

    // -------------------------------------------------------------------------
    // SKENARIO 2: Expense talangan masuk ke biaya operasional tetapi tidak
    //             langsung mengurangi saldo kas
    // -------------------------------------------------------------------------
    const nabeelAdvanceRes = await authorizedCreateExpense(prisma, nabeelActor, {
      title: "Talangan Nabeel: Paket Wi-Fi Tambahan",
      amount: 30_000,
      categoryId: subCatWifi.id,
      fundingSource: "MEMBER_ADVANCE",
      advancedByMemberId: nabeelActor.memberId,
      confirmImmediately: true,
      expenseDate: dateNov10,
      idempotencyKey: "M7:EXP:ADVANCE:30K",
    });
    assert.ok(nabeelAdvanceRes.reimbursement);

    const reportBeforePayout = await getFinancialReportData(
      prisma,
      farhanActor,
      M7_PERIOD_NOV,
      { cashAccountId: testCashAccount.id }
    );

    assert.equal(
      reportBeforePayout.operatingExpenses.totalOperatingExpense,
      70_000,
      "Total biaya operasional harus mencakup Rp40.000 langsung + Rp30.000 talangan = Rp70.000"
    );
    assert.equal(
      reportBeforePayout.actualCashOutflow.totalCashOutflow,
      40_000,
      "Pengeluaran talangan Rp30.000 TIDAK boleh langsung mengurangi saldo kas (kas keluar tetap Rp40.000)"
    );
    console.log(
      "✓ [Skenario 2] Expense talangan Rp30.000 masuk ke biaya operasional (total Rp70.000) tanpa langsung mengurangi saldo kas."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 5: Transaksi PENDING tidak masuk laporan arus kas terkonfirmasi
    // -------------------------------------------------------------------------
    await authorizedCreateExpense(prisma, farhanActor, {
      title: "Pengeluaran PENDING Uji M7",
      amount: 25_000,
      categoryId: parentCat.id,
      fundingSource: "DIRECT_CASH",
      confirmImmediately: false,
      cashAccountId: testCashAccount.id,
      expenseDate: dateNov15,
      idempotencyKey: "M7:EXP:PENDING:25K",
    });

    const reportAfterPending = await getFinancialReportData(
      prisma,
      farhanActor,
      M7_PERIOD_NOV,
      { cashAccountId: testCashAccount.id }
    );
    assert.equal(
      reportAfterPending.actualCashOutflow.totalCashOutflow,
      40_000,
      "Transaksi PENDING tidak boleh masuk ke laporan arus kas keluar terkonfirmasi"
    );
    assert.equal(
      reportAfterPending.operatingExpenses.totalOperatingExpense,
      70_000,
      "Transaksi PENDING tidak boleh masuk ke total biaya operasional terkonfirmasi"
    );
    assert.equal(reportAfterPending.operatingExpenses.pendingExpenseAmount, 25_000);
    console.log(
      "✓ [Skenario 5] Transaksi PENDING tidak masuk laporan arus kas maupun biaya operasional terkonfirmasi."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 3 & 1: Reimbursement payout mengurangi kas tanpa menggandakan
    //                 expense, serta Saldo Awal + Kas Masuk - Kas Keluar = Saldo Akhir
    // -------------------------------------------------------------------------
    await authorizedSettleReimbursementPayout(prisma, farhanActor, {
      reimbursementId: nabeelAdvanceRes.reimbursement.id,
      cashAccountId: testCashAccount.id,
      amount: 20_000,
      paidAt: dateNov15,
      idempotencyKey: "M7:REIMB:PAYOUT:20K",
      note: "Cicilan reimburse Nabeel Rp20.000",
    });

    const reportAfterPayout = await getFinancialReportData(
      prisma,
      farhanActor,
      M7_PERIOD_NOV,
      { cashAccountId: testCashAccount.id }
    );

    // Skenario 3: Kas keluar bertambah Rp20.000 (menjadi Rp60.000), tapi beban operasional tetap Rp70.000!
    assert.equal(
      reportAfterPayout.actualCashOutflow.reimbursementPayoutCashOutflow,
      20_000
    );
    assert.equal(reportAfterPayout.actualCashOutflow.totalCashOutflow, 60_000);
    assert.equal(
      reportAfterPayout.operatingExpenses.totalOperatingExpense,
      70_000,
      "Pencairan reimbursement Rp20.000 TIDAK boleh menggandakan beban operasional (tetap Rp70.000)"
    );
    console.log(
      "✓ [Skenario 3] Pencairan reimbursement mengurangi kas aktual tanpa menggandakan biaya operasional."
    );

    // Skenario 1: Saldo awal (Rp100.000) + Kas masuk (Rp150.000) - Kas keluar (Rp60.000) = Saldo akhir (Rp190.000)
    assert.equal(reportAfterPayout.actualCashInflow.openingBalance, 100_000);
    assert.equal(reportAfterPayout.actualCashInflow.totalCashInflow, 150_000);
    assert.equal(reportAfterPayout.actualCashOutflow.totalCashOutflow, 60_000);
    assert.equal(
      reportAfterPayout.actualCashInflow.openingBalance +
        reportAfterPayout.actualCashInflow.totalCashInflow -
        reportAfterPayout.actualCashOutflow.totalCashOutflow,
      reportAfterPayout.actualCashInflow.closingBalance,
      "Saldo awal + kas masuk - kas keluar wajib sama persis dengan saldo akhir"
    );
    assert.equal(reportAfterPayout.actualCashInflow.closingBalance, 190_000);
    console.log(
      "✓ [Skenario 1] Persamaan laporan (Saldo Awal Rp100.000 + Masuk Rp150.000 - Keluar Rp60.000 = Saldo Akhir Rp190.000) terverifikasi."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 6 & 8: Budget Rp100.000 dan realisasi Rp70.000 menghasilkan
    //                 sisa Rp30.000, dan reimbursement tidak menggandakan anggaran
    // -------------------------------------------------------------------------
    await authorizedUpsertMonthlyBudget(prisma, farhanActor, {
      period: M7_PERIOD_NOV,
      totalAmount: 100_000,
      note: "Anggaran uji November 2096",
    });

    await authorizedUpsertCategoryBudgetAllocation(prisma, farhanActor, {
      period: M7_PERIOD_NOV,
      categoryId: parentCat.id,
      amount: 100_000,
    });

    const budgetNovUnder = await getBudgetPageData(
      prisma,
      farhanActor,
      M7_PERIOD_NOV
    );

    assert.equal(budgetNovUnder.monthlyBudget.effectiveTotalBudget, 100_000);
    assert.equal(
      budgetNovUnder.monthlyBudget.totalRealizedAmount,
      70_000,
      "Realisasi anggaran harus berasal dari Expense CONFIRMED (Rp40.000 + Rp30.000 = Rp70.000), tidak menggandakan reimbursement payout Rp20.000"
    );
    assert.equal(
      budgetNovUnder.monthlyBudget.remainingAvailableAmount,
      30_000,
      "Budget Rp100.000 dengan realisasi Rp70.000 harus menyisakan Rp30.000"
    );
    assert.equal(budgetNovUnder.monthlyBudget.overBudgetAmount, 0);
    assert.equal(budgetNovUnder.monthlyBudget.isOverBudget, false);
    console.log(
      "✓ [Skenario 6 & 8] Budget Rp100.000 dan realisasi Rp70.000 menghasilkan sisa Rp30.000, serta reimbursement tidak menggandakan realisasi anggaran."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 7: Realisasi Rp120.000 terhadap budget Rp100.000 menghasilkan
    //             over-budget Rp20.000
    // -------------------------------------------------------------------------
    // Tambahkan pengeluaran CONFIRMED Rp50.000 lagi pada periode 2096-11 sehingga total realisasi menjadi Rp70.000 + Rp50.000 = Rp120.000
    await authorizedCreateExpense(prisma, farhanActor, {
      title: "Perawatan Tambahan November Rp50.000",
      amount: 50_000,
      categoryId: subCatWifi.id,
      fundingSource: "DIRECT_CASH",
      confirmImmediately: true,
      cashAccountId: testCashAccount.id,
      expenseDate: dateNov15,
      idempotencyKey: "M7:EXP:DIRECT:50K",
    });

    const budgetNovOver = await getBudgetPageData(
      prisma,
      farhanActor,
      M7_PERIOD_NOV
    );
    assert.equal(budgetNovOver.monthlyBudget.effectiveTotalBudget, 100_000);
    assert.equal(budgetNovOver.monthlyBudget.totalRealizedAmount, 120_000);
    assert.equal(budgetNovOver.monthlyBudget.remainingBalance, -20_000);
    assert.equal(budgetNovOver.monthlyBudget.remainingAvailableAmount, 0);
    assert.equal(
      budgetNovOver.monthlyBudget.overBudgetAmount,
      20_000,
      "Realisasi Rp120.000 terhadap budget Rp100.000 harus menghasilkan over-budget Rp20.000"
    );
    assert.equal(budgetNovOver.monthlyBudget.isOverBudget, true);
    assert.equal(budgetNovOver.monthlyBudget.alertLevel, "OVER_BUDGET");
    console.log(
      "✓ [Skenario 7] Realisasi Rp120.000 terhadap budget Rp100.000 menghasilkan over-budget Rp20.000 (status OVER_BUDGET)."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 9 & 4: Perubahan budget periode baru (2096-12) tidak mengubah
    //                 histori lama (2096-11), & filter periode laporan konsisten
    // -------------------------------------------------------------------------
    await authorizedUpsertMonthlyBudget(prisma, farhanActor, {
      period: M7_PERIOD_DEC,
      totalAmount: 250_000,
      note: "Anggaran periode baru Desember 2096",
    });

    await authorizedCreateExpense(prisma, farhanActor, {
      title: "Pengeluaran Periode Desember 2096",
      amount: 45_000,
      categoryId: parentCat.id,
      fundingSource: "DIRECT_CASH",
      confirmImmediately: true,
      cashAccountId: testCashAccount.id,
      expenseDate: dateDec05,
      idempotencyKey: "M7:EXP:DEC:45K",
    });

    const budgetNovAfterDecChange = await getBudgetPageData(
      prisma,
      farhanActor,
      M7_PERIOD_NOV
    );
    const budgetDec = await getBudgetPageData(
      prisma,
      farhanActor,
      M7_PERIOD_DEC
    );

    assert.equal(
      budgetNovAfterDecChange.monthlyBudget.effectiveTotalBudget,
      100_000,
      "Perubahan budget periode 2096-12 tidak boleh mengubah budget histori periode 2096-11 (tetap Rp100.000)"
    );
    assert.equal(
      budgetNovAfterDecChange.monthlyBudget.totalRealizedAmount,
      120_000
    );
    assert.equal(budgetDec.monthlyBudget.effectiveTotalBudget, 250_000);
    assert.equal(budgetDec.monthlyBudget.totalRealizedAmount, 45_000);
    assert.equal(budgetDec.monthlyBudget.remainingAvailableAmount, 205_000);

    // Verifikasi Skenario 4: Saldo akhir 2096-11 (Rp190.000 - Rp50.000 = Rp140.000) menjadi saldo awal 2096-12!
    const reportNovFinal = await getFinancialReportData(
      prisma,
      farhanActor,
      M7_PERIOD_NOV,
      { cashAccountId: testCashAccount.id }
    );
    const reportDec = await getFinancialReportData(
      prisma,
      farhanActor,
      M7_PERIOD_DEC,
      { cashAccountId: testCashAccount.id }
    );

    assert.equal(reportNovFinal.actualCashInflow.closingBalance, 140_000);
    assert.equal(
      reportDec.actualCashInflow.openingBalance,
      reportNovFinal.actualCashInflow.closingBalance,
      "Saldo awal periode 2096-12 wajib sama dengan saldo akhir periode 2096-11 (Rp140.000)"
    );
    assert.equal(reportDec.operatingExpenses.totalOperatingExpense, 45_000);
    assert.equal(reportDec.actualCashInflow.closingBalance, 95_000);
    console.log(
      "✓ [Skenario 4 & 9] Filter periode laporan konsisten (Closing Nov = Opening Dec = Rp140.000) & perubahan budget periode baru tidak mengubah histori lama."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 10: Export CSV mencakup data sesuai filter dan terlindung dari
    //              formula injection
    // -------------------------------------------------------------------------
    assert.equal(
      sanitizeCsvCell("=SUM(A1:A2)"),
      `"'=SUM(A1:A2)"`,
      "Sel CSV yang diawali '=' harus di-prefix tanda kutip tunggal untuk mencegah formula injection"
    );
    assert.equal(sanitizeCsvCell("+cmd|' /C calc'!A0"), `"'+cmd|' /C calc'!A0"`);
    assert.equal(sanitizeCsvCell("-50000"), `"'-50000"`);
    assert.equal(sanitizeCsvCell("@IMPORTXML()"), `"'@IMPORTXML()"`);

    const csvSummaryNov = await exportFinancialReportCsv(prisma, farhanActor, {
      period: M7_PERIOD_NOV,
      type: "summary",
      cashAccountId: testCashAccount.id,
    });
    assert.ok(csvSummaryNov.csvContent.includes(M7_PERIOD_NOV));
    assert.ok(csvSummaryNov.csvContent.includes("140000")); // Closing balance Nov

    const csvContributionsNov = await exportFinancialReportCsv(
      prisma,
      farhanActor,
      {
        period: M7_PERIOD_NOV,
        type: "contributions",
        cashAccountId: testCashAccount.id,
      }
    );
    assert.ok(
      csvContributionsNov.csvContent.includes("'=SUM(A1:A2)"),
      "Catatan pembayaran yang diawali '=SUM' harus di-escape menjadi \"'=SUM\" di dalam hasil export CSV"
    );
    assert.ok(!csvContributionsNov.csvContent.includes("passwordHash"));
    assert.ok(!csvContributionsNov.csvContent.includes("$2b$"));
    console.log(
      "✓ [Skenario 10] Export CSV akurat sesuai filter periode dan terlindung dari Spreadsheet Formula Injection."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 11: User tidak login tidak dapat mengakses laporan privat atau
    //              melakukan mutasi
    // -------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        await getFinancialReportData(prisma, null, M7_PERIOD_NOV);
      },
      (err: unknown) => err instanceof UnauthorizedError
    );

    await assert.rejects(
      async () => {
        await exportFinancialReportCsv(prisma, null, {
          period: M7_PERIOD_NOV,
          type: "summary",
        });
      },
      (err: unknown) => err instanceof UnauthorizedError
    );

    await assert.rejects(
      async () => {
        await authorizedUpsertMonthlyBudget(prisma, null, {
          period: M7_PERIOD_NOV,
          totalAmount: 100_000,
        });
      },
      (err: unknown) => err instanceof UnauthorizedError
    );

    await assert.rejects(
      async () => {
        await authorizedUpdateCashAccountSettings(prisma, null, {
          kostName: "Ilegal",
          accountName: "Ilegal",
          provider: "DANA",
          custodianMemberId: testMembersConfig[0].id,
        });
      },
      (err: unknown) => err instanceof UnauthorizedError
    );
    console.log(
      "✓ [Skenario 11] Pengguna tanpa sesi login ditolak saat mengakses laporan privat, export CSV, maupun mutasi anggaran/pengaturan."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 12: Pergantian password memerlukan verifikasi password lama yang benar
    // -------------------------------------------------------------------------
    const newFarhanPassword = generateEphemeralPassword();

    // Password lama salah harus ditolak
    await assert.rejects(
      async () => {
        await authorizedChangeOwnPassword(prisma, farhanActor, {
          currentPassword: "PasswordLamaYangSalah123!",
          newPassword: newFarhanPassword,
          confirmNewPassword: newFarhanPassword,
        });
      },
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes("Password lama yang dimasukkan tidak sesuai"),
      "Pergantian password dengan password lama yang salah wajib ditolak"
    );

    // Password lama benar berhasil mengubah password
    await authorizedChangeOwnPassword(prisma, farhanActor, {
      currentPassword: testMembersConfig[0].password,
      newPassword: newFarhanPassword,
      confirmNewPassword: newFarhanPassword,
    });

    // Verifikasi login dengan password baru berhasil
    const reLogin = await authenticateMemberCredentials(prisma, {
      username: testMembersConfig[0].username,
      password: newFarhanPassword,
    });
    assert.ok(reLogin.sessionToken);

    // Uji pencabutan sesi perangkat lain
    const revokeRes = await authorizedRevokeOtherActiveSessions(
      prisma,
      farhanActor
    );
    assert.ok(revokeRes.revokedCount >= 1);
    console.log(
      "✓ [Skenario 12] Pergantian password memverifikasi password lama dengan benar & mendukung pencabutan sesi lain."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 13 & 14: AuditLog tercatat untuk perubahan pengaturan penting,
    //                   serta Rekonsiliasi & Koreksi Saldo memerlukan alasan
    //                   dan tidak mengubah histori ledger lama
    // -------------------------------------------------------------------------
    await authorizedUpdateCashAccountSettings(prisma, farhanActor, {
      kostName: "KostKas Bersama Uji M7",
      accountName: "DANA Kas Kost Uji M7 Updated",
      provider: "DANA",
      custodianMemberId: nabeelActor.memberId,
      cashAccountId: testCashAccount.id,
    });

    await authorizedUpdateContributionTariffSetting(prisma, farhanActor, {
      effectiveFromPeriod: M7_PERIOD_DEC,
      name: "Tarif Uji M7 Desember",
      amountPerMember: 165_000,
    });

    await authorizedUpdateAppPreferences(prisma, farhanActor, {
      kostName: "KostKas Bersama Uji M7",
      dateFormat: "dd MMM yyyy",
    });

    // Skenario 14a: Evaluasi rekonsiliasi manual menghitung selisih tanpa membuat CashMovement otomatis
    const ledgerBeforeRecon = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    const reconCheck = evaluateManualCashReconciliation(
      ledgerBeforeRecon.actualBalance,
      ledgerBeforeRecon.actualBalance + 15_000
    );
    assert.equal(reconCheck.status, "SURPLUS_IN_DANA");
    assert.equal(reconCheck.discrepancyAmount, 15_000);

    const ledgerAfterPureRecon = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    assert.equal(
      ledgerAfterPureRecon.confirmedMovementCount,
      ledgerBeforeRecon.confirmedMovementCount,
      "Evaluasi rekonsiliasi manual TIDAK boleh membuat penyesuaian saldo otomatis"
    );

    // Skenario 14b: Koreksi saldo tanpa alasan yang memadai (< 5 karakter) wajib ditolak
    await assert.rejects(
      async () => {
        await authorizedRecordReconciliationAdjustment(prisma, farhanActor, {
          direction: "IN",
          amount: 15_000,
          reason: "abc", // Terlalu pendek
          idempotencyKey: "M7:RECON:INVALID",
          cashAccountId: testCashAccount.id,
        });
      },
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes("Alasan koreksi saldo wajib diisi"),
      "Koreksi saldo tanpa alasan yang memadai wajib ditolak"
    );

    // Skenario 14c: Koreksi saldo dengan alasan sah mencatat CashMovement ADJUSTMENT tanpa menghapus/mengubah mutasi lama
    const adjMovement = await authorizedRecordReconciliationAdjustment(
      prisma,
      farhanActor,
      {
        direction: "IN",
        amount: 15_000,
        reason: "Penyesuaian bunga saldo kas DANA",
        idempotencyKey: "M7:RECON:VALID:15K",
        cashAccountId: testCashAccount.id,
      }
    );
    assert.equal(adjMovement.category, "ADJUSTMENT");
    assert.equal(adjMovement.amount, 15_000);

    const ledgerAfterAdjustment = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    assert.equal(
      ledgerAfterAdjustment.actualBalance,
      ledgerBeforeRecon.actualBalance + 15_000
    );
    assert.equal(
      ledgerAfterAdjustment.confirmedMovementCount,
      ledgerBeforeRecon.confirmedMovementCount + 1,
      "Koreksi saldo menambah entri ADJUSTMENT baru tanpa menghapus histori mutasi lama"
    );

    // Skenario 13: Verifikasi AuditLog pada SettingsPageData
    const settingsData = await getSettingsPageData(prisma, farhanActor, {
      period: "ALL",
      actorMemberId: farhanActor.memberId,
      actionCategory: "ALL",
    });

    const recordedActions = settingsData.auditLogs.items.map((i) => i.action);
    assert.ok(recordedActions.includes("UPDATE_CASH_ACCOUNT_SETTINGS"));
    assert.ok(recordedActions.includes("UPSERT_CONTRIBUTION_POLICY"));
    assert.ok(recordedActions.includes("UPDATE_APP_PREFERENCES"));
    assert.ok(recordedActions.includes("CHANGE_PASSWORD"));
    assert.ok(recordedActions.includes("RECORD_ADJUSTMENT"));

    for (const item of settingsData.auditLogs.items) {
      assert.ok(
        !item.summary.includes("$2b$") && !item.summary.includes(newFarhanPassword),
        "AuditLog tidak boleh membocorkan password atau bcrypt hash"
      );
    }

    console.log(
      "✓ [Skenario 13 & 14] AuditLog mencatat seluruh perubahan penting secara aman & koreksi rekonsiliasi mewajibkan alasan tanpa merusak histori ledger."
    );

    console.log(
      "\n=== SELURUH SKENARIO PENGUJIAN MILESTONE 7 LULUS 100% ==="
    );
  } finally {
    if (originalPref) {
      await prisma.appPreference.upsert({
        where: { id: "default" },
        update: {
          kostName: originalPref.kostName,
          currencyCode: originalPref.currencyCode,
          timezone: originalPref.timezone,
          dateFormat: originalPref.dateFormat,
        },
        create: {
          id: "default",
          kostName: originalPref.kostName,
          currencyCode: originalPref.currencyCode,
          timezone: originalPref.timezone,
          dateFormat: originalPref.dateFormat,
        },
      });
    }
    await cleanupM7TestData();
    await prisma.$disconnect();
  }
}

runMilestone7Tests().catch((error: unknown) => {
  console.error("\n[M7 TEST FAILED]", error);
  process.exitCode = 1;
});

