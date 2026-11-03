"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import {
  type BudgetSettingsActionState,
  upsertCategoryBudgetAction,
  upsertMonthlyBudgetAction,
} from "@/app/actions/budget-settings-actions";
import { InfoTooltip } from "@/components/info-tooltip";
import type {
  BudgetAlertLevel,
  BudgetPageData,
  CategoryBudgetComparisonItem,
} from "@/lib/budget-service";
import { formatRupiah } from "@/lib/navigation";

const initialState: BudgetSettingsActionState = { status: "idle" };

// Warna visual tematik untuk 5 kategori kas harian
const CATEGORY_COLORS: Record<string, { bg: string; bar: string; text: string; dot: string }> = {
  "galon & gas": {
    bg: "bg-sky-50 border-sky-200",
    bar: "bg-sky-600",
    text: "text-sky-800",
    dot: "bg-sky-500",
  },
  "kebersihan & dapur": {
    bg: "bg-teal-50 border-teal-200",
    bar: "bg-teal-600",
    text: "text-teal-800",
    dot: "bg-teal-500",
  },
  "listrik & wi-fi": {
    bg: "bg-amber-50 border-amber-200",
    bar: "bg-amber-600",
    text: "text-amber-800",
    dot: "bg-amber-500",
  },
  "perbaikan": {
    bg: "bg-purple-50 border-purple-200",
    bar: "bg-purple-600",
    text: "text-purple-800",
    dot: "bg-purple-500",
  },
  "lainnya": {
    bg: "bg-slate-100 border-slate-200",
    bar: "bg-slate-500",
    text: "text-slate-800",
    dot: "bg-slate-400",
  },
};

function getCategoryColor(name: string) {
  const normalized = name.toLowerCase().trim();
  for (const [key, val] of Object.entries(CATEGORY_COLORS)) {
    if (normalized.includes(key)) return val;
  }
  return {
    bg: "bg-slate-50 border-slate-200",
    bar: "bg-teal-600",
    text: "text-slate-800",
    dot: "bg-teal-500",
  };
}

function getAlertPresentation(alertLevel: BudgetAlertLevel, isOver: boolean) {
  if (isOver || alertLevel === "OVER_BUDGET") {
    return {
      barClass: "bg-rose-600",
      badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
      textClass: "text-rose-700 font-semibold",
      label: "Melebihi Anggaran",
    };
  }
  if (alertLevel === "NEAR_LIMIT") {
    return {
      barClass: "bg-amber-500",
      badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
      textClass: "text-amber-800 font-semibold",
      label: "Mendekati Batas (≥80%)",
    };
  }
  if (alertLevel === "UNBUDGETED") {
    return {
      barClass: "bg-slate-300",
      badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
      textClass: "text-slate-500 font-medium",
      label: "Belum Dianggarkan",
    };
  }
  return {
    barClass: "bg-teal-600",
    badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
    textClass: "text-teal-800 font-medium",
    label: "Aman",
  };
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

  // Modal / Inline editing state untuk kategori
  const [editingCategory, setEditingCategory] = useState<CategoryBudgetComparisonItem | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");

  const { monthlyBudget } = data;
  const overallAlert = getAlertPresentation(
    monthlyBudget.alertLevel,
    monthlyBudget.isOverBudget
  );
  const overallBarWidth = Math.min(
    100,
    Math.max(0, monthlyBudget.usagePercentage)
  );

  // Hitung persentase alokasi untuk visual distribution bar
  const totalAllocated = Math.max(1, monthlyBudget.allocatedCategoriesTotal);
  const distributionItems = data.flatCategories
    .filter((cat) => cat.effectiveBudgetAmount > 0)
    .map((cat) => {
      const share = Math.round((cat.effectiveBudgetAmount / totalAllocated) * 100);
      const color = getCategoryColor(cat.categoryName);
      return {
        ...cat,
        share,
        color,
      };
    });

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* ========================================================= */}
      {/* 1. HEADER & PERIOD SELECTOR                               */}
      {/* ========================================================= */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Anggaran & Pagu Belanja
            </h1>
            <InfoTooltip
              title="Apa itu Anggaran Kas Kost?"
              content="Anggaran adalah batas rencana belanja kas bersama untuk bulan ini. Gunanya supaya pengeluaran kas operasional terkendali dan tidak melebihi uang iuran yang terkumpul dari para anggota."
              label="Penjelasan apa itu anggaran kas"
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Periode aktif: <strong className="text-slate-800">{data.periodLabel}</strong>{" "}
            (Dibandingkan riil bulan lalu: {data.previousPeriodLabel})
          </p>
        </div>

        <form method="GET" action="/anggaran" className="flex items-center gap-2">
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
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Buka
          </button>
        </form>
      </section>

      {/* Banner Feedback Form */}
      {(monthlyState.status !== "idle" && monthlyState.message) && (
        <div
          role="status"
          className={`rounded-xl border p-3.5 text-xs ${
            monthlyState.status === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-teal-200 bg-teal-50 text-teal-900"
          }`}
        >
          {monthlyState.message}
        </div>
      )}

      {(categoryState.status !== "idle" && categoryState.message) && (
        <div
          role="status"
          className={`rounded-xl border p-3.5 text-xs ${
            categoryState.status === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-teal-200 bg-teal-50 text-teal-900"
          }`}
        >
          {categoryState.message}
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. THREE KEY VISUAL CARDS (HISTORICAL CONTEXT)            */}
      {/* ========================================================= */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Card 1: Realisasi Bulan Lalu */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Acuan Historis
            </span>
            <InfoTooltip
              title="Realisasi Bulan Lalu"
              content={`Total pengeluaran kas riil yang terjadi pada bulan ${data.previousPeriodLabel}. Ini adalah patokan kebutuhan nyata belanja kost sebelum menetapkan anggaran bulan ini.`}
              label="Info realisasi bulan lalu"
            />
          </div>
          <div>
            <p className="text-xs text-slate-500">
              Keluar Bulan Lalu ({data.previousPeriodLabel})
            </p>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 tabular-nums mt-1">
              {formatRupiah(monthlyBudget.previousTotalRealizedAmount)}
            </p>
          </div>
          <p className="text-[11px] text-slate-400">
            {monthlyBudget.previousTotalRealizedAmount > 0
              ? "Gunakan acuan ini agar kuota belanja realistis"
              : "Belum ada catatan pengeluaran di bulan lalu"}
          </p>
        </div>

        {/* Card 2: Pagu Anggaran Bulan Ini */}
        <div className="rounded-xl border border-teal-200/80 bg-teal-50/40 p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-800">
              Pagu Bulan Ini ({data.periodLabel})
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${overallAlert.badgeClass}`}>
              {overallAlert.label}
            </span>
          </div>
          <div>
            <p className="text-xs text-teal-900/80">Target Batas Belanja Kas</p>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight text-teal-950 tabular-nums mt-1">
              {formatRupiah(monthlyBudget.effectiveTotalBudget)}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1 tabular-nums">
              <span>Terpakai: {formatRupiah(monthlyBudget.totalRealizedAmount)}</span>
              <span className="font-semibold">{monthlyBudget.usagePercentage}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-teal-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${overallAlert.barClass} transition-all duration-300`}
                style={{ width: `${overallBarWidth}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Sisa Plafon Kas */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Sisa Plafon Kas
            </span>
            <InfoTooltip
              title="Sisa Plafon Belanja"
              content="Sisa batas belanja yang masih aman digunakan pada bulan ini. Jika minus (merah), berarti kas kost telah belanja melebihi rencana awal."
              label="Info sisa plafon"
            />
          </div>
          <div>
            <p className="text-xs text-slate-500">
              {monthlyBudget.isOverBudget ? "Melampaui Pagu (Over)" : "Sisa Kuota Belanja"}
            </p>
            <p
              className={`text-2xl sm:text-3xl font-bold tracking-tight tabular-nums mt-1 ${
                monthlyBudget.isOverBudget ? "text-rose-600" : "text-emerald-700"
              }`}
            >
              {monthlyBudget.isOverBudget
                ? `-${formatRupiah(monthlyBudget.overBudgetAmount)}`
                : formatRupiah(monthlyBudget.remainingAvailableAmount)}
            </p>
          </div>
          <p className="text-[11px] text-slate-500">
            Saldo riil DANA:{" "}
            <strong className="text-slate-800 tabular-nums">
              {formatRupiah(data.cashAccount.actualCashBalance)}
            </strong>
          </p>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. VISUAL ALLOCATION BREAKDOWN BAR                        */}
      {/* ========================================================= */}
      {distributionItems.length > 0 && (
        <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Distribusi Pagu per Kategori
              </h2>
              <InfoTooltip
                content="Proporsi alokasi pagu anggaran belanja yang disiapkan untuk tiap kebutuhan kost pada bulan ini."
                label="Info distribusi pagu"
              />
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              Total Alokasi: <strong className="text-slate-900">{formatRupiah(monthlyBudget.allocatedCategoriesTotal)}</strong>
            </span>
          </div>

          {/* Horizontal Stacked Visual Bar */}
          <div className="h-3 w-full rounded-full bg-slate-100 flex overflow-hidden gap-0.5">
            {distributionItems.map((item) => (
              <div
                key={item.categoryId}
                title={`${item.categoryName}: ${formatRupiah(item.effectiveBudgetAmount)} (${item.share}%)`}
                className={`h-full ${item.color.bar} transition-all duration-300 first:rounded-l-full last:rounded-r-full`}
                style={{ width: `${Math.max(item.share, 4)}%` }}
              />
            ))}
          </div>

          {/* Color Chips Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-xs">
            {distributionItems.map((item) => (
              <div key={item.categoryId} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${item.color.bar}`} />
                <span className="text-slate-700 font-medium">{item.categoryName}</span>
                <span className="text-slate-400 tabular-nums">{item.share}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ========================================================= */}
      {/* 4. CATEGORY VISUAL CARDS (SIMPLE & INTUITIVE)             */}
      {/* ========================================================= */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Pagu Belanja per Kategori
            </h2>
            <p className="text-xs text-slate-500">
              Pantau realisasi saat ini dan bandingkan dengan belanja riil bulan lalu.
            </p>
          </div>

          <Link
            href={`/pengeluaran?period=${encodeURIComponent(data.period)}`}
            className="text-xs font-semibold text-teal-800 hover:text-teal-900 hover:underline"
          >
            Lihat Rincian Pengeluaran &rarr;
          </Link>
        </div>

        {/* Grid of Category Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.flatCategories.map((cat) => {
            const catColor = getCategoryColor(cat.categoryName);
            const alertUI = getAlertPresentation(cat.alertLevel, cat.isOverBudget);
            const clampedPct = Math.min(100, Math.max(0, cat.usagePercentage));

            return (
              <div
                key={cat.categoryId}
                className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors"
              >
                {/* Header: Name + Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${catColor.dot}`} />
                      <h3 className="text-sm font-bold text-slate-900 truncate">
                        {cat.categoryName}
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Bulan lalu:{" "}
                      <strong className="text-slate-600 tabular-nums">
                        {formatRupiah(cat.previousRealizedAmount)}
                      </strong>
                    </p>
                  </div>

                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${alertUI.badgeClass}`}
                  >
                    {alertUI.label}
                  </span>
                </div>

                {/* Numbers: Pagu vs Terpakai */}
                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  <div className="flex items-baseline justify-between text-xs tabular-nums">
                    <span className="text-slate-500">Pagu Anggaran</span>
                    <strong className="text-slate-900">
                      {formatRupiah(cat.effectiveBudgetAmount)}
                    </strong>
                  </div>
                  <div className="flex items-baseline justify-between text-xs tabular-nums">
                    <span className="text-slate-500">Sudah Terpakai</span>
                    <strong className={cat.isOverBudget ? "text-rose-600" : "text-slate-800"}>
                      {formatRupiah(cat.inclusiveRealizedAmount)}
                    </strong>
                  </div>
                  <div className="flex items-baseline justify-between text-xs tabular-nums">
                    <span className="text-slate-500">
                      {cat.isOverBudget ? "Kelebihan" : "Sisa Pagu"}
                    </span>
                    <span className={cat.isOverBudget ? "text-rose-700 font-semibold" : "text-emerald-700 font-semibold"}>
                      {cat.isOverBudget
                        ? `+${formatRupiah(cat.overBudgetAmount)}`
                        : formatRupiah(cat.remainingAvailableAmount)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="pt-1">
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${alertUI.barClass}`}
                        style={{ width: `${clampedPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Card Action: Ubah Pagu Button */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(cat);
                      setEditAmount(cat.effectiveBudgetAmount.toString());
                    }}
                    className="text-xs font-semibold text-teal-800 hover:text-teal-900 px-2.5 py-1 rounded-md bg-teal-50 hover:bg-teal-100 transition-colors cursor-pointer"
                  >
                    Atur Pagu
                  </button>

                  {cat.previousRealizedAmount > 0 && cat.effectiveBudgetAmount !== cat.previousRealizedAmount && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(cat);
                        setEditAmount(cat.previousRealizedAmount.toString());
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-900 underline underline-offset-2 cursor-pointer"
                      title={`Samakan dengan belanja riil bulan lalu: ${formatRupiah(cat.previousRealizedAmount)}`}
                    >
                      Pakai bulan lalu
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================= */}
      {/* 5. MODAL / DIALOG ATUR PAGU KATEGORI                      */}
      {/* ========================================================= */}
      {editingCategory && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-category-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 id="modal-category-title" className="text-sm font-bold text-slate-900">
                  Atur Pagu: {editingCategory.categoryName}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Periode {data.periodLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {editingCategory.previousRealizedAmount > 0 && (
              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200/80 flex items-center justify-between text-xs">
                <span className="text-slate-600">Realisasi bulan lalu:</span>
                <button
                  type="button"
                  onClick={() => setEditAmount(editingCategory.previousRealizedAmount.toString())}
                  className="font-bold text-teal-800 hover:underline cursor-pointer tabular-nums"
                  title="Klik untuk memasukkan nominal ini"
                >
                  {formatRupiah(editingCategory.previousRealizedAmount)} ⤶
                </button>
              </div>
            )}

            <form
              action={async (formData) => {
                await categoryFormAction(formData);
                setEditingCategory(null);
              }}
              className="space-y-3"
            >
              <input type="hidden" name="period" value={data.period} />
              <input type="hidden" name="categoryId" value={editingCategory.categoryId} />

              <div>
                <label
                  htmlFor="modal-category-amount"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nominal Pagu (Rp)
                </label>
                <input
                  id="modal-category-amount"
                  type="number"
                  name="amount"
                  min={0}
                  step={1000}
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="Contoh: 100000"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="modal-category-note"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Catatan (Opsional)
                </label>
                <input
                  id="modal-category-note"
                  type="text"
                  name="note"
                  maxLength={120}
                  placeholder="Contoh: Kenaikan tarif listrik / ekstra galon"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
                >
                  {isSavingCategory ? "Menyimpan..." : "Simpan Pagu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. SET TOTAL MONTHLY BUDGET (CLEAN & ACCESSIBLE)           */}
      {/* ========================================================= */}
      <section className="rounded-xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold text-slate-900">
                Plafon Total Anggaran Bulanan
              </h2>
              <InfoTooltip
                content="Batas maksimal total belanja kas kost dalam sebulan. Jika pengeluaran operasional melebihi nominal ini, sistem akan memberikan notifikasi over-budget."
                label="Info plafon bulanan"
              />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Target total belanja kost periode {data.periodLabel}.
            </p>
          </div>

          <span className="text-xs font-bold text-slate-800 tabular-nums">
            Saat ini: {formatRupiah(monthlyBudget.effectiveTotalBudget)}
          </span>
        </div>

        <form action={monthlyFormAction} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <input type="hidden" name="period" value={data.period} />

          <div className="sm:col-span-5">
            <label
              htmlFor="monthly-total-amount"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Total Anggaran (Rp)
            </label>
            <input
              id="monthly-total-amount"
              type="number"
              name="totalAmount"
              min={0}
              step={1000}
              required
              defaultValue={monthlyBudget.effectiveTotalBudget || 450000}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-5">
            <label
              htmlFor="monthly-budget-note"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Catatan (Opsional)
            </label>
            <input
              id="monthly-budget-note"
              type="text"
              name="note"
              maxLength={140}
              defaultValue={monthlyBudget.note ?? ""}
              placeholder="Contoh: Target belanja normal bulanan"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={isSavingMonthly}
              className="w-full rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {isSavingMonthly ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
