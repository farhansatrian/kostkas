import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Validasi fail-closed untuk memastikan test suite KostKas hanya berjalan
 * di atas database pengujian terisolasi (contoh: kostkas_test_db),
 * dan TIDAK PERNAH menyentuh database development (kostkas_db) maupun production.
 */
export function assertTestDatabaseIsolation(): string {
  const testDbUrl = process.env.TEST_DATABASE_URL;

  if (!testDbUrl || testDbUrl.trim() === "") {
    throw new Error(
      "FAIL-CLOSED TEST GUARD: Variabel environment TEST_DATABASE_URL tidak ditemukan. " +
        "Automated test suites diwajibkan menggunakan database terisolasi (contoh: kostkas_test_db). " +
        "Pengujian dibatalkan secara aman untuk mencegah kerusakan data."
    );
  }

  let parsedTestUrl: URL;
  try {
    parsedTestUrl = new URL(testDbUrl);
  } catch (err) {
    throw new Error(
      `FAIL-CLOSED TEST GUARD: Format TEST_DATABASE_URL tidak valid: ${(err as Error).message}`
    );
  }

  const testDbName = parsedTestUrl.pathname.replace(/^\//, "");
  if (!testDbName) {
    throw new Error(
      "FAIL-CLOSED TEST GUARD: Nama database pada TEST_DATABASE_URL kosong."
    );
  }

  // Database pengujian DILARANG KERAS sama dengan database development
  const devDbUrl = process.env.DATABASE_URL;
  if (devDbUrl) {
    if (testDbUrl.trim() === devDbUrl.trim()) {
      throw new Error(
        "FAIL-CLOSED TEST GUARD: TEST_DATABASE_URL identik dengan DATABASE_URL! " +
          "Automated tests dilarang menggunakan database development. Harap gunakan database terpisah (kostkas_test_db)."
      );
    }

    try {
      const parsedDevUrl = new URL(devDbUrl);
      const devDbName = parsedDevUrl.pathname.replace(/^\//, "");
      if (devDbName && devDbName.toLowerCase() === testDbName.toLowerCase()) {
        throw new Error(
          `FAIL-CLOSED TEST GUARD: Nama database test '${testDbName}' sama dengan nama database development '${devDbName}'. ` +
            "Pengujian dibatalkan secara fail-closed."
        );
      }
    } catch (err) {
      if ((err as Error).message.includes("FAIL-CLOSED TEST GUARD")) {
        throw err;
      }
    }
  }

  // Database pengujian WAJIB memiliki indikasi 'test' pada namanya
  if (!testDbName.toLowerCase().includes("test")) {
    throw new Error(
      `FAIL-CLOSED TEST GUARD: Nama database '${testDbName}' tidak memuat kata 'test'. ` +
        "Untuk keamanan data, database pengujian harus secara eksplisit bernama test (contoh: kostkas_test_db)."
    );
  }

  return testDbUrl;
}

const verifiedTestDatabaseUrl = assertTestDatabaseIsolation();

function createTestPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: verifiedTestDatabaseUrl });
  return new PrismaClient({ adapter });
}

const globalForTestPrisma = globalThis as unknown as {
  testPrisma: PrismaClient | undefined;
};

export const testPrisma = globalForTestPrisma.testPrisma ?? createTestPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForTestPrisma.testPrisma = testPrisma;
}

export const prisma = testPrisma;
