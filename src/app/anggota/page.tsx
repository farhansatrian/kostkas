import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import {
  AddMemberForm,
  MemberListSection,
} from "@/components/member-management";
import { listMembersDirectory } from "@/lib/member-service";
import { APP_NAVIGATION_MODULES } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedActor } from "@/lib/session";

async function MembersPageContent() {
  const actor = await requireAuthenticatedActor();
  const [members, cashAccount] = await Promise.all([
    listMembersDirectory(prisma, actor),
    prisma.cashAccount.findFirst({
      where: { isActive: true },
      include: { custodianMember: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const activeMembersCount = members.filter((m) => m.isActiveMember).length;
  const inactiveMembersCount = members.length - activeMembersCount;
  const custodianHolder = cashAccount?.custodianMember?.name ?? "Farhan";
  const cashProvider = cashAccount?.provider ?? "DANA";

  return (
    <AppShell
      navigationItems={APP_NAVIGATION_MODULES}
      currentPath="/anggota"
      cashAccountProvider={cashProvider}
      cashAccountHolder={custodianHolder}
      actorName={actor.memberName}
      actorUsername={actor.username}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
            Anggota Kost
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Kelola penghuni kost aktif dan akun login. Seluruh anggota aktif
            memiliki hak akses setara.
          </p>
        </div>

        {/* Ringkasan Keanggotaan */}
        <section
          aria-label="Ringkasan keanggotaan"
          className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
        >
          <dl className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
            <div className="p-5">
              <dt className="text-xs font-medium text-slate-500">
                Anggota aktif
              </dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                {activeMembersCount} orang
              </dd>
            </div>
            <div className="p-5">
              <dt className="text-xs font-medium text-slate-500">
                Pemegang akun kas {cashProvider}
              </dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {custodianHolder}
              </dd>
            </div>
            <div className="p-5">
              <dt className="text-xs font-medium text-slate-500">
                Riwayat anggota keluar
              </dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                {inactiveMembersCount} orang
              </dd>
            </div>
          </dl>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Daftar Anggota */}
          <section
            aria-labelledby="daftar-anggota-heading"
            className="lg:col-span-8 space-y-3"
          >
            <div className="flex items-baseline justify-between">
              <h2
                id="daftar-anggota-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Daftar penghuni & status akun
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                Total {members.length} entitas
              </span>
            </div>

            <MemberListSection members={members} />
          </section>

          {/* Form Tambah Anggota */}
          <section
            aria-labelledby="tambah-anggota-heading"
            className="lg:col-span-4 space-y-3"
          >
            <h2
              id="tambah-anggota-heading"
              className="text-sm font-semibold text-slate-900"
            >
              Tambah anggota baru
            </h2>

            <div className="rounded-xl bg-white border border-slate-200/80 p-5">
              <AddMemberForm />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

export default function MembersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFA] p-6 text-xs text-slate-500">
          Memuat data anggota...
        </div>
      }
    >
      <MembersPageContent />
    </Suspense>
  );
}

