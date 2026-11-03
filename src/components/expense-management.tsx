"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  confirmPendingExpenseAction,
  createExpenseAction,
  createExpenseCategoryAction,
  deleteUnusedExpenseCategoryAction,
  type ExpenseActionState,
  recordLedgerAdjustmentAction,
  reverseOrVoidExpenseAction,
  toggleExpenseCategoryStatusAction,
} from "@/app/actions/expense-actions";
import type {
  ExpenseLedgerRow,
  ExpensesPageData,
} from "@/lib/expense-reimbursement-service";
import { formatRupiah, formatShortDateId } from "@/lib/navigation";
import { getJakartaTodayIso } from "@/lib/date-utils";

const initialState: ExpenseActionState = { status: "idle" };

function FeedbackBanner({ state }: { state: ExpenseActionState }) {
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

function ExpenseRowActions({ expense }: { expense: ExpenseLedgerRow }) {
  const [confirmState, confirmAction, isConfirming] = useActionState(
    confirmPendingExpenseAction,
    initialState
  );
  const [voidState, voidAction, isVoiding] = useActionState(
    reverseOrVoidExpenseAction,
    initialState
  );
  const [showVoidForm, setShowVoidForm] = useState(false);

  const canVoid =
    expense.status !== "REJECTED" &&
    (!expense.reimbursement || expense.reimbursement.settledAmount === 0);

  return (
    <div className="space-y-1.5 text-right">
      <div className="inline-flex flex-wrap items-center justify-end gap-2">
        {expense.status === "PENDING" && (
          <form action={confirmAction}>
            <input type="hidden" name="expenseId" value={expense.id} />
            <button
              type="submit"
              disabled={isConfirming}
              className="rounded-md bg-teal-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {isConfirming ? "Memproses..." : "Konfirmasi"}
            </button>
          </form>
        )}

        {canVoid && (
          <button
            type="button"
            onClick={() => setShowVoidForm((prev) => !prev)}
            className="rounded-md border border-slate-200/90 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
          >
            {showVoidForm ? "Tutup" : "Koreksi / Batal"}
          </button>
        )}
      </div>

      {showVoidForm && canVoid && (
        <form
          action={voidAction}
          className="mt-2 rounded-lg border border-slate-200/90 bg-slate-50/80 p-2.5 text-left space-y-2 max-w-xs ml-auto"
        >
          <input type="hidden" name="expenseId" value={expense.id} />
          <label className="block text-[11px] font-medium text-slate-700">
            Alasan pembatalan / koreksi (auditable)
          </label>
          <input
            type="text"
            name="reason"
            required
            minLength={3}
            maxLength={160}
            placeholder="Contoh: Salah nominal / duplikat input"
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              disabled={isVoiding}
              className="rounded-md bg-rose-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {isVoiding ? "Membatalkan..." : "Simpan Pembatalan"}
            </button>
          </div>
        </form>
      )}

      {confirmState.status !== "idle" && confirmState.message && (
        <p
          className={`text-[11px] ${
            confirmState.status === "error" ? "text-rose-700" : "text-teal-800"
          }`}
        >
          {confirmState.message}
        </p>
      )}
      {voidState.status !== "idle" && voidState.message && (
        <p
          className={`text-[11px] ${
            voidState.status === "error" ? "text-rose-700" : "text-teal-800"
          }`}
        >
          {voidState.message}
        </p>
      )}
    </div>
  );
}

export function ExpenseManagement({
  data,
  actorMemberId,
}: {
  data: ExpensesPageData;
  actorMemberId: string;
}) {
  const [fundingSource, setFundingSource] = useState<
    "DIRECT_CASH" | "MEMBER_ADVANCE"
  >("DIRECT_CASH");
  const [expenseKey, setExpenseKey] = useState(
    () => `EXP:${actorMemberId}:${Date.now()}`
  );
  const [adjKey, setAdjKey] = useState(
    () => `ADJ:${actorMemberId}:${Date.now()}`
  );

  const [createExpenseState, createExpenseFormAction, isCreatingExpense] =
    useActionState(
      async (prev: ExpenseActionState | undefined, formData: FormData) => {
        const res = await createExpenseAction(prev, formData);
        if (res.status === "success") {
          setExpenseKey(`EXP:${actorMemberId}:${Date.now()}`);
        }
        return res;
      },
      initialState
    );

  const [createCategoryState, createCategoryFormAction, isCreatingCategory] =
    useActionState(createExpenseCategoryAction, initialState);

  const [toggleCategoryState, toggleCategoryFormAction, isTogglingCategory] =
    useActionState(toggleExpenseCategoryStatusAction, initialState);

  const [deleteCategoryState, deleteCategoryFormAction, isDeletingCategory] =
    useActionState(deleteUnusedExpenseCategoryAction, initialState);

  const [adjState, adjFormAction, isRecordingAdj] = useActionState(
    async (prev: ExpenseActionState | undefined, formData: FormData) => {
      const res = await recordLedgerAdjustmentAction(prev, formData);
      if (res.status === "success") {
        setAdjKey(`ADJ:${actorMemberId}:${Date.now()}`);
      }
      return res;
    },
    initialState
  );

  const todayIso = getJakartaTodayIso();
  const selectableCategories = data.categories.flatCategories.filter(
    (c) => c.isActive
  );

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Executive Ledger Summary */}
      <section
        aria-labelledby="expense-summary-heading"
        className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
      >
        <h2 id="expense-summary-heading" className="sr-only">
          Ringkasan Saldo Kas dan Pengeluaran Operasional
        </h2>

        <div className="p-5 sm:p-7 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Saldo kas aktual {data.cashAccount.provider} (
              {data.cashAccount.custodianName})
            </p>
            <p className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatRupiah(data.cashAccount.actualBalance)}
            </p>
          </div>

          <div className="text-xs text-slate-500 sm:text-right tabular-nums space-y-0.5">
            <p>
              Total biaya operasional terkonfirmasi:{" "}
              <span className="font-semibold text-slate-900">
                {formatRupiah(data.summary.totalConfirmedOperatingExpense)}
              </span>
            </p>
            <p>
              Kewajiban reimbursement terutang:{" "}
              <Link
                href="/reimbursement"
                className="font-medium text-teal-800 underline underline-offset-2"
              >
                {formatRupiah(data.summary.outstandingReimbursementTotal)}
              </Link>
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200/80">
          <div className="p-5 sm:p-6">
            <dt className="text-xs font-medium text-slate-500">
              Dibayar langsung dari kas DANA
            </dt>
            <dd className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatRupiah(data.summary.confirmedDirectCashExpenseTotal)}
            </dd>
            <p className="mt-2 text-xs text-slate-500">
              Langsung mengurangi saldo kas aktual setelah berstatus CONFIRMED.
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <dt className="text-xs font-medium text-slate-500">
              Ditalangi anggota (Member Advance)
            </dt>
            <dd className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatRupiah(data.summary.confirmedMemberAdvanceExpenseTotal)}
            </dd>
            <p className="mt-2 text-xs text-slate-500">
              Mencatat biaya operasional & utang reimburse tanpa memotong DANA langsung.
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <dt className="text-xs font-medium text-slate-500">
              Pengeluaran menunggu konfirmasi (PENDING)
            </dt>
            <dd className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatRupiah(data.summary.pendingExpenseTotal)}
            </dd>
            <p className="mt-2 text-xs text-slate-500 tabular-nums">
              {data.summary.pendingExpenseCount} transaksi belum mengurangi saldo kas.
            </p>
          </div>
        </dl>
      </section>

      {/* Main Grid: Expense Ledger + Recording Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* Left 7 Cols: Filter & Expense Table */}
        <div className="lg:col-span-7 space-y-6">
          <section
            aria-labelledby="expense-filter-heading"
            className="rounded-xl bg-white border border-slate-200/80 p-4 sm:p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h2
                id="expense-filter-heading"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Filter Buku Pengeluaran
              </h2>
              <Link
                href="/pengeluaran"
                className="text-xs font-medium text-teal-800 hover:underline"
              >
                Reset filter
              </Link>
            </div>

            <form
              method="GET"
              action="/pengeluaran"
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"
            >
              <div>
                <label
                  htmlFor="filter-period"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Periode
                </label>
                <select
                  id="filter-period"
                  name="period"
                  defaultValue={data.filters.period}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  {data.availablePeriods.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="filter-category"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Kategori
                </label>
                <select
                  id="filter-category"
                  name="categoryId"
                  defaultValue={data.filters.categoryId}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  <option value="ALL">Semua Kategori</option>
                  {data.categories.flatCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.displayLabel}
                      {!cat.isActive ? " (Nonaktif)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="filter-member"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Anggota
                </label>
                <select
                  id="filter-member"
                  name="memberId"
                  defaultValue={data.filters.memberId}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  <option value="ALL">Semua Anggota</option>
                  {data.activeMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="filter-source"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Sumber Dana
                </label>
                <select
                  id="filter-source"
                  name="fundingSource"
                  defaultValue={data.filters.fundingSource}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  <option value="ALL">Semua Sumber</option>
                  <option value="DIRECT_CASH">Kas Langsung (DANA)</option>
                  <option value="MEMBER_ADVANCE">Talangan Anggota</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="filter-status"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Status
                </label>
                <select
                  id="filter-status"
                  name="status"
                  defaultValue={data.filters.status}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="CONFIRMED">Terkonfirmasi (CONFIRMED)</option>
                  <option value="PENDING">Menunggu (PENDING)</option>
                  <option value="REJECTED">Dibatalkan / Koreksi</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Terapkan Filter
                </button>
              </div>
            </form>
          </section>

          {/* Expense Ledger List */}
          <section
            aria-labelledby="expense-ledger-heading"
            className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200/80 flex items-baseline justify-between">
              <h2
                id="expense-ledger-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Daftar Transaksi Pengeluaran
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {data.expenses.length} transaksi
              </span>
            </div>

            {data.expenses.length === 0 ? (
              <div className="p-6 text-xs text-slate-500">
                Belum ada transaksi pengeluaran yang sesuai dengan filter saat ini.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200/70">
                {data.expenses.map((exp) => {
                  const isConfirmed = exp.status === "CONFIRMED";
                  const isPending = exp.status === "PENDING";
                  const isRejected = exp.status === "REJECTED";

                  return (
                    <li
                      key={exp.id}
                      className={`p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 ${
                        isRejected ? "bg-slate-50/60 opacity-75" : ""
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p
                            className={`text-sm font-medium ${
                              isRejected
                                ? "line-through text-slate-500"
                                : "text-slate-900"
                            }`}
                          >
                            {exp.title}
                          </p>
                          <span className="text-xs text-slate-500">
                            · {exp.category.displayLabel}
                            {!exp.category.isActive ? " (kategori nonaktif)" : ""}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 tabular-nums">
                          {formatShortDateId(exp.expenseDate)} · Sumber:{" "}
                          <span className="font-medium text-slate-800">
                            {exp.paidOrAdvancedByLabel}
                          </span>{" "}
                          · Dicatat oleh{" "}
                          <span className="font-medium text-slate-800">
                            {exp.recordedByName}
                          </span>
                        </p>

                        {exp.note && (
                          <p className="text-xs text-slate-500">{exp.note}</p>
                        )}

                        {exp.fundingSource === "MEMBER_ADVANCE" &&
                          exp.reimbursement && (
                            <p className="text-xs text-teal-800 tabular-nums">
                              Klaim Reimburse:{" "}
                              <Link
                                href="/reimbursement"
                                className="font-medium underline underline-offset-2"
                              >
                                {exp.reimbursement.status === "SETTLED"
                                  ? "Sudah Lunas Dicairkan"
                                  : exp.reimbursement.status ===
                                      "PARTIALLY_SETTLED"
                                    ? `Cicilan Reimburse (Sisa ${formatRupiah(exp.reimbursement.remainingAmount)})`
                                    : exp.reimbursement.status === "CANCELLED"
                                      ? "Dibatalkan"
                                      : `Menunggu Pencairan (${formatRupiah(exp.reimbursement.remainingAmount)})`}
                              </Link>
                            </p>
                          )}
                      </div>

                      <div className="sm:text-right shrink-0 space-y-2">
                        <div>
                          <p
                            className={`text-sm font-semibold tabular-nums ${
                              isRejected
                                ? "line-through text-slate-400"
                                : "text-slate-900"
                            }`}
                          >
                            {formatRupiah(exp.amount)}
                          </p>
                          <div className="mt-0.5 inline-flex items-center sm:justify-end gap-1.5 text-xs">
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 rounded-full ${
                                isConfirmed
                                  ? "bg-teal-700"
                                  : isPending
                                    ? "bg-amber-600"
                                    : "bg-rose-600"
                              }`}
                            />
                            <span
                              className={
                                isConfirmed
                                  ? "text-teal-800 font-medium"
                                  : isPending
                                    ? "text-amber-800 font-medium"
                                    : "text-rose-700 font-medium"
                              }
                            >
                              {isConfirmed
                                ? "Terkonfirmasi"
                                : isPending
                                  ? "Menunggu Konfirmasi"
                                  : "Dibatalkan"}
                            </span>
                          </div>
                        </div>

                        <ExpenseRowActions expense={exp} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Right 5 Cols: Add Expense Form + Category Management + Ledger Adjustment */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Form Catat Pengeluaran (dibuat sesingkat mungkin untuk input harian) */}
          <section
            aria-labelledby="add-expense-heading"
            className="rounded-xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-4"
          >
            <div>
              <h2
                id="add-expense-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Catat Pengeluaran
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Isi nominal, pilih kategori, tulis keterangan singkat. Selesai.
              </p>
            </div>

            <FeedbackBanner state={createExpenseState} />

            <form action={createExpenseFormAction} className="space-y-4">
              <input type="hidden" name="idempotencyKey" value={expenseKey} />

              <div>
                <label
                  htmlFor="expense-amount"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Nominal (Rp)
                </label>
                <input
                  id="expense-amount"
                  type="number"
                  inputMode="numeric"
                  name="amount"
                  min={1}
                  step={1}
                  required
                  placeholder="25000"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base font-semibold text-slate-900 tabular-nums placeholder:font-normal placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <fieldset>
                <legend className="block text-xs font-medium text-slate-700 mb-1.5">
                  Kategori
                </legend>
                {selectableCategories.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Belum ada kategori aktif. Tambahkan di bagian Kategori di
                    bawah.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectableCategories.map((cat, index) => (
                      <label key={cat.id} className="cursor-pointer">
                        <input
                          type="radio"
                          name="categoryId"
                          value={cat.id}
                          required={index === 0}
                          className="peer sr-only"
                        />
                        <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 peer-checked:border-teal-700 peer-checked:bg-teal-700 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-700">
                          {cat.displayLabel}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              <div>
                <label
                  htmlFor="expense-title"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Keterangan
                </label>
                <input
                  id="expense-title"
                  type="text"
                  name="title"
                  required
                  minLength={3}
                  maxLength={120}
                  placeholder="Contoh: Galon 2x"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <fieldset>
                <legend className="block text-xs font-medium text-slate-700 mb-1.5">
                  Dibayar pakai
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        value: "DIRECT_CASH",
                        label: `Kas ${data.cashAccount.provider}`,
                      },
                      { value: "MEMBER_ADVANCE", label: "Uang pribadi dulu" },
                    ] as const
                  ).map((opt) => (
                    <label key={opt.value} className="cursor-pointer">
                      <input
                        type="radio"
                        name="fundingSource"
                        value={opt.value}
                        checked={fundingSource === opt.value}
                        onChange={() => setFundingSource(opt.value)}
                        className="peer sr-only"
                      />
                      <span className="flex justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 peer-checked:border-teal-700 peer-checked:bg-teal-50 peer-checked:text-teal-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-700">
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
                {fundingSource === "MEMBER_ADVANCE" && (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Otomatis masuk daftar Reimbursement untuk diganti dari kas.
                  </p>
                )}
              </fieldset>

              {fundingSource === "MEMBER_ADVANCE" && (
                <div>
                  <label
                    htmlFor="expense-advanced-by"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Siapa yang menalangi?
                  </label>
                  <select
                    id="expense-advanced-by"
                    name="advancedByMemberId"
                    defaultValue={actorMemberId}
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  >
                    {data.activeMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <details className="group rounded-lg border border-slate-200/80 bg-slate-50/50">
                <summary className="cursor-pointer select-none list-none px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center justify-between">
                  <span>Opsi lainnya (tanggal, catatan)</span>
                  <span
                    aria-hidden="true"
                    className="text-slate-400 transition-transform group-open:rotate-180"
                  >
                    ▾
                  </span>
                </summary>
                <div className="px-3 pb-3 pt-1 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="expense-date"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Tanggal
                      </label>
                      <input
                        id="expense-date"
                        type="date"
                        name="expenseDate"
                        defaultValue={todayIso}
                        max={todayIso}
                        required
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="expense-note"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Catatan (Opsional)
                      </label>
                      <input
                        id="expense-note"
                        type="text"
                        name="note"
                        maxLength={200}
                        placeholder="Opsional"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                      />
                    </div>
                  </div>
                  <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      name="confirmStatus"
                      value="PENDING"
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-teal-700"
                    />
                    <span>
                      Simpan dulu sebagai menunggu konfirmasi
                      <span className="block text-[11px] text-slate-500">
                        Belum mengurangi saldo sampai dikonfirmasi.
                      </span>
                    </span>
                  </label>
                </div>
              </details>

              <button
                type="submit"
                disabled={isCreatingExpense}
                className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                {isCreatingExpense ? "Menyimpan..." : "Simpan Pengeluaran"}
              </button>
            </form>
          </section>

          {/* 2. Kelola Kategori (jarang dipakai, disembunyikan secara default) */}
          <details
            aria-labelledby="manage-categories-heading"
            className="group rounded-xl bg-white border border-slate-200/80"
          >
            <summary className="cursor-pointer select-none list-none p-5 sm:p-6 flex items-center justify-between gap-3">
              <div>
                <h2
                  id="manage-categories-heading"
                  className="text-sm font-semibold text-slate-900"
                >
                  Kategori
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  {selectableCategories.length} kategori aktif · tambah atau
                  nonaktifkan bila perlu
                </p>
              </div>
              <span
                aria-hidden="true"
                className="text-slate-400 transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>

            <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">
              <FeedbackBanner state={createCategoryState} />
              <FeedbackBanner state={toggleCategoryState} />
              <FeedbackBanner state={deleteCategoryState} />

              <form
                action={createCategoryFormAction}
                className="flex items-end gap-2"
              >
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor="new-category-name"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Kategori baru
                  </label>
                  <input
                    id="new-category-name"
                    type="text"
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="Contoh: Iuran Sampah"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isCreatingCategory}
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {isCreatingCategory ? "Menambah..." : "Tambah"}
                </button>
              </form>

              <div className="pt-2 border-t border-slate-200/70 divide-y divide-slate-200/60">
                {data.categories.flatCategories.map((cat) => {
                  const canDelete =
                    cat.expenseCount === 0 && cat.childrenCount === 0;
                  return (
                    <div
                      key={cat.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p
                          className={`font-medium truncate ${
                            cat.isActive ? "text-slate-800" : "text-slate-400"
                          }`}
                        >
                          {cat.displayLabel}
                        </p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {cat.expenseCount} transaksi
                          {cat.isActive ? "" : " · Nonaktif"}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <form action={toggleCategoryFormAction}>
                          <input
                            type="hidden"
                            name="categoryId"
                            value={cat.id}
                          />
                          <input
                            type="hidden"
                            name="isActive"
                            value={cat.isActive ? "false" : "true"}
                          />
                          <button
                            type="submit"
                            disabled={isTogglingCategory}
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            {cat.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </form>

                        {canDelete && (
                          <form action={deleteCategoryFormAction}>
                            <input
                              type="hidden"
                              name="categoryId"
                              value={cat.id}
                            />
                            <button
                              type="submit"
                              disabled={isDeletingCategory}
                              className="rounded border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                            >
                              Hapus
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>

          {/* 3. Saldo Awal & Penyesuaian (jarang dipakai, disembunyikan secara default) */}
          <details
            aria-labelledby="ledger-adjustment-heading"
            className="group rounded-xl bg-white border border-slate-200/80"
          >
            <summary className="cursor-pointer select-none list-none p-5 sm:p-6 flex items-center justify-between gap-3">
              <div>
                <h2
                  id="ledger-adjustment-heading"
                  className="text-sm font-semibold text-slate-900"
                >
                  Saldo Awal & Penyesuaian Kas
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dipakai sekali saat mulai, atau saat saldo perlu dikoreksi.
                </p>
              </div>
              <span
                aria-hidden="true"
                className="text-slate-400 transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>

            <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">
              <FeedbackBanner state={adjState} />

              <form action={adjFormAction} className="space-y-3">
                <input type="hidden" name="idempotencyKey" value={adjKey} />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="adj-category"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Jenis
                    </label>
                    <select
                      id="adj-category"
                      name="category"
                      defaultValue="OPENING_BALANCE"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    >
                      <option value="OPENING_BALANCE">Saldo awal</option>
                      <option value="ADJUSTMENT">Penyesuaian kas</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="adj-direction"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Arah
                    </label>
                    <select
                      id="adj-direction"
                      name="direction"
                      defaultValue="IN"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    >
                      <option value="IN">Kas masuk (+)</option>
                      <option value="OUT">Kas keluar (−)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="adj-amount"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Nominal (Rp)
                    </label>
                    <input
                      id="adj-amount"
                      type="number"
                      inputMode="numeric"
                      name="amount"
                      min={1}
                      step={1}
                      required
                      placeholder="120000"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="adj-desc"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Keterangan
                    </label>
                    <input
                      id="adj-desc"
                      type="text"
                      name="description"
                      required
                      minLength={3}
                      maxLength={160}
                      placeholder="Saldo awal kas DANA"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isRecordingAdj}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {isRecordingAdj ? "Menyimpan..." : "Simpan"}
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

