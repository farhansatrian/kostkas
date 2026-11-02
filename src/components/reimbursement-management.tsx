"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createReimbursementClaimAction,
  type ExpenseActionState,
  settleReimbursementPayoutAction,
} from "@/app/actions/expense-actions";
import type {
  ReimbursementClaimRow,
  ReimbursementsPageData,
  UnclaimedAdvanceExpenseItem,
} from "@/lib/expense-reimbursement-service";
import { formatRupiah, formatShortDateId } from "@/lib/navigation";

const initialState: ExpenseActionState = { status: "idle" };

function PayoutFormCard({ claim }: { claim: ReimbursementClaimRow }) {
  const [amountInput, setAmountInput] = useState<string>(
    String(claim.remainingAmount)
  );
  const [payoutKey, setPayoutKey] = useState(
    () => `REIMB-PAY:${claim.id}:${Date.now()}`
  );
  const [state, formAction, isPending] = useActionState(
    async (prev: ExpenseActionState | undefined, formData: FormData) => {
      const res = await settleReimbursementPayoutAction(prev, formData);
      if (res.status === "success") {
        setPayoutKey(`REIMB-PAY:${claim.id}:${Date.now()}`);
      }
      return res;
    },
    initialState
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  if (claim.remainingAmount <= 0 || claim.status === "CANCELLED") {
    return null;
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-200/70">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="reimbursementId" value={claim.id} />
        <input type="hidden" name="idempotencyKey" value={payoutKey} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-800">
            Cairkan Penggantian Dana dari Kas DANA
          </p>
          <div className="flex items-center gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => setAmountInput(String(claim.remainingAmount))}
              className="text-teal-800 font-medium underline underline-offset-2 cursor-pointer"
            >
              Isi Lunasi Penuh ({formatRupiah(claim.remainingAmount)})
            </button>
            {claim.remainingAmount >= 2 && (
              <button
                type="button"
                onClick={() =>
                  setAmountInput(String(Math.floor(claim.remainingAmount / 2)))
                }
                className="text-slate-600 font-medium underline underline-offset-2 cursor-pointer"
              >
                Isi 50% ({formatRupiah(Math.floor(claim.remainingAmount / 2))})
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor={`payout-amount-${claim.id}`}
              className="block text-[11px] font-medium text-slate-600 mb-1"
            >
              Nominal Pencairan (Rp)
            </label>
            <input
              id={`payout-amount-${claim.id}`}
              type="number"
              name="amount"
              min={1}
              max={claim.remainingAmount}
              step={1}
              required
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor={`payout-date-${claim.id}`}
              className="block text-[11px] font-medium text-slate-600 mb-1"
            >
              Tanggal Pencairan
            </label>
            <input
              id={`payout-date-${claim.id}`}
              type="date"
              name="paidAt"
              defaultValue={todayIso}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor={`payout-note-${claim.id}`}
              className="block text-[11px] font-medium text-slate-600 mb-1"
            >
              Catatan Pencairan (Opsional)
            </label>
            <input
              id={`payout-note-${claim.id}`}
              type="text"
              name="note"
              maxLength={180}
              placeholder={`Transfer DANA ke ${claim.beneficiaryMember.name}`}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            Mengurangi saldo kas DANA & sisa utang tanpa menambah biaya operasional kedua.
          </p>
          <button
            type="submit"
            disabled={isPending}
            className="shrink-0 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
          >
            {isPending ? "Memproses..." : "Konfirmasi Pencairan"}
          </button>
        </div>

        {state.status !== "idle" && state.message && (
          <div
            role="status"
            className={`rounded-lg border px-3 py-2 text-xs ${
              state.status === "error"
                ? "border-rose-200 bg-rose-50/70 text-rose-800"
                : "border-teal-200 bg-teal-50/60 text-teal-900"
            }`}
          >
            {state.message}
          </div>
        )}
      </form>
    </div>
  );
}

function UnclaimedAdvanceRow({ item }: { item: UnclaimedAdvanceExpenseItem }) {
  const [state, formAction, isPending] = useActionState(
    createReimbursementClaimAction,
    initialState
  );

  return (
    <li className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-slate-900">{item.title}</p>
        <p className="text-xs text-slate-500 tabular-nums">
          {formatShortDateId(item.expenseDate)} · {item.categoryLabel} · Ditalangi oleh{" "}
          <span className="font-medium text-slate-800">
            {item.advancedByMemberName}
          </span>{" "}
          (dicatat oleh {item.recordedByName})
        </p>
        {state.status !== "idle" && state.message && (
          <p
            className={`text-xs ${
              state.status === "error" ? "text-rose-700" : "text-teal-800"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-semibold text-slate-900 tabular-nums">
          {formatRupiah(item.amount)}
        </span>
        <form action={formAction}>
          <input type="hidden" name="expenseId" value={item.id} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
          >
            {isPending ? "Memproses..." : "Terbitkan Klaim Reimburse"}
          </button>
        </form>
      </div>
    </li>
  );
}

export function ReimbursementManagement({
  data,
}: {
  data: ReimbursementsPageData;
}) {
  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Executive Ledger Summary */}
      <section
        aria-labelledby="reimbursement-summary-heading"
        className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
      >
        <h2 id="reimbursement-summary-heading" className="sr-only">
          Ringkasan Kewajiban Reimbursement dan Saldo Kas DANA
        </h2>

        <div className="p-5 sm:p-7 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Total kewajiban reimbursement terutang
            </p>
            <p className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatRupiah(data.summary.totalOutstandingObligation)}
            </p>
          </div>

          <div className="text-xs text-slate-500 sm:text-right tabular-nums space-y-0.5">
            <p>
              Saldo kas {data.cashAccount.provider} tersedia ({data.cashAccount.custodianName}):{" "}
              <span className="font-semibold text-slate-900">
                {formatRupiah(data.cashAccount.actualBalance)}
              </span>
            </p>
            <p>
              Total biaya operasional terkonfirmasi:{" "}
              <span className="font-medium text-slate-700">
                {formatRupiah(data.summary.totalConfirmedOperatingExpense)}
              </span>
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200/80">
          <div className="p-5 sm:p-6">
            <dt className="text-xs font-medium text-slate-500">
              Total talangan anggota tercatat
            </dt>
            <dd className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatRupiah(data.summary.totalAdvanceAmount)}
            </dd>
            <p className="mt-2 text-xs text-slate-500 tabular-nums">
              {data.summary.outstandingClaimsCount} klaim aktif menunggu pelunasan.
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <dt className="text-xs font-medium text-slate-500">
              Total sudah diganti dari kas DANA
            </dt>
            <dd className="mt-1.5 text-xl font-semibold tracking-tight text-emerald-700 tabular-nums">
              {formatRupiah(data.summary.totalSettledAmount)}
            </dd>
            <p className="mt-2 text-xs text-slate-500 tabular-nums">
              {data.summary.settledClaimsCount} klaim telah lunas dicairkan.
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <dt className="text-xs font-medium text-slate-500">
              Prinsip akuntansi buku besar
            </dt>
            <dd className="mt-1.5 text-sm font-semibold text-slate-900">
              Bebas Hitung Ganda
            </dd>
            <p className="mt-2 text-xs text-slate-500">
              Pelunasan reimburse mengurangi kas DANA & kewajiban utang tanpa menambah biaya operasional kedua.
            </p>
          </div>
        </dl>
      </section>

      {/* Unclaimed Member Advance Expenses (if any) */}
      {data.unclaimedAdvanceExpenses.length > 0 && (
        <section
          aria-labelledby="unclaimed-advance-heading"
          className="rounded-xl bg-white border border-amber-200/90 overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-amber-200/80 bg-amber-50/40 flex items-baseline justify-between">
            <div>
              <h2
                id="unclaimed-advance-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Talangan Anggota Menunggu Penerbitan Klaim
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Hubungkan pengeluaran talangan berikut menjadi klaim reimbursement aktif tanpa duplikasi.
              </p>
            </div>
            <span className="text-xs font-medium text-amber-800 tabular-nums">
              {data.unclaimedAdvanceExpenses.length} transaksi
            </span>
          </div>

          <ul className="divide-y divide-slate-200/70">
            {data.unclaimedAdvanceExpenses.map((item) => (
              <UnclaimedAdvanceRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}

      {/* Filter Bar */}
      <section
        aria-labelledby="reimbursement-filter-heading"
        className="rounded-xl bg-white border border-slate-200/80 p-4 sm:p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <h2
            id="reimbursement-filter-heading"
            className="text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Filter Klaim Reimbursement
          </h2>
          <Link
            href="/reimbursement"
            className="text-xs font-medium text-teal-800 hover:underline"
          >
            Reset filter
          </Link>
        </div>

        <form
          method="GET"
          action="/reimbursement"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <div>
            <label
              htmlFor="reimb-filter-status"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Status Klaim
            </label>
            <select
              id="reimb-filter-status"
              name="status"
              defaultValue={data.filters.status}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
            >
              <option value="ALL">Semua Status Klaim</option>
              <option value="OUTSTANDING">
                Belum Dicairkan (OUTSTANDING)
              </option>
              <option value="PARTIALLY_SETTLED">
                Dicairkan Sebagian (PARTIALLY_SETTLED)
              </option>
              <option value="SETTLED">Sudah Lunas (SETTLED)</option>
              <option value="CANCELLED">Dibatalkan (CANCELLED)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="reimb-filter-member"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Anggota Penalang
            </label>
            <select
              id="reimb-filter-member"
              name="memberId"
              defaultValue={data.filters.memberId}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
            >
              <option value="ALL">Semua Anggota</option>
              {data.activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
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

      {/* Reimbursement Claims List */}
      <section
        aria-labelledby="reimbursement-claims-heading"
        className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200/80 flex items-baseline justify-between">
          <h2
            id="reimbursement-claims-heading"
            className="text-sm font-semibold text-slate-900"
          >
            Daftar Klaim & Riwayat Pencairan Reimbursement
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">
            {data.reimbursements.length} klaim
          </span>
        </div>

        {data.reimbursements.length === 0 ? (
          <div className="p-6 text-xs text-slate-500">
            Belum ada klaim reimbursement yang tercatat untuk filter ini. Catat pengeluaran dengan metode{" "}
            <Link
              href="/pengeluaran"
              className="font-medium text-teal-800 underline underline-offset-2"
            >
              Talangan Anggota di halaman Pengeluaran
            </Link>
            .
          </div>
        ) : (
          <ul className="divide-y divide-slate-200/80">
            {data.reimbursements.map((claim) => {
              const isSettled = claim.status === "SETTLED";
              const isPartial = claim.status === "PARTIALLY_SETTLED";
              const isCancelled = claim.status === "CANCELLED";

              return (
                <li
                  key={claim.id}
                  className={`p-5 sm:p-6 ${
                    isCancelled ? "bg-slate-50/60 opacity-75" : ""
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {claim.expenseTitle}
                        </p>
                        <span className="text-xs text-slate-500">
                          · {claim.expenseCategoryLabel}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 tabular-nums">
                        Tanggal belanja {formatShortDateId(claim.expenseDate)} · Ditalangi oleh{" "}
                        <span className="font-semibold text-slate-900">
                          {claim.beneficiaryMember.name}
                        </span>{" "}
                        · Dicatat oleh {claim.recordedByName}
                      </p>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <div className="inline-flex items-center gap-1.5 text-xs">
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${
                            isSettled
                              ? "bg-teal-700"
                              : isPartial
                                ? "bg-amber-600"
                                : isCancelled
                                  ? "bg-rose-600"
                                  : "bg-slate-500"
                          }`}
                        />
                        <span
                          className={
                            isSettled
                              ? "text-teal-800 font-semibold"
                              : isPartial
                                ? "text-amber-800 font-semibold"
                                : isCancelled
                                  ? "text-rose-700 font-semibold"
                                  : "text-slate-700 font-semibold"
                          }
                        >
                          {isSettled
                            ? "Lunas Diganti (SETTLED)"
                            : isPartial
                              ? "Cicilan Reimburse (PARTIALLY_SETTLED)"
                              : isCancelled
                                ? "Dibatalkan (CANCELLED)"
                                : "Menunggu Pencairan (OUTSTANDING)"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Breakdown Metrics per Claim */}
                  <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg bg-slate-50/80 border border-slate-200/70 p-3.5 text-xs tabular-nums">
                    <div>
                      <dt className="text-slate-500">Total Talangan</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {formatRupiah(claim.totalAmount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Sudah Diganti</dt>
                      <dd className="mt-0.5 font-semibold text-emerald-700">
                        {formatRupiah(claim.settledAmount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Sisa Kewajiban Kas</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {formatRupiah(claim.remainingAmount)}
                      </dd>
                    </div>
                  </dl>

                  {/* Payout History */}
                  {claim.payouts.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-slate-700">
                        Riwayat Pencairan Dana ({claim.payouts.length} kali):
                      </p>
                      <ul className="divide-y divide-slate-200/60 rounded-lg border border-slate-200/70 bg-white px-3.5">
                        {claim.payouts.map((p) => (
                          <li
                            key={p.id}
                            className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs tabular-nums"
                          >
                            <div className="text-slate-600">
                              <span className="font-medium text-slate-900">
                                {formatShortDateId(p.paidAt)}
                              </span>{" "}
                              · Dicairkan dari {p.cashAccountName} · Dikonfirmasi oleh{" "}
                              <span className="font-medium text-slate-800">
                                {p.disbursedByName}
                              </span>
                              {p.note ? ` — "${p.note}"` : ""}
                            </div>
                            <span className="font-semibold text-slate-900 shrink-0">
                              {formatRupiah(p.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Settlement Action Form */}
                  <PayoutFormCard claim={claim} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

