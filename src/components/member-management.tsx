"use client";

import { useActionState } from "react";
import {
  type ActionFeedbackState,
  createMemberAction,
  deactivateMemberAction,
  reactivateMemberAction,
} from "@/app/actions/member-actions";
import type { MemberDirectoryItem } from "@/lib/member-service";
import { formatRupiah, formatShortDateId } from "@/lib/navigation";

const initialActionState: ActionFeedbackState = { status: "idle" };

export function AddMemberForm() {
  const [state, formAction, isPending] = useActionState(
    createMemberAction,
    initialActionState
  );

  return (
    <form action={formAction} className="space-y-4">
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

      <div>
        <label
          htmlFor="member-name"
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Nama anggota
        </label>
        <input
          id="member-name"
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          placeholder="Nama penghuni kost"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
      </div>

      <div>
        <label
          htmlFor="member-username"
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Username login
        </label>
        <input
          id="member-username"
          name="username"
          type="text"
          required
          minLength={3}
          maxLength={40}
          placeholder="contoh: dimas"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
      </div>

      <div>
        <label
          htmlFor="member-password"
          className="block text-xs font-medium text-slate-700 mb-1"
        >
          Password awal
        </label>
        <input
          id="member-password"
          name="initialPassword"
          type="password"
          required
          minLength={8}
          maxLength={128}
          placeholder="Minimal 8 karakter"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        {isPending ? "Menyimpan..." : "Tambah anggota"}
      </button>
    </form>
  );
}

export function MemberListSection({
  members,
}: {
  members: MemberDirectoryItem[];
}) {
  const [deactivateState, deactivateAction, isDeactivating] = useActionState(
    deactivateMemberAction,
    initialActionState
  );
  const [reactivateState, reactivateAction, isReactivating] = useActionState(
    reactivateMemberAction,
    initialActionState
  );

  const feedback =
    deactivateState.status !== "idle"
      ? deactivateState
      : reactivateState.status !== "idle"
        ? reactivateState
        : null;

  return (
    <div className="space-y-4">
      {feedback?.message && (
        <div
          role="status"
          className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
            feedback.status === "success"
              ? "border-teal-200 bg-teal-50/70 text-teal-900"
              : "border-amber-300/80 bg-amber-50/90 text-amber-900"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <ul className="divide-y divide-slate-200/80 rounded-xl bg-white border border-slate-200/80 overflow-hidden">
        {members.map((member) => (
          <li
            key={member.id}
            className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {member.name}
                </p>
                {member.username && (
                  <span className="text-xs font-mono text-slate-500">
                    @{member.username}
                  </span>
                )}
                {member.isCashCustodian && (
                  <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    Pemegang Kas DANA
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 tabular-nums">
                Bergabung {formatShortDateId(new Date(member.joinedAt))}
                {member.leftAt
                  ? ` · Nonaktif sejak ${formatShortDateId(new Date(member.leftAt))}`
                  : " · Hak akses setara"}
              </p>

              <p className="text-xs text-slate-600 tabular-nums">
                Sisa tagihan belum lunas:{" "}
                <span className="font-medium text-slate-900">
                  {formatRupiah(member.unpaidAmount)}
                </span>{" "}
                ({member.totalChargesCount} tagihan tercatat)
              </p>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    member.isActiveMember ? "bg-teal-700" : "bg-slate-400"
                  }`}
                />
                <span
                  className={
                    member.isActiveMember ? "text-teal-800" : "text-slate-600"
                  }
                >
                  {member.isActiveMember ? "Aktif" : "Nonaktif"}
                </span>
              </div>

              {member.isActiveMember ? (
                !member.isCashCustodian ? (
                  <form action={deactivateAction}>
                    <input
                      type="hidden"
                      name="targetMemberId"
                      value={member.id}
                    />
                    <button
                      type="submit"
                      disabled={isDeactivating}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors"
                    >
                      Nonaktifkan
                    </button>
                  </form>
                ) : (
                  <span className="text-xs text-slate-500">
                    Penanggung jawab kas
                  </span>
                )
              ) : (
                <form action={reactivateAction}>
                  <input
                    type="hidden"
                    name="targetMemberId"
                    value={member.id}
                  />
                  <button
                    type="submit"
                    disabled={isReactivating}
                    className="rounded-lg border border-teal-700/30 bg-teal-50/50 px-3 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50 transition-colors"
                  >
                    Aktifkan kembali
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

