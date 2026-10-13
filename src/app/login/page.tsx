"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signIn, {});
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-red-700">
            Farmácias FCT
          </div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Sistema FCT</h1>
          <p className="text-sm text-slate-500">Gestão interna — acesso restrito</p>
        </div>
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-600">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
            />
          </div>
          <div>
            <label htmlFor="senha" className="mb-1 block text-xs font-medium text-slate-600">
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
            />
          </div>
          {state.erro && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.erro}
            </div>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-60"
          >
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <div className="mt-4 text-center">
          <Link href="/recuperar-senha" className="text-xs text-slate-500 underline hover:text-slate-700">
            Esqueci minha senha
          </Link>
        </div>
      </div>
    </main>
  );
}
