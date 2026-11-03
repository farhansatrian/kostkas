"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth-actions";
import { InfoTooltip } from "@/components/info-tooltip";
import {
  type NavigationModuleItem,
  NAVIGATION_GROUPS,
} from "@/lib/navigation";

interface AppShellProps {
  navigationItems?: NavigationModuleItem[];
  currentPath?: string;
  cashAccountProvider: string;
  cashAccountHolder: string;
  actorName?: string;
  actorUsername?: string;
  kostName?: string;
  children: React.ReactNode;
}

function NavIcon({ id }: { id: string }) {
  switch (id) {
    case "overview":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      );
    case "dues":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6H2.25m0 0v8.25m0 0A2.25 2.25 0 004.5 16.5h15a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H4.5A2.25 2.25 0 002.25 6zM15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "expenses":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "reimbursements":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      );
    case "reports":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case "budgets":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "members":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      );
    case "settings":
      return (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return (
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      );
  }
}

export function AppShell({
  currentPath = "/",
  cashAccountProvider,
  cashAccountHolder,
  actorName,
  actorUsername,
  kostName = "KostKas",
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFA] text-slate-900 flex flex-col lg:flex-row print:bg-white">
      {/* ========================================================= */}
      {/* DESKTOP SIDEBAR (Grouped, Minimalist Executive Ledger)    */}
      {/* ========================================================= */}
      <aside
        aria-label="Navigasi aplikasi"
        className="hidden lg:flex lg:w-64 lg:flex-col lg:shrink-0 border-r border-slate-200/80 bg-white print:hidden"
      >
        {/* App Logo & Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-100">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-700 rounded-sm"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-xs bg-teal-700 shrink-0"
            />
            <span className="text-base font-semibold tracking-tight">
              {kostName || "KostKas"}
            </span>
          </Link>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200/60">
            Kas Kost
          </span>
        </div>

        {/* Grouped Navigation */}
        <nav aria-label="Menu utama" className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
          {NAVIGATION_GROUPS.map((group) => (
            <div key={group.id} className="space-y-1">
              <p className="px-3 text-[11px] font-semibold tracking-wider uppercase text-slate-400">
                {group.title}
              </p>

              <div className="space-y-0.5 pt-1">
                {group.items.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? currentPath === "/"
                      : currentPath.startsWith(item.href);

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-700 ${
                        isActive
                          ? "bg-slate-900 text-white shadow-xs"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`${
                            isActive
                              ? "text-teal-400"
                              : "text-slate-400 group-hover:text-slate-700"
                          }`}
                        >
                          <NavIcon id={item.id} />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </div>

                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 rounded-full bg-teal-400 shrink-0"
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer: Cash Custodian & User Account */}
        <div className="px-5 py-4 border-t border-slate-200/70 bg-slate-50/50 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] text-slate-500 font-medium">Rekening Kas Utama</p>
                <InfoTooltip
                  content={`Uang kas bersama disimpan di akun ${cashAccountProvider} atas nama ${cashAccountHolder}. Semua mutasi dicatat transparan di buku kas.`}
                  label="Info rekening kas"
                />
              </div>
              <p className="text-xs font-semibold text-slate-900 mt-0.5 truncate">
                {cashAccountHolder}{" "}
                <span className="font-normal text-slate-500">
                  ({cashAccountProvider})
                </span>
              </p>
            </div>
          </div>

          {actorName && (
            <div className="pt-2.5 border-t border-slate-200/60 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {actorName}
                </p>
                {actorUsername && (
                  <p className="text-[11px] text-slate-500 truncate">
                    @{actorUsername}
                  </p>
                )}
              </div>

              <form action={logoutAction}>
                <button
                  type="submit"
                  className="text-xs font-medium text-slate-600 hover:text-rose-700 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 transition-colors cursor-pointer"
                >
                  Keluar
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================= */}
      {/* MOBILE & TABLET HEADER & COLLAPSIBLE DRAWER               */}
      {/* ========================================================= */}
      <header className="lg:hidden border-b border-slate-200/80 bg-white sticky top-0 z-40 print:hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="h-14 flex items-center justify-between gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-700 rounded-sm shrink-0"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-xs bg-teal-700 shrink-0"
              />
              <span className="text-base font-semibold tracking-tight">
                {kostName || "KostKas"}
              </span>
            </Link>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 hidden sm:inline truncate">
                Kas {cashAccountProvider}:{" "}
                <strong className="text-slate-900">{cashAccountHolder}</strong>
              </span>

              {/* Menu Dropdown / Toggle Button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                aria-expanded={mobileMenuOpen}
                aria-label="Toggle navigasi menu"
              >
                <span>{mobileMenuOpen ? "Tutup" : "Menu"}</span>
                <svg
                  className={`w-4 h-4 transition-transform ${mobileMenuOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Quick Horizontal Operational Bar (Always Visible on Mobile) */}
          <nav
            aria-label="Navigasi cepat operasional"
            className="flex items-center gap-1.5 border-t border-slate-100 py-2 overflow-x-auto whitespace-nowrap scrollbar-none"
          >
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors ${
                currentPath === "/"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Ringkasan
            </Link>
            <Link
              href="/iuran"
              className={`px-3 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors ${
                currentPath.startsWith("/iuran")
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Iuran
            </Link>
            <Link
              href="/pengeluaran"
              className={`px-3 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors ${
                currentPath.startsWith("/pengeluaran")
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Pengeluaran
            </Link>
            <Link
              href="/reimbursement"
              className={`px-3 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors ${
                currentPath.startsWith("/reimbursement")
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Reimburse
            </Link>
            <Link
              href="/laporan"
              className={`px-3 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors ${
                currentPath.startsWith("/laporan")
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Laporan
            </Link>
          </nav>
        </div>

        {/* Collapsible Mobile Menu Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6 space-y-4 shadow-lg animate-in slide-in-from-top-2 duration-150">
            {NAVIGATION_GROUPS.map((group) => (
              <div key={group.id} className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.title}
                </p>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {group.items.map((item) => {
                    const isActive =
                      item.href === "/"
                        ? currentPath === "/"
                        : currentPath.startsWith(item.href);

                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-2 rounded-lg p-2.5 text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-slate-900 text-white"
                            : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <NavIcon id={item.id} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            {actorName && (
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-900">{actorName}</p>
                  <p className="text-[11px] text-slate-500">
                    Kas {cashAccountProvider}: {cashAccountHolder}
                  </p>
                </div>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="text-xs font-medium text-rose-700 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 transition-colors"
                  >
                    Keluar Akun
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </header>

      {/* ========================================================= */}
      {/* MAIN CONTENT AREA                                         */}
      {/* ========================================================= */}
      <main className="flex-1 min-w-0 print:p-0">{children}</main>
    </div>
  );
}
