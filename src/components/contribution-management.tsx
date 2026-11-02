"use client";

import { useActionState, useState } from "react";
import {
  type ContributionActionState,
  confirmPendingPaymentAction,
  createAdditionalChargesAction,
  generateRegularChargesAction,
  recordPaymentAction,
  upsertPolicyAction,
} from "@/app/actions/contribution-actions";
import { formatRupiah, formatShortDateId } from "@/lib/navigation";

const initialState: ContributionActionState = { status: "idle" };

function createRequestKey(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export interface OpenChargeOption {
  id: string;
  memberId: string;
  memberName: string;
  title: string;
  kind: "REGULAR" | "ADDITIONAL";
  amount: number;
  allocatedAmount: number;
  remainingAmount: number;
}

export interface PendingPaymentItem {
  id: string;
  memberId: string;
  memberName: string;
  amount: number;
  paidAt: Date;
  cleanNote: string;
  linkedChargeId: string | null;
}

export function GenerateRegularChargesButton({ period }: { period: string }) {
  const [state, formAction, isPending] = useActionState(
    generateRegularChargesAction,
    initialState
  );

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="period" value={period} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          {isPending
            ? "Menerbitkan tagihan..."
            : `Terbitkan tagihan rutin (${period})`}
        </button>
      </form>

      {state.status !== "idle" && state.message && (
        <p
          role="status"
          className={`text-xs font-medium ${
            state.status === "success" ? "text-teal-800" : "text-amber-900"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}

export function RecordPaymentForm({
  openCharges,
}: {
  openCharges: OpenChargeOption[];
}) {
  const [selectedChargeId, setSelectedChargeId] = useState<string>(
    openCharges[0]?.id ?? ""
  );
  const selectedCharge =
    openCharges.find((c) => c.id === selectedChargeId) ?? openCharges[0];

  const [amountValue, setAmountValue] = useState<string>(
    selectedCharge ? String(selectedCharge.remainingAmount) : ""
  );
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    createRequestKey("PAY")
  );

  const [state, formAction, isPending] = useActionState(
    async (
      prevState: ContributionActionState | undefined,
      formData: FormData
    ) => {
      const res = await recordPaymentAction(prevState, formData);
      if (res.status === "success") {
        setIdempotencyKey(createRequestKey("PAY"));
      }
      return res;
    },
    initialState
  );

  function handleChargeChange(newChargeId: string) {
    setSelectedChargeId(newChargeId);
    const target = openCharges.find((c) => c.id === newChargeId);
    if (target) {
      setAmountValue(String(target.remainingAmount));
    }
    setIdempotencyKey(createRequestKey("PAY"));
  }

  if (openCharges.length === 0) {
    return (
      <p className="text-xs text-slate-600">
        Belum ada tagihan terbuka pada periode ini. Terbitkan tagihan rutin
        terlebih dahulu atau seluruh tagihan periode ini sudah lunas.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.status !== "idle" && state.message && (
        <div
          role="status"
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            state.status === "success"
              ? "border-teal-200 bg-teal-50/70 text-teal-900"
              : "border-amber-300/80 bg-amber-50/90 text-amber-900"
          }`}
        >
          {state.message}
        </div>
      )}

      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div>
        <label
          htmlFor="payment-charge"
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Pilih tagihan anggota
        </label>
        <select
          id="payment-charge"
          name="chargeId"
          value={selectedCharge?.id ?? ""}
          onChange={(e) => handleChargeChange(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        >
          {openCharges.map((charge) => (
            <option key={charge.id} value={charge.id}>
              {charge.memberName} — {charge.title} (Sisa{" "}
              {formatRupiah(charge.remainingAmount)})
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <label
            htmlFor="payment-amount"
            className="block text-xs font-medium text-slate-700"
          >
            Nominal pembayaran (Rp)
          </label>
          {selectedCharge && (
            <span className="text-xs text-slate-500 tabular-nums">
              Maks: {formatRupiah(selectedCharge.remainingAmount)}
            </span>
          )}
        </div>
        <input
          id="payment-amount"
          name="amount"
          type="number"
          min={1000}
          max={selectedCharge?.remainingAmount}
          step={1000}
          required
          value={amountValue}
          onChange={(e) => setAmountValue(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
        <p className="mt-1 text-xs text-slate-500">
          Dapat diisi penuh maupun cicilan parsial sesuai nominal yang ditransfer.
        </p>
      </div>

      <div>
        <label
          htmlFor="payment-mode"
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Status konfirmasi kas DANA
        </label>
        <select
          id="payment-mode"
          name="confirmationMode"
          defaultValue="CONFIRMED"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        >
          <option value="CONFIRMED">
            Langsung konfirmasi (Mutasi DANA sudah diterima)
          </option>
          <option value="PENDING">
            Simpan sebagai Menunggu Konfirmasi (Pending)
          </option>
        </select>
      </div>

      <div>
        <label
          htmlFor="payment-note"
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Catatan pembayaran (opsional)
        </label>
        <input
          id="payment-note"
          name="note"
          type="text"
          maxLength={120}
          placeholder="contoh: Transfer DANA tahap 1"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        {isPending ? "Memproses pembayaran..." : "Catat pembayaran iuran"}
      </button>
    </form>
  );
}

export function PendingPaymentsConfirmationList({
  pendingPayments,
  openCharges,
}: {
  pendingPayments: PendingPaymentItem[];
  openCharges: OpenChargeOption[];
}) {
  const [state, formAction, isPending] = useActionState(
    confirmPendingPaymentAction,
    initialState
  );

  if (pendingPayments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {state.status !== "idle" && state.message && (
        <div
          role="status"
          className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
            state.status === "success"
              ? "border-teal-200 bg-teal-50/70 text-teal-900"
              : "border-amber-300/80 bg-amber-50/90 text-amber-900"
          }`}
        >
          {state.message}
        </div>
      )}

      <ul className="divide-y divide-slate-200/80 rounded-xl bg-white border border-slate-200/80 overflow-hidden">
        {pendingPayments.map((payment) => {
          const memberOpenCharges = openCharges.filter(
            (c) => c.memberId === payment.memberId
          );
          const defaultTargetChargeId =
            payment.linkedChargeId ?? memberOpenCharges[0]?.id ?? "";

          return (
            <li
              key={payment.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {payment.memberName}
                  </span>
                  <span className="text-sm font-semibold text-amber-800 tabular-nums">
                    {formatRupiah(payment.amount)}
                  </span>
                </div>
                <p className="text-xs text-slate-600 truncate">
                  {payment.cleanNote} ·{" "}
                  {formatShortDateId(new Date(payment.paidAt))}
                </p>
              </div>

              {defaultTargetChargeId ? (
                <form
                  action={formAction}
                  className="flex flex-wrap items-center gap-2 shrink-0"
                >
                  <input type="hidden" name="paymentId" value={payment.id} />
                  {memberOpenCharges.length > 1 ? (
                    <select
                      name="targetChargeId"
                      defaultValue={defaultTargetChargeId}
                      aria-label="Pilih tagihan tujuan"
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                    >
                      {memberOpenCharges.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} (Sisa {formatRupiah(c.remainingAmount)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="hidden"
                      name="targetChargeId"
                      value={defaultTargetChargeId}
                    />
                  )}

                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 transition-colors"
                  >
                    Konfirmasi ke Kas DANA
                  </button>
                </form>
              ) : (
                <span className="text-xs text-slate-500">
                  Pilih periode tagihan terkait untuk konfirmasi
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AdditionalChargeForm({ period }: { period: string }) {
  const [batchKey, setBatchKey] = useState<string>(() =>
    createRequestKey(`ADD:${period}`)
  );

  const [state, formAction, isPending] = useActionState(
    async (
      prevState: ContributionActionState | undefined,
      formData: FormData
    ) => {
      const res = await createAdditionalChargesAction(prevState, formData);
      if (res.status === "success") {
        setBatchKey(createRequestKey(`ADD:${period}`));
      }
      return res;
    },
    initialState
  );

  return (
    <form action={formAction} className="space-y-3.5">
      {state.status !== "idle" && state.message && (
        <div
          role="status"
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            state.status === "success"
              ? "border-teal-200 bg-teal-50/70 text-teal-900"
              : "border-amber-300/80 bg-amber-50/90 text-amber-900"
          }`}
        >
          {state.message}
        </div>
      )}

      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="batchIdempotencyKey" value={batchKey} />

      <div>
        <label
          htmlFor="additional-title"
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Keperluan patungan / tagihan tambahan
        </label>
        <input
          id="additional-title"
          name="title"
          type="text"
          required
          minLength={3}
          maxLength={100}
          placeholder="contoh: Tambahan Token Listrik & Galon"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
      </div>

      <div>
        <label
          htmlFor="additional-amount"
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Nominal per anggota (Rp)
        </label>
        <input
          id="additional-amount"
          name="amountPerMember"
          type="number"
          min={1000}
          step={1000}
          required
          defaultValue={50000}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors"
      >
        {isPending
          ? "Menambahkan..."
          : `Tambah tagihan tambahan (${period})`}
      </button>
    </form>
  );
}

export function FuturePolicyForm({ defaultNextPeriod }: { defaultNextPeriod: string }) {
  const [state, formAction, isPending] = useActionState(
    upsertPolicyAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-3.5">
      {state.status !== "idle" && state.message && (
        <div
          role="status"
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            state.status === "success"
              ? "border-teal-200 bg-teal-50/70 text-teal-900"
              : "border-amber-300/80 bg-amber-50/90 text-amber-900"
          }`}
        >
          {state.message}
        </div>
      )}

      <div>
        <label
          htmlFor="policy-period"
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Berlaku mulai periode (YYYY-MM)
        </label>
        <input
          id="policy-period"
          name="effectiveFromPeriod"
          type="text"
          required
          pattern="\d{4}-(0[1-9]|1[0-2])"
          defaultValue={defaultNextPeriod}
          placeholder="2026-12"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
      </div>

      <div>
        <label
          htmlFor="policy-name"
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Nama kebijakan tarif
        </label>
        <input
          id="policy-name"
          name="name"
          type="text"
          required
          minLength={3}
          maxLength={100}
          defaultValue="Penyesuaian Tarif Iuran Rutin"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
      </div>

      <div>
        <label
          htmlFor="policy-amount"
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Tarif baru per anggota / bulan (Rp)
        </label>
        <input
          id="policy-amount"
          name="amountPerMember"
          type="number"
          min={1000}
          step={5000}
          required
          defaultValue={175000}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
        <p className="mt-1 text-xs text-slate-500">
          Tidak mengubah tagihan yang sudah diterbitkan pada periode sebelumnya.
        </p>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors"
      >
        {isPending ? "Menyimpan..." : "Simpan tarif periode mendatang"}
      </button>
    </form>
  );
}
