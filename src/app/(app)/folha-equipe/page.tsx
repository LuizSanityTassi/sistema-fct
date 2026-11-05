import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Wallet } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirAcesso } from "@/lib/auth/session";
import { competenciaAtual, competenciaValida, rotuloCompetencia, somarMeses } from "@/lib/rh/competencia";
import { competenciaParaData, funcaoCurta, normalizarNome } from "@/lib/rh/lancamentos";
import { createClient } from "@/lib/supabase/server";
import { TabelaEquipe, type EventoEquipe, type GrupoEquipe } from "./tabela";

export const metadata = { title: "Folha da equipe" };

type DadosEquipe = {
  eventos: EventoEquipe[];
  filiais: { id: string; codigo: string; nome: string }[];
  funcionarios: { id: string; nome: string; matricula: string | null; cargo: string | null; filial: string; no_mes: boolean; valores: Record<string, number> }[];
};

const SITUACOES = { "": "Todos", valores: "Com lançamento", vazios: "Sem lançamento" } as const;

/** Lançamentos do mês dos colaboradores vinculados à pessoa. Quem decide as filiais é a função folha_equipe, no banco. */
export default async function FolhaEquipePage({ searchParams }: PageProps<"/folha-equipe">) {
  const [, sp] = await Promise.all([exigirAcesso("/folha-equipe"), searchParams]);
  const txt = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const competencia = competenciaValida(txt("competencia")) ? txt("competencia") : competenciaAtual();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("folha_equipe", { p_competencia: competenciaParaData(competencia) });
  if (error) throw new Error(error.message);
  const dados = data as unknown as DadosEquipe;

  const filial = dados.filiais.some((f) => f.id === txt("filial")) ? txt("filial") : "";
  const situacao = Object.hasOwn(SITUACOES, txt("so")) ? txt("so") : "";
  const q = normalizarNome(txt("q"));
  const temValor = (f: DadosEquipe["funcionarios"][number]) => Object.values(f.valores).some((v) => Number(v) > 0);

  const lista = dados.funcionarios.filter((f) => !filial || f.filial === filial);
  const grupos: GrupoEquipe[] = dados.filiais
    .filter((f) => !filial || f.id === filial)
    .map((f) => ({
      filial: f,
      funcionarios: lista
        .filter((x) => x.filial === f.id)
        .filter((x) => !q || normalizarNome(x.nome).includes(q) || x.matricula === txt("q").trim())
        .filter((x) => (situacao === "valores" ? temValor(x) : situacao === "vazios" ? !temValor(x) : true))
        .map((x) => ({ id: x.id, nome: x.nome, matricula: x.matricula, funcao: funcaoCurta(x.cargo), noMes: x.no_mes, valores: x.valores })),
    }))
    .filter((g) => g.funcionarios.length > 0);
  const mes = (delta: number) => `/folha-equipe?${new URLSearchParams({ competencia: somarMeses(competencia, delta), ...(filial ? { filial } : {}) })}`;

  return (
    <>
      <PageHeader eyebrow="Folha" titulo="Folha da equipe" descricao="Horas extras, adicional noturno, quebra de caixa e os demais eventos do mês dos colaboradores vinculados a você. Só consulta: quem lança é o RH." />

      {dados.filiais.length === 0 ? (
        <section className="rounded-xl border bg-card">
          <EstadoVazio icone={Wallet} titulo="Nenhuma filial vinculada a você" descricao="Os colaboradores aparecem aqui quando você está como responsável no cadastro da filial. Se isso estiver errado, fale com o RH." />
        </section>
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <Button variant="ghost" size="icon" nativeButton={false} render={<Link href={mes(-1)} aria-label="Mês anterior" />}>
              <ChevronLeft />
            </Button>
            <Input type="month" name="competencia" defaultValue={competencia} aria-label="Mês" className="w-40" />
            <Button variant="ghost" size="icon" nativeButton={false} render={<Link href={mes(1)} aria-label="Próximo mês" />}>
              <ChevronRight />
            </Button>
            {dados.filiais.length > 1 && (
              <SelectNativo name="filial" defaultValue={filial} aria-label="Filial" className="w-52">
                <option value="">Todas as minhas filiais</option>
                {dados.filiais.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.codigo} · {f.nome}
                  </option>
                ))}
              </SelectNativo>
            )}
            <SelectNativo name="so" defaultValue={situacao} aria-label="Situação" className="w-44">
              {Object.entries(SITUACOES).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </SelectNativo>
            <Input name="q" defaultValue={txt("q")} placeholder="Nome ou matrícula" aria-label="Buscar colaborador" className="w-48" />
            <Button type="submit" variant="outline" size="sm">
              <Search data-icon="inline-start" />
              Filtrar
            </Button>
          </form>

          <dl className="mb-4 grid grid-cols-2 gap-3 md:max-w-md">
            {[
              { rotulo: `Colaboradores · ${rotuloCompetencia(competencia)}`, valor: lista.length },
              { rotulo: "Com lançamento", valor: lista.filter(temValor).length },
            ].map((k) => (
              <div key={k.rotulo} className="rounded-xl border bg-card p-4">
                <dt className="text-xs text-muted-foreground">{k.rotulo}</dt>
                <dd className="numero-sm">{k.valor}</dd>
              </div>
            ))}
          </dl>

          <TabelaEquipe eventos={dados.eventos} grupos={grupos} />
        </>
      )}
    </>
  );
}
