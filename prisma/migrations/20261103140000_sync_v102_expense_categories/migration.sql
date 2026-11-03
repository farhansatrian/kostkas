-- Migration: 20261103140000_sync_v102_expense_categories
-- Tujuan: Sinkronisasi non-destruktif 5 kategori default KostKas v1.0.2 dan penonaktifan kategori legacy
-- Sifat: Data-only, idempotent, zero data loss (mempertahankan seluruh foreign key & transaksi historis)

-- 1. Pastikan 5 kategori operasional final aktif di tingkat root
INSERT INTO "ExpenseCategory" ("id", "slug", "name", "parentId", "isActive", "createdAt", "updatedAt")
VALUES
    (gen_random_uuid(), 'galon', 'Galon', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'listrik', 'Listrik', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'wifi', 'Wi-Fi', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'alat-mandi', 'Alat Mandi', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'lainnya', 'Lainnya', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
    "name" = EXCLUDED."name",
    "isActive" = true,
    "parentId" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP;

-- 2. Nonaktifkan kategori legacy agar tidak muncul di form transaksi baru,
--    namun pertahankan baris data secara utuh agar transaksi & pagu anggaran historis tidak hilang.
UPDATE "ExpenseCategory"
SET
    "isActive" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" IN (
    'galon-gas',
    'listrik-wifi',
    'kebersihan-dapur',
    'perbaikan',
    'tagihan-utilitas',
    'konsumsi-bersama',
    'kebersihan',
    'perawatan',
    'token-listrik',
    'air-galon',
    'kebutuhan-dapur',
    'kebersihan-kamar-mandi'
)
AND "isActive" = true;

