import Link from "next/link";
import type { NavigationModuleItem } from "@/data/demo-dashboard";

interface AppShellProps {
  navigationItems: NavigationModuleItem[];
  cashAccountProvider: string;
  cashAccountHolder: string;
  children: React.ReactNode;
}

export function AppShell({
  navigationItems,
  cashAccountProvider,
  cashAccountHolder,
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
              KostKas
            </span>
          </Link>
        </div>

        <nav aria-label="Menu utama" className="flex-1 px-3 py-5 space-y-1">
          {availableModules.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-current="page"
              className="flex items-center gap-3 rounded-lg bg-slate-100/80 px-3 py-2 text-sm font-medium text-slate-900 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <span
                aria-hidden="true"
                className="h-4 w-0.5 rounded-full bg-teal-700"
              />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="px-6 py-4 border-t border-slate-200/70">
          <p className="text-xs text-slate-500">Pemegang rekening kas</p>
          <p className="text-sm font-medium text-slate-900 mt-0.5">
            {cashAccountHolder} ({cashAccountProvider})
          </p>
        </div>
      </aside>

      {/* Mobile & Tablet Header */}
      <header className="lg:hidden border-b border-slate-200/80 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 rounded-sm"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-xs bg-teal-700 shrink-0"
            />
            <span className="text-base font-semibold tracking-tight">
              KostKas
            </span>
          </Link>

          <p className="text-xs text-slate-600 truncate">
            Kas {cashAccountProvider}:{" "}
            <span className="font-medium text-slate-900">
              {cashAccountHolder}
            </span>
          </p>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
