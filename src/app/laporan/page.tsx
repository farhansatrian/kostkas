import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { FinancialReportView } from "@/components/financial-report-view";
import { APP_NAVIGATION_MODULES } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { getFinancialReportData } from "@/lib/reporting-service";
import { requireAuthenticatedActor } from "@/lib/session";

interface FinancialReportPageProps {
  searchParams: Promise<{
    period?: string;
    year?: string;
    month?: string;
  }>;
}

async function FinancialReportContent({
  searchParams,
}: {
  searchParams: FinancialReportPageProps["searchParams"];
}) {
  const actor = await requireAuthenticatedActor();
  const resolved = await searchParams;

  const explicitPeriod =
    resolved.period ??
    (resolved.year && resolved.month
      ? `${resolved.year}-${resolved.month.padStart(2, "0")}`
      : undefined);

  const data = await getFinancialReportData(prisma, actor, explicitPeriod);

  return (
    <AppShell
      navigationItems={APP_NAVIGATION_MODULES}
      currentPath="/laporan"
      cashAccountProvider={data.cashAccount.provider}
      cashAccountHolder={data.cashAccount.custodianName}
      kostName={data.kostName}
      actorName={actor.memberName}
      actorUsername={actor.username}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
              Laporan & Rekapitulasi Keuangan
            </h1>
            <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
              Laporan buku besar periode {data.periodLabel} (Zona waktu{" "}
              {data.timezone}).
            </p>
          </div>

          <Link
            href={`/anggaran?period=${encodeURIComponent(data.period)}`}
            className="inline-flex items-center self-start sm:self-auto rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            Evaluasi anggaran {data.periodLabel}
          </Link>
        </div>

        <FinancialReportView data={data} />
      </div>
    </AppShell>
  );
}

export default function FinancialReportPage({
  searchParams,
}: FinancialReportPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFA] p-6 text-xs text-slate-500">
          Memuat laporan finansial dari PostgreSQL...
        </div>
      }
    >
      <FinancialReportContent searchParams={searchParams} />
    </Suspense>
  );
}

