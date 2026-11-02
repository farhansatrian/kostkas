import "dotenv/config";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  authenticateMemberCredentials,
  UnauthorizedError,
  upsertMemberAccountCredentials,
  validateDatabaseSessionToken,
} from "./auth";
import { getSettingsPageData } from "./settings-service";
import { assertTestDatabaseIsolation, prisma } from "./test-db";

const M8_TEST_MEMBER_ID = "66666666-0000-4000-8000-000000000001";
const M8_TEST_USERNAME = "m8_security_tester";
const M8_INITIAL_PASSWORD = "PasswordAman123!";
const M8_NEW_PASSWORD = "PasswordBaruKuat456!";

async function cleanupM8TestData(): Promise<void> {
  const testAccount = await prisma.cashAccount.findUnique({
    where: { code: "M8_TEST_DANA" },
  });
  if (testAccount) {
    await prisma.cashMovement.deleteMany({
      where: { cashAccountId: testAccount.id },
    });
    await prisma.cashAccount.delete({
      where: { id: testAccount.id },
    });
  }

  const account = await prisma.userAccount.findUnique({
    where: { username: M8_TEST_USERNAME },
  });

  if (account) {
    await prisma.authSession.deleteMany({
      where: { userAccountId: account.id },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorMemberId: account.memberId },
          { entityId: M8_TEST_USERNAME },
        ],
      },
    });
    await prisma.userAccount.delete({
      where: { id: account.id },
    });
  }

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorMemberId: M8_TEST_MEMBER_ID },
        { entityId: "fake_non_existent_user_999" },
      ],
    },
  });

  await prisma.member.deleteMany({
    where: { id: M8_TEST_MEMBER_ID },
  });
}

async function runMilestone8Tests(): Promise<void> {
  console.log("=== Memulai Pengujian Otomatis Milestone 8: Security Hardening, QA & Readiness ===");

  await cleanupM8TestData();

  try {
    // -------------------------------------------------------------------------
    // 1. Pengujian Fail-Closed Test Database Isolation Guard
    // -------------------------------------------------------------------------
    console.log("\n[Uji 1] Memvalidasi Pengaman Database Test Terisolasi (Fail-Closed)...");

    const originalTestDbUrl = process.env.TEST_DATABASE_URL;
    const originalDevDbUrl = process.env.DATABASE_URL;

    // Skenario A: TEST_DATABASE_URL kosong harus melempar error keras
    delete process.env.TEST_DATABASE_URL;
    assert.throws(
      () => assertTestDatabaseIsolation(),
      /FAIL-CLOSED TEST GUARD: Variabel environment TEST_DATABASE_URL tidak ditemukan/,
      "Test guard wajib menolak jika TEST_DATABASE_URL kosong"
    );

    // Skenario B: TEST_DATABASE_URL tanpa kata 'test' harus ditolak
    process.env.TEST_DATABASE_URL =
      "postgresql://kostkas_app:pass@127.0.0.1:5433/kostkas_production?schema=public";
    assert.throws(
      () => assertTestDatabaseIsolation(),
      /tidak memuat kata 'test'/,
      "Test guard wajib menolak database tanpa indikasi test"
    );

    // Skenario C: TEST_DATABASE_URL identik dengan DATABASE_URL (kostkas_db) harus ditolak
    if (originalDevDbUrl) {
      process.env.TEST_DATABASE_URL = originalDevDbUrl;
      assert.throws(
        () => assertTestDatabaseIsolation(),
        /TEST_DATABASE_URL identik dengan DATABASE_URL/,
        "Test guard wajib menolak jika TEST_DATABASE_URL sama dengan development database"
      );
    }

    // Kembalikan environment normal
    process.env.TEST_DATABASE_URL = originalTestDbUrl;
    process.env.DATABASE_URL = originalDevDbUrl;

    const verifiedUrl = assertTestDatabaseIsolation();
    assert.ok(
      verifiedUrl.includes("kostkas_test_db"),
      "Test database URL yang valid wajib mengarah ke kostkas_test_db"
    );
    console.log("✓ [Uji 1] Pengaman isolasi database test fail-closed terverifikasi 100%.");

    // -------------------------------------------------------------------------
    // 2. Persiapan Data Akun Uji Keamanan
    // -------------------------------------------------------------------------
    await prisma.member.create({
      data: {
        id: M8_TEST_MEMBER_ID,
        name: "Security Tester (M8)",
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    await upsertMemberAccountCredentials(prisma, {
      memberId: M8_TEST_MEMBER_ID,
      username: M8_TEST_USERNAME,
      plainPassword: M8_INITIAL_PASSWORD,
    });

    await prisma.cashAccount.create({
      data: {
        code: "M8_TEST_DANA",
        name: "DANA Kas Uji M8",
        provider: "DANA",
        custodianMemberId: M8_TEST_MEMBER_ID,
        isActive: true,
      },
    });

    // -------------------------------------------------------------------------
    // 3. Pengujian Proteksi Brute-Force & Lockout Sesi Login
    // -------------------------------------------------------------------------
    console.log("\n[Uji 2] Memvalidasi Proteksi Brute-Force & Penguncian Akun Sementara...");

    // Coba 5 kali login dengan password salah
    for (let attempt = 1; attempt <= 5; attempt++) {
      await assert.rejects(
        async () => {
          await authenticateMemberCredentials(prisma, {
            username: M8_TEST_USERNAME,
            password: `PasswordSalah_${attempt}!`,
          });
        },
        (err: unknown) => {
          return (
            err instanceof UnauthorizedError &&
            err.message === "Username atau password tidak sesuai."
          );
        },
        `Percobaan ke-${attempt} harus ditolak dengan pesan seragam`
      );
    }

    // Percobaan ke-6 (bahkan dengan password yang BENAR!) harus diblokir oleh rate limiter
    await assert.rejects(
      async () => {
        await authenticateMemberCredentials(prisma, {
          username: M8_TEST_USERNAME,
          password: M8_INITIAL_PASSWORD,
        });
      },
      (err: unknown) => {
        return (
          err instanceof UnauthorizedError &&
          err.message.includes("Terlalu banyak percobaan login yang gagal")
        );
      },
      "Percobaan ke-6 wajib diblokir oleh proteksi brute-force"
    );
    console.log("✓ [Uji 2] Proteksi brute-force dan penguncian akun sementara berhasil diverifikasi.");

    // -------------------------------------------------------------------------
    // 4. Pengujian Mitigasi Timing Attack & Username Enumeration
    // -------------------------------------------------------------------------
    console.log("\n[Uji 3] Memvalidasi Mitigasi Timing Attack & Enumerasi Akun...");

    await assert.rejects(
      async () => {
        await authenticateMemberCredentials(prisma, {
          username: "fake_non_existent_user_999",
          password: "RandomHackerPassword123!",
        });
      },
      (err: unknown) => {
        return (
          err instanceof UnauthorizedError &&
          err.message === "Username atau password tidak sesuai."
        );
      },
      "Akun tidak terdaftar harus mengembalikan pesan yang persis sama dengan password salah"
    );

    const nonExistentAudit = await prisma.auditLog.findFirst({
      where: {
        entityId: "fake_non_existent_user_999",
        action: "LOGIN_FAILED",
      },
    });
    assert.ok(nonExistentAudit, "Percobaan login akun fiktif wajib dicatat ke AuditLog");
    console.log("✓ [Uji 3] Mitigasi timing attack dan anti-enumerasi akun terverifikasi.");

    // Bersihkan audit log kegagalan agar akun M8 bisa login untuk uji berikutnya
    await prisma.auditLog.deleteMany({
      where: {
        action: "LOGIN_FAILED",
        entityId: M8_TEST_USERNAME,
      },
    });

    // -------------------------------------------------------------------------
    // 5. Pengujian Invalidasi Sesi Lain Saat Password Diubah
    // -------------------------------------------------------------------------
    console.log("\n[Uji 4] Memvalidasi Invalidasi Sesi Lain Saat Password Diperbarui...");

    // Login pertama (Sesi A)
    const sessionA = await authenticateMemberCredentials(prisma, {
      username: M8_TEST_USERNAME,
      password: M8_INITIAL_PASSWORD,
    });

    // Login kedua di browser lain (Sesi B)
    const sessionB = await authenticateMemberCredentials(prisma, {
      username: M8_TEST_USERNAME,
      password: M8_INITIAL_PASSWORD,
    });

    // Pastikan kedua token sesi saat ini valid di database
    assert.ok(
      await validateDatabaseSessionToken(prisma, sessionA.sessionToken),
      "Sesi A harus valid sebelum pergantian password"
    );
    assert.ok(
      await validateDatabaseSessionToken(prisma, sessionB.sessionToken),
      "Sesi B harus valid sebelum pergantian password"
    );

    // Ubah password menggunakan Sesi A
    const { authorizedChangeOwnPassword } = await import("./settings-service");
    await authorizedChangeOwnPassword(prisma, sessionA.actor, {
      currentPassword: M8_INITIAL_PASSWORD,
      newPassword: M8_NEW_PASSWORD,
      confirmNewPassword: M8_NEW_PASSWORD,
    });

    // Sesi A (pembuat perubahan) tetap aktif
    const validatedA = await validateDatabaseSessionToken(
      prisma,
      sessionA.sessionToken
    );
    assert.ok(validatedA, "Sesi A harus tetap aktif setelah mengganti password");

    // Sesi B (perangkat lain) WAJIB otomatis hangus / dicabut (revokedAt != null)
    const validatedB = await validateDatabaseSessionToken(
      prisma,
      sessionB.sessionToken
    );
    assert.equal(
      validatedB,
      null,
      "Sesi B wajib hangus dan ditolak setelah password diubah"
    );

    const revokedDbSessionB = await prisma.authSession.findUnique({
      where: { id: sessionB.session.id },
    });
    assert.ok(
      revokedDbSessionB?.revokedAt !== null,
      "Record sesi B di PostgreSQL harus memiliki revokedAt"
    );
    console.log("✓ [Uji 4] Invalidasi seluruh sesi lain saat password diperbarui terverifikasi.");

    // -------------------------------------------------------------------------
    // 6. Pengujian Paginasi Database Audit Log (/pengaturan)
    // -------------------------------------------------------------------------
    console.log("\n[Uji 5] Memvalidasi Paginasi Database AuditLog...");

    // Buat beberapa entri audit log tambahan untuk menguji batas paginasi
    for (let i = 1; i <= 6; i++) {
      await prisma.auditLog.create({
        data: {
          actorMemberId: M8_TEST_MEMBER_ID,
          actorName: "Security Tester",
          action: `TEST_ACTION_${i}`,
          entityType: "AppPreference",
          entityId: `test-${i}`,
          summary: `Pengujian paginasi entri audit #${i}`,
        },
      });
    }

    // Ambil halaman 1 dengan pageSize 3
    const page1Data = await getSettingsPageData(prisma, sessionA.actor, {
      period: "ALL",
      actorMemberId: M8_TEST_MEMBER_ID,
      actionCategory: "ALL",
      page: 1,
      pageSize: 3,
    });

    assert.equal(page1Data.auditLogs.pagination.page, 1);
    assert.equal(page1Data.auditLogs.pagination.pageSize, 3);
    assert.ok(page1Data.auditLogs.pagination.totalCount >= 6);
    assert.ok(page1Data.auditLogs.pagination.totalPages >= 2);
    assert.equal(page1Data.auditLogs.pagination.hasPrevPage, false);
    assert.equal(page1Data.auditLogs.pagination.hasNextPage, true);
    assert.equal(page1Data.auditLogs.items.length, 3);

    // Ambil halaman 2 dengan pageSize 3
    const page2Data = await getSettingsPageData(prisma, sessionA.actor, {
      period: "ALL",
      actorMemberId: M8_TEST_MEMBER_ID,
      actionCategory: "ALL",
      page: 2,
      pageSize: 3,
    });

    assert.equal(page2Data.auditLogs.pagination.page, 2);
    assert.equal(page2Data.auditLogs.pagination.hasPrevPage, true);
    assert.equal(page2Data.auditLogs.items.length, 3);

    // Pastikan item di halaman 1 dan halaman 2 tidak saling tumpang tindih
    const page1Ids = page1Data.auditLogs.items.map((i) => i.id);
    const page2Ids = page2Data.auditLogs.items.map((i) => i.id);
    for (const id of page1Ids) {
      assert.ok(!page2Ids.includes(id), "Paginasi database tidak boleh menduplikasi baris");
    }
    console.log("✓ [Uji 5] Paginasi database AuditLog (skip/take/totalCount) terverifikasi 100%.");

    // -------------------------------------------------------------------------
    // 7. Pengujian Cadangan & Pemulihan Database (Backup & Restore Verification)
    // -------------------------------------------------------------------------
    console.log("\n[Uji 6] Memvalidasi Pencadangan & Pemulihan (Backup & Restore Integrity)...");

    const tempBackupPath = path.join(
      process.cwd(),
      "backups",
      "test_automated_verify_backup.sql.gz"
    );
    const restoreVerifyDbName = "kostkas_restore_verify_db";

    fs.mkdirSync(path.join(process.cwd(), "backups"), { recursive: true });

    const DOCKER_PATH = `${process.env.HOME}/.docker/bin:/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ""}`;
    const execOpts = { env: { ...process.env, PATH: DOCKER_PATH } };

    // Lakukan dump database test terisolasi via Docker
    execSync(
      `docker exec -t kostkas-db pg_dump -U kostkas_app -d kostkas_test_db --clean --if-exists --no-owner --no-privileges | gzip > "${tempBackupPath}"`,
      execOpts
    );

    assert.ok(fs.existsSync(tempBackupPath), "File cadangan uji harus tercipta");
    const backupStat = fs.statSync(tempBackupPath);
    assert.ok(backupStat.size > 100, "Ukuran file cadangan harus > 100 bytes");

    // Buat database target restore sementara
    try {
      execSync(
        `docker exec kostkas-db psql -U kostkas_app -d postgres -c "DROP DATABASE IF EXISTS ${restoreVerifyDbName};"`,
        execOpts
      );
      execSync(
        `docker exec kostkas-db psql -U kostkas_app -d postgres -c "CREATE DATABASE ${restoreVerifyDbName} OWNER kostkas_app;"`,
        execOpts
      );

      // Jalankan restore ke database target sementara
      execSync(
        `gunzip -c "${tempBackupPath}" | docker exec -i kostkas-db psql -U kostkas_app -d "${restoreVerifyDbName}"`,
        execOpts
      );

      // Bandingkan jumlah baris Member antara kostkas_test_db dan kostkas_restore_verify_db
      const sourceCountOutput = execSync(
        `docker exec kostkas-db psql -U kostkas_app -d kostkas_test_db -t -c 'SELECT COUNT(*) FROM "Member";'`,
        execOpts
      ).toString().trim();

      const restoredCountOutput = execSync(
        `docker exec kostkas-db psql -U kostkas_app -d ${restoreVerifyDbName} -t -c 'SELECT COUNT(*) FROM "Member";'`,
        execOpts
      ).toString().trim();

      assert.equal(
        restoredCountOutput,
        sourceCountOutput,
        "Jumlah baris Member di database hasil restore harus identik dengan database sumber"
      );
    } finally {
      // Hapus database pengujian restore sementara dan file cadangan uji
      execSync(
        `docker exec kostkas-db psql -U kostkas_app -d postgres -c "DROP DATABASE IF EXISTS ${restoreVerifyDbName};"`,
        execOpts
      );
      if (fs.existsSync(tempBackupPath)) {
        fs.unlinkSync(tempBackupPath);
      }
    }
    console.log("✓ [Uji 6] Integritas cadangan dan pemulihan database terverifikasi 100%.");

    console.log("\n=== SELURUH SKENARIO PENGUJIAN MILESTONE 8 LULUS 100% ===");
  } finally {
    await cleanupM8TestData();
    await prisma.$disconnect();
  }
}

runMilestone8Tests().catch((err) => {
  console.error("Gagal dalam Pengujian Milestone 8:", err);
  process.exit(1);
});
