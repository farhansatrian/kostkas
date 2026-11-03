-- Migration: 20261103140000_sync_v102_expense_categories
-- Tujuan: Sinkronisasi non-destruktif 5 kategori default KostKas v1.0.2 dan penonaktifan kategori legacy
-- Sifat: Data-only, transaksi PostgreSQL eksplisit (BEGIN/COMMIT), idempotent sejati, zero data loss

BEGIN;

-- 1. Pastikan 5 kategori operasional final aktif di tingkat root.
--    Jika kategori sudah ada:
--    - Hanya perbarui "name", "isActive", dan "updatedAt" jika terdapat perbedaan data (true idempotency).
--    - Tangani "parentId": jika sebelumnya menjadi anak dari kategori legacy yang dinonaktifkan,
--      lepaskan hubungannya ("parentId" = NULL) agar dapat digunakan mandiri di tingkat root.
--    - Jika sudah memiliki parent aktif non-legacy, pertahankan relasi parent/subcategory yang dibuat pengguna.
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
    "parentId" = CASE
        WHEN "ExpenseCategory"."parentId" IN (
            SELECT "id" FROM "ExpenseCategory" WHERE "slug" IN (
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
        ) THEN NULL
        ELSE "ExpenseCategory"."parentId"
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE
    "ExpenseCategory"."name" IS DISTINCT FROM EXCLUDED."name"
    OR "ExpenseCategory"."isActive" IS NOT TRUE
    OR (
        "ExpenseCategory"."parentId" IS NOT NULL
        AND "ExpenseCategory"."parentId" IN (
            SELECT "id" FROM "ExpenseCategory" WHERE "slug" IN (
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
        )
    );

-- 2. Nonaktifkan kategori legacy bawaan yang telah digantikan oleh 5 kategori v1.0.2.
--    Pencocokan menggunakan slug eksak (whitelist), bukan wildcard/LIKE, sehingga kategori
--    kustom pengguna (misal: 'perbaikan-genteng', 'listrik-kamar-1') tetap 100% aman dan aktif.
--    Hanya memperbarui baris yang saat ini masih aktif ("isActive" = true), sehingga tidak
--    mengubah "updatedAt" bila sudah dinonaktifkan. Seluruh riwayat transaksi, anggaran,
--    dan log audit tetap utuh tanpa ada baris data yang dihapus.
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

COMMIT;
