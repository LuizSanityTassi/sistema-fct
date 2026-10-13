"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestReset, type AuthState } from "../login/actions";

export default function RecuperarSenhaPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(requestReset, {});
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Recuperar senha</h1>
        <p className="mb-5 text-sm text-slate-500">
          Informe seu e-mail e enviaremos um link para redefinir a senha.
        </p>
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-600">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
            />
          </div>
          {state.erro && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.erro}</div>
          )}
          {state.ok && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</div>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {pending ? "Enviando…" : "Enviar link"}
          </button>
        </form>
        <div className="mt-4 text-center">
          <Link href="/login" className="text-xs text-slate-500 underline hover:text-slate-700">
            Voltar ao login
          </Link>
        </div>
      </div>
    </main>
  );
}
