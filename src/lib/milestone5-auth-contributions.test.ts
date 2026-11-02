import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  authenticateMemberCredentials,
  revokeDatabaseSession,
  UnauthorizedError,
  upsertMemberAccountCredentials,
  validateDatabaseSessionToken,
} from "./auth";
import {
  authorizedConfirmPendingPayment,
  authorizedRecordContributionPayment,
} from "./contribution-service";
import {
  confirmPendingContributionPayment,
  createAdditionalPeriodCharges,
  generateRegularPeriodCharges,
  getCashLedgerSummary,
  getPeriodObligationSummary,
  recordContributionPayment,
  upsertContributionPolicy,
} from "./financial-service";
import {
  createMemberWithAccount,
  deactivateMember,
  listMembersDirectory,
  reactivateMember,
} from "./member-service";
import { prisma } from "./test-db";

const M5_TEST_MEMBER_IDS = [
  "88888888-0000-4000-8000-000000000001",
  "88888888-0000-4000-8000-000000000002",
  "88888888-0000-4000-8000-000000000003",
] as const;

const M5_TEST_USERNAMES = [
  "test_m5_farhan",
  "test_m5_nabeel",
  "test_m5_alzha",
  "test_m5_dimas_baru",
] as const;

const M5_CASH_ACCOUNT_CODE = "TEST_M5_DANA_ACCOUNT";
const M5_POLICY_NOV_CODE = "TEST_M5_POLICY_2098_11";
const M5_POLICY_DEC_CODE = "TEST_M5_POLICY_2098_12";
const M5_PERIOD_NOV = "2098-11";
const M5_PERIOD_DEC = "2098-12";

function generateEphemeralPassword(): string {
  return `Ephem#${crypto.randomBytes(12).toString("hex")}`;
}

async function cleanupM5TestData(): Promise<void> {
  const dynamicAccounts = await prisma.userAccount.findMany({
    where: { username: { in: [...M5_TEST_USERNAMES] } },
    select: { memberId: true },
  });

  const allTestMemberIds = Array.from(
    new Set([
      ...M5_TEST_MEMBER_IDS,
      ...dynamicAccounts.map((a) => a.memberId),
    ])
  );

  const testCashAccount = await prisma.cashAccount.findUnique({
    where: { code: M5_CASH_ACCOUNT_CODE },
  });

  if (testCashAccount) {
    await prisma.cashMovement.deleteMany({
      where: { cashAccountId: testCashAccount.id },
    });
    await prisma.payment.deleteMany({
      where: { cashAccountId: testCashAccount.id },
    });
  }

  await prisma.cashMovement.deleteMany({
    where: { actorMemberId: { in: allTestMemberIds } },
  });

  await prisma.payment.deleteMany({
    where: { memberId: { in: allTestMemberIds } },
  });

  await prisma.contributionCharge.deleteMany({
    where: {
      OR: [
        { memberId: { in: allTestMemberIds } },
        { period: { in: [M5_PERIOD_NOV, M5_PERIOD_DEC] } },
      ],
    },
  });

  await prisma.contributionPolicy.deleteMany({
    where: { code: { in: [M5_POLICY_NOV_CODE, M5_POLICY_DEC_CODE] } },
  });

  if (testCashAccount) {
    await prisma.cashAccount.delete({
      where: { id: testCashAccount.id },
    });
  }

  await prisma.userAccount.deleteMany({
    where: {
      OR: [
        { memberId: { in: allTestMemberIds } },
        { username: { in: [...M5_TEST_USERNAMES] } },
      ],
    },
  });

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorMemberId: { in: allTestMemberIds } },
        { entityId: { in: [M5_PERIOD_NOV, M5_PERIOD_DEC] } },
      ],
    },
  });

  await prisma.member.deleteMany({
    where: { id: { in: allTestMemberIds } },
  });
}

async function runMilestone5Tests(): Promise<void> {
  console.log(
    "=== Memulai Pengujian Otomatis Milestone 5 (Auth, Members & Contributions) ==="
  );

  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    process.env.AUTH_SECRET = crypto.randomBytes(32).toString("hex");
  }

  await cleanupM5TestData();

  try {
    // Siapkan 3 anggota uji terisolasi + 1 akun kas DANA uji
    await prisma.member.createMany({
      data: [
        {
          id: M5_TEST_MEMBER_IDS[0],
          name: "Farhan M5 Test",
          joinedAt: new Date("2098-10-01T00:00:00.000Z"),
        },
        {
          id: M5_TEST_MEMBER_IDS[1],
          name: "Nabeel M5 Test",
          joinedAt: new Date("2098-10-01T00:00:00.000Z"),
        },
        {
          id: M5_TEST_MEMBER_IDS[2],
          name: "Alzha M5 Test",
          joinedAt: new Date("2098-10-01T00:00:00.000Z"),
        },
      ],
    });

    const testCashAccount = await prisma.cashAccount.create({
      data: {
        code: M5_CASH_ACCOUNT_CODE,
        name: "DANA Kas M5 Test",
        provider: "DANA",
        custodianMemberId: M5_TEST_MEMBER_IDS[0],
        isActive: true,
      },
    });

    // -------------------------------------------------------------------------
    // 1. Pengujian Autentikasi, Hashing Bcrypt, Sesi Jose, & Logout
    // -------------------------------------------------------------------------
    const farhanPassword = generateEphemeralPassword();
    const nabeelPassword = generateEphemeralPassword();
    const alzhaPassword = generateEphemeralPassword();

    const farhanAccount = await upsertMemberAccountCredentials(prisma, {
      memberId: M5_TEST_MEMBER_IDS[0],
      username: M5_TEST_USERNAMES[0],
      plainPassword: farhanPassword,
    });
    await upsertMemberAccountCredentials(prisma, {
      memberId: M5_TEST_MEMBER_IDS[1],
      username: M5_TEST_USERNAMES[1],
      plainPassword: nabeelPassword,
    });
    await upsertMemberAccountCredentials(prisma, {
      memberId: M5_TEST_MEMBER_IDS[2],
      username: M5_TEST_USERNAMES[2],
      plainPassword: alzhaPassword,
    });

    assert.notEqual(
      farhanAccount.passwordHash,
      farhanPassword,
      "Password wajib disimpan sebagai hash bcrypt, bukan plaintext"
    );

    // Login dengan password salah harus ditolak
    await assert.rejects(
      async () => {
        await authenticateMemberCredentials(prisma, {
          username: M5_TEST_USERNAMES[0],
          password: generateEphemeralPassword(),
        });
      },
      (err: unknown) => err instanceof UnauthorizedError,
      "Password salah wajib ditolak dengan UnauthorizedError"
    );

    // Login valid untuk Farhan & Nabeel
    const farhanLogin = await authenticateMemberCredentials(prisma, {
      username: M5_TEST_USERNAMES[0],
      password: farhanPassword,
    });
    const nabeelLogin = await authenticateMemberCredentials(prisma, {
      username: M5_TEST_USERNAMES[1],
      password: nabeelPassword,
    });

    const validatedFarhan = await validateDatabaseSessionToken(
      prisma,
      farhanLogin.sessionToken
    );
    assert.ok(validatedFarhan, "Token sesi Farhan harus valid");
    assert.equal(validatedFarhan.memberId, M5_TEST_MEMBER_IDS[0]);
    console.log(
      "✓ [Test 1] Autentikasi bcrypt + sesi database Jose berhasil diverifikasi."
    );

    // -------------------------------------------------------------------------
    // 2. Pengujian Otorisasi Server-Side & Hak Akses Setara (Equal Access)
    // -------------------------------------------------------------------------
    // Tanpa sesi autentikasi (null actor), semua operasi wajib ditolak
    await assert.rejects(
      async () => {
        await listMembersDirectory(prisma, null);
      },
      (err: unknown) => err instanceof UnauthorizedError,
      "Akses tanpa sesi wajib ditolak oleh server-side guard"
    );

    // Nabeel (bukan pemegang akun DANA) tetap memiliki hak akses setara untuk menambah anggota baru
    const dimasPassword = generateEphemeralPassword();
    const createdDimas = await createMemberWithAccount(
      prisma,
      nabeelLogin.actor,
      {
        name: "Dimas M5 Test",
        username: M5_TEST_USERNAMES[3],
        initialPassword: dimasPassword,
      }
    );
    assert.equal(createdDimas.username, M5_TEST_USERNAMES[3]);
    console.log(
      "✓ [Test 2] Otorisasi server-side & hak akses setara seluruh anggota terverifikasi."
    );

    // -------------------------------------------------------------------------
    // 3. Pengujian Manajemen Anggota: Nonaktifkan, Histori, & Revokasi Sesi
    // -------------------------------------------------------------------------
    const dimasLogin = await authenticateMemberCredentials(prisma, {
      username: M5_TEST_USERNAMES[3],
      password: dimasPassword,
    });
    assert.ok(
      await validateDatabaseSessionToken(prisma, dimasLogin.sessionToken),
      "Sesi Dimas aktif sebelum dinonaktifkan"
    );

    // Nonaktifkan Dimas oleh Farhan
    const deactivatedDimas = await deactivateMember(
      prisma,
      farhanLogin.actor,
      {
        targetMemberId: createdDimas.member.id,
      }
    );
    assert.ok(
      deactivatedDimas.leftAt !== null,
      "Anggota nonaktif harus memiliki timestamp leftAt"
    );

    // Sesi Dimas yang sedang berjalan wajib langsung tidak valid (revoked)
    const dimasSessionAfterDeactivate = await validateDatabaseSessionToken(
      prisma,
      dimasLogin.sessionToken
    );
    assert.equal(
      dimasSessionAfterDeactivate,
      null,
      "Sesi anggota yang dinonaktifkan wajib langsung dicabut"
    );

    // Anggota nonaktif tidak bisa login kembali sebelum diaktifkan ulang
    await assert.rejects(
      async () => {
        await authenticateMemberCredentials(prisma, {
          username: M5_TEST_USERNAMES[3],
          password: dimasPassword,
        });
      },
      (err: unknown) => err instanceof UnauthorizedError,
      "Anggota nonaktif tidak boleh berhasil login"
    );

    // Pemegang kas aktif (Farhan) tidak boleh dinonaktifkan sebelum kas dialihkan
    await assert.rejects(
      async () => {
        await deactivateMember(prisma, nabeelLogin.actor, {
          targetMemberId: M5_TEST_MEMBER_IDS[0],
        });
      },
      /pemegang rekening kas aktif/,
      "Penanggung jawab kas aktif tidak boleh dinonaktifkan sembarangan"
    );

    // Aktifkan kembali & nonaktifkan lagi untuk menguji siklus hidup penuh
    const reactivatedDimas = await reactivateMember(
      prisma,
      nabeelLogin.actor,
      createdDimas.member.id
    );
    assert.equal(reactivatedDimas.leftAt, null);
    await deactivateMember(prisma, nabeelLogin.actor, {
      targetMemberId: createdDimas.member.id,
    });
    console.log(
      "✓ [Test 3] Penambahan, penonaktifan anggota, & revokasi sesi otomatis terverifikasi."
    );

    // -------------------------------------------------------------------------
    // 4. Pengujian Tagihan Rutin Idempotent, Tagihan Tambahan, & Tarif Mendatang
    // -------------------------------------------------------------------------
    const policyNov = await upsertContributionPolicy(prisma, {
      code: M5_POLICY_NOV_CODE,
      name: "Tarif Uji M5 November",
      amountPerMember: 150_000,
      effectiveFromPeriod: M5_PERIOD_NOV,
      actorMemberId: nabeelLogin.actor.memberId,
    });

    const firstGen = await generateRegularPeriodCharges(prisma, {
      period: M5_PERIOD_NOV,
      policyCode: policyNov.code,
      memberIds: [...M5_TEST_MEMBER_IDS],
      actorMemberId: nabeelLogin.actor.memberId,
    });
    const secondGen = await generateRegularPeriodCharges(prisma, {
      period: M5_PERIOD_NOV,
      policyCode: policyNov.code,
      memberIds: [...M5_TEST_MEMBER_IDS],
      actorMemberId: farhanLogin.actor.memberId,
    });

    assert.equal(firstGen.totalBilledAmount, 450_000);
    assert.equal(
      secondGen.totalBilledAmount,
      450_000,
      "Pembuatan tagihan rutin berulang harus idempotent (tetap Rp450.000)"
    );
    assert.equal(secondGen.charges.length, 3);

    const additionalGen = await createAdditionalPeriodCharges(prisma, {
      period: M5_PERIOD_NOV,
      amountPerMember: 50_000,
      title: "Tambahan Kas Kebersihan M5",
      batchIdempotencyKey: "M5:TEST:ADD:BATCH:1",
      memberIds: [...M5_TEST_MEMBER_IDS],
      actorMemberId: nabeelLogin.actor.memberId,
    });
    assert.equal(additionalGen.totalBilledAmount, 150_000);

    // Perubahan tarif periode mendatang (2098-12) tidak mengubah tagihan 2098-11
    await upsertContributionPolicy(prisma, {
      code: M5_POLICY_DEC_CODE,
      name: "Tarif Uji M5 Desember",
      amountPerMember: 175_000,
      effectiveFromPeriod: M5_PERIOD_DEC,
      closePreviousPolicyCode: M5_POLICY_NOV_CODE,
      actorMemberId: farhanLogin.actor.memberId,
    });

    const novSummary = await getPeriodObligationSummary(prisma, M5_PERIOD_NOV, {
      memberIds: [...M5_TEST_MEMBER_IDS],
    });
    assert.equal(novSummary.regularTotal, 450_000);
    assert.equal(novSummary.additionalTotal, 150_000);
    assert.equal(novSummary.totalBilled, 600_000);
    console.log(
      "✓ [Test 4] Tagihan rutin idempotent, tagihan tambahan, & isolasi tarif masa depan terverifikasi."
    );

    // -------------------------------------------------------------------------
    // 5. Pengujian Pembayaran Parsial, Konfirmasi Atomic (Pending -> Confirmed),
    //    serta Perlindungan Pengiriman Ganda (Idempotency)
    // -------------------------------------------------------------------------
    const farhanCharge = firstGen.charges.find(
      (c) => c.memberId === M5_TEST_MEMBER_IDS[0]
    );
    const nabeelCharge = firstGen.charges.find(
      (c) => c.memberId === M5_TEST_MEMBER_IDS[1]
    );
    assert.ok(farhanCharge && nabeelCharge);

    // 5a. Catat pembayaran PENDING cicilan Rp100.000 untuk Nabeel
    const pendingPay = await recordContributionPayment(prisma, {
      memberId: M5_TEST_MEMBER_IDS[1],
      cashAccountId: testCashAccount.id,
      amount: 100_000,
      targetChargeIds: [nabeelCharge.id],
      idempotencyKey: "M5:PAY:PENDING:NABEEL:100K",
      confirmImmediately: false,
      actorMemberId: nabeelLogin.actor.memberId,
      note: "Cicilan Nabeel menunggu konfirmasi",
    });

    assert.equal(pendingPay.payment.status, "PENDING");
    assert.equal(pendingPay.cashMovement, null);

    const ledgerBeforeConfirm = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    assert.equal(
      ledgerBeforeConfirm.actualBalance,
      0,
      "Pembayaran PENDING belum boleh menambah saldo kas"
    );

    // 5b. Konfirmasi pembayaran PENDING secara atomic
    const confirmedPay = await confirmPendingContributionPayment(prisma, {
      paymentId: pendingPay.payment.id,
      targetChargeIds: [nabeelCharge.id],
      actorMemberId: farhanLogin.actor.memberId,
    });

    assert.equal(confirmedPay.wasDuplicateRequest, false);
    assert.equal(confirmedPay.payment.status, "CONFIRMED");
    assert.equal(confirmedPay.updatedCharges[0].allocatedAmount, 100_000);
    assert.equal(confirmedPay.updatedCharges[0].remainingAmount, 50_000);
    assert.equal(confirmedPay.updatedCharges[0].status, "PARTIALLY_PAID");
    assert.ok(confirmedPay.cashMovement, "CashMovement harus tercatat saat konfirmasi");

    const ledgerAfterConfirm = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    assert.equal(
      ledgerAfterConfirm.actualBalance,
      100_000,
      "Konfirmasi pembayaran harus menambah saldo kas sebesar Rp100.000"
    );

    // 5c. Konfirmasi ganda pada pembayaran yang sama tidak boleh menduplikasi saldo kas
    const duplicateConfirm = await authorizedConfirmPendingPayment(
      prisma,
      farhanLogin.actor,
      {
        paymentId: pendingPay.payment.id,
        targetChargeId: nabeelCharge.id,
      }
    );
    assert.equal(duplicateConfirm.wasDuplicateRequest, true);

    const ledgerAfterDuplicateConfirm = await getCashLedgerSummary(
      prisma,
      testCashAccount.id
    );
    assert.equal(
      ledgerAfterDuplicateConfirm.actualBalance,
      100_000,
      "Konfirmasi berulang tidak boleh menggandakan saldo kas"
    );

    // 5d. Pengiriman pembayaran langsung dengan idempotencyKey yang sama tidak membuat duplikasi
    const directPay1 = await authorizedRecordContributionPayment(
      prisma,
      farhanLogin.actor,
      {
        chargeId: farhanCharge.id,
        cashAccountId: testCashAccount.id,
        amount: 150_000,
        confirmImmediately: true,
        idempotencyKey: "M5:PAY:DIRECT:FARHAN:150K",
        note: "Pelunasan penuh Farhan",
      }
    );
    const directPay2 = await authorizedRecordContributionPayment(
      prisma,
      farhanLogin.actor,
      {
        chargeId: farhanCharge.id,
        cashAccountId: testCashAccount.id,
        amount: 150_000,
        confirmImmediately: true,
        idempotencyKey: "M5:PAY:DIRECT:FARHAN:150K",
        note: "Pelunasan penuh Farhan (retry)",
      }
    );
    assert.equal(directPay1.wasDuplicateRequest, false);
    assert.equal(
      directPay2.wasDuplicateRequest,
      true,
      "Pengiriman ganda dengan idempotencyKey sama wajib terdeteksi"
    );
    assert.equal(directPay1.payment.id, directPay2.payment.id);

    // Logout Farhan mencabut sesi di database
    await revokeDatabaseSession(prisma, farhanLogin.sessionToken);
    assert.equal(
      await validateDatabaseSessionToken(prisma, farhanLogin.sessionToken),
      null,
      "Sesi harus tidak valid setelah logout"
    );

    console.log(
      "✓ [Test 5] Pembayaran parsial, konfirmasi atomic, idempotency pengiriman ganda, & logout terverifikasi."
    );
    console.log(
      "\n=== Seluruh Pengujian Otomatis Milestone 5 LULUS 100% ==="
    );
  } finally {
    await cleanupM5TestData();
  }
}

runMilestone5Tests()
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[Milestone 5 Test Suite] GAGAL:\n${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
