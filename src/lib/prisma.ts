import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // Fallback aman agar proses kompilasi 'next build' (static analysis) di Dockerfile tidak gagal
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[KostKas Warning] Variabel DATABASE_URL tidak ditemukan di environment saat inisialisasi Prisma."
      );
    }
    const adapter = new PrismaPg({
      connectionString:
        "postgresql://build_placeholder:build_placeholder@127.0.0.1:5432/build_placeholder",
    });
    return new PrismaClient({ adapter });
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
