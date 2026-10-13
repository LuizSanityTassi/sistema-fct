"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "../../login/actions";

export default function AtualizarSenhaPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Definir nova senha</h1>
        <p className="mb-5 text-sm text-slate-500">Escolha uma senha com pelo menos 8 caracteres.</p>
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="senha" className="mb-1 block text-xs font-medium text-slate-600">Nova senha</label>
            <input id="senha" name="senha" type="password" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600" />
          </div>
          <div>
            <label htmlFor="senha2" className="mb-1 block text-xs font-medium text-slate-600">Confirmar senha</label>
            <input id="senha2" name="senha2" type="password" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600" />
          </div>
          {state.erro && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.erro}</div>
          )}
          <button type="submit" disabled={pending} className="w-full rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-60">
            {pending ? "Salvando…" : "Salvar senha"}
          </button>
        </form>
      </div>
    </main>
  );
}
