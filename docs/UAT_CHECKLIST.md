# Lembar Uji Penerimaan Pengguna KostKas (`UAT_CHECKLIST.md`)

Dokumen ini memuat skenario pengujian manual menyeluruh (*End-to-End User Acceptance Testing*) yang wajib diverifikasi sebelum aplikasi KostKas di-deploy ke VM produksi.

---

## Ringkasan Matriks Pengujian

| Area Modul | Jumlah Skenario | Status Verifikasi |
| :--- | :---: | :---: |
| 1. Autentikasi, Sesi & Keamanan Akun | 6 | Siap Diuji |
| 2. Manajemen Anggota (*Members Lifecycle*) | 4 | Siap Diuji |
| 3. Iuran Bulanan (*Monthly Contributions*) | 5 | Siap Diuji |
| 4. Pengeluaran Kas & Reimbursement | 6 | Siap Diuji |
| 5. Perencanaan & Evaluasi Anggaran (*Budgeting*) | 4 | Siap Diuji |
| 6. Laporan Keuangan & Export CSV | 5 | Siap Diuji |
| 7. Pengaturan, Rekonsiliasi & Audit Log | 5 | Siap Diuji |
| 8. Cadangan & Pemulihan (*Backup & Disaster Recovery*) | 3 | Siap Diuji |

---

## 1. Autentikasi, Sesi & Keamanan Akun

- [ ] **TC-AUTH-01 (Login Berhasil)**: Masuk menggunakan username dan password yang benar. Pastikan cookie sesi `kostkas_session` tercipta dengan atribut `HttpOnly`, `SameSite=Lax`, dan pengguna diarahkan ke Dashboard.
- [ ] **TC-AUTH-02 (Login Gagal & Pesan Seragam)**: Coba masuk dengan username yang salah atau password salah. Pastikan pesan error seragam (*"Username atau password tidak sesuai."*) tanpa membocorkan eksistensi akun.
- [ ] **TC-AUTH-03 (Proteksi Brute-Force)**: Lakukan 5 kali percobaan login dengan password salah berturut-turut. Pada percobaan ke-6, pastikan sistem mengunci login sementara (*"Terlalu banyak percobaan login yang gagal... 15 menit"*).
- [ ] **TC-AUTH-04 (Ganti Password Mandiri)**: Masuk ke `/pengaturan`, ubah password akun dengan memasukkan password lama yang valid dan password baru minimal 8 karakter.
- [ ] **TC-AUTH-05 (Invalidasi Sesi Lain Saat Password Berubah)**: Buka aplikasi di 2 browser berbeda. Ubah password di browser 1. Refresh browser 2 dan pastikan sesi di browser 2 otomatis terlempar ke halaman `/login`.
- [ ] **TC-AUTH-06 (Logout & Pencabutan Sesi)**: Klik tombol Keluar (*Logout*). Pastikan cookie terhapus dan token sesi di database berstatus `revokedAt != null`.

---

## 2. Manajemen Anggota (*Members Lifecycle*)

- [ ] **TC-MEM-01 (Hak Akses Setara Seluruh Anggota)**: Masuk sebagai Farhan, Nabeel, atau Alzha. Pastikan seluruh anggota dapat melihat pembukuan dan mencatat transaksi tanpa batasan role buatan.
- [ ] **TC-MEM-02 (Pendaftaran Anggota Baru)**: Tambahkan penghuni kost baru beserta username login awal. Pastikan anggota muncul di daftar aktif.
- [ ] **TC-MEM-03 (Penonaktifan Anggota Pindah Kost)**: Nonaktifkan anggota yang telah pindah kost. Pastikan histori keanggotaannya tetap utuh, akun loginnya dinonaktifkan, dan sesinya otomatis dicabut.
- [ ] **TC-MEM-04 (Aktivasi Ulang Anggota)**: Aktifkan kembali anggota yang sebelumnya nonaktif. Pastikan anggota dapat mengakses aplikasi kembali.

---

## 3. Iuran Bulanan (*Monthly Contributions*)

- [ ] **TC-DUE-01 (Penerbitan Tagihan Rutin Idempotent)**: Klik *Terbitkan Tagihan Rutin Bulan Ini*. Pastikan tagihan tercipta untuk setiap anggota aktif sesuai tarif berlaku (misal: Rp150.000). Klik tombol sekali lagi dan pastikan tidak ada tagihan ganda yang tercipta.
- [ ] **TC-DUE-02 (Penerbitan Tagihan Tambahan Bersama)**: Terbitkan tagihan insidental (misal: "Beli Token Listrik Tambahan Rp30.000/orang"). Pastikan seluruh anggota menerima tagihan tersebut.
- [ ] **TC-DUE-03 (Pembayaran Parsial / Cicilan)**: Catat pembayaran sebagian (misal Rp100.000 dari tagihan Rp150.000). Pastikan status tagihan menjadi `PARTIALLY_PAID` dan menyisakan sisa kewajiban Rp50.000.
- [ ] **TC-DUE-04 (Pelunasan Pembayaran & Konfirmasi Kas)**: Lunasi sisa tagihan. Pastikan status menjadi `PAID` dan mutasi kas bertambah di buku besar kas.
- [ ] **TC-DUE-05 (Perubahan Tarif Periode Masa Depan)**: Atur perubahan tarif iuran untuk bulan depan (misal: Rp175.000). Pastikan tagihan bulan berjalan dan bulan lalu tidak berubah secara tidak sengaja.

---

## 4. Pengeluaran Kas & Reimbursement

- [ ] **TC-EXP-01 (Pengeluaran Langsung Kas DANA)**: Catat belanja perlengkapan kost langsung dari kas DANA. Pastikan saldo kas aktual berkurang dan tercatat di mutasi buku besar.
- [ ] **TC-EXP-02 (Pencegahan Saldo Kas Negatif)**: Catat pengeluaran langsung dengan nominal yang melebihi saldo kas DANA yang tersedia. Pastikan sistem menolak transaksi dengan pesan saldo tidak mencukupi.
- [ ] **TC-EXP-03 (Talangan Anggota / Reimbursement Claim)**: Catat pengeluaran yang ditalangi anggota (misal Nabeel menalangi galon air Rp40.000). Pastikan saldo kas DANA **belum** berkurang, namun kewajiban reimbursement bertambah Rp40.000.
- [ ] **TC-EXP-04 (Pencairan Reimbursement Parsial)**: Cairkan sebagian talangan (misal Rp20.000). Pastikan saldo kas DANA berkurang Rp20.000 dan sisa utang reimburse menjadi Rp20.000.
- [ ] **TC-EXP-05 (Tanpa Double-Counting Biaya Operasional)**: Periksa laporan pengeluaran operasional. Pastikan biaya galon air tetap dihitung Rp40.000 (tidak menjadi Rp80.000 setelah pencairan reimburse).
- [ ] **TC-EXP-06 (Penonaktifan Kategori Pengeluaran)**: Nonaktifkan kategori pengeluaran yang sudah tidak digunakan. Pastikan transaksi lama yang menggunakan kategori tersebut tetap dapat dibaca dengan benar.

---

## 5. Perencanaan & Evaluasi Anggaran (*Budgeting*)

- [ ] **TC-BDG-01 (Penyusunan Pagu Anggaran Bulanan)**: Tetapkan pagu total anggaran operasional dan alokasi per kategori di `/anggaran`.
- [ ] **TC-BDG-02 (Pemantauan Realisasi vs Pagu)**: Catat beberapa pengeluaran. Periksa indikator persentase realisasi anggaran per kategori secara visual.
- [ ] **TC-BDG-03 (Status Over-Budget)**: Catat pengeluaran yang melampaui pagu salah satu kategori. Pastikan status visual menampilkan penanda over-budget secara jelas.
- [ ] **TC-BDG-04 (Independensi Anggaran Antar-Periode)**: Beralih ke bulan berikutnya. Pastikan anggaran baru dapat disesuaikan tanpa merusak histori bulan sebelumnya.

---

## 6. Laporan Keuangan & Export CSV

- [ ] **TC-RPT-01 (Persamaan Saldo Arus Kas)**: Buka `/laporan`. Pastikan rumus: `Saldo Awal + Total Kas Masuk - Total Kas Keluar = Saldo Akhir Kas` terbukti konsisten 100%.
- [ ] **TC-RPT-02 (Pemisahan Kas Aktual vs Utang/Piutang)**: Pastikan kartu Saldo Kas, Total Piutang Iuran, dan Utang Reimbursement terpisah secara tegas.
- [ ] **TC-RPT-03 (Navigasi Periode Cepat)**: Gunakan tombol `< Bulan Lalu` dan `Bulan Depan >` atau pemilih dropdown untuk berpindah periode laporan tanpa mengetik URL manual.
- [ ] **TC-RPT-04 (Ekspor CSV Bebas Formula Injection)**: Unduh kelima jenis file CSV (Ringkasan, Cash Ledger, Pembayaran, Pengeluaran, Reimbursement). Buka di Excel/Spreadsheet dan pastikan karakter formula (`=`, `+`, `-`, `@`) telah disanitasi secara aman.
- [ ] **TC-RPT-05 (Format Angka Rupiah)**: Pastikan seluruh nominal tercetak rapi dalam Rupiah tanpa desimal janggal dan mudah dibaca.

---

## 7. Pengaturan, Rekonsiliasi & Audit Log

- [ ] **TC-SET-01 (Kustomisasi Nama Kost Dinamis)**: Ubah nama kost di `/pengaturan` (misal: "Kost Harmoni 3"). Pastikan sidebar dan header aplikasi di seluruh halaman menampilkan nama kost yang baru.
- [ ] **TC-SET-02 (Rekonsiliasi Kas DANA Manual)**: Masukkan saldo riil yang tertera di aplikasi DANA fisik. Periksa perhitungan selisih rekonsiliasi.
- [ ] **TC-SET-03 (Pencatatan Penyesuaian Kas / Koreksi)**: Jika ada selisih, catat jurnal koreksi dengan alasan wajib (misal: "Biaya admin transfer bank"). Pastikan mutasi tercatat rapi di buku besar.
- [ ] **TC-SET-04 (Paginasi Database Audit Log)**: Periksa riwayat aktivitas di bagian bawah pengaturan. Navigasikan tombol halaman (*Sebelumnya* / *Berikutnya*) untuk menguji paginasi database.
- [ ] **TC-SET-05 (Filter Kategori Aktivitas)**: Filter riwayat berdasarkan FINANCE, BUDGET, SETTINGS, atau AUTH. Pastikan hasil filter akurat.

---

## 8. Cadangan & Pemulihan (*Backup & Disaster Recovery*)

- [ ] **TC-BKP-01 (Eksekusi Backup)**: Jalankan `./scripts/db-backup.sh`. Pastikan file `.sql.gz` tercipta di folder `backups/` dengan ukuran file valid.
- [ ] **TC-BKP-02 (Pengaman Fail-Closed Restore)**: Jalankan `./scripts/db-restore.sh backups/...`. Pastikan skrip menolak berjalan tanpa variabel `CONFIRM_RESTORE=YES`.
- [ ] **TC-BKP-03 (Verifikasi Pasca-Restore)**: Lakukan pemulihan ke database pengujian dan pastikan seluruh data tabel utuh 100%.

