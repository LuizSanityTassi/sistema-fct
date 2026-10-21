import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { funcionariosDoCaixa } from "@/lib/data/diferenca-caixa";
import { empresaDasFiliais } from "@/lib/data/filiais";
import { semQuebraDeCaixa } from "@/lib/rh/lancamentos";
import { createClient } from "@/lib/supabase/server";
import { lancarQuebraManual } from "../actions";
import { quebraNaFolha } from "@/lib/data/diferenca-caixa";
import { QuebraManualForm, type GrupoColaboradores } from "./quebra-manual-form";

export const metadata = { title: "Lançar quebra de caixa" };

// hoje no horário de Brasília (UTC−3), em aaaa-mm-dd
const hojeNoBrasil = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

export default async function NovaQuebraPage() {
  await exigirAcesso("/financeiro/diferenca-caixa");
  const supabase = await createClient();
  const [funcionarios, { data: lojas }, empresas, naFolha] = await Promise.all([funcionariosDoCaixa(), supabase.from("branches").select("id, codigo, nome").eq("ativo", true).order("codigo"), empresaDasFiliais(supabase), quebraNaFolha()]);
  const porLoja = new Map<string, GrupoColaboradores>();
  for (const f of funcionarios) {
    if (f.status === "desligado" || semQuebraDeCaixa(f.cargo, f.branch_id ? empresas.get(f.branch_id) : null)) continue;
    const g = porLoja.get(f.filial) ?? { loja: `Loja ${f.filial}`, opcoes: [] };
    g.opcoes.push({ id: f.id, branchId: f.branch_id, rotulo: `${f.nome}${f.matricula ? ` · mat. ${f.matricula}` : ""}${f.cargo ? ` · ${f.cargo}` : ""}` });
    porLoja.set(f.filial, g);
  }
  const grupos = [...porLoja.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);

  return (
    <>
      <PageHeader
        eyebrow="Diferença de caixa"
        titulo="Lançar quebra manual"
        descricao={`Para a quebra que não veio do Trier (ou que precisa ser lançada mesmo dentro da tolerância). ${naFolha ? "Entra no desconto “Quebra de caixa” da folha do mês e vai" : "Vai"} para o gestor da loja justificar; o financeiro decide depois, como nas outras.`}
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/financeiro/diferenca-caixa" />}>
            <ChevronLeft data-icon="inline-start" />
            Diferença de caixa
          </Button>
        }
      />
      <section className="max-w-3xl rounded-xl border bg-card p-5">
        <QuebraManualForm action={lancarQuebraManual} grupos={grupos} lojas={lojas ?? []} hoje={hojeNoBrasil()} naFolha={naFolha} />
      </section>
    </>
  );
}
