import Link from "next/link";
import { logoutAction } from "@/app/actions/auth-actions";
import type { NavigationModuleItem } from "@/lib/navigation";

interface AppShellProps {
  navigationItems: NavigationModuleItem[];
  currentPath?: string;
  cashAccountProvider: string;
  cashAccountHolder: string;
  actorName?: string;
  actorUsername?: string;
  kostName?: string;
  children: React.ReactNode;
}

export function AppShell({
  navigationItems,
  currentPath = "/",
  cashAccountProvider,
  cashAccountHolder,
  actorName,
  actorUsername,
  kostName = "KostKas",
  children,
}: AppShellProps) {
  const availableModules = navigationItems.filter((item) => item.implemented);

  return (
    <div className="min-h-screen bg-[#F8FAFA] text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside
        aria-label="Navigasi aplikasi"
        className="hidden lg:flex lg:w-60 lg:flex-col lg:shrink-0 border-r border-slate-200/80 bg-white"
      >
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-100">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 rounded-sm"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-xs bg-teal-700 shrink-0"
            />
            <span className="text-base font-semibold tracking-tight">
              {kostName || "KostKas"}
            </span>
          </Link>
        </div>

        <nav aria-label="Menu utama" className="flex-1 px-3 py-5 space-y-1">
          {availableModules.map((item) => {
            const isActive =
              item.href === "/"
                ? currentPath === "/"
                : currentPath.startsWith(item.href);

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                  isActive
                    ? "bg-slate-100/80 font-medium text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-4 w-0.5 rounded-full ${
                    isActive ? "bg-teal-700" : "bg-transparent"
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-slate-200/70 space-y-3">
          <div>
            <p className="text-xs text-slate-500">Pemegang rekening kas</p>
            <p className="text-sm font-medium text-slate-900 mt-0.5">
              {cashAccountHolder} ({cashAccountProvider})
            </p>
          </div>

          {actorName && (
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-900 truncate">
                  {actorName}
                </p>
                {actorUsername && (
                  <p className="text-xs text-slate-500 truncate">
                    @{actorUsername}
                  </p>
                )}
              </div>

              <form action={logoutAction}>
                <button
                  type="submit"
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                >
                  Keluar
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile & Tablet Header */}
      <header className="lg:hidden border-b border-slate-200/80 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="h-14 flex items-center justify-between gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 rounded-sm shrink-0"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-xs bg-teal-700 shrink-0"
              />
              <span className="text-base font-semibold tracking-tight">
                {kostName || "KostKas"}
              </span>
            </Link>

            <div className="flex items-center gap-3 min-w-0">
              <p className="text-xs text-slate-600 truncate">
                Kas {cashAccountProvider}:{" "}
                <span className="font-medium text-slate-900">
                  {cashAccountHolder}
                </span>
              </p>

              {actorName && (
                <form action={logoutAction} className="shrink-0">
                  <button
                    type="submit"
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Keluar
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Mobile & Tablet Navigation Bar */}
          <nav
            aria-label="Menu utama"
            className="flex items-center gap-1 border-t border-slate-100 py-2"
          >
            {availableModules.map((item) => {
              const isActive =
                item.href === "/"
                  ? currentPath === "/"
                  : currentPath.startsWith(item.href);

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-teal-700 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
