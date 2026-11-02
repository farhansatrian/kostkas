import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  authenticateMemberCredentials,
  UnauthorizedError,
  upsertMemberAccountCredentials,
  validateDatabaseSessionToken,
} from "./auth";
import { getLiveDashboardData } from "./dashboard-service";
import {
  createExpenseCategory,
  deleteUnusedExpenseCategory,
  listExpenseCategories,
  setExpenseCategoryActiveStatus,
} from "./expense-category-service";
import {
  authorizedConfirmPendingExpense,
  authorizedCreateExpense,
  authorizedCreateReimbursementClaim,
  authorizedRecordLedgerAdjustment,
  authorizedReverseOrVoidExpense,
  authorizedSettleReimbursementPayout,
  getExpensesPageData,
  getReimbursementsPageData,
} from "./expense-reimbursement-service";
import {
  getCashLedgerSummary,
  getTotalConfirmedOperatingExpenses,
} from "./financial-service";
import { prisma } from "./test-db";

const M6_TEST_MEMBER_IDS = [
  "77777777-0000-4000-8000-000000000001",
  "77777777-0000-4000-8000-000000000002",
  "77777777-0000-4000-8000-000000000003",
] as const;

const M6_TEST_USERNAMES = [
  "test_m6_farhan",
  "test_m6_nabeel",
  "test_m6_alzha",
] as const;

const M6_CASH_ACCOUNT_CODE = "TEST_M6_DANA_ACCOUNT";
const M6_PARENT_CAT_SLUG = "test-m6-konsumsi-bersama";
const M6_SUB_CAT_SLUG = "test-m6-air-galon";

function generateEphemeralPassword(): string {
  return `EphemM6#${crypto.randomBytes(12).toString("hex")}`;
}

async function cleanupM6TestData(): Promise<void> {
  const testCashAccount = await prisma.cashAccount.findUnique({
    where: { code: M6_CASH_ACCOUNT_CODE },
  });

  if (testCashAccount) {
    await prisma.cashMovement.deleteMany({
      where: { cashAccountId: testCashAccount.id },
    });
    await prisma.reimbursementPayout.deleteMany({
      where: { cashAccountId: testCashAccount.id },
    });
    await prisma.expense.deleteMany({
      where: { cashAccountId: testCashAccount.id },
    });
  }

  await prisma.cashMovement.deleteMany({
    where: { actorMemberId: { in: [...M6_TEST_MEMBER_IDS] } },
  });

  const testExpenses = await prisma.expense.findMany({
    where: {
      OR: [
        { recordedByMemberId: { in: [...M6_TEST_MEMBER_IDS] } },
        { advancedByMemberId: { in: [...M6_TEST_MEMBER_IDS] } },
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

  // Hapus subkategori dinamis & kategori uji M6
  const m6Categories = await prisma.expenseCategory.findMany({
    where: {
      OR: [
        { slug: { startsWith: "test-m6-" } },
        { name: { startsWith: "Uji M6" } },
      ],
    },
    select: { id: true, parentId: true },
  });

  const childCatIds = m6Categories
    .filter((c) => c.parentId !== null)
    .map((c) => c.id);
  const parentCatIds = m6Categories
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
    where: { actorMemberId: { in: [...M6_TEST_MEMBER_IDS] } },
  });

  await prisma.userAccount.deleteMany({
    where: { memberId: { in: [...M6_TEST_MEMBER_IDS] } },
  });

  await prisma.member.deleteMany({
    where: { id: { in: [...M6_TEST_MEMBER_IDS] } },
  });
}

async function runMilestone6Tests(): Promise<void> {
  console.log(
    "=== Memulai Pengujian Otomatis Milestone 6: Expense Management & Reimbursement ===\n"
  );

  await cleanupM6TestData();

  try {
    // Setup 3 anggota uji & akun login terhubung
    const testMembersConfig = [
      {
        id: M6_TEST_MEMBER_IDS[0],
        name: "Farhan Uji M6",
        username: M6_TEST_USERNAMES[0],
        password: generateEphemeralPassword(),
      },
      {
        id: M6_TEST_MEMBER_IDS[1],
        name: "Nabeel Uji M6",
        username: M6_TEST_USERNAMES[1],
        password: generateEphemeralPassword(),
      },
      {
        id: M6_TEST_MEMBER_IDS[2],
        name: "Alzha Uji M6",
        username: M6_TEST_USERNAMES[2],
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
    assert.ok(farhanActor, "Sesi login Farhan harus valid");

    const nabeelLogin = await authenticateMemberCredentials(prisma, {
      username: testMembersConfig[1].username,
      password: testMembersConfig[1].password,
    });
    const nabeelActor = await validateDatabaseSessionToken(
      prisma,
      nabeelLogin.sessionToken
    );
    assert.ok(nabeelActor, "Sesi login Nabeel harus valid");

    // Buat akun kas DANA uji dengan saldo awal Rp300.000
    const testCashAccount = await prisma.cashAccount.create({
      data: {
        code: M6_CASH_ACCOUNT_CODE,
        name: "DANA Kas Kost Uji M6",
        provider: "DANA",
        custodianMemberId: testMembersConfig[0].id,
        isActive: true,
      },
    });

    await prisma.cashMovement.create({
      data: {
        cashAccountId: testCashAccount.id,
        direction: "IN",
        category: "OPENING_BALANCE",
        amount: 300_000,
        status: "CONFIRMED",
        description: "Saldo awal kas DANA uji M6",
        actorMemberId: farhanActor.memberId,
        idempotencyKey: "M6:OPENING:300K",
      },
    });

    const parentCategory = await prisma.expenseCategory.create({
      data: {
        slug: M6_PARENT_CAT_SLUG,
        name: "Uji M6 Konsumsi Bersama",
        isActive: true,
      },
    });

    const subCategory = await prisma.expenseCategory.create({
      data: {
        slug: M6_SUB_CAT_SLUG,
        name: "Uji M6 Air Galon",
        parentId: parentCategory.id,
        isActive: true,
      },
    });

    const initialLedger = await getCashLedgerSummary(prisma, testCashAccount.id);
    assert.equal(
      initialLedger.actualBalance,
      300_000,
      "Saldo awal kas DANA uji harus Rp300.000"
    );

    // -------------------------------------------------------------------------
    // SKENARIO 1: Pengeluaran langsung Rp40.000 mengurangi saldo kas Rp40.000
    // -------------------------------------------------------------------------
    const directExpenseRes = await authorizedCreateExpense(prisma, farhanActor, {
      title: "Beli 2 Galon Air Minum Langsung Kas",
      amount: 40_000,
      categoryId: subCategory.id,
      fundingSource: "DIRECT_CASH",
      confirmImmediately: true,
      cashAccountId: testCashAccount.id,
      idempotencyKey: "M6:EXP:DIRECT:GALON:40K",
      note: "Dibayar langsung via QRIS DANA Kas",
    });

    assert.equal(directExpenseRes.wasDuplicateRequest, false);
    assert.equal(directExpenseRes.expense.status, "CONFIRMED");

    const ledgerAfterDirect = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    assert.equal(
      initialLedger.actualBalance - ledgerAfterDirect.actualBalance,
      40_000,
      "Pengeluaran kas langsung Rp40.000 harus mengurangi saldo kas DANA sebesar Rp40.000 (menjadi Rp260.000)"
    );
    assert.equal(ledgerAfterDirect.actualBalance, 260_000);
    console.log(
      "✓ [Skenario 1] Pengeluaran langsung Rp40.000 mengurangi saldo kas DANA sebesar Rp40.000."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 2: Pengeluaran PENDING tidak mengurangi saldo kas
    // -------------------------------------------------------------------------
    const pendingDirectRes = await authorizedCreateExpense(prisma, farhanActor, {
      title: "Rencana Beli Lampu Lorong (PENDING)",
      amount: 35_000,
      categoryId: parentCategory.id,
      fundingSource: "DIRECT_CASH",
      confirmImmediately: false,
      cashAccountId: testCashAccount.id,
      idempotencyKey: "M6:EXP:PENDING:35K",
    });

    assert.equal(pendingDirectRes.expense.status, "PENDING");

    const ledgerAfterPending = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    assert.equal(
      ledgerAfterPending.actualBalance,
      260_000,
      "Pengeluaran berstatus PENDING tidak boleh mengurangi saldo kas aktual"
    );
    console.log(
      "✓ [Skenario 2] Pengeluaran berstatus PENDING tidak mengurangi saldo kas DANA."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 3 & 4: Pengeluaran talangan Nabeel Rp40.000 membuat kewajiban
    //                 reimbursement Rp40.000 DAN tidak mengurangi saldo kas DANA langsung
    // -------------------------------------------------------------------------
    const nabeelAdvanceRes = await authorizedCreateExpense(prisma, nabeelActor, {
      title: "Talangan Nabeel: Sabun Cuci Piring & Spons Dapur",
      amount: 40_000,
      categoryId: subCategory.id,
      fundingSource: "MEMBER_ADVANCE",
      advancedByMemberId: nabeelActor.memberId,
      confirmImmediately: true,
      idempotencyKey: "M6:EXP:ADVANCE:NABEEL:40K",
    });

    assert.equal(nabeelAdvanceRes.expense.status, "CONFIRMED");
    assert.equal(nabeelAdvanceRes.expense.fundingSource, "MEMBER_ADVANCE");
    assert.ok(
      "reimbursement" in nabeelAdvanceRes && nabeelAdvanceRes.reimbursement,
      "Klaim reimbursement harus terbentuk untuk pengeluaran talangan Nabeel"
    );

    const nabeelReimbursement = nabeelAdvanceRes.reimbursement;
    assert.equal(nabeelReimbursement.beneficiaryMemberId, nabeelActor.memberId);
    assert.equal(nabeelReimbursement.totalAmount, 40_000);
    assert.equal(nabeelReimbursement.settledAmount, 0);
    assert.equal(nabeelReimbursement.status, "OUTSTANDING");

    // Pastikan tidak membuat klaim ganda untuk pengeluaran yang sama
    const duplicateClaimAttempt = await authorizedCreateReimbursementClaim(
      prisma,
      farhanActor,
      {
        expenseId: nabeelAdvanceRes.expense.id,
      }
    );
    assert.equal(
      duplicateClaimAttempt.wasDuplicateRequest,
      true,
      "Membuat klaim reimbursement untuk pengeluaran yang sama tidak boleh menduplikasi klaim"
    );
    assert.equal(duplicateClaimAttempt.reimbursement.id, nabeelReimbursement.id);

    const ledgerAfterAdvance = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    assert.equal(
      ledgerAfterAdvance.actualBalance,
      260_000,
      "Pengeluaran talangan anggota TIDAK boleh mengurangi saldo kas DANA secara langsung"
    );
    console.log(
      "✓ [Skenario 3 & 4] Talangan Nabeel Rp40.000 membuat kewajiban reimbursement Rp40.000 tanpa mengurangi saldo kas DANA secara langsung."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 5: Pencairan reimbursement Rp20.000 menyisakan kewajiban Rp20.000
    // -------------------------------------------------------------------------
    const firstPayoutRes = await authorizedSettleReimbursementPayout(
      prisma,
      farhanActor,
      {
        reimbursementId: nabeelReimbursement.id,
        cashAccountId: testCashAccount.id,
        amount: 20_000,
        idempotencyKey: "M6:REIMB:PAYOUT:NABEEL:1",
        note: "Pencairan reimburse tahap 1 ke Nabeel",
      }
    );

    assert.equal(firstPayoutRes.wasDuplicateRequest, false);
    assert.equal(firstPayoutRes.reimbursement.settledAmount, 20_000);
    assert.equal(firstPayoutRes.remainingDebtAmount, 20_000);
    assert.equal(firstPayoutRes.reimbursement.status, "PARTIALLY_SETTLED");

    const ledgerAfterFirstPayout = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    assert.equal(
      ledgerAfterFirstPayout.actualBalance,
      240_000,
      "Pencairan reimburse tahap 1 Rp20.000 harus mengurangi saldo kas DANA menjadi Rp240.000"
    );
    console.log(
      "✓ [Skenario 5] Pencairan reimbursement Rp20.000 menyisakan kewajiban Rp20.000 (PARTIALLY_SETTLED)."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 6: Pencairan reimbursement kedua Rp20.000 membuat status SETTLED
    // -------------------------------------------------------------------------
    const secondPayoutRes = await authorizedSettleReimbursementPayout(
      prisma,
      farhanActor,
      {
        reimbursementId: nabeelReimbursement.id,
        cashAccountId: testCashAccount.id,
        amount: 20_000,
        idempotencyKey: "M6:REIMB:PAYOUT:NABEEL:2",
        note: "Pelunasan sisa reimburse tahap 2 ke Nabeel",
      }
    );

    assert.equal(secondPayoutRes.wasDuplicateRequest, false);
    assert.equal(secondPayoutRes.reimbursement.settledAmount, 40_000);
    assert.equal(secondPayoutRes.remainingDebtAmount, 0);
    assert.equal(secondPayoutRes.reimbursement.status, "SETTLED");

    const ledgerAfterSecondPayout = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    assert.equal(
      ledgerAfterSecondPayout.actualBalance,
      220_000,
      "Pencairan reimburse tahap 2 Rp20.000 harus mengurangi saldo kas DANA menjadi Rp220.000"
    );
    console.log(
      "✓ [Skenario 6] Pencairan reimbursement kedua Rp20.000 melunasi kewajiban menjadi Rp0 (status SETTLED)."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 7: Total biaya operasional tetap Rp40.000 (untuk transaksi talangan)
    //             dan tidak menjadi Rp80.000 setelah reimbursement
    // -------------------------------------------------------------------------
    const nabeelOperatingExpenseTotal = await getTotalConfirmedOperatingExpenses(
      prisma,
      {
        expenseIds: [nabeelAdvanceRes.expense.id],
      }
    );
    assert.equal(
      nabeelOperatingExpenseTotal,
      40_000,
      "Biaya operasional untuk talangan Nabeel tetap Rp40.000 dan tidak dihitung dua kali (Rp80.000) setelah reimbursement lunas"
    );

    const combinedOperatingExpenseTotal =
      await getTotalConfirmedOperatingExpenses(prisma, {
        expenseIds: [
          directExpenseRes.expense.id,
          nabeelAdvanceRes.expense.id,
          pendingDirectRes.expense.id,
        ],
      });
    assert.equal(
      combinedOperatingExpenseTotal,
      80_000,
      "Total biaya operasional terkonfirmasi (Rp40.000 langsung + Rp40.000 talangan, tanpa PENDING) harus tepat Rp80.000"
    );
    console.log(
      "✓ [Skenario 7] Total biaya operasional talangan tetap Rp40.000 (tidak dihitung ganda menjadi Rp80.000 setelah pencairan reimburse)."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 8: Proses submit ganda tidak membuat transaksi duplikat
    // -------------------------------------------------------------------------
    const duplicateDirectExpense = await authorizedCreateExpense(
      prisma,
      farhanActor,
      {
        title: "Beli 2 Galon Air Minum Langsung Kas",
        amount: 40_000,
        categoryId: subCategory.id,
        fundingSource: "DIRECT_CASH",
        confirmImmediately: true,
        cashAccountId: testCashAccount.id,
        idempotencyKey: "M6:EXP:DIRECT:GALON:40K", // Idempotency key yang sama dengan Skenario 1
      }
    );
    assert.equal(
      duplicateDirectExpense.wasDuplicateRequest,
      true,
      "Submit pengeluaran ganda dengan idempotencyKey yang sama harus terdeteksi sebagai duplikat"
    );

    const duplicatePayout = await authorizedSettleReimbursementPayout(
      prisma,
      farhanActor,
      {
        reimbursementId: nabeelReimbursement.id,
        cashAccountId: testCashAccount.id,
        amount: 20_000,
        idempotencyKey: "M6:REIMB:PAYOUT:NABEEL:2", // Idempotency key yang sama dengan Skenario 6
      }
    );
    assert.equal(
      duplicatePayout.wasDuplicateRequest,
      true,
      "Submit pencairan reimburse ganda dengan idempotencyKey yang sama harus terdeteksi sebagai duplikat"
    );

    const ledgerAfterDuplicates = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    assert.equal(
      ledgerAfterDuplicates.actualBalance,
      220_000,
      "Submit ganda tidak boleh mengubah posisi saldo kas DANA"
    );
    console.log(
      "✓ [Skenario 8] Proteksi idempotency mencegah duplikasi pengeluaran maupun pencairan reimbursement."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 9: Pencairan reimbursement melebihi sisa utang ditolak
    //             (serta pengeluaran melebihi saldo kas DANA ditolak)
    // -------------------------------------------------------------------------
    const alzhaAdvanceRes = await authorizedCreateExpense(prisma, farhanActor, {
      title: "Talangan Alzha: Keset & Sapu Lantai",
      amount: 50_000,
      categoryId: parentCategory.id,
      fundingSource: "MEMBER_ADVANCE",
      advancedByMemberId: testMembersConfig[2].id,
      confirmImmediately: true,
      idempotencyKey: "M6:EXP:ADVANCE:ALZHA:50K",
    });
    const alzhaReimbursement = alzhaAdvanceRes.reimbursement;
    assert.ok(alzhaReimbursement, "Klaim reimbursement Alzha harus terbentuk");

    await assert.rejects(
      async () => {
        await authorizedSettleReimbursementPayout(prisma, farhanActor, {
          reimbursementId: alzhaReimbursement.id,
          cashAccountId: testCashAccount.id,
          amount: 60_000, // Melebihi utang Rp50.000
          idempotencyKey: "M6:REIMB:OVERPAY:ALZHA",
        });
      },
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes("melebihi sisa utang reimbursement"),
      "Pencairan melebihi sisa utang reimbursement wajib ditolak"
    );

    await assert.rejects(
      async () => {
        await authorizedCreateExpense(prisma, farhanActor, {
          title: "Pengeluaran Melebihi Saldo Kas DANA",
          amount: 999_000, // Saldo tersedia Rp220.000
          categoryId: subCategory.id,
          fundingSource: "DIRECT_CASH",
          confirmImmediately: true,
          cashAccountId: testCashAccount.id,
          idempotencyKey: "M6:EXP:INSUFFICIENT:999K",
        });
      },
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes("Saldo kas DANA tidak mencukupi"),
      "Pengeluaran kas langsung yang menyebabkan saldo negatif wajib ditolak secara default"
    );
    console.log(
      "✓ [Skenario 9] Pencairan reimbursement melebihi sisa utang & pengeluaran melebihi saldo kas DANA berhasil ditolak."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 10: Menonaktifkan kategori yang sudah digunakan transaksi
    //              tidak merusak histori pengeluaran
    // -------------------------------------------------------------------------
    const createdDynamicSub = await createExpenseCategory(prisma, farhanActor, {
      name: "Uji M6 Subkategori Dinamis",
      parentId: parentCategory.id,
    });
    assert.equal(createdDynamicSub.isActive, true);

    // Kategori kosong yang belum dipakai transaksi boleh dihapus
    const deletedEmptyCat = await deleteUnusedExpenseCategory(
      prisma,
      farhanActor,
      {
        categoryId: createdDynamicSub.id,
      }
    );
    assert.equal(deletedEmptyCat.deletedId, createdDynamicSub.id);

    // Kategori yang sudah digunakan transaksi TIDAK boleh dihapus
    await assert.rejects(
      async () => {
        await deleteUnusedExpenseCategory(prisma, farhanActor, {
          categoryId: subCategory.id,
        });
      },
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes("tidak boleh dihapus agar histori tetap utuh"),
      "Menghapus kategori yang sudah memiliki histori transaksi wajib ditolak"
    );

    // Menonaktifkan kategori yang sudah digunakan transaksi
    const deactivatedCat = await setExpenseCategoryActiveStatus(
      prisma,
      farhanActor,
      {
        categoryId: subCategory.id,
        isActive: false,
      }
    );
    assert.equal(deactivatedCat.isActive, false);

    // Histori transaksi lama yang memakai kategori tersebut tetap utuh dan terbaca
    const historicalExpense = await prisma.expense.findUnique({
      where: { id: directExpenseRes.expense.id },
      include: { category: true },
    });
    assert.ok(historicalExpense);
    assert.equal(historicalExpense.category.id, subCategory.id);
    assert.equal(historicalExpense.category.name, "Uji M6 Air Galon");

    // Aktifkan kembali kategori untuk pengujian selanjutnya
    await setExpenseCategoryActiveStatus(prisma, farhanActor, {
      categoryId: subCategory.id,
      isActive: true,
    });
    const catList = await listExpenseCategories(prisma, farhanActor);
    assert.ok(catList.flatCategories.some((c) => c.id === subCategory.id));
    console.log(
      "✓ [Skenario 10] Penonaktifan kategori menjaga histori pengeluaran tetap utuh & mencegah penghapusan kategori terpakai."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 11: Pengguna tanpa sesi login tidak dapat melakukan mutasi data
    // -------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        await authorizedCreateExpense(prisma, null, {
          title: "Pengeluaran Tanpa Login",
          amount: 25_000,
          categoryId: subCategory.id,
          fundingSource: "DIRECT_CASH",
          idempotencyKey: "M6:UNAUTH:EXP:1",
        });
      },
      (err: unknown) => err instanceof UnauthorizedError,
      "Mutasi pengeluaran tanpa sesi login wajib ditolak dengan UnauthorizedError"
    );

    await assert.rejects(
      async () => {
        await authorizedSettleReimbursementPayout(prisma, null, {
          reimbursementId: alzhaReimbursement.id,
          amount: 10_000,
          idempotencyKey: "M6:UNAUTH:PAYOUT:1",
        });
      },
      (err: unknown) => err instanceof UnauthorizedError,
      "Mutasi pencairan reimbursement tanpa sesi login wajib ditolak dengan UnauthorizedError"
    );

    await assert.rejects(
      async () => {
        await createExpenseCategory(prisma, null, {
          name: "Kategori Ilegal",
        });
      },
      (err: unknown) => err instanceof UnauthorizedError,
      "Penambahan kategori tanpa sesi login wajib ditolak"
    );
    console.log(
      "✓ [Skenario 11] Seluruh endpoint mutasi menolak request tanpa sesi login (UnauthorizedError)."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 12: Saldo kas, pembatalan auditable, dan ringkasan halaman/dashboard
    //              konsisten setelah refresh/mutasi
    // -------------------------------------------------------------------------
    // Konfirmasi pengeluaran PENDING dari Skenario 2 (Rp35.000)
    const confirmedPendingRes = await authorizedConfirmPendingExpense(
      prisma,
      farhanActor,
      {
        expenseId: pendingDirectRes.expense.id,
      }
    );
    assert.equal(confirmedPendingRes.expense.status, "CONFIRMED");

    // Batalkan/koreksi pengeluaran Rp35.000 secara auditable (reverseOrVoidExpense)
    const reversedRes = await authorizedReverseOrVoidExpense(
      prisma,
      farhanActor,
      {
        expenseId: pendingDirectRes.expense.id,
        reason: "Koreksi uji M6: batal beli lampu lorong",
      }
    );
    assert.equal(reversedRes.expense.status, "REJECTED");
    assert.ok(
      reversedRes.reversalCashMovement,
      "Pembatalan pengeluaran kas langsung yang sudah CONFIRMED harus membuat jurnal pembalik ADJUSTMENT IN"
    );

    // Rekonsiliasi penyesuaian kas masuk Rp10.000
    await authorizedRecordLedgerAdjustment(prisma, farhanActor, {
      direction: "IN",
      category: "ADJUSTMENT",
      amount: 10_000,
      description: "Koreksi selisih pembulatan uji M6",
      idempotencyKey: "M6:ADJ:IN:10K",
    });

    const expensesPageData = await getExpensesPageData(prisma, farhanActor, {
      period: "ALL",
    });
    const reimbursementsPageData = await getReimbursementsPageData(
      prisma,
      farhanActor,
      {
        status: "ALL",
      }
    );
    const liveDashboard = await getLiveDashboardData(prisma, farhanActor);

    assert.ok(expensesPageData.expenses.length >= 4);
    assert.ok(reimbursementsPageData.reimbursements.length >= 2);
    assert.equal(
      expensesPageData.cashAccount.actualBalance,
      reimbursementsPageData.cashAccount.actualBalance,
      "Saldo kas aktual pada halaman Pengeluaran dan Reimbursement harus konsisten"
    );
    assert.equal(
      liveDashboard.cashSummary.actualCashBalance,
      expensesPageData.cashAccount.actualBalance,
      "Saldo kas aktual pada Dashboard dan halaman Pengeluaran harus konsisten"
    );
    console.log(
      "✓ [Skenario 12] Konsistensi saldo kas, koreksi/pembatalan auditable, dan sinkronisasi Dashboard terverifikasi."
    );

    // -------------------------------------------------------------------------
    // SKENARIO 13: Dua request pencairan paralel (Promise.all) pada reimbursement
    //              yang sama tidak boleh menyebabkan over-settlement
    // -------------------------------------------------------------------------
    // Alzha memiliki klaim reimbursement sebesar Rp50.000 (sisa utang Rp50.000).
    // Kita jalankan 2 request pencairan paralel masing-masing Rp30.000 dengan idempotencyKey berbeda.
    // Total Rp60.000 > Rp50.000, sehingga tepat 1 harus berhasil dan 1 harus ditolak oleh row-level lock FOR UPDATE!
    const concurrentResults = await Promise.allSettled([
      authorizedSettleReimbursementPayout(prisma, farhanActor, {
        reimbursementId: alzhaReimbursement.id,
        cashAccountId: testCashAccount.id,
        amount: 30_000,
        idempotencyKey: "M6:CONCURRENT:ALZHA:REQ-A",
        note: "Request paralel A Rp30.000",
      }),
      authorizedSettleReimbursementPayout(prisma, nabeelActor, {
        reimbursementId: alzhaReimbursement.id,
        cashAccountId: testCashAccount.id,
        amount: 30_000,
        idempotencyKey: "M6:CONCURRENT:ALZHA:REQ-B",
        note: "Request paralel B Rp30.000",
      }),
    ]);

    const fulfilledCount = concurrentResults.filter(
      (r) => r.status === "fulfilled"
    ).length;
    const rejectedCount = concurrentResults.filter(
      (r) => r.status === "rejected"
    ).length;

    assert.equal(
      fulfilledCount,
      1,
      "Hanya tepat 1 dari 2 request paralel Rp30.000 (pada utang Rp50.000) yang boleh berhasil"
    );
    assert.equal(
      rejectedCount,
      1,
      "Request paralel kedua yang menyebabkan over-settlement (Rp60.000 > Rp50.000) wajib ditolak"
    );

    const alzhaReimbAfterConcurrent = await prisma.reimbursement.findUnique({
      where: { id: alzhaReimbursement.id },
    });
    assert.ok(alzhaReimbAfterConcurrent);
    assert.equal(
      alzhaReimbAfterConcurrent.settledAmount,
      30_000,
      "Total pencairan setelah 2 request paralel harus tetap Rp30.000 (tidak over-settled menjadi Rp60.000)"
    );
    assert.equal(alzhaReimbAfterConcurrent.status, "PARTIALLY_SETTLED");
    console.log(
      "✓ [Skenario 13] Concurrency lock (SELECT ... FOR UPDATE) mencegah over-settlement pada 2 request pencairan paralel."
    );

    console.log(
      "\n=== SELURUH SKENARIO PENGUJIAN MILESTONE 6 LULUS 100% ==="
    );
  } finally {
    await cleanupM6TestData();
    await prisma.$disconnect();
  }
}

runMilestone6Tests().catch((error: unknown) => {
  console.error("\n[M6 TEST FAILED]", error);
  process.exitCode = 1;
});
