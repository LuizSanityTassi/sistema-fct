import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso, semAcesso } from "@/lib/auth/session";
import { podeExcluirLancamento, podeLancar } from "@/lib/financeiro/permissoes";
import { pluralizar } from "@/lib/formatos";
import { rotuloCompetencia, somarMeses } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";
import { desfazerLoteImportacao, importarOmie } from "../../importar/actions";
import { ImportarForm } from "../../importar/importar-form";
import { AbasCaixaContabil } from "../abas";

export const metadata = { title: "Importar novo mês · Caixa contábil" };

const ESTA_TELA = "/financeiro/caixa-contabil/importar";
const hojeBrasil = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * Aba "Importar novo mês" do Caixa contábil: todo mês o contador sobe os relatórios do Omie do mês (Fluxo Por Filial
 * ou Contas a Pagar/Receber); só as linhas do mês escolhido entram, com a mesma prévia e proteção contra duplicidade
 * da importação do Omie.
 */
export default async function ImportarCaixaContabilPage({ searchParams }: PageProps<"/financeiro/caixa-contabil/importar">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/caixa-contabil"), searchParams]);
  if (!podeLancar(sessao.papel)) semAcesso(ESTA_TELA);
  const supabase = await createClient();
  const { data: ultimoLanc } = await supabase.from("fin_lancamentos").select("competencia").order("competencia", { ascending: false }).limit(1).maybeSingle();
  const ultimo = ultimoLanc?.competencia?.trim() ?? null;
  const hoje = hojeBrasil();
  // sugestão: o mês seguinte ao último com lançamentos, sem passar do mês passado (o mês corrente ainda não fechou)
  const mesPassado = somarMeses(hoje.slice(0, 7), -1);
  const sugerido = ultimo ? (somarMeses(ultimo, 1) <= mesPassado ? somarMeses(ultimo, 1) : mesPassado) : mesPassado;
  const { count: qtdUltimo } = ultimo ? await supabase.from("fin_lancamentos").select("id", { count: "exact", head: true }).eq("competencia", ultimo) : { count: 0 };

  const inseridos = typeof sp.inseridos === "string" ? Number(sp.inseridos) : null;
  const desfeito = typeof sp.desfeito === "string" ? Number(sp.desfeito) : null;
  const mesImportado = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : null;
  const erro = typeof sp.erro === "string" ? sp.erro : null;

  return (
    <>
      <PageHeader
        eyebrow="Financeiro · Caixa contábil"
        titulo="Importar novo mês"
        descricao="Todo mês o contador envia aqui os relatórios do Omie do mês. Só as linhas do mês escolhido entram; o resto do arquivo fica de fora. Nada é gravado antes da prévia."
      />
      <AbasCaixaContabil ativa="importar" podeImportar />

      <section aria-label="Situação" className="mb-4 rounded-xl border bg-card p-4 text-sm">
        {ultimo ? (
          <p>
            Último mês com lançamentos: <span className="font-semibold">{rotuloCompetencia(ultimo)}</span> ({pluralizar(qtdUltimo ?? 0, "lançamento", "lançamentos")}) · próximo a importar:{" "}
            <span className="font-semibold">{rotuloCompetencia(somarMeses(ultimo, 1))}</span>.
          </p>
        ) : (
          <p>Ainda não há lançamentos no financeiro.</p>
        )}
      </section>

      {inseridos !== null && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
          <span>
            {pluralizar(inseridos, "lançamento importado", "lançamentos importados")}
            {mesImportado ? ` de ${rotuloCompetencia(mesImportado)}` : ""}
            {Number(sp.pulados ?? 0) > 0 ? ` · ${sp.pulados} duplicado(s) pulado(s)` : ""}.
          </span>
          <Link href={`/financeiro/caixa-contabil${mesImportado ? `?ano=${mesImportado.slice(0, 4)}` : ""}`} className="underline">
            ver no Caixa contábil
          </Link>
          {typeof sp.lote === "string" && inseridos > 0 && podeExcluirLancamento(sessao.papel) && (
            <ConfirmarAcao
              titulo="Desfazer esta importação?"
              descricao={`Remove os ${inseridos} lançamentos deste lote. A auditoria guarda o registro.`}
              rotuloBotao="Desfazer importação"
              variant="destructive"
              action={desfazerLoteImportacao}
              campos={{ lote: sp.lote, voltar: ESTA_TELA }}
            />
          )}
        </div>
      )}
      {desfeito !== null && (
        <div className="mb-4">
          <AvisoSucesso mensagem={`Importação desfeita: ${pluralizar(desfeito, "lançamento removido", "lançamentos removidos")}.`} />
        </div>
      )}
      {erro && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{erro}</p>
        </div>
      )}

      <ImportarForm action={importarOmie} anoPadrao={Number(sugerido.slice(0, 4))} hoje={hoje} mesPadrao={sugerido} voltar={ESTA_TELA} />

      <p className="mt-4 text-xs text-muted-foreground">
        Todas as importações (de qualquer mês) e o desfazer ficam em{" "}
        <Link href="/financeiro/importar" className="underline">
          Financeiro → Importar do Omie
        </Link>
        .
      </p>
    </>
  );
}
