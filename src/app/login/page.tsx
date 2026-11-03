import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BootstrapAccountForm } from "@/components/bootstrap-account-form";
import { LoginForm } from "@/components/login-form";
import { prisma } from "@/lib/prisma";
import { getCurrentActor } from "@/lib/session";

async function LoginContent() {
  const actor = await getCurrentActor();
  if (actor) {
    redirect("/");
  }

  const activeAccounts = await prisma.userAccount.findMany({
    where: {
      isActive: true,
      member: { leftAt: null },
    },
    include: {
      member: {
        select: { name: true },
      },
    },
    orderBy: { member: { joinedAt: "asc" } },
  });

  const isInitialSetup = activeAccounts.length === 0;

  return (
    <div className="w-full max-w-sm mx-auto space-y-6">
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-xs bg-teal-700 shrink-0"
          />
          <span className="text-base font-semibold tracking-tight text-slate-900">
            KostKas
          </span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {isInitialSetup ? "Inisialisasi Sistem KostKas" : "Masuk ke Buku Kas Kost"}
        </h1>
        <p className="text-xs text-slate-600">
          {isInitialSetup
            ? "Belum ada akun penghuni terdaftar. Buat akun pertama untuk mulai mengelola kas kost."
            : "Seluruh penghuni aktif memiliki akses setara untuk mencatat dan memantau kas bersama."}
        </p>
      </div>

      <section
        aria-label={isInitialSetup ? "Formulir inisialisasi akun pertama" : "Formulir masuk"}
        className="rounded-xl bg-white border border-slate-200/80 p-5 sm:p-6"
      >
        {isInitialSetup ? <BootstrapAccountForm /> : <LoginForm />}
      </section>

      {activeAccounts.length > 0 && (
        <section
          aria-label="Daftar akun anggota aktif"
          className="rounded-xl bg-white border border-slate-200/80 px-4 py-3.5 space-y-2"
        >
          <p className="text-xs font-medium text-slate-700">
            Akun anggota aktif terdaftar:
          </p>
          <ul className="divide-y divide-slate-100 text-xs text-slate-600">
            {activeAccounts.map((acc) => (
              <li
                key={acc.id}
                className="py-1.5 flex items-center justify-between gap-2"
              >
                <span className="font-medium text-slate-900">
                  {acc.member.name}
                </span>
                <span className="font-mono text-slate-600">
                  @{acc.username}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#F8FAFA] text-slate-900 flex flex-col justify-center px-4 py-12">
      <Suspense
        fallback={
          <div className="w-full max-w-sm mx-auto text-xs text-slate-500">
            Memuat halaman masuk...
          </div>
        }
      >
        <LoginContent />
      </Suspense>
    </main>
  );
}

