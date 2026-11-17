import Link from "next/link";
import { AlarmClock, CalendarRange, Store, Users } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Indicador, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirAcesso } from "@/lib/auth/session";
import { filiaisDaEscala, filiaisForaDaEscala } from "@/lib/data/escalas";
import { preAnalise, ROTULO_PRE, type PreAnalise } from "@/lib/escalas/motor";
import { horarioPendente, mesCurto, modeloFilial, proximoMes, rotuloDias, textoFuncionamento } from "@/lib/escalas/resumo";
import type { Tom } from "@/lib/tons";
import { AbasEscala } from "./abas";
import { IncluirFilial } from "./incluir-filial";

export const metadata = { title: "Escala 5x2" };

const TOM_PRE: Record<PreAnalise["status"], Tom> = { ok: "sucesso", ajustavel: "atencao", equipe: "perigo", indisponivel: "neutro" };
const sem = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default async function EscalasPage({ searchParams }: PageProps<"/escalas">) {
  const [, sp] = await Promise.all([exigirAcesso("/escalas"), searchParams]);
  const [filiais, fora] = await Promise.all([filiaisDaEscala(), filiaisForaDaEscala()]);
  const ref = proximoMes();
  const analises = new Map(filiais.map((f) => [f.id, preAnalise(f.config, f.equipe, { ano: ref.ano, mes: ref.mes, jornadaSemanal: 40 })]));

  const regional = typeof sp.regional === "string" ? sp.regional : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const sit = typeof sp.situacao === "string" ? sp.situacao : "";
  const regionais = [...new Set(filiais.map((f) => f.regional ?? "Sem regional"))].sort();
  const lista = filiais.filter(
    (f) =>
      (!regional || (f.regional ?? "Sem regional") === regional) &&
      (!q || sem(`${f.codigo} ${f.nome} ${f.regional ?? ""}`).includes(sem(q))) &&
      (!sit || (sit === "pendente" ? horarioPendente(f.linha) : analises.get(f.id)?.status === sit)),
  );

  const equipe = filiais.flatMap((f) => f.equipe);
  const ativos = equipe.filter((p) => p.situacao === "ativo");
  const farm = ativos.filter((p) => p.funcao === "farmaceutico").length;
  const pendentes = filiais.filter((f) => horarioPendente(f.linha)).length;
  const contagem = (s: PreAnalise["status"]) => [...analises.values()].filter((a) => a.status === s).length;

  return (
    <>
      <PageHeader
        eyebrow="Ponto · Escala 5x2"
        titulo="Escala 5x2 das filiais"
        descricao="Horário de cada loja, equipe da escala e a pré-análise do próximo mês: se as folgas fecham com farmacêutico em todo o horário de funcionamento."
        acoes={
          <Button render={<Link href="/escalas/simulador" />} nativeButton={false}>
            <CalendarRange data-icon="inline-start" />
            Abrir o simulador
          </Button>
        }
      />
      <AbasEscala ativa="/escalas" />

      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="Filiais na escala" valor={filiais.length} icone={Store} detalhe={`${regionais.length} regionais`} />
        <Indicador
          rotulo="Pessoas na escala"
          valor={equipe.length}
          icone={Users}
          detalhe={`${ativos.length} ativos · ${equipe.filter((p) => p.situacao === "afastado").length} afastados · ${equipe.filter((p) => p.situacao === "inativo").length} inativos`}
        />
        <Indicador rotulo="Farmacêuticos ativos" valor={farm} icone={Users} detalhe="mínimo por hora definido em cada filial" />
        <Indicador rotulo="Horário pendente" valor={pendentes} icone={AlarmClock} tomValor={pendentes ? "atencao" : undefined} detalhe={pendentes ? "filiais sem horário de seg–sex" : "todas com horário"} />
      </section>

      <Painel
        titulo={`Pré-análise de ${mesCurto(ref.ano, ref.mes)}`}
        descricao="Melhor de três opções automáticas, 40 h/semana e os dias de folga de cada filial. Passe o mouse na situação para ver o motivo."
        className="mb-4"
      >
        <div className="flex flex-wrap gap-2 px-5 pb-4 text-sm">
          {(["ok", "ajustavel", "equipe", "indisponivel"] as const).map((s) => (
            <Link key={s} href={`/escalas?situacao=${s}`} className="rounded-full">
              <Status tom={TOM_PRE[s]}>
                {ROTULO_PRE[s]}: {contagem(s)}
              </Status>
            </Link>
          ))}
        </div>
      </Painel>

      <Painel titulo="Filiais" descricao={`${lista.length} de ${filiais.length} filiais`}>
        <form className="flex flex-wrap items-end gap-2 px-5 pb-3" action="/escalas">
          <label className="grid gap-1 text-xs">
            <span className="font-medium">Regional</span>
            <SelectNativo name="regional" defaultValue={regional} className="w-40">
              <option value="">Todas</option>
              {regionais.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </SelectNativo>
          </label>
          <label className="grid gap-1 text-xs">
            <span className="font-medium">Situação</span>
            <SelectNativo name="situacao" defaultValue={sit} className="w-56">
              <option value="">Todas</option>
              <option value="ok">{ROTULO_PRE.ok}</option>
              <option value="ajustavel">{ROTULO_PRE.ajustavel}</option>
              <option value="equipe">{ROTULO_PRE.equipe}</option>
              <option value="indisponivel">{ROTULO_PRE.indisponivel}</option>
              <option value="pendente">Horário pendente</option>
            </SelectNativo>
          </label>
          <label className="grid gap-1 text-xs">
            <span className="font-medium">Buscar</span>
            <Input name="q" defaultValue={q} placeholder="Código ou nome" className="w-48" />
          </label>
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
          {(regional || q || sit) && (
            <Link href="/escalas" className="px-2 py-2 text-sm text-muted-foreground underline">
              Limpar
            </Link>
          )}
        </form>
        {lista.length === 0 ? (
          <EstadoVazio icone={Store} titulo="Nenhuma filial com esses filtros" compacto />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Situação 5x2</th>
                  <th className="px-3 py-2 font-medium">Filial</th>
                  <th className="px-3 py-2 font-medium">Equipe</th>
                  <th className="px-3 py-2 font-medium">Funcionamento</th>
                  <th className="px-3 py-2 font-medium">Folgas em</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => {
                  const a = analises.get(f.id)!;
                  const at = f.equipe.filter((p) => p.situacao === "ativo");
                  return (
                    <tr key={f.id} className="border-b align-top last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <span title={a.detalhe}>
                          <Status tom={TOM_PRE[a.status]}>{a.rotulo}</Status>
                        </span>
                        {a.status === "equipe" && <p className="mt-1 max-w-64 text-xs text-muted-foreground">{a.detalhe.split(".")[0]}.</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/escalas/filial/${f.id}`} className="font-medium hover:underline">
                          {f.codigo} · {f.nome}
                        </Link>
                        <p className="text-xs text-muted-foreground">{f.regional ?? "Sem regional"}</p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {at.length} ativos
                        <p className="text-xs text-muted-foreground">
                          {at.filter((p) => p.funcao === "farmaceutico").length} farmacêutico(s) · mín. {f.config.minimos.farmaceutico ?? 0}/h
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        {horarioPendente(f.linha) ? <Status tom="atencao">Horário pendente</Status> : <span className="text-xs">{textoFuncionamento(f.config)}</span>}
                        <p className="text-xs text-muted-foreground">{modeloFilial(f.config)}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">{rotuloDias(f.config.folgasPermitidas)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <Link href={`/escalas/filial/${f.id}`} className="mr-3 text-xs font-medium hover:underline">
                          Equipe e horário
                        </Link>
                        <Link href={`/escalas/simulador?filial=${f.id}`} className="text-xs font-medium text-primary hover:underline">
                          Simular
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      {fora.length > 0 && <IncluirFilial filiais={fora} />}
      <p className="mt-3 text-xs text-muted-foreground">
        A pré-análise usa a equipe e o horário cadastrados aqui. Vermelho quer dizer que a equipe ativa não alcança o mínimo de farmacêuticos mesmo antes de otimizar folgas e turnos; amarelo, que dá para
        resolver reorganizando. Acordos coletivos, feriados e exigências do CRF não são interpretados: revise antes de publicar.
      </p>
    </>
  );
}
