import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { InfoTooltip } from "@/components/info-tooltip";
import {
  AdditionalChargeForm,
  FuturePolicyForm,
  GenerateRegularChargesButton,
  PendingPaymentsConfirmationList,
  RecordPaymentForm,
} from "@/components/contribution-management";
import { getKostAppPreferences } from "@/lib/app-preferences";
import {
  formatPeriodLabel,
  getMonthlyContributionsPageData,
  shiftYearMonthPeriod,
} from "@/lib/contribution-service";
import {
  APP_NAVIGATION_MODULES,
  formatRupiah,
  formatShortDateId,
} from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedActor } from "@/lib/session";

async function MonthlyContributionsContent({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const actor = await requireAuthenticatedActor();
  const resolvedParams = await searchParams;

  const [data, cashAccount, preferences] = await Promise.all([
    getMonthlyContributionsPageData(prisma, actor, resolvedParams.period),
    prisma.cashAccount.findFirst({
      where: { isActive: true },
      include: { custodianMember: true },
      orderBy: { createdAt: "asc" },
    }),
    getKostAppPreferences(prisma),
  ]);

  const custodianHolder = cashAccount?.custodianMember?.name ?? "Farhan";
  const cashProvider = cashAccount?.provider ?? "DANA";
  const nextPeriod = shiftYearMonthPeriod(data.period, 1);

  return (
    <AppShell
      navigationItems={APP_NAVIGATION_MODULES}
      currentPath="/iuran"
      cashAccountProvider={cashProvider}
      cashAccountHolder={custodianHolder}
      kostName={preferences.kostName}
      actorName={actor.memberName}
      actorUsername={actor.username}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-8">
        {/* Header & Pemilih Periode */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                Iuran Bulanan
              </h1>
              <InfoTooltip
                title="Iuran Bulanan Kost"
                content="Iuran rutin yang dikumpulkan dari seluruh anggota kost setiap bulan untuk operasional kas bersama (galon, gas, listrik, wi-fi, kebersihan, dan perbaikan)."
                label="Info iuran bulanan"
              />
            </div>
            <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
              Periode {data.periodLabel} · Tarif efektif{" "}
              {data.effectivePolicy
                ? `${formatRupiah(data.effectivePolicy.amountPerMember)} / anggota`
                : "belum ditetapkan"}
            </p>
          </div>

          <GenerateRegularChargesButton period={data.period} />
        </div>

        {/* Navigasi Pilihan Bulan */}
        <nav
          aria-label="Pilih periode bulan"
          className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/80 pb-4"
        >
          {data.availablePeriods.map((p) => {
            const isSelected = p === data.period;
            return (
              <Link
                key={p}
                href={`/iuran?period=${p}`}
                aria-current={isSelected ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-xs font-medium tabular-nums transition-colors ${
                  isSelected
                    ? "bg-teal-700 text-white"
                    : "bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {formatPeriodLabel(p)} ({p})
              </Link>
            );
          })}
        </nav>

        {/* Ringkasan Kewajiban & Realisasi Periode */}
        <section
          aria-label="Ringkasan kewajiban periode"
          className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
        >
          <dl className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <dt className="text-xs font-medium text-slate-500">
                  Total tagihan periode ({data.period})
                </dt>
                <InfoTooltip
                  content="Total kewajiban yang dibebankan kepada anggota, terdiri dari iuran rutin bulanan dan tagihan khusus jika ada."
                  label="Info total tagihan"
                />
              </div>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                {formatRupiah(data.obligationSummary.totalBilled)}
              </dd>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                Rutin {formatRupiah(data.obligationSummary.regularTotal)} +
                Tambahan {formatRupiah(data.obligationSummary.additionalTotal)}
              </p>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between">
                <dt className="text-xs font-medium text-slate-500">
                  Realisasi pembayaran masuk
                </dt>
                <InfoTooltip
                  content="Total uang iuran yang sudah benar-benar masuk dan terkonfirmasi di rekening DANA Kas."
                  label="Info realisasi iuran"
                />
              </div>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-emerald-700 tabular-nums">
                {formatRupiah(data.obligationSummary.totalAllocated)}
              </dd>
              <p className="mt-1 text-xs text-slate-500">
                Terkonfirmasi masuk ke {cashProvider} Kas
              </p>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between">
                <dt className="text-xs font-medium text-slate-500">
                  Sisa kewajiban belum lunas
                </dt>
                <InfoTooltip
                  content="Sisa tagihan iuran yang masih belum dilunasi oleh anggota pada periode ini."
                  label="Info sisa tagihan"
                />
              </div>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                {formatRupiah(data.obligationSummary.totalRemaining)}
              </dd>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                {data.activeMembersCount} anggota aktif terdaftar
              </p>
            </div>
          </dl>
        </section>

        {/* Antrean Pembayaran Menunggu Konfirmasi (jika ada) */}
        {data.pendingPayments.length > 0 && (
          <section
            aria-labelledby="pending-payments-heading"
            className="space-y-3"
          >
            <div className="flex items-baseline justify-between">
              <h2
                id="pending-payments-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Pembayaran menunggu konfirmasi
              </h2>
              <span className="text-xs font-medium text-amber-800 tabular-nums">
                {data.pendingPayments.length} pembayaran belum masuk saldo kas
              </span>
            </div>

            <PendingPaymentsConfirmationList
              pendingPayments={data.pendingPayments}
              openCharges={data.openChargesForPeriod}
            />
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Kolom Kiri: Daftar Tagihan Anggota & Riwayat Pembayaran */}
          <div className="lg:col-span-7 space-y-8">
            <section
              aria-labelledby="daftar-tagihan-heading"
              className="space-y-3"
            >
              <div className="flex items-baseline justify-between">
                <h2
                  id="daftar-tagihan-heading"
                  className="text-sm font-semibold text-slate-900"
                >
                  Daftar tagihan anggota ({data.periodLabel})
                </h2>
                <span className="text-xs text-slate-500 tabular-nums">
                  {data.charges.length} item tagihan
                </span>
              </div>

              {data.charges.length === 0 ? (
                <div className="rounded-xl bg-white border border-slate-200/80 p-6 space-y-2">
                  <p className="text-sm font-medium text-slate-900">
                    Belum ada tagihan diterbitkan untuk periode{" "}
                    {data.periodLabel}.
                  </p>
                  <p className="text-xs text-slate-600">
                    Klik tombol &ldquo;Terbitkan tagihan rutin ({data.period}
                    )&rdquo; di kanan atas untuk membuat tagihan seluruh anggota
                    aktif secara idempotent.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-200/80 rounded-xl bg-white border border-slate-200/80 overflow-hidden">
                  {data.charges.map((charge) => {
                    const isPaid = charge.status === "PAID";
                    const isPartial = charge.status === "PARTIALLY_PAID";

                    return (
                      <li
                        key={charge.id}
                        className="p-4 sm:p-5 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              {charge.memberName}
                            </p>
                            <span className="text-xs text-slate-500">
                              · {charge.title}
                            </span>
                          </div>

                          <p className="text-xs text-slate-500 tabular-nums">
                            {charge.kind === "REGULAR"
                              ? "Iuran rutin"
                              : `Tagihan tambahan #${charge.sequence}`}{" "}
                            · Terbayar {formatRupiah(charge.allocatedAmount)}{" "}
                            dari {formatRupiah(charge.amount)}
                          </p>
                        </div>

                        <div className="text-right shrink-0 space-y-0.5">
                          <p className="text-sm font-semibold text-slate-900 tabular-nums">
                            {isPaid
                              ? formatRupiah(charge.amount)
                              : `Sisa ${formatRupiah(charge.remainingAmount)}`}
                          </p>

                          <div className="inline-flex items-center justify-end gap-1.5 text-xs font-medium">
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
                                  ? "text-teal-800"
                                  : isPartial
                                    ? "text-amber-800"
                                    : "text-slate-600"
                              }
                            >
                              {isPaid
                                ? "Lunas"
                                : isPartial
                                  ? "Cicilan parsial"
                                  : "Belum dibayar"}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Riwayat Alokasi Pembayaran Terkonfirmasi pada Periode Ini */}
            <section
              aria-labelledby="riwayat-pembayaran-heading"
              className="space-y-3"
            >
              <div className="flex items-baseline justify-between">
                <h2
                  id="riwayat-pembayaran-heading"
                  className="text-sm font-semibold text-slate-900"
                >
                  Riwayat pembayaran terkonfirmasi ({data.periodLabel})
                </h2>
                <span className="text-xs text-slate-500 tabular-nums">
                  {data.recentConfirmedAllocations.length} catatan
                </span>
              </div>

              {data.recentConfirmedAllocations.length === 0 ? (
                <div className="rounded-xl bg-white border border-slate-200/80 p-5">
                  <p className="text-xs text-slate-500">
                    Belum ada pembayaran terkonfirmasi pada periode ini.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-200/80 rounded-xl bg-white border border-slate-200/80 overflow-hidden">
                  {data.recentConfirmedAllocations.map((item) => (
                    <li
                      key={item.id}
                      className="p-4 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {item.memberName} — {item.chargeTitle}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate tabular-nums">
                          {formatShortDateId(new Date(item.confirmedAt))} ·{" "}
                          {item.note}
                        </p>
                      </div>

                      <p className="text-sm font-semibold text-emerald-700 tabular-nums shrink-0">
                        +{formatRupiah(item.amount)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Kolom Kanan: Form Pembayaran, Tagihan Tambahan, & Kebijakan Tarif */}
          <div className="lg:col-span-5 space-y-6">
            {/* 1. Form Catat Pembayaran (Penuh / Parsial) */}
            <section
              aria-labelledby="form-pembayaran-heading"
              className="space-y-2.5"
            >
              <h2
                id="form-pembayaran-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Catat pembayaran iuran
              </h2>
              <div className="rounded-xl bg-white border border-slate-200/80 p-5">
                <RecordPaymentForm openCharges={data.openChargesForPeriod} />
              </div>
            </section>

            {/* 2. Form Tagihan Tambahan */}
            <section
              aria-labelledby="form-tambahan-heading"
              className="space-y-2.5"
            >
              <h2
                id="form-tambahan-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Tagihan tambahan pertengahan bulan
              </h2>
              <div className="rounded-xl bg-white border border-slate-200/80 p-5">
                <AdditionalChargeForm period={data.period} />
              </div>
            </section>

            {/* 3. Form Perubahan Tarif Efektif Periode Mendatang */}
            <section
              aria-labelledby="form-tarif-heading"
              className="space-y-2.5"
            >
              <h2
                id="form-tarif-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Tarif iuran periode mendatang
              </h2>
              <div className="rounded-xl bg-white border border-slate-200/80 p-5 space-y-4">
                <FuturePolicyForm defaultNextPeriod={nextPeriod} />

                <div className="pt-3 border-t border-slate-100 space-y-1.5">
                  <p className="text-xs font-medium text-slate-700">
                    Daftar kebijakan tarif tercatat:
                  </p>
                  <ul className="divide-y divide-slate-100 text-xs text-slate-600 tabular-nums">
                    {data.allPolicies.map((pol) => (
                      <li
                        key={pol.id}
                        className="py-1.5 flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          {pol.effectiveFromPeriod}
                          {pol.effectiveToPeriod
                            ? ` s/d ${pol.effectiveToPeriod}`
                            : " (berlaku)"}
                        </span>
                        <span className="font-medium text-slate-900 shrink-0">
                          {formatRupiah(pol.amountPerMember)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function MonthlyContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFA] p-6 text-xs text-slate-500">
          Memuat data iuran bulanan...
        </div>
      }
    >
      <MonthlyContributionsContent searchParams={searchParams} />
    </Suspense>
  );
}

