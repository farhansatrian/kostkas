import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ExpenseManagement } from "@/components/expense-management";
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
  const data = await getExpensesPageData(prisma, actor, {
    period: resolvedParams.period,
    categoryId: resolvedParams.categoryId,
    memberId: resolvedParams.memberId,
    fundingSource: resolvedParams.fundingSource,
    status: resolvedParams.status,
  });

  return (
    <AppShell
      navigationItems={APP_NAVIGATION_MODULES}
      currentPath="/pengeluaran"
      cashAccountProvider={data.cashAccount.provider}
      cashAccountHolder={data.cashAccount.custodianName}
      actorName={actor.memberName}
      actorUsername={actor.username}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
              Pengeluaran Kas & Operasional
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Pencatatan pengeluaran kas langsung DANA, talangan anggota, dan kategori dinamis.
            </p>
          </div>

          <Link
            href="/reimbursement"
            className="inline-flex items-center self-start sm:self-auto rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            Kelola klaim reimbursement
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

