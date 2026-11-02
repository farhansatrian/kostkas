import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BudgetManagement } from "@/components/budget-management";
import { getBudgetPageData } from "@/lib/budget-service";
import { APP_NAVIGATION_MODULES } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedActor } from "@/lib/session";

interface BudgetPageProps {
  searchParams: Promise<{
    period?: string;
  }>;
}

async function BudgetContent({
  searchParams,
}: {
  searchParams: BudgetPageProps["searchParams"];
}) {
  const actor = await requireAuthenticatedActor();
  const resolved = await searchParams;
  const data = await getBudgetPageData(prisma, actor, resolved.period);

  return (
    <AppShell
      navigationItems={APP_NAVIGATION_MODULES}
      currentPath="/anggaran"
      cashAccountProvider={data.cashAccount.provider}
      cashAccountHolder={data.cashAccount.custodianName}
      actorName={actor.memberName}
      actorUsername={actor.username}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
              Perencanaan & Evaluasi Anggaran Bulanan
            </h1>
            <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
              Pemantauan real-time anggaran vs realisasi beban operasional periode{" "}
              {data.periodLabel}.
            </p>
          </div>

          <Link
            href={`/laporan?period=${encodeURIComponent(data.period)}`}
            className="inline-flex items-center self-start sm:self-auto rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            Lihat laporan keuangan {data.periodLabel}
          </Link>
        </div>

        <BudgetManagement data={data} />
      </div>
    </AppShell>
  );
}

export default function BudgetPage({ searchParams }: BudgetPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFA] p-6 text-xs text-slate-500">
          Memuat perencanaan anggaran bulanan...
        </div>
      }
    >
      <BudgetContent searchParams={searchParams} />
    </Suspense>
  );
}

