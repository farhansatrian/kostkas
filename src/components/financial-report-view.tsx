"use client";

import { useState } from "react";
import Link from "next/link";
import { InfoTooltip } from "@/components/info-tooltip";
import { formatRupiah } from "@/lib/navigation";
import type { FinancialReportData } from "@/lib/reporting-service";

export function FinancialReportView({ data }: { data: FinancialReportData }) {
  const [csvMenuOpen, setCsvMenuOpen] = useState(false);

  const {
    actualCashInflow,
    actualCashOutflow,
    operatingExpenses,
    memberReceivables,
    reimbursementObligations,
  } = data;

  const maxChartValue = Math.max(
    1,
    actualCashInflow.totalCashInflow,
    actualCashOutflow.totalCashOutflow,
    operatingExpenses.totalOperatingExpense
  );

  const inflowWidthPct = Math.round(
    (actualCashInflow.totalCashInflow / maxChartValue) * 100
  );
  const outflowWidthPct = Math.round(
    (actualCashOutflow.totalCashOutflow / maxChartValue) * 100
  );
  const opExWidthPct = Math.round(
    (operatingExpenses.totalOperatingExpense / maxChartValue) * 100
  );

  const exportButtons = [
    { type: "summary", label: "Ringkasan Laporan" },
    { type: "cash-ledger", label: "Buku Mutasi Kas" },
    { type: "contributions", label: "Data Iuran Anggota" },
    { type: "expenses", label: "Rincian Pengeluaran" },
    { type: "reimbursements", label: "Riwayat Reimbursement" },
  ] as const;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 print:p-0 print:max-w-none">
      {/* ========================================================= */}
      {/* PRINT-ONLY OFFICIAL HEADER                                */}
      {/* ========================================================= */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              KostKas — Laporan Keuangan Bersama
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Periode Pembukuan: {data.periodLabel} ({data.period})
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Rekening: DANA ({data.cashAccount.custodianName})</p>
            <p>Dicetak pada: {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. TOP BAR: PERIOD FILTER & EXPORT ACTION BUTTONS         */}
      {/* ========================================================= */}
      <section className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200/80 pb-5 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Laporan Keuangan
            </h1>
            <InfoTooltip
              title="Laporan Keuangan KostKas"
              content="Ringkasan arus kas riil DANA dan beban operasional kost. Memisahkan secara transparan antara uang masuk dari iuran, uang keluar untuk belanja, dan kewajiban reimbursement talangan anggota."
              label="Penjelasan laporan keuangan"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Periode: <strong className="text-slate-800">{data.periodLabel}</strong> (Waktu Indonesia Barat)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period Navigator */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <Link
              href={`/laporan?period=${data.prevPeriod}`}
              className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-white rounded-lg transition-colors"
              title="Bulan sebelumnya"
            >
              &larr; {data.prevPeriod}
            </Link>

            <form method="GET" action="/laporan" className="inline-flex items-center">
              <label htmlFor="report-period-select" className="sr-only">
                Pilih Periode
              </label>
              <select
                id="report-period-select"
                name="period"
                defaultValue={data.period}
                onChange={(e) => e.target.form?.requestSubmit()}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none"
              >
                {data.availablePeriods.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </form>

            <Link
              href={`/laporan?period=${data.nextPeriod}`}
              className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-white rounded-lg transition-colors"
              title="Bulan berikutnya"
            >
              {data.nextPeriod} &rarr;
            </Link>
          </div>

          {/* Cetak / Simpan PDF Button */}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24-1.076-.672-2.03-1.28-2.827M17.28 13.829c.24-1.076.672-2.03 1.28-2.827m-12.56 0A8.96 8.96 0 0112 3c3.6 0 6.64 2.115 8.01 5.176M6.72 13.829A8.96 8.96 0 0012 21c3.6 0 6.64-2.115 8.01-5.176m-14.73 0h14.74" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span>Cetak / PDF</span>
          </button>

          {/* Export CSV Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setCsvMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span>Ekspor CSV</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {csvMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 rounded-xl bg-white border border-slate-200 shadow-xl py-1 z-30">
                {exportButtons.map((btn) => (
                  <a
                    key={btn.type}
                    href={`/api/laporan/export?period=${encodeURIComponent(data.period)}&type=${btn.type}`}
                    onClick={() => setCsvMenuOpen(false)}
                    className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-900 transition-colors"
                  >
                    {btn.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 2. VISUAL CASH EQUATION (ALIRAN SALDO KAS)                 */}
      {/* ========================================================= */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Persamaan Aliran Kas ({data.periodLabel})
            </h2>
            <InfoTooltip
              title="Rumus Saldo Kas Kost"
              content="Saldo Awal Periode + Seluruh Iuran Masuk - Seluruh Pengeluaran Riil dari Kas = Saldo Akhir Periode di akun DANA Kas."
              label="Info persamaan kas"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
            {reimbursementObligations.totalOutstandingReimbursement > 0 && (
              <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-semibold tabular-nums">
                Reimburse Terutang: {formatRupiah(reimbursementObligations.totalOutstandingReimbursement)} ({reimbursementObligations.outstandingClaimsCount} klaim)
              </span>
            )}
            <span>
              Pemegang Kas: <strong className="text-slate-900">{data.cashAccount.custodianName}</strong> ({data.cashAccount.provider})
            </span>
          </div>
        </div>

        {/* Visual Equation Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {/* 1. Saldo Awal */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-1">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              1. Saldo Awal
            </p>
            <p className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 tabular-nums">
              {formatRupiah(actualCashInflow.openingBalance)}
            </p>
            <p className="text-[11px] text-slate-400">Posisi awal bulan</p>
          </div>

          {/* 2. Kas Masuk (+) */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 space-y-1">
            <p className="text-[11px] font-semibold text-teal-800 uppercase tracking-wider flex items-center justify-between">
              <span>2. Kas Masuk</span>
              <span className="text-xs font-bold">+</span>
            </p>
            <p className="text-lg sm:text-xl font-bold tracking-tight text-teal-900 tabular-nums">
              +{formatRupiah(actualCashInflow.totalCashInflow)}
            </p>
            <p className="text-[11px] text-teal-700/80">Iuran terkonfirmasi</p>
          </div>

          {/* 3. Kas Keluar (-) */}
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 space-y-1">
            <p className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider flex items-center justify-between">
              <span>3. Kas Keluar</span>
              <span className="text-xs font-bold">-</span>
            </p>
            <p className="text-lg sm:text-xl font-bold tracking-tight text-rose-900 tabular-nums">
              -{formatRupiah(actualCashOutflow.totalCashOutflow)}
            </p>
            <p className="text-[11px] text-rose-700/80">Belanja & cair reimburse</p>
          </div>

          {/* 4. Saldo Akhir (=) */}
          <div className="rounded-xl border border-slate-900 bg-slate-900 text-white p-4 space-y-1">
            <p className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider flex items-center justify-between">
              <span>4. Saldo Akhir</span>
              <span className="text-xs font-bold">=</span>
            </p>
            <p className="text-lg sm:text-xl font-bold tracking-tight text-white tabular-nums">
              {formatRupiah(actualCashInflow.closingBalance)}
            </p>
            <p className="text-[11px] text-slate-400">Kas riil akhir periode</p>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. DUA GRAFIK VISUAL: ARUS KAS & KOMPOSISI BIAYA          */}
      {/* ========================================================= */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Grafik 1: Pemasukan vs Pengeluaran */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Pemasukan vs Pengeluaran
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Perbandingan arus kas masuk dan uang yang keluar.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            {/* Bar 1: Kas Masuk */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs tabular-nums">
                <span className="font-semibold text-teal-900">
                  Total Penerimaan Kas (Masuk)
                </span>
                <span className="font-bold text-teal-700">
                  +{formatRupiah(actualCashInflow.totalCashInflow)}
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-teal-600 transition-all duration-300"
                  style={{ width: `${Math.max(inflowWidthPct, 3)}%` }}
                />
              </div>
            </div>

            {/* Bar 2: Kas Keluar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs tabular-nums">
                <span className="font-semibold text-slate-800">
                  Total Arus Kas Keluar (Keluar DANA)
                </span>
                <span className="font-bold text-slate-900">
                  -{formatRupiah(actualCashOutflow.totalCashOutflow)}
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-slate-700 transition-all duration-300"
                  style={{ width: `${Math.max(outflowWidthPct, 3)}%` }}
                />
              </div>
            </div>

            {/* Bar 3: Beban Operasional */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs tabular-nums">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-amber-900">
                    Beban Operasional Riil
                  </span>
                  <InfoTooltip
                    content="Mencakup belanja langsung dari kas DANA ditambah talangan yang dibayar anggota. Reimbursement yang dicairkan tidak dihitung dua kali."
                    label="Info beban operasional"
                  />
                </div>
                <span className="font-bold text-amber-800">
                  {formatRupiah(operatingExpenses.totalOperatingExpense)}
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${Math.max(opExWidthPct, 3)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Grafik 2: Komposisi Biaya per Kategori */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Komposisi Biaya Operasional
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pengeluaran terkonfirmasi periode {data.periodLabel}.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-900 tabular-nums">
              {formatRupiah(operatingExpenses.totalOperatingExpense)}
            </span>
          </div>

          {operatingExpenses.categoryBreakdown.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Belum ada pengeluaran operasional pada periode ini.
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {operatingExpenses.categoryBreakdown.map((cat) => (
                <div key={cat.categoryId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs tabular-nums">
                    <span className="font-medium text-slate-800 truncate">
                      {cat.displayLabel}{" "}
                      <span className="text-slate-400 font-normal">
                        ({cat.transactionCount}x)
                      </span>
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatRupiah(cat.amount)}{" "}
                      <span className="text-slate-500 font-normal">
                        ({cat.percentage}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-teal-600 transition-all duration-300"
                      style={{ width: `${Math.max(cat.percentage, 3)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ========================================================= */}
      {/* 4. REKAPITULASI KEWAJIBAN IURAN ANGGOTA                   */}
      {/* ========================================================= */}
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold text-slate-900">
              Status Iuran per Anggota ({data.periodLabel})
            </h3>
            <InfoTooltip
              content="Daftar kewajiban iuran masing-masing penghuni kost. Termasuk iuran rutin bulanan dan tagihan tambahan jika ada."
              label="Info iuran anggota"
            />
          </div>
          <Link
            href={`/iuran?period=${encodeURIComponent(data.period)}`}
            className="text-xs font-semibold text-teal-800 hover:underline print:hidden"
          >
            Modul Iuran &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold">
                <th className="py-3 px-4">Nama Anggota</th>
                <th className="py-3 px-4 text-right">Tagihan Total</th>
                <th className="py-3 px-4 text-right">Sudah Dibayar</th>
                <th className="py-3 px-4 text-right">Sisa Kewajiban</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {memberReceivables.memberObligations.map((m) => (
                <tr key={m.memberId} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {m.memberName}
                    {!m.isActiveMember && (
                      <span className="ml-1.5 text-[10px] text-slate-400 font-normal">
                        (Nonaktif)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-700">
                    {formatRupiah(m.totalBilled)}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                    {formatRupiah(m.paidAllocated)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900">
                    {formatRupiah(m.unpaidRemaining)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                        m.status === "LUNAS"
                          ? "bg-teal-50 text-teal-800 border border-teal-200"
                          : m.status === "CICILAN"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-rose-50 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {m.status === "LUNAS"
                        ? "Lunas"
                        : m.status === "CICILAN"
                          ? "Cicilan"
                          : "Belum Bayar"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 5. BUKU MUTASI KAS TERKONFIRMASI (LEDGER)                 */}
      {/* ========================================================= */}
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Riwayat Mutasi Kas DANA ({data.periodLabel})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Seluruh transaksi kas riil terkonfirmasi beserta saldo berjalan.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600 tabular-nums">
            {data.periodCashMovements.length} transaksi
          </span>
        </div>

        {data.periodCashMovements.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Belum ada mutasi kas pada periode {data.periodLabel}. Saldo awal tercatat:{" "}
            <strong className="text-slate-700 tabular-nums">
              {formatRupiah(actualCashInflow.openingBalance)}
            </strong>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Keterangan</th>
                  <th className="py-3 px-4 text-right">Mutasi (IDR)</th>
                  <th className="py-3 px-4 text-right">Saldo Berjalan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {data.periodCashMovements.map((mov) => {
                  const isIn = mov.direction === "IN";
                  return (
                    <tr key={mov.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {mov.dateLabel}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap font-medium">
                        {mov.categoryLabel}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {mov.description}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold whitespace-nowrap ${
                          isIn ? "text-emerald-700" : "text-slate-900"
                        }`}
                      >
                        {isIn ? "+" : "-"}
                        {formatRupiah(mov.amount)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatRupiah(mov.runningBalance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ========================================================= */}
      {/* PRINT-ONLY SIGNATURE FOOTER                               */}
      {/* ========================================================= */}
      <div className="hidden print:grid grid-cols-3 gap-6 pt-12 mt-8 border-t border-slate-300 text-center text-xs">
        <div className="space-y-12">
          <p className="text-slate-600">Disusun oleh,</p>
          <div>
            <p className="font-bold underline text-slate-900">{data.cashAccount.custodianName}</p>
            <p className="text-slate-500">Pemegang Kas DANA</p>
          </div>
        </div>
        <div className="space-y-12">
          <p className="text-slate-600">Diverifikasi oleh,</p>
          <div>
            <p className="font-bold underline text-slate-900">Perwakilan Anggota</p>
            <p className="text-slate-500">Penghuni Kost</p>
          </div>
        </div>
        <div className="space-y-12">
          <p className="text-slate-600">Mengetahui,</p>
          <div>
            <p className="font-bold underline text-slate-900">Pengurus Kost</p>
            <p className="text-slate-500">KostKas</p>
          </div>
        </div>
      </div>
    </div>
  );
}
