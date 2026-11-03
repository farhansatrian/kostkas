import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { BudgetManagement } from "@/components/budget-management";
import { getKostAppPreferences } from "@/lib/app-preferences";
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
  const [data, preferences] = await Promise.all([
    getBudgetPageData(prisma, actor, resolved.period),
    getKostAppPreferences(prisma),
  ]);

  return (
    <AppShell
      navigationItems={APP_NAVIGATION_MODULES}
      currentPath="/anggaran"
      cashAccountProvider={data.cashAccount.provider}
      cashAccountHolder={data.cashAccount.custodianName}
      kostName={preferences.kostName}
      actorName={actor.memberName}
      actorUsername={actor.username}
    >
      <BudgetManagement data={data} />
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

