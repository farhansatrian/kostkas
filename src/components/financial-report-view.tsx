import Link from "next/link";
import { formatRupiah } from "@/lib/navigation";
import type { FinancialReportData } from "@/lib/reporting-service";

export function FinancialReportView({ data }: { data: FinancialReportData }) {
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
    operatingExpenses.totalOperatingExpense,
    memberReceivables.totalBilledAmount
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
    { type: "summary", label: "CSV Ringkasan Laporan" },
    { type: "cash-ledger", label: "CSV Cash Ledger" },
    { type: "contributions", label: "CSV Pembayaran Iuran" },
    { type: "expenses", label: "CSV Pengeluaran" },
    { type: "reimbursements", label: "CSV Reimbursement" },
  ] as const;

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Filter Periode & Export CSV Bar */}
      <section
        aria-labelledby="report-controls-heading"
        className="rounded-xl bg-white border border-slate-200/80 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4"
      >
        <div>
          <h2
            id="report-controls-heading"
            className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2"
          >
            Filter Periode Laporan ({data.timezone})
          </h2>
          <form
            method="GET"
            action="/laporan"
            className="flex flex-wrap items-center gap-2.5"
          >
            <label htmlFor="report-period-select" className="sr-only">
              Pilih Periode Bulan dan Tahun
            </label>
            <select
              id="report-period-select"
              name="period"
              defaultValue={data.period}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-teal-700 focus:outline-none"
            >
              {data.availablePeriods.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label} ({p.value})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Tampilkan Periode
            </button>
          </form>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-600">
            Ekspor Laporan ke Spreadsheet (CSV — Periode {data.periodLabel}):
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {exportButtons.map((btn) => (
              <a
                key={btn.type}
                href={`/api/laporan/export?period=${encodeURIComponent(data.period)}&type=${btn.type}`}
                className="inline-flex items-center rounded-lg border border-slate-200/90 bg-slate-50/80 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-teal-50/60 hover:border-teal-200 hover:text-teal-900 transition-colors"
              >
                Unduh {btn.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Executive Ledger: Saldo Awal + Kas Masuk - Kas Keluar = Saldo Akhir */}
      <section
        aria-labelledby="report-balance-heading"
        className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
      >
        <h2 id="report-balance-heading" className="sr-only">
          Rekapitulasi Posisi Saldo Kas Periode {data.periodLabel}
        </h2>

        <div className="p-5 sm:p-7 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Saldo akhir periode {data.periodLabel} ({data.cashAccount.provider}{" "}
              — {data.cashAccount.custodianName})
            </p>
            <p className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatRupiah(actualCashInflow.closingBalance)}
            </p>
          </div>

          <div className="text-xs text-slate-500 sm:text-right tabular-nums space-y-0.5">
            <p>
              Persamaan kas:{" "}
              <span className="font-medium text-slate-800">
                {formatRupiah(actualCashInflow.openingBalance)} (Awal) +{" "}
                {formatRupiah(actualCashInflow.totalCashInflow)} (Masuk) -{" "}
                {formatRupiah(actualCashOutflow.totalCashOutflow)} (Keluar)
              </span>
            </p>
            <p>
              Posisi kas aktual terkini lintas periode:{" "}
              <span className="font-semibold text-teal-800">
                {formatRupiah(data.cashAccount.currentTotalActualBalance)}
              </span>
            </p>
          </div>
        </div>

        {/* 5 Kelompok Metrik Terpisah */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 text-xs">
          {/* 1. Tagihan & Piutang Anggota */}
          <div className="p-4 sm:p-5 space-y-2">
            <dt className="font-medium text-slate-500">
              1. Tagihan & Piutang Anggota
            </dt>
            <dd className="text-lg font-semibold text-slate-900 tabular-nums">
              {formatRupiah(memberReceivables.totalBilledAmount)}
            </dd>
            <div className="space-y-0.5 text-slate-500 tabular-nums">
              <p>
                Teralokasi:{" "}
                <span className="font-medium text-emerald-700">
                  {formatRupiah(memberReceivables.totalAllocatedAmount)}
                </span>
              </p>
              <p>
                Belum dibayar:{" "}
                <span className="font-medium text-amber-800">
                  {formatRupiah(memberReceivables.totalUnpaidReceivableAmount)}
                </span>
              </p>
            </div>
          </div>

          {/* 2. Penerimaan Kas Aktual */}
          <div className="p-4 sm:p-5 space-y-2">
            <dt className="font-medium text-slate-500">
              2. Penerimaan Kas Aktual
            </dt>
            <dd className="text-lg font-semibold text-emerald-700 tabular-nums">
              +{formatRupiah(actualCashInflow.totalCashInflow)}
            </dd>
            <div className="space-y-0.5 text-slate-500 tabular-nums">
              <p>
                Iuran masuk:{" "}
                <span className="font-medium text-slate-700">
                  {formatRupiah(actualCashInflow.confirmedContributionInflow)}
                </span>
              </p>
              <p>
                Saldo awal:{" "}
                <span className="font-medium text-slate-700">
                  {formatRupiah(actualCashInflow.openingBalance)}
                </span>
              </p>
            </div>
          </div>

          {/* 3. Beban Operasional */}
          <div className="p-4 sm:p-5 space-y-2">
            <dt className="font-medium text-slate-500">
              3. Total Beban Operasional
            </dt>
            <dd className="text-lg font-semibold text-slate-900 tabular-nums">
              {formatRupiah(operatingExpenses.totalOperatingExpense)}
            </dd>
            <div className="space-y-0.5 text-slate-500 tabular-nums">
              <p>
                Kas langsung:{" "}
                <span className="font-medium text-slate-700">
                  {formatRupiah(operatingExpenses.directOperatingExpense)}
                </span>
              </p>
              <p>
                Talangan:{" "}
                <span className="font-medium text-slate-700">
                  {formatRupiah(operatingExpenses.memberAdvanceOperatingExpense)}
                </span>
              </p>
            </div>
          </div>

          {/* 4. Pengeluaran Kas Aktual */}
          <div className="p-4 sm:p-5 space-y-2">
            <dt className="font-medium text-slate-500">
              4. Pengeluaran Kas Aktual
            </dt>
            <dd className="text-lg font-semibold text-slate-900 tabular-nums">
              -{formatRupiah(actualCashOutflow.totalCashOutflow)}
            </dd>
            <div className="space-y-0.5 text-slate-500 tabular-nums">
              <p>
                Belanja kas:{" "}
                <span className="font-medium text-slate-700">
                  {formatRupiah(actualCashOutflow.directExpenseCashOutflow)}
                </span>
              </p>
              <p>
                Cair reimburse:{" "}
                <span className="font-medium text-slate-700">
                  {formatRupiah(
                    actualCashOutflow.reimbursementPayoutCashOutflow
                  )}
                </span>
              </p>
            </div>
          </div>

          {/* 5. Kewajiban Reimbursement */}
          <div className="p-4 sm:p-5 space-y-2">
            <dt className="font-medium text-slate-500">
              5. Reimbursement Outstanding
            </dt>
            <dd className="text-lg font-semibold text-slate-900 tabular-nums">
              {formatRupiah(
                reimbursementObligations.totalOutstandingReimbursement
              )}
            </dd>
            <div className="space-y-0.5 text-slate-500 tabular-nums">
              <p>
                Talangan baru:{" "}
                <span className="font-medium text-slate-700">
                  {formatRupiah(reimbursementObligations.periodNewAdvanceTotal)}
                </span>
              </p>
              <p>
                Klaim aktif:{" "}
                <span className="font-medium text-amber-800">
                  {reimbursementObligations.outstandingClaimsCount} klaim
                </span>
              </p>
            </div>
          </div>
        </dl>
      </section>

      {/* Grafik Visualisasi: Pemasukan vs Pengeluaran & Komposisi Kategori */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Grafik 1: Perbandingan Arus Kas Masuk, Kas Keluar, dan Beban Operasional */}
        <section
          aria-labelledby="cashflow-chart-heading"
          className="lg:col-span-6 rounded-xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-4"
        >
          <div>
            <h2
              id="cashflow-chart-heading"
              className="text-sm font-semibold text-slate-900"
            >
              Grafik Pemasukan vs Pengeluaran ({data.periodLabel})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Perbandingan penerimaan kas aktual, arus kas keluar DANA, dan beban operasional riil.
            </p>
          </div>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs tabular-nums">
                <span className="font-medium text-slate-700">
                  Penerimaan Kas Aktual (Masuk)
                </span>
                <span className="font-semibold text-emerald-700">
                  +{formatRupiah(actualCashInflow.totalCashInflow)}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-teal-700"
                  style={{ width: `${Math.max(inflowWidthPct, 2)}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs tabular-nums">
                <span className="font-medium text-slate-700">
                  Pengeluaran Kas Aktual (Keluar dari DANA)
                </span>
                <span className="font-semibold text-slate-900">
                  -{formatRupiah(actualCashOutflow.totalCashOutflow)}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-slate-700"
                  style={{ width: `${Math.max(outflowWidthPct, 2)}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs tabular-nums">
                <span className="font-medium text-slate-700">
                  Total Beban Operasional (Kas Langsung + Talangan)
                </span>
                <span className="font-semibold text-slate-900">
                  {formatRupiah(operatingExpenses.totalOperatingExpense)}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-600"
                  style={{ width: `${Math.max(opExWidthPct, 2)}%` }}
                />
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-200/70">
            Catatan akuntansi: Pencairan reimbursement masuk ke Pengeluaran Kas Aktual (mengurangi saldo DANA), namun tidak dihitung ulang sebagai Beban Operasional kedua.
          </p>
        </section>

        {/* Grafik 2: Komposisi Biaya Berdasarkan Kategori */}
        <section
          aria-labelledby="category-chart-heading"
          className="lg:col-span-6 rounded-xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-baseline justify-between">
            <div>
              <h2
                id="category-chart-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Komposisi Biaya Berdasarkan Kategori
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribusi beban operasional terkonfirmasi pada periode {data.periodLabel}.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-900 tabular-nums">
              {formatRupiah(operatingExpenses.totalOperatingExpense)}
            </span>
          </div>

          {operatingExpenses.categoryBreakdown.length === 0 ? (
            <div className="py-6 text-xs text-slate-500">
              Belum ada pengeluaran operasional terkonfirmasi pada periode ini.
            </div>
          ) : (
            <ul className="space-y-3.5 pt-1">
              {operatingExpenses.categoryBreakdown.map((cat) => (
                <li key={cat.categoryId} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                    <span className="font-medium text-slate-800 truncate">
                      {cat.displayLabel}{" "}
                      <span className="text-slate-400">
                        ({cat.transactionCount}x)
                      </span>
                    </span>
                    <span className="font-semibold text-slate-900 shrink-0">
                      {formatRupiah(cat.amount)} ({cat.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-teal-700"
                      style={{ width: `${Math.max(cat.percentage, 3)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Ringkasan Kewajiban Masing-Masing Anggota */}
      <section
        aria-labelledby="member-obligations-heading"
        className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200/80 flex items-baseline justify-between">
          <div>
            <h2
              id="member-obligations-heading"
              className="text-sm font-semibold text-slate-900"
            >
              Ringkasan Kewajiban Iuran per Anggota ({data.periodLabel})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Rincian tagihan rutin, tagihan tambahan, realisasi pembayaran, dan sisa piutang.
            </p>
          </div>
          <Link
            href={`/iuran?period=${encodeURIComponent(data.period)}`}
            className="text-xs font-medium text-teal-800 underline underline-offset-2"
          >
            Buka modul iuran
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500">
                <th className="py-3 px-4 font-medium">Anggota</th>
                <th className="py-3 px-4 font-medium text-right">
                  Tagihan Rutin
                </th>
                <th className="py-3 px-4 font-medium text-right">
                  Tagihan Tambahan
                </th>
                <th className="py-3 px-4 font-medium text-right">
                  Total Tagihan
                </th>
                <th className="py-3 px-4 font-medium text-right">
                  Sudah Dibayar
                </th>
                <th className="py-3 px-4 font-medium text-right">
                  Sisa Kewajiban
                </th>
                <th className="py-3 px-4 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 tabular-nums">
              {memberReceivables.memberObligations.map((m) => (
                <tr key={m.memberId} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-medium text-slate-900">
                    {m.memberName}
                    {!m.isActiveMember && (
                      <span className="ml-1.5 text-[11px] text-slate-400">
                        (Nonaktif)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-700">
                    {formatRupiah(m.regularBilled)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-700">
                    {formatRupiah(m.additionalBilled)}
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-slate-900">
                    {formatRupiah(m.totalBilled)}
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-emerald-700">
                    {formatRupiah(m.paidAllocated)}
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-slate-900">
                    {formatRupiah(m.unpaidRemaining)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span
                      className={`font-semibold ${
                        m.status === "LUNAS"
                          ? "text-teal-800"
                          : m.status === "CICILAN"
                            ? "text-amber-800"
                            : "text-slate-600"
                      }`}
                    >
                      {m.status === "LUNAS"
                        ? "Lunas"
                        : m.status === "CICILAN"
                          ? "Cicilan"
                          : m.status === "BELUM_BAYAR"
                            ? "Belum Bayar"
                            : "Belum Diterbitkan"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Riwayat Mutasi Kas (Cash Ledger) Periode Ini */}
      <section
        aria-labelledby="period-ledger-heading"
        className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200/80 flex items-baseline justify-between">
          <div>
            <h2
              id="period-ledger-heading"
              className="text-sm font-semibold text-slate-900"
            >
              Riwayat Mutasi Kas Terkonfirmasi ({data.periodLabel})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Seluruh arus kas masuk dan keluar berstatus CONFIRMED beserta posisi saldo berjalan.
            </p>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {data.periodCashMovements.length} mutasi
          </span>
        </div>

        {data.periodCashMovements.length === 0 ? (
          <div className="p-6 text-xs text-slate-500">
            Belum ada mutasi kas terkonfirmasi pada periode {data.periodLabel}.
            Saldo awal periode tercatat sebesar{" "}
            <span className="font-semibold text-slate-800 tabular-nums">
              {formatRupiah(actualCashInflow.openingBalance)}
            </span>
            .
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500">
                  <th className="py-3 px-4 font-medium">Tanggal</th>
                  <th className="py-3 px-4 font-medium">Kategori</th>
                  <th className="py-3 px-4 font-medium">Deskripsi</th>
                  <th className="py-3 px-4 font-medium">Aktor</th>
                  <th className="py-3 px-4 font-medium text-right">
                    Mutasi (IDR)
                  </th>
                  <th className="py-3 px-4 font-medium text-right">
                    Saldo Berjalan
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 tabular-nums">
                {data.periodCashMovements.map((mov) => {
                  const isIn = mov.direction === "IN";
                  return (
                    <tr key={mov.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {mov.dateLabel}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {mov.categoryLabel}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {mov.description}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {mov.actorName}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold whitespace-nowrap ${
                          isIn ? "text-emerald-700" : "text-slate-900"
                        }`}
                      >
                        {isIn ? "+" : "-"}
                        {formatRupiah(mov.amount)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900 whitespace-nowrap">
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
    </div>
  );
}

