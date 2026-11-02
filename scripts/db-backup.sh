#!/usr/bin/env bash
# =============================================================================
# KostKas — Skrip Cadangan Database Otomatis (Automated PostgreSQL Backup)
# =============================================================================
# Skrip ini mencadangkan database PostgreSQL ke folder backups/ dengan kompresi gzip.
# Tidak ada kredensial atau password yang ditulis di dalam skrip ini.
# Sumber konfigurasi: Environment variables atau Docker Compose container.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_ROOT}/backups"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILENAME="kostkas_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

mkdir -p "$BACKUP_DIR"

# Prioritas 1: Jalankan pg_dump via Docker container kostkas-db jika aktif
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "^kostkas-db$"; then
  echo "[KostKas Backup] Menggunakan kontainer Docker 'kostkas-db'..."
  
  # Ambil user dan db dari environment container atau default kostkas_app
  CONTAINER_USER=$(docker exec kostkas-db printenv POSTGRES_USER || echo "kostkas_app")
  CONTAINER_DB=$(docker exec kostkas-db printenv POSTGRES_DB || echo "kostkas_db")

  docker exec -t kostkas-db pg_dump -U "$CONTAINER_USER" -d "$CONTAINER_DB" --clean --if-exists --no-owner --no-privileges | gzip > "$BACKUP_PATH"

# Prioritas 2: Gunakan pg_dump lokal jika DATABASE_URL tersedia
elif command -v pg_dump >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
  echo "[KostKas Backup] Menggunakan pg_dump sistem via DATABASE_URL..."
  pg_dump "$DATABASE_URL" --clean --if-exists --no-owner --no-privileges | gzip > "$BACKUP_PATH"

else
  echo "[KostKas Backup ERROR] Tidak dapat menemukan kontainer 'kostkas-db' yang berjalan atau binary pg_dump dengan DATABASE_URL." >&2
  exit 1
fi

# Validasi bahwa file backup terbentuk dan tidak kosong
if [ -s "$BACKUP_PATH" ]; then
  FILE_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
  echo "[KostKas Backup SUKSES] File cadangan berhasil dibuat: ${BACKUP_FILENAME} (${FILE_SIZE})"
else
  echo "[KostKas Backup ERROR] File cadangan berukuran 0 byte. Pencadangan gagal!" >&2
  rm -f "$BACKUP_PATH"
  exit 1
fi

# Retensi: Hapus file cadangan yang lebih tua dari 14 hari
echo "[KostKas Backup] Membersihkan file cadangan lebih tua dari 14 hari..."
find "$BACKUP_DIR" -type f -name "kostkas_backup_*.sql.gz" -mtime +14 -exec rm -f {} \; || true
echo "[KostKas Backup Selesai]"

