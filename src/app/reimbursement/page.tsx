import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { InfoTooltip } from "@/components/info-tooltip";
import { ReimbursementManagement } from "@/components/reimbursement-management";
import { getKostAppPreferences } from "@/lib/app-preferences";
import { getReimbursementsPageData } from "@/lib/expense-reimbursement-service";
import { APP_NAVIGATION_MODULES } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedActor } from "@/lib/session";

interface ReimbursementsPageProps {
  searchParams: Promise<{
    status?: string;
    memberId?: string;
  }>;
}

async function ReimbursementsContent({
  searchParams,
}: {
  searchParams: ReimbursementsPageProps["searchParams"];
}) {
  const actor = await requireAuthenticatedActor();
  const resolvedParams = await searchParams;
  const [data, preferences] = await Promise.all([
    getReimbursementsPageData(prisma, actor, {
      status: resolvedParams.status,
      memberId: resolvedParams.memberId,
    }),
    getKostAppPreferences(prisma),
  ]);

  return (
    <AppShell
      navigationItems={APP_NAVIGATION_MODULES}
      currentPath="/reimbursement"
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
                Reimbursement & Talangan
              </h1>
              <InfoTooltip
                title="Apa itu Reimbursement?"
                content="Klaim pengembalian dana untuk belanja kost yang ditalangi terlebih dahulu memakai uang pribadi anggota. Setelah dicairkan dari kas DANA, saldo kas berkurang dan kewajiban kas selesai."
                label="Info reimbursement"
              />
            </div>
            <p className="text-sm text-slate-600 mt-0.5">
              Pelacakan talangan anggota serta pencairan dana dari kas DANA.
            </p>
          </div>

          <Link
            href="/pengeluaran"
            className="inline-flex items-center self-start sm:self-auto rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            Catat pengeluaran baru &rarr;
          </Link>
        </div>

        <ReimbursementManagement data={data} />
      </div>
    </AppShell>
  );
}

export default function ReimbursementsPage({
  searchParams,
}: ReimbursementsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFA] p-6 text-xs text-slate-500">
          Memuat buku klaim reimbursement...
        </div>
      }
    >
      <ReimbursementsContent searchParams={searchParams} />
    </Suspense>
  );
}

