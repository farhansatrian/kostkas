import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { InfoTooltip } from "@/components/info-tooltip";
import { getLiveDashboardData } from "@/lib/dashboard-service";
import { formatRupiah } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedActor } from "@/lib/session";

async function DashboardContent() {
  const actor = await requireAuthenticatedActor();
  const data = await getLiveDashboardData(prisma, actor);
  const { config, cashSummary } = data;

  const duesProgressPercent =
    cashSummary.monthlyTargetDues > 0
      ? Math.min(
          100,
          Math.round(
            (cashSummary.collectedDuesThisMonth /
              cashSummary.monthlyTargetDues) *
              100
          )
        )
      : 0;

  const netCashFlowThisMonth =
    cashSummary.collectedDuesThisMonth - cashSummary.totalCashOutflowThisMonth;

  return (
    <AppShell
      navigationItems={data.navigationModules}
      currentPath="/"
      cashAccountProvider={config.cashAccountProvider}
      cashAccountHolder={config.cashAccountHolder}
      kostName={config.kostName}
      actorName={actor.memberName}
      actorUsername={actor.username}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-8 sm:space-y-10">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
              Ringkasan Kas
            </h1>
            <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
              Periode {data.periodLabel} (per {data.asOfDateLabel})
            </p>
          </div>

          <Link
            href="/iuran"
            className="inline-flex items-center self-start sm:self-auto rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            Kelola iuran & pembayaran
          </Link>
        </div>

        {/* Executive Ledger Surface: 1. Saldo Kas Utama + 2. Iuran Diterima + 3. Kas Keluar + 4. Reimbursement Terutang */}
        <section
          aria-labelledby="ledger-summary-heading"
          className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
        >
          <h2 id="ledger-summary-heading" className="sr-only">
            Posisi Saldo dan Ringkasan Arus Kas
          </h2>

          {/* 1. Focal Point Utama: Total Saldo Kas DANA */}
          <div className="p-5 sm:p-7 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium text-slate-500">
                  Total saldo kas {config.cashAccountProvider} (
                  {config.cashAccountHolder})
                </p>
                <InfoTooltip
                  title="Saldo Kas Riil DANA"
                  content={`Uang fisik bersama yang saat ini tersimpan di dompet digital ${config.cashAccountProvider} atas nama ${config.cashAccountHolder}. Bukan target iuran, melainkan saldo nyata yang siap dipakai.`}
                  label="Info saldo kas riil"
                />
              </div>
              <p className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">
                {formatRupiah(cashSummary.actualCashBalance)}
              </p>
            </div>

            <div className="text-xs text-slate-500 sm:text-right tabular-nums space-y-0.5">
              <p>
                Saldo awal / periode lalu:{" "}
                <span className="font-medium text-slate-700">
                  {formatRupiah(cashSummary.previousMonthCarryOver)}
                </span>
              </p>
              <p>
                Selisih kas bulan ini:{" "}
                <span
                  className={`font-medium ${
                    netCashFlowThisMonth >= 0
                      ? "text-emerald-700"
                      : "text-slate-900"
                  }`}
                >
                  {netCashFlowThisMonth >= 0 ? "+" : "-"}
                  {formatRupiah(Math.abs(netCashFlowThisMonth))}
                </span>
              </p>
            </div>
          </div>

          {/* Metrik Pendukung (2, 3, 4) dalam satu baris ledger terpadu */}
          <dl className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200/80">
            {/* 2. Ringkasan Iuran Diterima Bulan Ini */}
            <div className="p-5 sm:p-6 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center justify-between">
                  <dt className="text-xs font-medium text-slate-500">
                    Iuran diterima bulan ini
                  </dt>
                  <InfoTooltip
                    title="Iuran Diterima"
                    content="Total uang iuran dari para anggota yang sudah ditransfer dan terkonfirmasi masuk ke rekening kas DANA pada bulan ini."
                    label="Info iuran diterima"
                  />
                </div>
                <dd className="mt-1.5 text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {formatRupiah(cashSummary.collectedDuesThisMonth)}
                </dd>
              </div>

              <div className="space-y-2">
                <div
                  role="progressbar"
                  aria-valuenow={duesProgressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progres pengumpulan iuran bulanan"
                  className="h-1 w-full rounded-full bg-slate-100 overflow-hidden"
                >
                  <div
                    className="h-full rounded-full bg-teal-700"
                    style={{ width: `${duesProgressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums">
                  <span>
                    Target {formatRupiah(cashSummary.monthlyTargetDues)}
                  </span>
                  <span className="font-medium text-slate-700">
                    {data.paidMembersCount}/{config.activeMemberCount} lunas
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Total Arus Kas Keluar Bulan Ini */}
            <div className="p-5 sm:p-6 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center justify-between">
                  <dt className="text-xs font-medium text-slate-500">
                    Total kas keluar bulan ini
                  </dt>
                  <InfoTooltip
                    title="Arus Kas Keluar"
                    content="Semua pengeluaran riil yang mengurangi saldo akun DANA, baik untuk belanja operasional langsung maupun pencairan reimbursement dana talangan."
                    label="Info kas keluar"
                  />
                </div>
                <dd className="mt-1.5 text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {formatRupiah(cashSummary.totalCashOutflowThisMonth)}
                </dd>
              </div>

              <div className="space-y-1 text-xs text-slate-500 tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <span>Operasional kas</span>
                  <span className="font-medium text-slate-700">
                    {formatRupiah(cashSummary.directOperatingExpensesThisMonth)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Pelunasan reimburse</span>
                  <span className="font-medium text-slate-700">
                    {formatRupiah(
                      cashSummary.reimbursementSettlementsThisMonth
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* 4. Total Reimbursement yang Masih Terutang */}
            <div className="p-5 sm:p-6 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center justify-between">
                  <dt className="text-xs font-medium text-slate-500">
                    Reimbursement terutang
                  </dt>
                  <InfoTooltip
                    title="Reimbursement Terutang"
                    content="Pengeluaran bersama yang ditalangi lebih dahulu memakai uang pribadi anggota, dan saat ini sedang menunggu pencairan kembali dari kas kost."
                    label="Info reimbursement terutang"
                  />
                </div>
                <dd className="mt-1.5 text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {formatRupiah(cashSummary.pendingReimbursementTotal)}
                </dd>
              </div>

              <div className="space-y-1 text-xs text-slate-500 tabular-nums">
                <div className="flex items-center justify-between">
                  <span>Menunggu pencairan</span>
                  <span className="font-medium text-amber-800">
                    {cashSummary.pendingReimbursementCount} klaim
                  </span>
                </div>
                {data.latestPendingReimbursement && (
                  <div className="flex items-center justify-between">
                    <span>Penalang</span>
                    <span className="font-medium text-slate-700">
                      {data.latestPendingReimbursement.requester} (
                      {data.latestPendingReimbursement.dateLabel})
                    </span>
                  </div>
                )}
              </div>
            </div>
          </dl>
        </section>

        {/* Bagian Bawah: 5. Status Iuran Anggota & 6. Lima Transaksi Terbaru */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          {/* 5. Status Iuran Anggota Secara Ringkas */}
          <section
            aria-labelledby="member-dues-heading"
            className="lg:col-span-5"
          >
            <div className="flex items-baseline justify-between pb-3 border-b border-slate-200/80">
              <h2
                id="member-dues-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Status iuran anggota
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {formatRupiah(config.monthlyDuePerMember)} / anggota
              </span>
            </div>

            <ul className="divide-y divide-slate-200/70">
              {data.memberDues.map((member) => {
                const isPaid = member.status === "LUNAS";
                const isPartial = member.status === "CICILAN";

                return (
                  <li
                    key={member.id}
                    className="py-3.5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {member.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums truncate">
                        {member.detailLabel}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-slate-900 tabular-nums">
                        {formatRupiah(member.billedAmount)}
                      </p>
                      <div className="mt-0.5 inline-flex items-center justify-end gap-1.5 text-xs">
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            isPaid
                              ? "bg-teal-700"
                              : isPartial
                                ? "bg-amber-600"
                                : "bg-slate-400"
                          }`}
                        />
                        <span
                          className={
                            isPaid
                              ? "text-teal-800 font-medium"
                              : isPartial
                                ? "text-amber-800 font-medium"
                                : "text-slate-600 font-medium"
                          }
                        >
                          {member.statusLabel}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* 6. Maksimal Lima Transaksi Terbaru */}
          <section
            aria-labelledby="recent-transactions-heading"
            className="lg:col-span-7"
          >
            <div className="flex items-baseline justify-between pb-3 border-b border-slate-200/80">
              <h2
                id="recent-transactions-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Transaksi terbaru
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {data.recentTransactions.length} mutasi terakhir
              </span>
            </div>

            {data.recentTransactions.length === 0 ? (
              <div className="py-6 text-xs text-slate-500">
                Belum ada mutasi kas terkonfirmasi. Catat pembayaran iuran
                melalui halaman{" "}
                <Link
                  href="/iuran"
                  className="font-medium text-teal-800 underline underline-offset-2"
                >
                  Iuran Bulanan
                </Link>
                .
              </div>
            ) : (
              <ul className="divide-y divide-slate-200/70">
                {data.recentTransactions.map((trx) => {
                  const isInflow = trx.flow === "IN";
                  return (
                    <li
                      key={trx.id}
                      className="py-3.5 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {trx.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate tabular-nums">
                          {trx.dateLabel}, {trx.categoryLabel.toLowerCase()} (
                          {trx.actorName})
                        </p>
                      </div>

                      <p
                        className={`text-sm font-semibold tabular-nums shrink-0 ${
                          isInflow ? "text-emerald-700" : "text-slate-900"
                        }`}
                      >
                        {isInflow ? "+" : "-"}
                        {formatRupiah(trx.amount)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFA] p-6 text-xs text-slate-500">
          Memuat buku besar kas...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
