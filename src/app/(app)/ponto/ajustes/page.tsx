import Link from "next/link";
import { Plus, TimerReset } from "lucide-react";
import { AvisoSucesso, SelectNativo } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirAcesso } from "@/lib/auth/session";
import { apurar, gerePonto, lerData, lerUuid, listarAjustes, listarEquipe, listarFechamentos, meuFuncionario, type AjusteLinha } from "@/lib/data/ponto";
import { formatarData, formatarDataHora } from "@/lib/formatos";
import { hojeLocal, MOTIVO_AJUSTE_LABEL, proximoTipo, TIPO_MARCACAO_LABEL, type MotivoAjuste } from "@/lib/ponto/calculo";
import type { Tom } from "@/lib/tons";
import { cn } from "@/lib/utils";
import { horaLocal } from "../_ui/marcacoes";
import { cancelarAjuste, decidirAjuste, solicitarAjuste } from "./actions";
import { DecidirAjuste } from "./decidir-form";
import { NovoAjusteForm } from "./novo-ajuste-form";

export const metadata = { title: "Ajustes de ponto" };

const STATUS: Record<AjusteLinha["status"], [string, Tom]> = {
  pendente: ["Pendente", "atencao"],
  aprovado: ["Aprovado", "sucesso"],
  recusado: ["Recusado", "perigo"],
  cancelado: ["Cancelado", "neutro"],
};

function descreverPedido(a: AjusteLinha) {
  const tipo = a.tipo_marcacao ? TIPO_MARCACAO_LABEL[a.tipo_marcacao] : "Marcação";
  if (a.acao === "incluir") return `Incluir ${tipo.toLowerCase()} às ${a.horario_solicitado ? horaLocal(a.horario_solicitado) : "?"}`;
  if (a.acao === "alterar") return `Corrigir ${tipo.toLowerCase()}: ${a.horario_original ? horaLocal(a.horario_original) : "?"} → ${a.horario_solicitado ? horaLocal(a.horario_solicitado) : "?"}`;
  return `Anular ${tipo.toLowerCase()} das ${a.horario_original ? horaLocal(a.horario_original) : "?"}`;
}

export default async function AjustesPage({ searchParams }: PageProps<"/ponto/ajustes">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto/ajustes"), searchParams]);
  const gestor = gerePonto(sessao);
  const decide = gestor && sessao.papel !== "coordenador";
  const eu = await meuFuncionario();
  const aba = sp.aba === "meus" || sp.aba === "historico" || sp.aba === "aprovar" ? sp.aba : gestor ? "aprovar" : "meus";
  const novo = sp.novo === "1";
  const hoje = hojeLocal();

  // ---------- novo pedido ----------
  let formNovo: React.ReactNode = null;
  if (novo) {
    const equipe = gestor ? await listarEquipe({ filial: sessao.papel === "gerente" ? (sessao.branchId ?? undefined) : undefined }) : [];
    const funcId = (gestor && lerUuid(sp.funcionario)) || eu?.id;
    const data = lerData(sp.data);
    const func = funcId ? (funcId === eu?.id ? eu : (equipe.find((f) => f.id === funcId) ?? (await listarEquipe({ ids: [funcId] }))[0])) : null;
    let dia = null;
    if (func && data && data <= hoje) dia = (await apurar([func], data, data))[0].dias[0];
    formNovo = (
      <Painel className="mb-4" titulo="Novo pedido de ajuste" icone={TimerReset} descricao="Escolha o dia; depois diga o que mudar e por quê. O gestor da filial aprova ou recusa; a marcação original nunca é apagada.">
        <form method="get" className="flex flex-wrap items-end gap-2 border-t px-5 py-3">
          <input type="hidden" name="novo" value="1" />
          {gestor ? (
            <SelectNativo name="funcionario" defaultValue={func?.id ?? ""} aria-label="Funcionário" className="w-auto min-w-64">
              <option value="" disabled>
                Funcionário…
              </option>
              {eu && <option value={eu.id}>{eu.nome} (eu)</option>}
              {equipe
                .filter((f) => f.id !== eu?.id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome} · {f.filialCodigo}
                  </option>
                ))}
            </SelectNativo>
          ) : (
            <p className="self-center text-sm font-medium">{eu?.nome ?? "Seu usuário não está ligado a um funcionário"}</p>
          )}
          <Input type="date" name="data" defaultValue={data ?? ""} max={hoje} aria-label="Dia" className="h-9 w-44" />
          <Button type="submit" variant="outline">
            Ver o dia
          </Button>
        </form>
        {func && dia ? (
          <>
            <p className="border-t px-5 py-2 text-sm text-muted-foreground">
              {func.nome} · {formatarData(dia.data)}: {dia.marcacoes.length ? dia.marcacoes.map((m) => `${horaLocal(m.momento)} ${TIPO_MARCACAO_LABEL[m.tipo].toLowerCase()}`).join(" · ") : "nenhuma marcação"}
            </p>
            <NovoAjusteForm
              action={solicitarAjuste}
              employeeId={func.id}
              data={dia.data}
              marcacoes={dia.marcacoes.map((m) => ({ id: m.id, hora: horaLocal(m.momento), tipo: m.tipo, metodo: m.metodo }))}
              sugestaoTipo={proximoTipo(dia.marcacoes.length)}
              podeExtra={sessao.papel === "admin" || sessao.papel === "rh"}
            />
          </>
        ) : (
          data && data > hoje && <p className="border-t px-5 py-3 text-sm text-destructive">Escolha um dia até hoje.</p>
        )}
      </Painel>
    );
  }

  // ---------- listas ----------
  const [pendentes, meus, historico] = await Promise.all([
    decide ? listarAjustes({ status: "pendente" }) : Promise.resolve([]),
    listarAjustes({ meus: true, limite: 100 }),
    gestor && aba === "historico" ? listarAjustes({ limite: 300 }) : Promise.resolve([]),
  ]);
  const paraAprovar = pendentes.filter((a) => a.solicitado_por !== sessao.id && a.employee_id !== eu?.id);
  const meses = [...new Set(paraAprovar.map((a) => `${a.data.slice(0, 7)}-01`))];
  const fechados = new Set((meses.length ? await listarFechamentos(meses) : []).filter((f) => f.status === "fechado").map((f) => `${f.branch_id}|${f.competencia}`));
  const lista = aba === "aprovar" ? paraAprovar : aba === "meus" ? meus : historico.filter((a) => a.status !== "pendente");
  const ok = sp.ok === "enviado" ? "Pedido enviado. O gestor da filial vai aprovar ou recusar; você acompanha aqui." : null;

  const abas = [
    ...(decide ? [{ v: "aprovar", r: `Para aprovar (${paraAprovar.length})` }] : []),
    { v: "meus", r: "Meus pedidos" },
    ...(gestor ? [{ v: "historico", r: "Histórico da equipe" }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo="Ajustes de ponto"
        descricao="Correção de marcação com motivo e aprovação do gestor. Tudo fica registrado: quem pediu, quem decidiu, quando e o horário antes e depois."
        acoes={
          !novo && (
            <Button nativeButton={false} render={<Link href="/ponto/ajustes?novo=1" />}>
              <Plus aria-hidden /> Novo pedido
            </Button>
          )
        }
      />
      {ok && (
        <div className="mb-4">
          <AvisoSucesso mensagem={ok} />
        </div>
      )}
      {formNovo}

      <nav aria-label="Listas" className="mb-3 flex flex-wrap gap-2">
        {abas.map((a) => (
          <Link
            key={a.v}
            href={`/ponto/ajustes?aba=${a.v}`}
            aria-current={aba === a.v ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm transition-colors", aba === a.v ? "border-fct-tinta bg-fct-tinta/10 font-medium text-fct-tinta" : "text-muted-foreground hover:bg-muted")}
          >
            {a.r}
          </Link>
        ))}
      </nav>

      <Painel>
        {lista.length === 0 ? (
          <EstadoVazio
            icone={TimerReset}
            titulo={aba === "aprovar" ? "Nenhum pedido esperando você" : aba === "meus" ? "Você não fez pedidos de ajuste" : "Nenhum pedido decidido"}
            descricao={aba === "meus" ? "Esqueceu de marcar? Use “Novo pedido” ou o link “Ajustar” no espelho." : undefined}
            compacto
          />
        ) : (
          <ul>
            {lista.map((a) => {
              const [rotulo, tom] = STATUS[a.status];
              const mesFechado = fechados.has(`${a.branch_id}|${a.data.slice(0, 7)}-01`);
              return (
                <li key={a.id} className="grid gap-3 border-b px-5 py-3 last:border-0 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.funcionario}</span>
                      <span className="text-xs text-muted-foreground">{a.filial}</span>
                      <Status tom={tom}>{rotulo}</Status>
                      {mesFechado && a.status === "pendente" && <Status tom="info">Mês fechado</Status>}
                    </p>
                    <p className="text-sm">
                      <Link href={`/ponto/espelho?funcionario=${a.employee_id}&mes=${a.data.slice(0, 7)}`} className="tabular-nums hover:underline">
                        {formatarData(a.data)}
                      </Link>{" "}
                      · {descreverPedido(a)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {MOTIVO_AJUSTE_LABEL[a.motivo_tipo as MotivoAjuste] ?? a.motivo_tipo}: “{a.motivo}” · pedido {a.solicitante ? `por ${a.solicitante} ` : ""}em {formatarDataHora(a.solicitado_em)}
                    </p>
                    {a.decidido_em && a.status !== "cancelado" && (
                      <p className="text-xs text-muted-foreground">
                        {rotulo} {a.decisor ? `por ${a.decisor} ` : ""}em {formatarDataHora(a.decidido_em)}
                        {a.resposta ? `: “${a.resposta}”` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    {aba === "aprovar" && a.status === "pendente" && (sessao.papel === "admin" || !mesFechado) && (
                      <DecidirAjuste action={decidirAjuste} id={a.id} resumo={`${a.funcionario} · ${formatarData(a.data)} · ${descreverPedido(a)}`} mesFechado={mesFechado} />
                    )}
                    {aba === "meus" && a.status === "pendente" && a.solicitado_por === sessao.id && (
                      <ConfirmarAcao titulo="Cancelar pedido?" descricao="O pedido sai da fila do gestor. Você pode pedir de novo depois." rotuloBotao="Cancelar pedido" rotuloConfirmar="Cancelar pedido" action={cancelarAjuste} campos={{ id: a.id }} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Painel>
    </>
  );
}
