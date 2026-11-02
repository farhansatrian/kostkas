import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SettingsManagement } from "@/components/settings-management";
import { APP_NAVIGATION_MODULES } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedActor } from "@/lib/session";
import { getSettingsPageData } from "@/lib/settings-service";

interface SettingsPageProps {
  searchParams: Promise<{
    period?: string;
    actorMemberId?: string;
    actionCategory?: string;
    page?: string;
    pageSize?: string;
  }>;
}

async function SettingsContent({
  searchParams,
}: {
  searchParams: SettingsPageProps["searchParams"];
}) {
  const actor = await requireAuthenticatedActor();
  const resolved = await searchParams;
  const data = await getSettingsPageData(prisma, actor, {
    period: resolved.period,
    actorMemberId: resolved.actorMemberId,
    actionCategory: resolved.actionCategory,
    page: resolved.page,
    pageSize: resolved.pageSize,
  });

  return (
    <AppShell
      navigationItems={APP_NAVIGATION_MODULES}
      currentPath="/pengaturan"
      cashAccountProvider={data.cashAccount.provider}
      cashAccountHolder={data.cashAccount.custodianName}
      kostName={data.preferences.kostName}
      actorName={actor.memberName}
      actorUsername={actor.username}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
              Pengaturan Aplikasi, Rekonsiliasi & Audit Log
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Konfigurasi akun kas DANA, kebijakan tarif iuran, keamanan akun, rekonsiliasi manual, dan riwayat aktivitas.
            </p>
          </div>

          <Link
            href="/anggota"
            className="inline-flex items-center self-start sm:self-auto rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            Kelola direktori anggota
          </Link>
        </div>

        <SettingsManagement data={data} actorMemberId={actor.memberId} />
      </div>
    </AppShell>
  );
}

export default function SettingsPage({ searchParams }: SettingsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFA] p-6 text-xs text-slate-500">
          Memuat pengaturan aplikasi & riwayat aktivitas...
        </div>
      }
    >
      <SettingsContent searchParams={searchParams} />
    </Suspense>
  );
}

