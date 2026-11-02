import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "./prisma";
import {
  createAdditionalPeriodCharges,
  generateRegularPeriodCharges,
  getCashLedgerSummary,
  getPeriodObligationSummary,
  getTotalConfirmedOperatingExpenses,
  recordContributionPayment,
  recordDirectCashExpense,
  recordLedgerEntry,
  recordMemberAdvanceExpense,
  settleReimbursementPayout,
  upsertContributionPolicy,
} from "./financial-service";

const TEST_MEMBER_IDS = [
  "99999999-0000-4000-8000-000000000001",
  "99999999-0000-4000-8000-000000000002",
  "99999999-0000-4000-8000-000000000003",
] as const;

const TEST_CASH_ACCOUNT_CODE = "TEST_DANA_KAS_ISOLATED";
const TEST_POLICY_NOV_CODE = "TEST_POLICY_2026_11";
const TEST_POLICY_DEC_CODE = "TEST_POLICY_2026_12";
const TEST_CATEGORY_SLUG = "test-kategori-operasional";
const TEST_PERIOD_NOV = "2099-11";
const TEST_PERIOD_DEC = "2099-12";

async function cleanupIsolatedTestData(): Promise<void> {
  const testAccount = await prisma.cashAccount.findUnique({
    where: { code: TEST_CASH_ACCOUNT_CODE },
  });

  if (testAccount) {
    await prisma.cashMovement.deleteMany({
      where: { cashAccountId: testAccount.id },
    });
    await prisma.reimbursementPayout.deleteMany({
      where: { cashAccountId: testAccount.id },
    });
    await prisma.payment.deleteMany({
      where: { cashAccountId: testAccount.id },
    });
  }

  await prisma.reimbursement.deleteMany({
    where: { beneficiaryMemberId: { in: [...TEST_MEMBER_IDS] } },
  });

  const testCategory = await prisma.expenseCategory.findUnique({
    where: { slug: TEST_CATEGORY_SLUG },
  });

  if (testCategory) {
    await prisma.expense.deleteMany({
      where: { categoryId: testCategory.id },
    });
  }

  await prisma.contributionCharge.deleteMany({
    where: { memberId: { in: [...TEST_MEMBER_IDS] } },
  });

  await prisma.contributionPolicy.deleteMany({
    where: { code: { in: [TEST_POLICY_NOV_CODE, TEST_POLICY_DEC_CODE] } },
  });

  if (testAccount) {
    await prisma.cashAccount.delete({
      where: { id: testAccount.id },
    });
  }

  if (testCategory) {
    await prisma.expenseCategory.delete({
      where: { id: testCategory.id },
    });
  }

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorMemberId: { in: [...TEST_MEMBER_IDS] } },
        { entityId: { in: [TEST_PERIOD_NOV, TEST_PERIOD_DEC] } },
      ],
    },
  });

  await prisma.member.deleteMany({
    where: { id: { in: [...TEST_MEMBER_IDS] } },
  });
}

async function runTests(): Promise<void> {
  console.log("=== Memulai Pengujian Otomatis Financial Service KostKas ===");

  await cleanupIsolatedTestData();

  try {
    // Persiapan entitas uji terisolasi (3 anggota, 1 akun DANA uji, 1 kategori pengeluaran uji)
    await prisma.member.createMany({
      data: [
        {
          id: TEST_MEMBER_IDS[0],
          name: "Farhan (Test)",
          joinedAt: new Date("2099-10-01T00:00:00.000Z"),
        },
        {
          id: TEST_MEMBER_IDS[1],
          name: "Nabeel (Test)",
          joinedAt: new Date("2099-10-01T00:00:00.000Z"),
        },
        {
          id: TEST_MEMBER_IDS[2],
          name: "Alzha (Test)",
          joinedAt: new Date("2099-10-01T00:00:00.000Z"),
        },
      ],
    });

    const testCashAccount = await prisma.cashAccount.create({
      data: {
        code: TEST_CASH_ACCOUNT_CODE,
        name: "Akun DANA Uji Terisolasi",
        provider: "DANA",
        custodianMemberId: TEST_MEMBER_IDS[0],
      },
    });

    const testCategory = await prisma.expenseCategory.create({
      data: {
        slug: TEST_CATEGORY_SLUG,
        name: "Kategori Operasional Uji",
      },
    });

    // Catat saldo awal Rp50.000 untuk menguji perhitungan buku besar (ledger)
    await recordLedgerEntry(prisma, {
      cashAccountId: testCashAccount.id,
      direction: "IN",
      category: "OPENING_BALANCE",
      amount: 50_000,
      description: "Saldo awal kas DANA uji",
      idempotencyKey: "TEST:OPENING:2099-11",
      actorMemberId: TEST_MEMBER_IDS[0],
    });

    // -------------------------------------------------------------------------
    // SKENARIO 1: 3 anggota × Rp150.000 menghasilkan total tagihan Rp450.000
    // -------------------------------------------------------------------------
    const policyNov = await upsertContributionPolicy(prisma, {
      code: TEST_POLICY_NOV_CODE,
      name: "Tarif Iuran Rutin Uji November",
      amountPerMember: 150_000,
      effectiveFromPeriod: TEST_PERIOD_NOV,
      actorMemberId: TEST_MEMBER_IDS[0],
    });

    const regularNov = await generateRegularPeriodCharges(prisma, {
      period: TEST_PERIOD_NOV,
      policyCode: policyNov.code,
      memberIds: [...TEST_MEMBER_IDS],
      actorMemberId: TEST_MEMBER_IDS[0],
    });

    assert.equal(regularNov.charges.length, 3, "Harus menghasilkan 3 tagihan anggota");
    assert.equal(
      regularNov.totalBilledAmount,
      450_000,
      "3 anggota × Rp150.000 harus menghasilkan total tagihan Rp450.000"
    );
    console.log("✓ [Skenario 1] 3 anggota × Rp150.000 = Rp450.000 terverifikasi.");

    // -------------------------------------------------------------------------
    // SKENARIO 2: Tagihan tambahan Rp50.000/orang menghasilkan kewajiban
    //             tambahan Rp150.000 tanpa menghapus tagihan awal Rp450.000
    // -------------------------------------------------------------------------
    const additionalNov = await createAdditionalPeriodCharges(prisma, {
      period: TEST_PERIOD_NOV,
      amountPerMember: 50_000,
      title: "Patungan Tambahan Token Listrik & Galon",
      batchIdempotencyKey: "TEST:ADD:2099-11:BATCH-1",
      memberIds: [...TEST_MEMBER_IDS],
      actorMemberId: TEST_MEMBER_IDS[0],
    });

    assert.equal(
      additionalNov.totalBilledAmount,
      150_000,
      "Tagihan tambahan 3 × Rp50.000 harus sebesar Rp150.000"
    );

    const summaryNov = await getPeriodObligationSummary(prisma, TEST_PERIOD_NOV, {
      memberIds: [...TEST_MEMBER_IDS],
    });
    assert.equal(summaryNov.regularTotal, 450_000, "Tagihan rutin awal tetap Rp450.000");
    assert.equal(summaryNov.additionalTotal, 150_000, "Tagihan tambahan tercatat Rp150.000");
    assert.equal(
      summaryNov.totalBilled,
      600_000,
      "Total kewajiban periode menjadi Rp600.000"
    );
    console.log(
      "✓ [Skenario 2] Tagihan tambahan Rp50.000/orang = Rp150.000 (total Rp600.000) terverifikasi."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 3: Pembayaran cicilan Rp100.000 pada tagihan Rp150.000
    //             menyisakan Rp50.000 (serta pembayaran PENDING tidak menambah saldo)
    // -------------------------------------------------------------------------
    const nabeelRegularCharge = regularNov.charges.find(
      (c) => c.memberId === TEST_MEMBER_IDS[1]
    );
    assert.ok(nabeelRegularCharge, "Tagihan rutin Nabeel harus ditemukan");

    // 3a. Pembayaran PENDING belum dikonfirmasi tidak boleh menambah saldo kas
    const ledgerBeforePending = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    await recordContributionPayment(prisma, {
      memberId: TEST_MEMBER_IDS[2],
      cashAccountId: testCashAccount.id,
      amount: 150_000,
      targetChargeIds: [],
      idempotencyKey: "TEST:PAY:PENDING:ALZHA:1",
      confirmImmediately: false,
      note: "Pembayaran menunggu verifikasi mutasi DANA",
    });
    const ledgerAfterPending = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    assert.equal(
      ledgerAfterPending.actualBalance,
      ledgerBeforePending.actualBalance,
      "Pembayaran PENDING tidak boleh mengubah saldo kas aktual"
    );

    // 3b. Pembayaran cicilan (parsial) Rp100.000 terkonfirmasi oleh Nabeel
    const partialPaymentResult = await recordContributionPayment(prisma, {
      memberId: TEST_MEMBER_IDS[1],
      cashAccountId: testCashAccount.id,
      amount: 100_000,
      targetChargeIds: [nabeelRegularCharge.id],
      idempotencyKey: "TEST:PAY:PARTIAL:NABEEL:1",
      confirmImmediately: true,
      note: "Cicilan tahap 1 iuran Nabeel",
    });

    assert.equal(partialPaymentResult.wasDuplicateRequest, false);
    assert.equal(partialPaymentResult.updatedCharges.length, 1);
    assert.equal(partialPaymentResult.updatedCharges[0].allocatedAmount, 100_000);
    assert.equal(
      partialPaymentResult.updatedCharges[0].remainingAmount,
      50_000,
      "Cicilan Rp100.000 pada tagihan Rp150.000 harus menyisakan Rp50.000"
    );
    assert.equal(partialPaymentResult.updatedCharges[0].status, "PARTIALLY_PAID");
    console.log(
      "✓ [Skenario 3] Cicilan Rp100.000 dari Rp150.000 menyisakan Rp50.000 (status PARTIALLY_PAID) terverifikasi."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 4: Perubahan tarif periode berikutnya tidak mengubah tagihan
    //             periode sebelumnya
    // -------------------------------------------------------------------------
    const policyDec = await upsertContributionPolicy(prisma, {
      code: TEST_POLICY_DEC_CODE,
      name: "Tarif Iuran Baru Uji Desember",
      amountPerMember: 175_000,
      effectiveFromPeriod: TEST_PERIOD_DEC,
      closePreviousPolicyCode: TEST_POLICY_NOV_CODE,
      actorMemberId: TEST_MEMBER_IDS[0],
    });

    const regularDec = await generateRegularPeriodCharges(prisma, {
      period: TEST_PERIOD_DEC,
      policyCode: policyDec.code,
      memberIds: [...TEST_MEMBER_IDS],
      actorMemberId: TEST_MEMBER_IDS[0],
    });

    assert.equal(
      regularDec.totalBilledAmount,
      525_000,
      "Periode baru (3 × Rp175.000) harus berjumlah Rp525.000"
    );

    const summaryNovAfterTariffChange = await getPeriodObligationSummary(
      prisma,
      TEST_PERIOD_NOV,
      { memberIds: [...TEST_MEMBER_IDS] }
    );
    assert.equal(
      summaryNovAfterTariffChange.regularTotal,
      450_000,
      "Perubahan tarif periode berikutnya tidak boleh mengubah tagihan rutin periode sebelumnya (tetap Rp450.000)"
    );
    console.log(
      "✓ [Skenario 4] Perubahan tarif periode berikutnya tidak mengubah tagihan histori periode sebelumnya."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 5: Pengeluaran langsung Rp40.000 mengurangi saldo kas Rp40.000
    // -------------------------------------------------------------------------
    const balanceBeforeDirectExpense = (
      await getCashLedgerSummary(prisma, testCashAccount.id)
    ).actualBalance;

    const directExpenseRes = await recordDirectCashExpense(prisma, {
      categoryId: testCategory.id,
      cashAccountId: testCashAccount.id,
      title: "Beli 2 Air Galon Isi Ulang",
      amount: 40_000,
      idempotencyKey: "TEST:EXPENSE:DIRECT:GALON:1",
      recordedByMemberId: TEST_MEMBER_IDS[0],
    });

    const balanceAfterDirectExpense = (
      await getCashLedgerSummary(prisma, testCashAccount.id)
    ).actualBalance;

    assert.equal(
      balanceBeforeDirectExpense - balanceAfterDirectExpense,
      40_000,
      "Pengeluaran langsung Rp40.000 harus mengurangi saldo kas DANA sebesar Rp40.000"
    );
    console.log(
      "✓ [Skenario 5] Pengeluaran kas langsung Rp40.000 mengurangi saldo kas Rp40.000 terverifikasi."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 6: Pengeluaran talangan anggota Rp40.000 membuat kewajiban
    //             reimburse tanpa mengurangi saldo kas DANA secara langsung
    // -------------------------------------------------------------------------
    const balanceBeforeAdvance = (
      await getCashLedgerSummary(prisma, testCashAccount.id)
    ).actualBalance;

    const advanceExpenseRes = await recordMemberAdvanceExpense(prisma, {
      categoryId: testCategory.id,
      advancedByMemberId: TEST_MEMBER_IDS[2],
      title: "Talangan Sabun & Pembersih Lantai",
      amount: 40_000,
      idempotencyKey: "TEST:EXPENSE:ADVANCE:SABUN:1",
    });

    const balanceAfterAdvance = (
      await getCashLedgerSummary(prisma, testCashAccount.id)
    ).actualBalance;

    assert.equal(
      balanceAfterAdvance,
      balanceBeforeAdvance,
      "Pengeluaran talangan anggota TIDAK boleh mengurangi saldo kas DANA secara langsung"
    );
    assert.equal(advanceExpenseRes.reimbursement.totalAmount, 40_000);
    assert.equal(advanceExpenseRes.reimbursement.settledAmount, 0);
    assert.equal(advanceExpenseRes.reimbursement.status, "OUTSTANDING");
    console.log(
      "✓ [Skenario 6] Talangan anggota Rp40.000 mencatat utang reimburse tanpa memotong saldo kas DANA."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 7: Pencairan reimburse Rp20.000 dari utang Rp40.000 menyisakan
    //             utang Rp20.000 dan mengurangi saldo kas DANA Rp20.000
    // -------------------------------------------------------------------------
    const operatingExpenseBeforePayout = await getTotalConfirmedOperatingExpenses(
      prisma,
      {
        expenseIds: [
          directExpenseRes.expense.id,
          advanceExpenseRes.expense.id,
        ],
      }
    );
    assert.equal(
      operatingExpenseBeforePayout,
      80_000,
      "Total biaya operasional sebelum pencairan reimburse adalah Rp80.000 (Rp40.000 langsung + Rp40.000 talangan)"
    );

    const payoutRes = await settleReimbursementPayout(prisma, {
      reimbursementId: advanceExpenseRes.reimbursement.id,
      cashAccountId: testCashAccount.id,
      amount: 20_000,
      idempotencyKey: "TEST:REIMBURSE:PAYOUT:1",
      actorMemberId: TEST_MEMBER_IDS[0],
      note: "Pencairan reimburse tahap 1 ke Alzha",
    });

    const balanceAfterPayout = (
      await getCashLedgerSummary(prisma, testCashAccount.id)
    ).actualBalance;

    assert.equal(
      payoutRes.remainingDebtAmount,
      20_000,
      "Pencairan Rp20.000 dari utang Rp40.000 harus menyisakan utang Rp20.000"
    );
    assert.equal(payoutRes.reimbursement.status, "PARTIALLY_SETTLED");
    assert.equal(
      balanceBeforeAdvance - balanceAfterPayout,
      20_000,
      "Pencairan reimburse Rp20.000 harus mengurangi saldo kas DANA sebesar Rp20.000"
    );
    console.log(
      "✓ [Skenario 7] Pencairan reimburse parsial Rp20.000 dari Rp40.000 menyisakan utang Rp20.000."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 8: Pelunasan reimburse tidak menghitung biaya operasional 2 kali
    // -------------------------------------------------------------------------
    const operatingExpenseAfterPayout = await getTotalConfirmedOperatingExpenses(
      prisma,
      {
        expenseIds: [
          directExpenseRes.expense.id,
          advanceExpenseRes.expense.id,
        ],
      }
    );
    assert.equal(
      operatingExpenseAfterPayout,
      80_000,
      "Pencairan reimburse TIDAK boleh menambah total biaya operasional menjadi dua kali lipat"
    );
    console.log(
      "✓ [Skenario 8] Pelunasan reimburse tidak menghitung biaya operasional dua kali (tetap Rp80.000)."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 9: Proses pembayaran berulang dengan idempotencyKey yang sama
    //             tidak membuat duplikasi transaksi
    // -------------------------------------------------------------------------
    const balanceBeforeDuplicateRetry = (
      await getCashLedgerSummary(prisma, testCashAccount.id)
    ).actualBalance;

    const duplicatePaymentAttempt = await recordContributionPayment(prisma, {
      memberId: TEST_MEMBER_IDS[1],
      cashAccountId: testCashAccount.id,
      amount: 100_000,
      targetChargeIds: [nabeelRegularCharge.id],
      idempotencyKey: "TEST:PAY:PARTIAL:NABEEL:1", // Key yang sama dengan Skenario 3b
      confirmImmediately: true,
    });

    const balanceAfterDuplicateRetry = (
      await getCashLedgerSummary(prisma, testCashAccount.id)
    ).actualBalance;

    assert.equal(
      duplicatePaymentAttempt.wasDuplicateRequest,
      true,
      "Request dengan idempotencyKey yang sama harus terdeteksi sebagai duplikat"
    );
    assert.equal(
      duplicatePaymentAttempt.payment.id,
      partialPaymentResult.payment.id,
      "Harus mengembalikan record Payment yang sama"
    );
    assert.equal(
      balanceAfterDuplicateRetry,
      balanceBeforeDuplicateRetry,
      "Request duplikat tidak boleh menambah saldo kas dua kali"
    );
    assert.equal(
      duplicatePaymentAttempt.updatedCharges[0].remainingAmount,
      50_000,
      "Sisa tagihan Nabeel tetap Rp50.000 (tidak terpotong ganda)"
    );
    console.log(
      "✓ [Skenario 9] Perlindungan idempotency mencegah duplikasi pembayaran dan mutasi kas ganda."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 10: Saldo kas yang dihitung dari ledger konsisten dengan
    //              seluruh pergerakan kas terkonfirmasi (CashMovement)
    // -------------------------------------------------------------------------
    // Rincian mutasi CONFIRMED pada akun kas uji:
    // + Rp50.000  (OPENING_BALANCE)
    // + Rp100.000 (CONTRIBUTION_PAYMENT Nabeel; pembayaran PENDING Alzha Rp150.000 diabaikan)
    // - Rp40.000  (DIRECT_EXPENSE Galon; talangan Sabun Rp40.000 tidak memotong kas langsung)
    // - Rp20.000  (REIMBURSEMENT_PAYOUT tahap 1 ke Alzha)
    // -------------------------------------------------------------------------
    // Total Inflow Terkonfirmasi  = Rp150.000
    // Total Outflow Terkonfirmasi = Rp60.000
    // Saldo Aktual Buku Besar     = Rp90.000
    const finalLedger = await getCashLedgerSummary(prisma, testCashAccount.id);

    assert.equal(
      finalLedger.confirmedInflowTotal,
      150_000,
      "Total kas masuk CONFIRMED harus Rp150.000 (Rp50.000 saldo awal + Rp100.000 cicilan Nabeel)"
    );
    assert.equal(
      finalLedger.confirmedOutflowTotal,
      60_000,
      "Total kas keluar CONFIRMED harus Rp60.000 (Rp40.000 galon + Rp20.000 pencairan reimburse)"
    );
    assert.equal(
      finalLedger.actualBalance,
      90_000,
      "Saldo kas aktual pada ledger harus konsisten sebesar Rp90.000"
    );
    assert.equal(
      finalLedger.confirmedMovementCount,
      4,
      "Terdapat tepat 4 pergerakan kas CONFIRMED pada buku besar"
    );
    console.log(
      "✓ [Skenario 10] Saldo kas buku besar (Rp90.000) konsisten 100% dengan seluruh pergerakan kas CONFIRMED."
    );

    console.log("\n=== Seluruh 10 Skenario Pengujian Keuangan LULUS 100% ===");
  } finally {
    await cleanupIsolatedTestData();
  }
}

runTests()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[Test Suite] GAGAL:\n${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

