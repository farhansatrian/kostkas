import "dotenv/config";
import { assertTestDatabaseIsolation, prisma as db } from "./test-db";
import {
  bootstrapInitialMember,
  DEFAULT_EXPENSE_CATEGORIES,
  ensureSystemDefaults,
} from "./bootstrap-service";
import { verifyPassword } from "./auth";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

async function cleanAllTestData() {
  await db.authSession.deleteMany();
  await db.payment.deleteMany();
  await db.contributionCharge.deleteMany();
  await db.reimbursementPayout.deleteMany();
  await db.reimbursement.deleteMany();
  await db.expense.deleteMany();
  await db.cashMovement.deleteMany();
  await db.auditLog.deleteMany();
  await db.userAccount.deleteMany();
  await db.member.deleteMany();
  await db.expenseCategory.deleteMany();
  await db.cashAccount.deleteMany();
  await db.contributionPolicy.deleteMany();
}

async function runMilestone10Tests() {
  console.log("=== Memulai Pengujian Keamanan & Kesiapan Milestone 10 (First-Time Web Setup Security Gate) ===");

  // Pengaman fail-closed: hanya boleh berjalan pada database khusus test
  assertTestDatabaseIsolation();

  const VALID_TEST_TOKEN = "test_setup_secret_token_1234567890_hex";
  process.env.INITIAL_SETUP_TOKEN = VALID_TEST_TOKEN;

  try {
    // -------------------------------------------------------------------------
    // Skenario 1: Basis Database Kosong
    // -------------------------------------------------------------------------
    console.log("\n[Uji 1] Membersihkan data test database...");
    await cleanAllTestData();
    const countZero = await db.userAccount.count();
    assert(countZero === 0, "Database test harus memiliki 0 akun sebelum inisialisasi.");
    console.log("✓ [Uji 1] Database test bersih, 0 akun terdaftar.");

    // -------------------------------------------------------------------------
    // Skenario 2: Bootstrap Ditolak Jika Tanpa Token
    // -------------------------------------------------------------------------
    console.log("\n[Uji 2] Memverifikasi penolakan bootstrap tanpa token (fail-closed)...");
    let caughtNoToken = false;
    try {
      await bootstrapInitialMember(db, {
        name: "Farhan",
        username: "farhan",
        plainPassword: "SuperSecurePassword123!",
        setupToken: "",
      });
    } catch (err: unknown) {
      caughtNoToken = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(
        msg.includes("Token setup inisialisasi awal wajib diisi"),
        `Pesan error salah: ${msg}`
      );
    }
    assert(caughtNoToken, "Bootstrap tanpa token harus melempar error!");
    console.log("✓ [Uji 2] Bootstrap tanpa token berhasil ditolak secara aman.");

    // -------------------------------------------------------------------------
    // Skenario 3: Bootstrap Ditolak Jika Token Salah (Timing-Safe)
    // -------------------------------------------------------------------------
    console.log("\n[Uji 3] Memverifikasi penolakan bootstrap dengan token salah...");
    let caughtWrongToken = false;
    try {
      await bootstrapInitialMember(db, {
        name: "Farhan",
        username: "farhan",
        plainPassword: "SuperSecurePassword123!",
        setupToken: "token_palsu_yang_salah_total_123456789",
      });
    } catch (err: unknown) {
      caughtWrongToken = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(
        msg.includes("Token setup inisialisasi awal tidak valid"),
        `Pesan error salah: ${msg}`
      );
    }
    assert(caughtWrongToken, "Bootstrap dengan token salah harus melempar error!");
    console.log("✓ [Uji 3] Bootstrap dengan token salah berhasil ditolak secara timing-safe.");

    // -------------------------------------------------------------------------
    // Skenario 4: Bootstrap Berhasil dengan Token yang Benar
    // -------------------------------------------------------------------------
    console.log("\n[Uji 4] Menguji bootstrap akun pertama (Farhan) dengan token benar...");
    const { member, account } = await bootstrapInitialMember(db, {
      name: "Farhan",
      username: "farhan",
      plainPassword: "SuperSecurePassword123!",
      setupToken: VALID_TEST_TOKEN,
    });

    assert(member.name === "Farhan", "Nama member harus Farhan.");
    assert(account.username === "farhan", "Username harus farhan.");

    const isPassValid = await verifyPassword(
      "SuperSecurePassword123!",
      account.passwordHash
    );
    assert(isPassValid, "Password bcrypt hash harus valid untuk password awal.");

    const audit = await db.auditLog.findFirst({
      where: { action: "INITIAL_SYSTEM_BOOTSTRAP" },
    });
    assert(audit !== null, "AuditLog INITIAL_SYSTEM_BOOTSTRAP harus tercatat.");
    console.log("✓ [Uji 4] Akun pertama berhasil dibuat, bcrypt valid, dan AuditLog tercatat.");

    // -------------------------------------------------------------------------
    // Skenario 5: Bootstrap Kedua DITOLAK Sekalipun Token Benar (Permanently Locked)
    // -------------------------------------------------------------------------
    console.log("\n[Uji 5] Memverifikasi bootstrap kedua ditolak setelah sistem aktif...");
    let caughtSecondBootstrap = false;
    try {
      await bootstrapInitialMember(db, {
        name: "Nabeel",
        username: "nabeel",
        plainPassword: "PasswordNabeel123!",
        setupToken: VALID_TEST_TOKEN,
      });
    } catch (err: unknown) {
      caughtSecondBootstrap = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(
        msg.includes("Inisialisasi akun awal ditolak: sistem sudah memiliki akun terdaftar"),
        `Pesan error salah: ${msg}`
      );
    }
    assert(caughtSecondBootstrap, "Bootstrap kedua wajib ditolak 100%!");
    console.log("✓ [Uji 5] Bootstrap kedua berhasil ditolak (sistem terkunci permanen).");

    // -------------------------------------------------------------------------
    // Skenario 6: Uji Konkurensi (Concurrent Bootstrap Attack / Race Condition)
    // -------------------------------------------------------------------------
    console.log("\n[Uji 6] Menguji 2 request bootstrap yang dipanggil bersamaan (Concurrent Bootstrap)...");
    // Reset database kembali ke 0 akun
    await cleanAllTestData();
    const countBeforeConcurrency = await db.userAccount.count();
    assert(countBeforeConcurrency === 0, "Database harus 0 sebelum uji konkurensi.");

    const req1 = bootstrapInitialMember(db, {
      name: "User Paralel 1",
      username: "paralel1",
      plainPassword: "ParalelPassword1!",
      setupToken: VALID_TEST_TOKEN,
    });

    const req2 = bootstrapInitialMember(db, {
      name: "User Paralel 2",
      username: "paralel2",
      plainPassword: "ParalelPassword2!",
      setupToken: VALID_TEST_TOKEN,
    });

    const results = await Promise.allSettled([req1, req2]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert(
      fulfilled.length === 1,
      `Tepat 1 request yang boleh berhasil pada eksekusi paralel. Didapat: ${fulfilled.length}`
    );
    assert(
      rejected.length === 1,
      `Tepat 1 request yang harus ditolak pada eksekusi paralel. Didapat: ${rejected.length}`
    );

    const totalAccountsAfter = await db.userAccount.count();
    assert(
      totalAccountsAfter === 1,
      `Database hanya boleh memiliki tepat 1 akun setelah race condition. Didapat: ${totalAccountsAfter}`
    );

    const totalMembersAfter = await db.member.count();
    assert(
      totalMembersAfter === 1,
      `Database hanya boleh memiliki tepat 1 member setelah race condition. Didapat: ${totalMembersAfter}`
    );
    console.log("✓ [Uji 6] Advisory transaction lock mencegah race condition: tepat 1 request berhasil, 1 ditolak.");

    // -------------------------------------------------------------------------
    // Skenario 7: Idempotency Master Data Operasional
    // -------------------------------------------------------------------------
    console.log("\n[Uji 7] Menguji idempotency master data...");
    await ensureSystemDefaults(db);
    const totalCategories = await db.expenseCategory.count();
    assert(
      totalCategories === DEFAULT_EXPENSE_CATEGORIES.length,
      `Jumlah total kategori harus tetap ${DEFAULT_EXPENSE_CATEGORIES.length} (aktual: ${totalCategories}).`
    );

    const cashAccount = await db.cashAccount.findUnique({ where: { code: "DANA_KAS" } });
    assert(cashAccount !== null && cashAccount.name === "DANA Kas Kost", "DANA Kas Kost valid.");

    const policy = await db.contributionPolicy.findUnique({
      where: { code: "DEFAULT_MONTHLY_DUES" },
    });
    assert(policy !== null && policy.amountPerMember === 150000, "Tarif iuran valid.");
    console.log("✓ [Uji 7] Master data kas DANA, tarif Rp150.000, dan kategori idempotent 100%.");

    console.log("\n=== SELURUH PENGUJIAN KEAMANAN FIRST-TIME SETUP LULUS 100% ===");
  } finally {
    await db.$disconnect();
  }
}

runMilestone10Tests().catch((err) => {
  console.error("\n[GAGAL TEST KEAMANAN MILESTONE 10]:", err);
  process.exit(1);
});
