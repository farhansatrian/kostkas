"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  type BudgetSettingsActionState,
  upsertCategoryBudgetAction,
  upsertMonthlyBudgetAction,
} from "@/app/actions/budget-settings-actions";
import type {
  BudgetAlertLevel,
  BudgetPageData,
  CategoryBudgetComparisonItem,
} from "@/lib/budget-service";
import { formatRupiah } from "@/lib/navigation";

const initialState: BudgetSettingsActionState = { status: "idle" };

function FeedbackBanner({ state }: { state: BudgetSettingsActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const isError = state.status === "error";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg border px-3.5 py-2.5 text-xs ${
        isError
          ? "border-rose-200 bg-rose-50/70 text-rose-800"
          : "border-teal-200 bg-teal-50/60 text-teal-900"
      }`}
    >
      {state.message}
    </div>
  );
}

function getAlertPresentation(alertLevel: BudgetAlertLevel, isOver: boolean) {
  if (isOver || alertLevel === "OVER_BUDGET") {
    return {
      barClass: "bg-rose-600",
      dotClass: "bg-rose-600",
      textClass: "text-rose-700 font-semibold",
      label: "Melebihi Anggaran (Over-Budget)",
    };
  }
  if (alertLevel === "NEAR_LIMIT") {
    return {
      barClass: "bg-amber-600",
      dotClass: "bg-amber-600",
      textClass: "text-amber-800 font-semibold",
      label: "Mendekati Batas (>=80%)",
    };
  }
  if (alertLevel === "UNBUDGETED") {
    return {
      barClass: "bg-slate-300",
      dotClass: "bg-slate-400",
      textClass: "text-slate-500 font-medium",
      label: "Belum Dianggarkan",
    };
  }
  return {
    barClass: "bg-teal-700",
    dotClass: "bg-teal-700",
    textClass: "text-teal-800 font-medium",
    label: "Dalam Batas Aman",
  };
}

function CategoryBudgetRow({
  item,
  isSubcategory,
}: {
  item: CategoryBudgetComparisonItem;
  isSubcategory: boolean;
}) {
  const alertUI = getAlertPresentation(item.alertLevel, item.isOverBudget);
  const clampedWidth = Math.min(100, Math.max(0, item.usagePercentage));

  return (
    <li
      className={`p-4 sm:p-5 space-y-2.5 ${
        isSubcategory ? "bg-slate-50/50 pl-7 sm:pl-9" : "bg-white"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p
            className={`text-sm truncate ${
              isSubcategory
                ? "font-medium text-slate-700"
                : "font-semibold text-slate-900"
            }`}
          >
            {isSubcategory ? `↳ ${item.categoryName}` : item.categoryName}
          </p>
          {!item.isActive && (
            <span className="text-[11px] text-slate-400">(Nonaktif)</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums shrink-0">
          <span className="text-slate-500">
            Realisasi:{" "}
            <strong className="text-slate-900">
              {formatRupiah(item.inclusiveRealizedAmount)}
            </strong>{" "}
            / Anggaran{" "}
            <strong className="text-slate-900">
              {formatRupiah(item.effectiveBudgetAmount)}
            </strong>
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${alertUI.dotClass}`}
            />
            <span className={alertUI.textClass}>
              {item.isOverBudget
                ? `Over-budget +${formatRupiah(item.overBudgetAmount)} (${item.usagePercentage}%)`
                : item.effectiveBudgetAmount > 0
                  ? `Sisa ${formatRupiah(item.remainingAvailableAmount)} (${item.usagePercentage}%)`
                  : "Rp0 dianggarkan"}
            </span>
          </span>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuenow={clampedWidth}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Pemakaian anggaran ${item.displayLabel}`}
        className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden"
      >
        <div
          className={`h-full rounded-full ${alertUI.barClass}`}
          style={{ width: `${clampedWidth}%` }}
        />
      </div>
    </li>
  );
}

export function BudgetManagement({ data }: { data: BudgetPageData }) {
  const [monthlyState, monthlyFormAction, isSavingMonthly] = useActionState(
    upsertMonthlyBudgetAction,
    initialState
  );

  const [categoryState, categoryFormAction, isSavingCategory] = useActionState(
    upsertCategoryBudgetAction,
    initialState
  );

  const { monthlyBudget } = data;
  const overallAlert = getAlertPresentation(
    monthlyBudget.alertLevel,
    monthlyBudget.isOverBudget
  );
  const overallBarWidth = Math.min(
    100,
    Math.max(0, monthlyBudget.usagePercentage)
  );

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Period Selector */}
      <section
        aria-labelledby="budget-period-heading"
        className="rounded-xl bg-white border border-slate-200/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h2
            id="budget-period-heading"
            className="text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Periode Perencanaan Anggaran
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Perubahan anggaran pada periode baru tidak mengubah histori anggaran periode sebelumnya.
          </p>
        </div>

        <form
          method="GET"
          action="/anggaran"
          className="flex items-center gap-2.5"
        >
          <label htmlFor="budget-period-select" className="sr-only">
            Pilih Periode Anggaran
          </label>
          <select
            id="budget-period-select"
            name="period"
            defaultValue={data.period}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-teal-700 focus:outline-none"
          >
            {data.availablePeriods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} ({p.value})
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Buka Periode
          </button>
        </form>
      </section>

      {/* Executive Ledger Surface: Monthly Budget vs Realization */}
      <section
        aria-labelledby="budget-summary-heading"
        className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
      >
        <h2 id="budget-summary-heading" className="sr-only">
          Evaluasi Anggaran dan Realisasi Pengeluaran {data.periodLabel}
        </h2>

        <div className="p-5 sm:p-7 border-b border-slate-200/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">
                Total anggaran bulanan efektif ({data.periodLabel})
              </p>
              <p className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">
                {formatRupiah(monthlyBudget.effectiveTotalBudget)}
              </p>
            </div>

            <div className="text-xs text-slate-500 sm:text-right tabular-nums space-y-0.5">
              <p>
                Saldo kas aktual {data.cashAccount.provider} (bukan anggaran):{" "}
                <span className="font-semibold text-slate-900">
                  {formatRupiah(data.cashAccount.actualCashBalance)}
                </span>
              </p>
              <p>
                Status pemakaian:{" "}
                <span className={overallAlert.textClass}>
                  {overallAlert.label} ({monthlyBudget.usagePercentage}%)
                </span>
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div
              role="progressbar"
              aria-valuenow={overallBarWidth}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Persentase penggunaan anggaran bulanan"
              className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"
            >
              <div
                className={`h-full rounded-full ${overallAlert.barClass}`}
                style={{ width: `${overallBarWidth}%` }}
              />
            </div>

            {monthlyBudget.isOverBudget && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50/70 px-3.5 py-2 text-xs text-rose-800 tabular-nums"
              >
                Peringatan: Realisasi pengeluaran operasional periode{" "}
                {data.periodLabel} telah melampaui plafon anggaran sebesar{" "}
                <strong>{formatRupiah(monthlyBudget.overBudgetAmount)}</strong>.
              </div>
            )}

            {!monthlyBudget.isOverBudget &&
              monthlyBudget.alertLevel === "NEAR_LIMIT" && (
                <div
                  role="status"
                  className="rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2 text-xs text-amber-900 tabular-nums"
                >
                  Perhatian: Penggunaan anggaran periode {data.periodLabel}{" "}
                  telah mencapai <strong>{monthlyBudget.usagePercentage}%</strong>{" "}
                  (Sisa anggaran:{" "}
                  {formatRupiah(monthlyBudget.remainingAvailableAmount)}).
                </div>
              )}
          </div>
        </div>

        <dl className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200/80">
          <div className="p-5 sm:p-6">
            <dt className="text-xs font-medium text-slate-500">
              Realisasi beban operasional (CONFIRMED)
            </dt>
            <dd className="mt-1.5 text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatRupiah(monthlyBudget.totalRealizedAmount)}
            </dd>
            <p className="mt-2 text-xs text-slate-500 tabular-nums">
              Kas langsung {formatRupiah(monthlyBudget.directCashRealizedAmount)}{" "}
              + Talangan {formatRupiah(monthlyBudget.memberAdvanceRealizedAmount)}.
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <dt className="text-xs font-medium text-slate-500">
              {monthlyBudget.isOverBudget
                ? "Selisih pelampauan anggaran (Over-Budget)"
                : "Sisa plafon anggaran tersedia"}
            </dt>
            <dd
              className={`mt-1.5 text-xl sm:text-2xl font-semibold tracking-tight tabular-nums ${
                monthlyBudget.isOverBudget
                  ? "text-rose-700"
                  : "text-emerald-700"
              }`}
            >
              {monthlyBudget.isOverBudget
                ? `-${formatRupiah(monthlyBudget.overBudgetAmount)}`
                : formatRupiah(monthlyBudget.remainingAvailableAmount)}
            </dd>
            <p className="mt-2 text-xs text-slate-500">
              Pencairan reimbursement tidak dihitung ulang sebagai realisasi anggaran.
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <dt className="text-xs font-medium text-slate-500">
              Total alokasi per kategori
            </dt>
            <dd className="mt-1.5 text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatRupiah(monthlyBudget.allocatedCategoriesTotal)}
            </dd>
            <p className="mt-2 text-xs text-slate-500">
              Bebas perhitungan ganda antara kategori induk dan subkategori.
            </p>
          </div>
        </dl>
      </section>

      {/* Main Content Grid: Category Comparison + Budget Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* Left 7 Cols: Category Budget vs Realization */}
        <section
          aria-labelledby="category-budget-list-heading"
          className="lg:col-span-7 rounded-xl bg-white border border-slate-200/80 overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200/80 flex items-baseline justify-between">
            <div>
              <h2
                id="category-budget-list-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Perbandingan Anggaran vs Realisasi per Kategori
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Realisasi kategori induk merangkum subkategori di bawahnya secara otomatis tanpa hitung ganda.
              </p>
            </div>
            <Link
              href={`/pengeluaran?period=${encodeURIComponent(data.period)}`}
              className="text-xs font-medium text-teal-800 underline underline-offset-2"
            >
              Rincian belanja
            </Link>
          </div>

          <ul className="divide-y divide-slate-200/70">
            {data.categoryGroups.map((group) => (
              <div key={group.parent.categoryId}>
                <CategoryBudgetRow item={group.parent} isSubcategory={false} />
                {group.subcategories.map((sub) => (
                  <CategoryBudgetRow
                    key={sub.categoryId}
                    item={sub}
                    isSubcategory={true}
                  />
                ))}
              </div>
            ))}
          </ul>
        </section>

        {/* Right 5 Cols: Set Monthly Total Budget + Set Category Budget */}
        <div className="lg:col-span-5 space-y-6">
          {/* Form 1: Plafon Anggaran Bulanan */}
          <section
            aria-labelledby="set-monthly-budget-heading"
            className="rounded-xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-4"
          >
            <div>
              <h2
                id="set-monthly-budget-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Tetapkan Plafon Anggaran Bulanan ({data.periodLabel})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Menetapkan target batas belanja maksimal untuk bulan {data.periodLabel}.
              </p>
            </div>

            <FeedbackBanner state={monthlyState} />

            <form action={monthlyFormAction} className="space-y-3.5">
              <input type="hidden" name="period" value={data.period} />

              <div>
                <label
                  htmlFor="monthly-total-amount"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Total Anggaran Bulanan (Rp)
                </label>
                <input
                  id="monthly-total-amount"
                  type="number"
                  name="totalAmount"
                  min={0}
                  step={1}
                  required
                  defaultValue={monthlyBudget.effectiveTotalBudget || 450000}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="monthly-budget-note"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Catatan Perencanaan (Opsional)
                </label>
                <input
                  id="monthly-budget-note"
                  type="text"
                  name="note"
                  maxLength={180}
                  defaultValue={monthlyBudget.note ?? ""}
                  placeholder="Contoh: Prioritas utilitas & kebersihan bulanan"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingMonthly}
                className="w-full rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {isSavingMonthly
                  ? "Menyimpan..."
                  : `Simpan Plafon ${data.periodLabel}`}
              </button>
            </form>
          </section>

          {/* Form 2: Alokasi Anggaran per Kategori */}
          <section
            aria-labelledby="set-category-budget-heading"
            className="rounded-xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-4"
          >
            <div>
              <h2
                id="set-category-budget-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Atur Anggaran per Kategori ({data.periodLabel})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Setiap perubahan alokasi kategori tercatat pada AuditLog aplikasi.
              </p>
            </div>

            <FeedbackBanner state={categoryState} />

            <form action={categoryFormAction} className="space-y-3.5">
              <input type="hidden" name="period" value={data.period} />

              <div>
                <label
                  htmlFor="budget-category-select"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Pilih Kategori / Subkategori
                </label>
                <select
                  id="budget-category-select"
                  name="categoryId"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  <option value="">— Pilih Kategori —</option>
                  {data.flatCategories.map((cat) => (
                    <option key={cat.categoryId} value={cat.categoryId}>
                      {cat.displayLabel} (Saat ini:{" "}
                      {formatRupiah(cat.directBudgetAmount)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="budget-category-amount"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Nominal Anggaran Kategori (Rp)
                </label>
                <input
                  id="budget-category-amount"
                  type="number"
                  name="amount"
                  min={0}
                  step={1}
                  required
                  placeholder="100000"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="budget-category-note"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Keterangan Alokasi (Opsional)
                </label>
                <input
                  id="budget-category-note"
                  type="text"
                  name="note"
                  maxLength={160}
                  placeholder="Kuota belanja kategori bulan ini"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingCategory}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {isSavingCategory
                  ? "Menyimpan..."
                  : "Simpan Anggaran Kategori"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

