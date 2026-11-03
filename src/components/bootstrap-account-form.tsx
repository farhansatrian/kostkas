"use client";

import { useActionState } from "react";
import {
  type AuthFormState,
  bootstrapInitialAccountAction,
} from "@/app/actions/auth-actions";

const initialState: AuthFormState = {};

export function BootstrapAccountForm() {
  const [state, formAction, isPending] = useActionState(
    bootstrapInitialAccountAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300/80 bg-amber-50/90 px-3.5 py-2.5 text-xs font-medium text-amber-900"
        >
          {state.error}
        </div>
      )}

      <div>
        <label
          htmlFor="setupToken"
          className="block text-xs font-medium text-slate-700 mb-1.5"
        >
          Token setup inisialisasi awal
        </label>
        <input
          id="setupToken"
          name="setupToken"
          type="password"
          required
          autoComplete="off"
          placeholder="Masukkan INITIAL_SETUP_TOKEN dari server"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700 font-mono"
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Token rahasia satu kali pakai yang dikonfigurasi administrator server.
        </p>
      </div>

      <div>
        <label
          htmlFor="memberName"
          className="block text-xs font-medium text-slate-700 mb-1.5"
        >
          Nama lengkap anggota
        </label>
        <input
          id="memberName"
          name="memberName"
          type="text"
          required
          autoComplete="name"
          placeholder="contoh: Farhan"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Akan dicatat sebagai nama penghuni pada buku kas bersama.
        </p>
      </div>

      <div>
        <label
          htmlFor="bootstrap-username"
          className="block text-xs font-medium text-slate-700 mb-1.5"
        >
          Username login
        </label>
        <input
          id="bootstrap-username"
          name="username"
          type="text"
          required
          autoComplete="username"
          placeholder="contoh: farhan"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
      </div>

      <div>
        <label
          htmlFor="bootstrap-password"
          className="block text-xs font-medium text-slate-700 mb-1.5"
        >
          Password
        </label>
        <input
          id="bootstrap-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Minimal 8 karakter"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-xs font-medium text-slate-700 mb-1.5"
        >
          Konfirmasi password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Ulangi password di atas"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        {isPending ? "Menginisialisasi..." : "Buat Akun Pertama & Mulai"}
      </button>
    </form>
  );
}

