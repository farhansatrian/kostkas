import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { syncExpenseCategoriesNonDestructive } from "../src/lib/expense-category-service";

async function main() {
  console.log("=== KostKas — Sinkronisasi Kategori Non-Destruktif (v1.0.2) ===");
  const result = await syncExpenseCategoriesNonDestructive(prisma);

  console.log("\n1. Kategori Default Final Aktif:");
  for (const cat of result.ensuredFinalCategories) {
    console.log(`   ✓ ${cat}`);
  }

  console.log("\n2. Kategori Legacy yang Dipertahankan (Histori Aman):");
  if (result.preservedUsedLegacy.length === 0) {
    console.log("   (Tidak ada kategori legacy dengan riwayat transaksi)");
  } else {
    for (const leg of result.preservedUsedLegacy) {
      console.log(`   • ${leg} -> dinonaktifkan untuk transaksi baru, histori utuh`);
    }
  }

  console.log("\n3. Kategori Legacy Kosong yang Dinonaktifkan:");
  if (result.deactivatedUnusedLegacy.length === 0) {
    console.log("   (Tidak ada)");
  } else {
    for (const leg of result.deactivatedUnusedLegacy) {
      console.log(`   - ${leg}`);
    }
  }

  console.log("\n=== SINKRONISASI KATEGORI SELESAI DENGAN SUKSES ===");
}

main()
  .catch((err) => {
    console.error("Gagal melakukan sinkronisasi kategori:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

