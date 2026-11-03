"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  type BudgetSettingsActionState,
  changeOwnPasswordAction,
  recordReconciliationAdjustmentAction,
  revokeOtherSessionsAction,
  updateAppPreferencesAction,
  updateCashAccountSettingsAction,
  updateContributionTariffSettingAction,
} from "@/app/actions/budget-settings-actions";
import { formatRupiah } from "@/lib/navigation";
import {
  evaluateManualCashReconciliation,
  type SettingsPageData,
} from "@/lib/settings-service";

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

export function SettingsManagement({
  data,
  actorMemberId,
}: {
  data: SettingsPageData;
  actorMemberId: string;
}) {
  const [actualDanaInput, setActualDanaInput] = useState<string>(
    String(data.cashAccount.recordedLedgerBalance)
  );
  const [reconKey, setReconKey] = useState(
    () => `RECON-ADJ:${actorMemberId}:${Date.now()}`
  );

  const parsedActualDana = Number(actualDanaInput);
  const reconciliation = Number.isInteger(parsedActualDana)
    ? evaluateManualCashReconciliation(
        data.cashAccount.recordedLedgerBalance,
        parsedActualDana
      )
    : null;

  const [cashSettingsState, cashSettingsAction, isSavingCashSettings] =
    useActionState(updateCashAccountSettingsAction, initialState);

  const [tariffState, tariffAction, isSavingTariff] = useActionState(
    updateContributionTariffSettingAction,
    initialState
  );

  const [passwordState, passwordAction, isSavingPassword] = useActionState(
    changeOwnPasswordAction,
    initialState
  );

  const [revokeState, revokeAction, isRevokingSessions] = useActionState(
    revokeOtherSessionsAction,
    initialState
  );

  const [prefState, prefAction, isSavingPref] = useActionState(
    updateAppPreferencesAction,
    initialState
  );

  const [reconState, reconFormAction, isRecordingRecon] = useActionState(
    async (
      prev: BudgetSettingsActionState | undefined,
      formData: FormData
    ) => {
      const res = await recordReconciliationAdjustmentAction(prev, formData);
      if (res.status === "success") {
        setReconKey(`RECON-ADJ:${actorMemberId}:${Date.now()}`);
      }
      return res;
    },
    initialState
  );

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Section 7: Rekonsiliasi Kas Manual */}
      <section
        aria-labelledby="reconciliation-heading"
        className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
      >
        <div className="p-5 sm:p-6 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h2
              id="reconciliation-heading"
              className="text-sm font-semibold text-slate-900"
            >
              Rekonsiliasi Kas Manual ({data.cashAccount.provider} —{" "}
              {data.cashAccount.custodianName})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Bandingkan saldo tercatat buku besar KostKas dengan saldo aplikasi DANA aktual yang dibaca secara manual.
            </p>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {data.cashAccount.confirmedMovementCount} mutasi CONFIRMED
          </span>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg bg-slate-50/80 border border-slate-200/80 p-4">
              <p className="text-xs font-medium text-slate-500">
                Saldo Tercatat Buku Besar
              </p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums">
                {formatRupiah(data.cashAccount.recordedLedgerBalance)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                Masuk {formatRupiah(data.cashAccount.confirmedInflowTotal)} · Keluar{" "}
                {formatRupiah(data.cashAccount.confirmedOutflowTotal)}
              </p>
            </div>

            <div className="rounded-lg bg-white border border-slate-200/90 p-4">
              <label
                htmlFor="manual-dana-balance"
                className="block text-xs font-medium text-slate-700"
              >
                Input Saldo DANA Riil
              </label>
              <input
                id="manual-dana-balance"
                type="number"
                step={1}
                value={actualDanaInput}
                onChange={(e) => setActualDanaInput(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-lg font-semibold text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Masukkan angka bulat Rupiah sesuai saldo aplikasi DANA.
              </p>
            </div>

            <div className="rounded-lg bg-slate-50/80 border border-slate-200/80 p-4">
              <p className="text-xs font-medium text-slate-500">
                Selisih Rekonsiliasi
              </p>
              {reconciliation ? (
                <>
                  <p
                    className={`mt-1.5 text-2xl font-semibold tabular-nums ${
                      reconciliation.status === "MATCHED"
                        ? "text-teal-800"
                        : reconciliation.status === "SURPLUS_IN_DANA"
                          ? "text-amber-800"
                          : "text-rose-700"
                    }`}
                  >
                    {reconciliation.discrepancyAmount > 0 ? "+" : ""}
                    {formatRupiah(reconciliation.discrepancyAmount)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    {reconciliation.status === "MATCHED"
                      ? "Cocok 100% (Tidak ada selisih)"
                      : reconciliation.status === "SURPLUS_IN_DANA"
                        ? "Surplus di DANA (Belum tercatat di Ledger)"
                        : "Defisit di DANA (Lebih kecil dari Ledger)"}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-rose-700">
                  Masukkan angka bulat yang valid.
                </p>
              )}
            </div>
          </div>

          {reconciliation && (
            <div
              className={`rounded-lg border px-4 py-3 text-xs ${
                reconciliation.status === "MATCHED"
                  ? "border-teal-200 bg-teal-50/50 text-teal-900"
                  : "border-amber-200 bg-amber-50/60 text-amber-900"
              }`}
            >
              {reconciliation.summaryText}
            </div>
          )}

          {/* Form Koreksi Rekonsiliasi Manual (Tidak otomatis mengubah saldo tanpa aksi & alasan) */}
          <div className="pt-4 border-t border-slate-200/80 space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                Jurnal Penyesuaian Kas
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sistem tidak mengubah saldo secara otomatis. Jika terdapat selisih yang sah, catat jurnal penyesuaian dengan alasan wajib di bawah ini.
              </p>
            </div>

            <FeedbackBanner state={reconState} />

            <form
              action={reconFormAction}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
            >
              <input type="hidden" name="idempotencyKey" value={reconKey} />

              <div>
                <label
                  htmlFor="recon-direction"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Arah Penyesuaian
                </label>
                <select
                  id="recon-direction"
                  name="direction"
                  defaultValue={reconciliation?.recommendedDirection ?? "IN"}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  <option value="IN">ADJUSTMENT IN (+ Tambah Saldo)</option>
                  <option value="OUT">ADJUSTMENT OUT (- Kurangi Saldo)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="recon-amount"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Nominal Koreksi (Rp)
                </label>
                <input
                  id="recon-amount"
                  type="number"
                  name="amount"
                  min={1}
                  step={1}
                  required
                  defaultValue={
                    reconciliation && reconciliation.absDiscrepancyAmount > 0
                      ? reconciliation.absDiscrepancyAmount
                      : ""
                  }
                  placeholder="10000"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="recon-reason"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Alasan Koreksi (Wajib)
                </label>
                <input
                  id="recon-reason"
                  type="text"
                  name="reason"
                  required
                  minLength={5}
                  maxLength={180}
                  placeholder="Contoh: Biaya admin bank / bunga kas"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isRecordingRecon}
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {isRecordingRecon
                  ? "Menyimpan..."
                  : "Catat Jurnal Penyesuaian"}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Grid Bagian A, B, C, D */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Bagian A: Pengaturan Kas Kost & Bagian D: Preferensi */}
        <div className="lg:col-span-6 space-y-6">
          <section
            aria-labelledby="cash-settings-heading"
            className="rounded-xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-4"
          >
            <div>
              <h2
                id="cash-settings-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Pengaturan Kas & Cash Custodian
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Seluruh anggota aktif memiliki hak akses setara. Cash Custodian adalah penanggung jawab dompet DANA operasional, bukan superadmin.
              </p>
            </div>

            <FeedbackBanner state={cashSettingsState} />

            <form action={cashSettingsAction} className="space-y-3.5">
              <div>
                <label
                  htmlFor="setting-kost-name"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Nama Kas Bersama
                </label>
                <input
                  id="setting-kost-name"
                  type="text"
                  name="kostName"
                  required
                  minLength={3}
                  maxLength={80}
                  defaultValue={data.preferences.kostName}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="setting-provider"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Provider Dompet Kas
                  </label>
                  <input
                    id="setting-provider"
                    type="text"
                    name="provider"
                    required
                    minLength={2}
                    maxLength={40}
                    defaultValue={data.cashAccount.provider}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="setting-account-name"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Nama Akun Kas
                  </label>
                  <input
                    id="setting-account-name"
                    type="text"
                    name="accountName"
                    required
                    minLength={3}
                    maxLength={80}
                    defaultValue={data.cashAccount.name}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="setting-custodian"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Anggota Pemegang Akun Kas (Cash Custodian)
                </label>
                <select
                  id="setting-custodian"
                  name="custodianMemberId"
                  defaultValue={
                    data.cashAccount.custodianMemberId ??
                    data.activeMembers[0]?.id
                  }
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

              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 tabular-nums">
                Saldo tercatat berdasarkan ledger saat ini:{" "}
                <strong className="text-slate-900">
                  {formatRupiah(data.cashAccount.recordedLedgerBalance)}
                </strong>{" "}
                (Kode akun: {data.cashAccount.code}).
              </div>

              <button
                type="submit"
                disabled={isSavingCashSettings}
                className="w-full rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {isSavingCashSettings
                  ? "Menyimpan..."
                  : "Simpan Pengaturan Kas Kost"}
              </button>
            </form>
          </section>

          {/* Bagian D: Preferensi Aplikasi */}
          <section
            aria-labelledby="app-preferences-heading"
            className="rounded-xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-4"
          >
            <div>
              <h2
                id="app-preferences-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Preferensi Standar Aplikasi
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Standar mata uang, zona waktu akuntansi, dan format tampilan tanggal.
              </p>
            </div>

            <FeedbackBanner state={prefState} />

            <form action={prefAction} className="space-y-3.5">
              <input
                type="hidden"
                name="kostName"
                value={data.preferences.kostName}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="block text-slate-500">Mata Uang Dasar</span>
                  <strong className="text-slate-900">
                    {data.preferences.currencyCode} (Rupiah Indonesia — Integer)
                  </strong>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="block text-slate-500">
                    Zona Waktu Buku Besar
                  </span>
                  <strong className="text-slate-900">
                    {data.preferences.timezone} (WIB / UTC+07:00)
                  </strong>
                </div>
              </div>

              <div>
                <label
                  htmlFor="pref-date-format"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Format Tanggal Tampilan
                </label>
                <select
                  id="pref-date-format"
                  name="dateFormat"
                  defaultValue={data.preferences.dateFormat}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  <option value="dd MMM yyyy">dd MMM yyyy (02 Nov 2026)</option>
                  <option value="dd/MM/yyyy">dd/MM/yyyy (02/11/2026)</option>
                  <option value="yyyy-MM-dd">yyyy-MM-dd (2026-11-02)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isSavingPref}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {isSavingPref ? "Menyimpan..." : "Simpan Preferensi Format"}
              </button>
            </form>
          </section>
        </div>

        {/* Bagian B: Pengaturan Iuran & Bagian C: Pengaturan Akun */}
        <div className="lg:col-span-6 space-y-6">
          {/* Bagian B: Pengaturan Iuran */}
          <section
            aria-labelledby="contribution-settings-heading"
            className="rounded-xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-4"
          >
            <div>
              <h2
                id="contribution-settings-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Kebijakan Tarif Iuran Bulanan
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Perubahan tarif berlaku mulai periode efektif yang dipilih dan tidak mengubah nominal tagihan historis secara retroaktif.
              </p>
            </div>

            <FeedbackBanner state={tariffState} />

            <form action={tariffAction} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="tariff-effective-period"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Periode Efektif (YYYY-MM)
                  </label>
                  <input
                    id="tariff-effective-period"
                    type="text"
                    name="effectiveFromPeriod"
                    required
                    defaultValue={data.contributionSettings.nextPeriod}
                    placeholder="2026-12"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="tariff-amount"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Tarif per Anggota (Rp)
                  </label>
                  <input
                    id="tariff-amount"
                    type="number"
                    name="amountPerMember"
                    min={1}
                    step={1}
                    required
                    defaultValue={
                      data.contributionSettings.policies[0]?.amountPerMember ??
                      150000
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="tariff-name"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Nama Kebijakan Tarif
                </label>
                <input
                  id="tariff-name"
                  type="text"
                  name="name"
                  required
                  minLength={3}
                  maxLength={100}
                  defaultValue="Tarif Iuran Rutin Kost"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingTariff}
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {isSavingTariff
                  ? "Menyimpan..."
                  : "Tetapkan Kebijakan Tarif Baru"}
              </button>
            </form>

            {/* Riwayat Kebijakan Tarif */}
            <div className="pt-3 border-t border-slate-200/70 space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                Riwayat Kebijakan Tarif ({data.contributionSettings.policies.length}):
              </p>
              <ul className="divide-y divide-slate-200/60 text-xs tabular-nums">
                {data.contributionSettings.policies.map((pol) => (
                  <li
                    key={pol.id}
                    className="py-2 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{pol.name}</p>
                      <p className="text-[11px] text-slate-500">
                        Mulai {pol.effectiveFromLabel} — {pol.effectiveToLabel}
                      </p>
                    </div>
                    <span className="font-semibold text-slate-900 shrink-0">
                      {formatRupiah(pol.amountPerMember)} / bln
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Bagian C: Pengaturan Akun & Keamanan Sesi */}
          <section
            aria-labelledby="account-settings-heading"
            className="rounded-xl bg-white border border-slate-200/80 p-5 sm:p-6 space-y-4"
          >
            <div>
              <h2
                id="account-settings-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Pengaturan Akun & Keamanan Sesi
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Anda masuk sebagai{" "}
                <strong className="text-slate-900">
                  {data.currentAccount.memberName} (@
                  {data.currentAccount.username})
                </strong>{" "}
                · Bergabung {data.currentAccount.joinedAtLabel}.
              </p>
            </div>

            <FeedbackBanner state={passwordState} />
            <FeedbackBanner state={revokeState} />

            <form action={passwordAction} className="space-y-3">
              <div>
                <label
                  htmlFor="current-password"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Password Saat Ini (Wajib Diverifikasi)
                </label>
                <input
                  id="current-password"
                  type="password"
                  name="currentPassword"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-password"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Password Baru (Min. 8 Karakter)
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    name="newPassword"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm-new-password"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Konfirmasi Password Baru
                  </label>
                  <input
                    id="confirm-new-password"
                    type="password"
                    name="confirmNewPassword"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingPassword}
                className="w-full rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {isSavingPassword ? "Memverifikasi..." : "Perbarui Password"}
              </button>
            </form>

            <div className="pt-3 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
              <div className="text-slate-600 tabular-nums">
                <p>
                  Sesi aktif saat ini:{" "}
                  <strong className="text-slate-900">
                    {data.currentAccount.activeSessionCount} sesi
                  </strong>{" "}
                  (Login terakhir: {data.currentAccount.lastLoginAtLabel})
                </p>
              </div>

              <form action={revokeAction}>
                <button
                  type="submit"
                  disabled={isRevokingSessions}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {isRevokingSessions
                    ? "Mengakhiri..."
                    : "Akhiri Sesi Perangkat Lain"}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>

      {/* Section 6: Activity Log & Transparency (AuditLog) */}
      <section
        aria-labelledby="activity-log-heading"
        className="rounded-xl bg-white border border-slate-200/80 overflow-hidden"
      >
        <div className="p-5 sm:p-6 border-b border-slate-200/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
            <div>
              <h2
                id="activity-log-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Riwayat Aktivitas & Audit Log
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Jejak audit seluruh transaksi kas, perubahan anggaran, kebijakan tarif, dan pengaturan aplikasi.
              </p>
            </div>
            <Link
              href="/pengaturan"
              className="text-xs font-medium text-teal-800 hover:underline"
            >
              Reset filter aktivitas
            </Link>
          </div>

          <form
            method="GET"
            action="/pengaturan"
            className="grid grid-cols-1 sm:grid-cols-4 gap-3"
          >
            <div>
              <label
                htmlFor="audit-period"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Periode Aktivitas
              </label>
              <select
                id="audit-period"
                name="period"
                defaultValue={data.auditLogs.filters.period}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
              >
                {data.auditLogs.availablePeriods.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="audit-actor"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Anggota Pelaku
              </label>
              <select
                id="audit-actor"
                name="actorMemberId"
                defaultValue={data.auditLogs.filters.actorMemberId}
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

            <div>
              <label
                htmlFor="audit-category"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Jenis Aktivitas
              </label>
              <select
                id="audit-category"
                name="actionCategory"
                defaultValue={data.auditLogs.filters.actionCategory}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
              >
                <option value="ALL">Semua Jenis Aktivitas</option>
                <option value="FINANCE">Transaksi & Rekonsiliasi Kas</option>
                <option value="BUDGET">Perencanaan Anggaran</option>
                <option value="SETTINGS">Pengaturan & Kebijakan Tarif</option>
                <option value="AUTH">Akun & Keamanan Sesi</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Filter Riwayat
              </button>
            </div>
          </form>
        </div>

        {data.auditLogs.items.length === 0 ? (
          <div className="p-6 text-xs text-slate-500">
            Tidak ada aktivitas AuditLog yang cocok dengan filter saat ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500">
                  <th className="py-3 px-4 font-medium">
                    Waktu (Asia/Jakarta)
                  </th>
                  <th className="py-3 px-4 font-medium">Anggota</th>
                  <th className="py-3 px-4 font-medium">Jenis Tindakan</th>
                  <th className="py-3 px-4 font-medium">Objek</th>
                  <th className="py-3 px-4 font-medium">Ringkasan Perubahan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 tabular-nums">
                {data.auditLogs.items.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {log.timestampLabel}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {log.actorName}
                    </td>
                    <td className="py-3 px-4 text-teal-800 font-mono text-[11px] whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {log.entityType}
                    </td>
                    <td className="py-3 px-4 text-slate-800">{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.auditLogs.pagination && data.auditLogs.pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
            <p className="text-slate-600">
              Menampilkan{" "}
              <strong className="font-semibold text-slate-900">
                {(data.auditLogs.pagination.page - 1) *
                  data.auditLogs.pagination.pageSize +
                  1}
              </strong>
              –
              <strong className="font-semibold text-slate-900">
                {Math.min(
                  data.auditLogs.pagination.page *
                    data.auditLogs.pagination.pageSize,
                  data.auditLogs.pagination.totalCount
                )}
              </strong>{" "}
              dari{" "}
              <strong className="font-semibold text-slate-900">
                {data.auditLogs.pagination.totalCount}
              </strong>{" "}
              riwayat aktivitas
            </p>

            <div className="flex items-center gap-2">
              {data.auditLogs.pagination.hasPrevPage ? (
                <Link
                  href={`/pengaturan?period=${data.auditLogs.filters.period}&actorMemberId=${data.auditLogs.filters.actorMemberId}&actionCategory=${data.auditLogs.filters.actionCategory}&page=${data.auditLogs.pagination.page - 1}`}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  &larr; Sebelumnya
                </Link>
              ) : (
                <span className="rounded-lg border border-slate-200 bg-slate-100/60 px-2.5 py-1 text-slate-400 cursor-not-allowed">
                  &larr; Sebelumnya
                </span>
              )}

              <span className="text-slate-600 px-1">
                Halaman {data.auditLogs.pagination.page} dari{" "}
                {data.auditLogs.pagination.totalPages}
              </span>

              {data.auditLogs.pagination.hasNextPage ? (
                <Link
                  href={`/pengaturan?period=${data.auditLogs.filters.period}&actorMemberId=${data.auditLogs.filters.actorMemberId}&actionCategory=${data.auditLogs.filters.actionCategory}&page=${data.auditLogs.pagination.page + 1}`}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Berikutnya &rarr;
                </Link>
              ) : (
                <span className="rounded-lg border border-slate-200 bg-slate-100/60 px-2.5 py-1 text-slate-400 cursor-not-allowed">
                  Berikutnya &rarr;
                </span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

