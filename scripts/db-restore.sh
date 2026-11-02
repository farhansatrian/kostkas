#!/usr/bin/env bash
# =============================================================================
# KostKas — Skrip Pemulihan Database (Database Disaster Recovery / Restore)
# =============================================================================
# Skrip ini memulihkan database PostgreSQL dari file cadangan .sql.gz.
# PENGAMAN FAIL-CLOSED: Memerlukan konfirmasi eksplisit CONFIRM_RESTORE=YES.
# =============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Penggunaan: $0 <path-to-backup-file.sql.gz>" >&2
  echo "Contoh: $0 backups/kostkas_backup_20261102_120000.sql.gz" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[KostKas Restore ERROR] File cadangan tidak ditemukan: $BACKUP_FILE" >&2
  exit 1
fi

# Pengaman konfirmasi fail-closed untuk mencegah eksekusi tidak sengaja
if [ "${CONFIRM_RESTORE:-}" != "YES" ]; then
  echo "====================================================================="
  echo "PERINGATAN KRITIS: PEMULIHAN DATABASE AKAN MENIMPA DATA SAAT INI!"
  echo "====================================================================="
  echo "File cadangan yang akan dipulihkan: $BACKUP_FILE"
  echo ""
  echo "Untuk melanjutkan, jalankan perintah ini dengan variabel CONFIRM_RESTORE=YES:"
  echo "  CONFIRM_RESTORE=YES $0 $BACKUP_FILE"
  echo "====================================================================="
  exit 1
fi

echo "[KostKas Restore] Memulai proses pemulihan dari: $BACKUP_FILE..."

# Mode 1: Restore ke kontainer Docker kostkas-db
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "^kostkas-db$"; then
  echo "[KostKas Restore] Memulihkan ke kontainer Docker 'kostkas-db'..."
  CONTAINER_USER=$(docker exec kostkas-db printenv POSTGRES_USER || echo "kostkas_app")
  CONTAINER_DB="${TARGET_DATABASE:-$(docker exec kostkas-db printenv POSTGRES_DB || echo "kostkas_db")}"

  gunzip -c "$BACKUP_FILE" | docker exec -i kostkas-db psql -U "$CONTAINER_USER" -d "$CONTAINER_DB"
  echo "[KostKas Restore SUKSES] Database '$CONTAINER_DB' berhasil dipulihkan dari $BACKUP_FILE."

# Mode 2: Restore via DATABASE_URL lokal
elif command -v psql >/dev/null 2>&1 && [ -n "${TARGET_DATABASE_URL:-${DATABASE_URL:-}}" ]; then
  RESTORE_URL="${TARGET_DATABASE_URL:-$DATABASE_URL}"
  echo "[KostKas Restore] Memulihkan via psql ke URL target..."
  gunzip -c "$BACKUP_FILE" | psql "$RESTORE_URL"
  echo "[KostKas Restore SUKSES] Database berhasil dipulihkan dari $BACKUP_FILE."

else
  echo "[KostKas Restore ERROR] Tidak dapat menemukan kontainer 'kostkas-db' atau binary psql." >&2
  exit 1
fi

