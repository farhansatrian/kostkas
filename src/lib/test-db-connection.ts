import "dotenv/config";
import { prisma } from "./prisma";

interface ColumnMetadata {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

async function verifyDatabaseConnection(): Promise<void> {
  try {
    const ping = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 AS result`;
    const memberCount = await prisma.member.count();
    const columns = await prisma.$queryRaw<ColumnMetadata[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Member'
      ORDER BY ordinal_position
    `;

    console.log("1. Koneksi PostgreSQL (SELECT 1):", JSON.stringify(ping));
    console.log("2. Jumlah baris di tabel Member saat ini:", memberCount);
    console.log("3. Struktur kolom tabel Member di PostgreSQL:", JSON.stringify(columns));
  } finally {
    await prisma.$disconnect();
  }
}

verifyDatabaseConnection().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("Gagal memverifikasi database:", message);
  process.exit(1);
});
