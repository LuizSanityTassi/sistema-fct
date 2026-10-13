import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

const PAPEL_LABEL: Record<string, string> = {
  admin: "Administrador",
  rh: "RH",
  ti: "TI",
  financeiro: "Financeiro",
  gerente: "Gerente",
  usuario: "Usuário",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, papel")
    .eq("id", user!.id)
    .single();

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-red-700">Farmácias FCT</div>
          <div className="text-lg font-bold text-slate-900">Sistema FCT</div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">
            {profile?.nome || user?.email}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {PAPEL_LABEL[profile?.papel ?? "usuario"]}
            </span>
          </span>
          <form action={signOut}>
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Sair
            </button>
          </form>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-xl font-bold text-slate-900">Bem-vindo 👋</h1>
        <p className="mt-1 text-sm text-slate-500">
          Autenticação funcionando. Os módulos (RH, Chamados, Filiais…) chegam nas próximas etapas.
        </p>
      </section>
    </main>
  );
}
