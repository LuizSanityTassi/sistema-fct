import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Search, Settings2, TriangleAlert } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirAcesso } from "@/lib/auth/session";
import { arquivoDaFilial, carregarCompetencia, codigoEmpresaDaPlanilha } from "@/lib/data/lancamentos-folha";
import { competenciaAtual, competenciaValida, rotuloCompetencia, somarMeses } from "@/lib/rh/competencia";
import { ehFarmaceutico, normalizarNome } from "@/lib/rh/lancamentos";
import { createClient } from "@/lib/supabase/server";
import { GradeLancamentos, LinkBaixarPlanilha, type GrupoGrade } from "./grade";

export const metadata = { title: "Lançamentos da folha" };

/** Assinatura dos dados gravados: muda quando algo é salvo, e aí a grade é remontada com os valores novos. */
function assinatura(valores: Map<string, Record<string, number>>, obs: Map<string, { texto: string; pendente: boolean }>) {
  let h = 2166136261;
  const add = (t: string) => {
    for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  };
  for (const [emp, v] of valores) for (const [ev, n] of Object.entries(v)) add(`${emp}|${ev}|${n};`);
  for (const [emp, o] of obs) add(`${emp}|${o.texto}|${o.pendente};`);
  return (h >>> 0).toString(36);
}

const SITUACOES = { "": "Todos", valores: "Com lançamento", pendentes: "Com pendência", vazios: "Sem lançamento" } as const;

export default async function LancamentosFolhaPage({ searchParams }: PageProps<"/rh/lancamentos">) {
  const [, sp] = await Promise.all([exigirAcesso("/rh/lancamentos"), searchParams]);
  const txt = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const competencia = competenciaValida(txt("competencia")) ? txt("competencia") : competenciaAtual();
  const supabase = await createClient();
  const dados = await carregarCompetencia(supabase, competencia);
  const filialPorId = new Map(dados.filiais.map((f) => [f.id, f]));

  // empresas (raiz do CNPJ) que têm funcionário no mês
  const qtdPorRaiz = new Map<string, { nome: string; qtd: number }>();
  for (const f of dados.funcionarios) {
    const fil = filialPorId.get(f.branchPlanilha);
    if (!fil) continue;
    const atual = qtdPorRaiz.get(fil.raiz) ?? { nome: fil.empresa, qtd: 0 };
    atual.qtd++;
    qtdPorRaiz.set(fil.raiz, atual);
  }
  const empresas = [...qtdPorRaiz.entries()].sort((a, b) => b[1].qtd - a[1].qtd);
  const empresa = qtdPorRaiz.has(txt("empresa")) ? txt("empresa") : (empresas[0]?.[0] ?? "");
  const filiaisDaEmpresa = dados.filiais.filter((f) => f.raiz === empresa && dados.funcionarios.some((x) => x.branchPlanilha === f.id));
  const filial = filiaisDaEmpresa.some((f) => f.id === txt("filial")) ? txt("filial") : "";
  const q = normalizarNome(txt("q"));
  const situacao = (txt("so") in SITUACOES ? txt("so") : "") as keyof typeof SITUACOES;

  const eventos = dados.eventos.filter((e) => e.ativo);
  const daEmpresa = dados.funcionarios.filter((f) => filialPorId.get(f.branchPlanilha)?.raiz === empresa);
  const temValor = (id: string) => Object.values(dados.valores.get(id) ?? {}).some((v) => v > 0);
  const pendente = (id: string) => !!dados.observacoes.get(id)?.pendente;

  const grupos: GrupoGrade[] = filiaisDaEmpresa
    .filter((f) => !filial || f.id === filial)
    .map((f) => ({
      filial: { id: f.id, codigo: f.codigo, nome: f.nome, cnpj: f.cnpj, codigoDominio: codigoEmpresaDaPlanilha(f).codigo, codigoProvisorio: codigoEmpresaDaPlanilha(f).provisorio, arquivo: arquivoDaFilial(f, competencia) },
      funcionarios: daEmpresa
        .filter((x) => x.branchPlanilha === f.id)
        .filter((x) => !q || normalizarNome(x.nome).includes(q) || x.matricula === txt("q").trim())
        .filter((x) => (situacao === "valores" ? temValor(x.id) : situacao === "pendentes" ? pendente(x.id) : situacao === "vazios" ? !temValor(x.id) : true))
        .map((x) => ({
          id: x.id,
          nome: x.nome,
          matricula: x.matricula,
          funcao: x.funcao,
          ativoNoMes: x.ativoNoMes,
          farmaceutico: ehFarmaceutico(x.cargo),
          valores: dados.valores.get(x.id) ?? {},
          obs: dados.observacoes.get(x.id) ?? null,
        })),
    }))
    .filter((g) => g.funcionarios.length > 0);

  const comValor = daEmpresa.filter((f) => temValor(f.id)).length;
  const pendencias = daEmpresa.filter((f) => pendente(f.id)).length;
  const semCodigo = filiaisDaEmpresa.filter((f) => codigoEmpresaDaPlanilha(f).provisorio).length;
  const versao = assinatura(dados.valores, dados.observacoes);
  const params = (extra: Record<string, string>) => new URLSearchParams({ competencia, empresa, ...(filial ? { filial } : {}), ...extra }).toString();

  return (
    <>
      <PageHeader
        eyebrow="Pessoas"
        titulo="Lançamentos da folha"
        descricao="Horas extras, adicional noturno, quebra de caixa e os demais eventos do mês por funcionário. No fechamento, gera a planilha da contabilidade (Domínio), um arquivo por CNPJ."
        acoes={
          <>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/rh/lancamentos/importar?competencia=${competencia}`} />}>
              <FileSpreadsheet data-icon="inline-start" />
              Importar planilha do RH
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/rh/lancamentos/configuracao" />}>
              <Settings2 data-icon="inline-start" />
              Configurar
            </Button>
          </>
        }
      />

      {txt("erro") && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{txt("erro")}</p>
        </div>
      )}

      <section className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link href={`/rh/lancamentos?${new URLSearchParams({ competencia: somarMeses(competencia, -1), empresa })}`} aria-label="Mês anterior" />}>
            <ChevronLeft />
          </Button>
          <Input type="month" name="competencia" defaultValue={competencia} aria-label="Competência" className="w-40" />
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link href={`/rh/lancamentos?${new URLSearchParams({ competencia: somarMeses(competencia, 1), empresa })}`} aria-label="Próximo mês" />}>
            <ChevronRight />
          </Button>
          <SelectNativo name="empresa" defaultValue={empresa} aria-label="Empresa" className="w-44">
            {empresas.map(([raiz, e]) => (
              <option key={raiz} value={raiz}>
                {e.nome} ({e.qtd})
              </option>
            ))}
          </SelectNativo>
          <SelectNativo name="filial" defaultValue={filial} aria-label="Filial" className="w-52">
            <option value="">Todas as filiais</option>
            {filiaisDaEmpresa.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo} · {f.nome}
              </option>
            ))}
          </SelectNativo>
          <SelectNativo name="so" defaultValue={situacao} aria-label="Situação" className="w-44">
            {Object.entries(SITUACOES).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </SelectNativo>
          <Input name="q" defaultValue={txt("q")} placeholder="Nome ou matrícula" aria-label="Buscar funcionário" className="w-48" />
          <Button type="submit" variant="outline" size="sm">
            <Search data-icon="inline-start" />
            Filtrar
          </Button>
        </form>
        {empresa && (
          <Button size="sm" nativeButton={false} render={<LinkBaixarPlanilha href={`/api/folha-lancamentos/planilha?${params({})}`} />}>
            <Download data-icon="inline-start" />
            {filial ? "Baixar planilha da filial" : "Baixar todas (.zip)"}
          </Button>
        )}
      </section>

      <dl className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { rotulo: `Funcionários · ${rotuloCompetencia(competencia)}`, valor: daEmpresa.length },
          { rotulo: "Com lançamento", valor: comValor },
          { rotulo: "Com pendência", valor: pendencias, alerta: pendencias > 0 },
          { rotulo: "CNPJs com código provisório", valor: semCodigo, alerta: semCodigo > 0 },
        ].map((k) => (
          <div key={k.rotulo} className="rounded-xl border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{k.rotulo}</dt>
            <dd className={`numero-sm ${k.alerta ? "text-amber-700" : ""}`}>{k.valor}</dd>
          </div>
        ))}
      </dl>

      <GradeLancamentos
        key={`${competencia}|${empresa}|${filial}|${q}|${situacao}`}
        competencia={competencia}
        eventos={eventos.map((e) => ({ id: e.id, chave: e.chave, nome: e.nome, codigo: e.codigo, unidade: e.unidade, naPlanilha: e.naPlanilha && e.codigo !== null }))}
        grupos={grupos}
        versao={versao}
      />
    </>
  );
}
