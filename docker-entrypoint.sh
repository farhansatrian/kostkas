#!/bin/sh
set -e

echo "=== KostKas Production Container Starting ==="

# Jalankan migrasi Prisma secara otomatis jika RUN_MIGRATIONS bernilai true (default)
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "=> Memeriksa & menjalankan migrasi PostgreSQL (prisma migrate deploy)..."
  if command -v prisma >/dev/null 2>&1; then
    if prisma migrate deploy; then
      echo "=> Migrasi database selesai diaplikasikan."
    else
      echo "=> [FATAL ERROR] Gagal mengaplikasikan migrasi database. Membatalkan startup server..." >&2
      exit 1
    fi
  elif [ -f "./node_modules/prisma/build/index.js" ]; then
    if node ./node_modules/prisma/build/index.js migrate deploy; then
      echo "=> Migrasi database selesai diaplikasikan."
    else
      echo "=> [FATAL ERROR] Gagal mengaplikasikan migrasi database via binary lokal. Membatalkan startup..." >&2
      exit 1
    fi
  else
    echo "=> Peringatan: Binary prisma tidak ditemukan. Melewati migrasi otomatis."
  fi
fi

echo "=> Menjalankan server aplikasi KostKas pada port ${PORT:-3000}..."
exec "$@"
