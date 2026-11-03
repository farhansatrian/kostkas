import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { InfoTooltip } from "@/components/info-tooltip";
import { ExpenseManagement } from "@/components/expense-management";
import { getKostAppPreferences } from "@/lib/app-preferences";
import { getExpensesPageData } from "@/lib/expense-reimbursement-service";
import { APP_NAVIGATION_MODULES } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedActor } from "@/lib/session";

interface ExpensesPageProps {
  searchParams: Promise<{
    period?: string;
    categoryId?: string;
    memberId?: string;
    fundingSource?: string;
    status?: string;
  }>;
}

async function ExpensesContent({
  searchParams,
}: {
  searchParams: ExpensesPageProps["searchParams"];
}) {
  const actor = await requireAuthenticatedActor();
  const resolvedParams = await searchParams;
  const [data, preferences] = await Promise.all([
    getExpensesPageData(prisma, actor, {
      period: resolvedParams.period,
      categoryId: resolvedParams.categoryId,
      memberId: resolvedParams.memberId,
      fundingSource: resolvedParams.fundingSource,
      status: resolvedParams.status,
    }),
    getKostAppPreferences(prisma),
  ]);

  return (
    <AppShell
      navigationItems={APP_NAVIGATION_MODULES}
      currentPath="/pengeluaran"
      cashAccountProvider={data.cashAccount.provider}
      cashAccountHolder={data.cashAccount.custodianName}
      kostName={preferences.kostName}
      actorName={actor.memberName}
      actorUsername={actor.username}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                Pengeluaran Kas
              </h1>
              <InfoTooltip
                title="Pencatatan Pengeluaran Kas"
                content="Catat semua belanja kebutuhan bersama. Jika dibayar memakai uang kas DANA, saldo kas berkurang langsung. Jika ditalangi anggota, sistem otomatis mencatatnya sebagai piutang reimbursement anggota."
                label="Info pengeluaran kas"
              />
            </div>
            <p className="text-sm text-slate-600 mt-0.5">
              Pencatatan belanja kas langsung DANA dan talangan anggota.
            </p>
          </div>

          <Link
            href="/reimbursement"
            className="inline-flex items-center self-start sm:self-auto rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            Kelola reimbursement &rarr;
          </Link>
        </div>

        <ExpenseManagement data={data} actorMemberId={actor.memberId} />
      </div>
    </AppShell>
  );
}

export default function ExpensesPage({ searchParams }: ExpensesPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFA] p-6 text-xs text-slate-500">
          Memuat buku pengeluaran kas...
        </div>
      }
    >
      <ExpensesContent searchParams={searchParams} />
    </Suspense>
  );
}

