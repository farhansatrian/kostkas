# Panduan Cadangan & Pemulihan Database KostKas (`BACKUP_AND_RESTORE.md`)

Dokumen ini menjelaskan strategi cadangan (*backup*), jadwal retensi, mitigasi risiko kehilangan data (*disaster recovery*), serta langkah-langkah verifikasi otomatis untuk database **KostKas**.

---

## 1. Strategi & Kebijakan Backup Keuangan Kost

Untuk menjamin integritas pembukuan uang kas bersama penghuni kost:
- **Recovery Point Objective (RPO)**: Maksimal 24 jam (pencadangan otomatis dilakukan setiap hari).
- **Recovery Time Objective (RTO)**: Kurang dari 15 menit (proses *restore* langsung dari file `.sql.gz`).
- **Retensi File Cadangan**: Disimpan selama 14 hari di server lokal/VM, dan cadangan mingguan dapat disalin ke penyimpanan terpisah yang aman.
- **Prinsip Keamanan Tanpa Kredensial**:
  - File cadangan (`*.sql.gz`, `*.dump`) dan folder `/backups/` **DILARANG KERAS** dimasukkan ke dalam Git (*diabaikan secara ketat oleh `.gitignore`*).
  - Skrip membaca kredensial dari environment server atau kontainer internal Docker, bukan dari argumen teks biasa atau baris perintah terbuka.

---

## 2. Struktur Skrip Operasional

| Skrip | Lokasi | Fungsi |
| :--- | :--- | :--- |
| `db-backup.sh` | `scripts/db-backup.sh` | Menjalankan `pg_dump`, melakukan kompresi `gzip`, memvalidasi ukuran file, dan membersihkan arsip > 14 hari. |
| `db-restore.sh` | `scripts/db-restore.sh` | Memulihkan database dari arsip cadangan dengan pengaman konfirmasi fail-closed (`CONFIRM_RESTORE=YES`). |

---

## 3. Menjalankan Backup Manual

Jalankan perintah berikut di direktori utama proyek:

```bash
./scripts/db-backup.sh
```

Contoh keluaran sukses:
```
[KostKas Backup] Menggunakan kontainer Docker 'kostkas-db'...
[KostKas Backup SUKSES] File cadangan berhasil dibuat: kostkas_backup_20261102_164500.sql.gz (18K)
[KostKas Backup] Membersihkan file cadangan lebih tua dari 14 hari...
[KostKas Backup Selesai]
```

File hasil cadangan akan tersimpan di dalam folder `backups/`.

---

## 4. Penjadwalan Otomatis di VM (Linux Cron Job)

Pada Virtual Machine (VM) kost, jadwalkan eksekusi backup setiap dini hari pukul **03:00 WIB** menggunakan `crontab -e`:

```cron
# Cadangkan database KostKas setiap hari pukul 03:00 WIB
0 3 * * * cd /home/kostuser/kostkas && ./scripts/db-backup.sh >> /var/log/kostkas-backup.log 2>&1
```

---

## 5. Prosedur Disaster Recovery (Pemulihan Data)

Untuk memulihkan database ketika terjadi kegagalan sistem atau kehilangan data:

### Langkah 1: Pilih File Cadangan Terakhir
Periksa daftar arsip di folder `backups/`:
```bash
ls -la backups/
```

### Langkah 2: Jalankan Pemulihan dengan Konfirmasi Fail-Closed
Skrip `db-restore.sh` secara sengaja menolak perintah tanpa konfirmasi eksplisit untuk mencegah penghapusan data tidak sengaja:

```bash
CONFIRM_RESTORE=YES ./scripts/db-restore.sh backups/kostkas_backup_YYYYMMDD_HHMMSS.sql.gz
```

Jika ingin memulihkan ke database tertentu (misalnya target pengujian/staging):
```bash
TARGET_DATABASE=kostkas_staging_db CONFIRM_RESTORE=YES ./scripts/db-restore.sh backups/kostkas_backup_YYYYMMDD_HHMMSS.sql.gz
```

---

## 6. Verifikasi Integritas Data Pasca-Restore

Setelah proses pemulihan selesai, lakukan pemeriksaan integritas:
1. Jalankan `npm run test:db` untuk memverifikasi konsistensi buku besar (*ledger*).
2. Periksa saldo kas dan mutasi kas terakhir di UI atau melalui query read-only:
   ```sql
   SELECT SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END) AS actual_balance FROM "CashMovement" WHERE status = 'CONFIRMED';
   ```
3. Pastikan tidak ada transaksi yang terputus atau saldo kas negatif tanpa persetujuan.

