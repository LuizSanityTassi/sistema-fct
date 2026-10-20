import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { pluralizar } from "@/lib/formatos";
import { migrarLegado } from "./actions";
import { MigrarForm } from "./migrar-form";

export const metadata = { title: "Migrar fluxo de caixa anterior" };

export default async function MigrarPage({ searchParams }: PageProps<"/financeiro/migrar">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/migrar"), searchParams]);
  if (sessao.papel !== "admin") redirect("/financeiro");

  return (
    <>
      <PageHeader eyebrow="Financeiro" titulo="Migrar o fluxo de caixa anterior" descricao="Traz lançamentos, categorias (com molde do caixa contábil), unidades que faltam, ajustes do contador, saldos, orçamento e inadimplência do sistema antigo (SQLite)." />
      {sp.ok === "1" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span>
            Migração concluída: {pluralizar(Number(sp.inseridos ?? 0), "lançamento novo", "lançamentos novos")}
            {Number(sp.ja ?? 0) > 0 ? `, ${sp.ja} já existiam` : ""} · {sp.unidades} unidade(s) criada(s) · {sp.categorias} categorias.
          </span>
          <Link href="/financeiro" className="underline">
            ver visão geral
          </Link>
          <Link href="/financeiro/dre" className="underline">
            ver caixa contábil
          </Link>
        </div>
      )}
      <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Em produção (Vercel) o envio de arquivo é limitado a 4,5 MB. Se o banco antigo for maior que isso, rode o sistema na sua máquina (<code className="rounded bg-white/70 px-1 text-xs">npm run dev</code>) e use esta tela em <code className="rounded bg-white/70 px-1 text-xs">localhost:3000</code>, ou use o script <code className="rounded bg-white/70 px-1 text-xs">scripts/migrar-financeiro.mjs</code> (ver README). Reexecutar não duplica lançamentos.
      </p>
      <MigrarForm action={migrarLegado} />
    </>
  );
}
