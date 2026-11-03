import { Suspense } from "react";
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
      <FinancialReportView data={data} />
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
          Memuat laporan keuangan...
        </div>
      }
    >
      <FinancialReportContent searchParams={searchParams} />
    </Suspense>
  );
}

