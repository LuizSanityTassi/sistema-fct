// Central de pendências (servidor): o que precisa de ação agora, reunido de todos os módulos.
// Cada contagem passa pela RLS do banco (cada papel só conta o que pode ver) e cada item só aparece para quem pode
// abrir a tela de destino (mesma regra do menu). O link já leva para a tela filtrada.
import type { Sessao } from "@/lib/auth/session";
import { filtroSlaEstourado } from "@/lib/chamados/sla";
import { CHAVE_LEMBRETE_DRE, lerLembreteDre, mesesAtrasadosDre } from "@/lib/financeiro/dre-lembrete";
import { podeAcessar } from "@/lib/nav";
import { competenciaAtual, rotuloCompetencia } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";

export type Severidade = "critico" | "alto" | "atencao" | "info";
export type AreaPendencia = "Caixa" | "Conciliação" | "DRE" | "Folha" | "RH" | "Chamados" | "Denúncias" | "Acessos";

export type Pendencia = {
  id: string;
  severidade: Severidade;
  area: AreaPendencia;
  titulo: string;
  detalhe?: string;
  quantidade: number;
  href: string;
  /** Depende de uma ação da própria pessoa (é dela, não só do setor). */
  minha?: boolean;
};

export const ORDEM_SEVERIDADE: Severidade[] = ["critico", "alto", "atencao", "info"];

const DIA = 86_400_000;
const isoBrasil = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export async function carregarPendencias(sessao: Sessao): Promise<Pendencia[]> {
  const supabase = await createClient();
  const agora = Date.now();
  const hoje = isoBrasil(agora);
  const ontem = isoBrasil(agora - DIA);
  const em3dias = isoBrasil(agora + 3 * DIA);
  const ha5dias = new Date(agora - 5 * DIA).toISOString();
  const ha7dias = isoBrasil(agora - 7 * DIA);
  const ha120dias = isoBrasil(agora - 120 * DIA);
  const em30dias = isoBrasil(agora + 30 * DIA);
  const comp = competenciaAtual();
  const compAnterior = (() => {
    const [a, m] = comp.split("-").map(Number);
    return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  })();
  const pode = (rota: string) => podeAcessar(sessao.papel, rota);
  const financeiro = sessao.papel === "admin" || sessao.papel === "financeiro";
  const out: Pendencia[] = [];
  const contar = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const r = await q;
    return r.error ? 0 : (r.count ?? 0);
  };
  const quebras = () => supabase.from("caixa_diferencas").select("id", { count: "exact", head: true }).eq("classe", "quebra");
  const caixa = (extra: Record<string, string>) => `/financeiro/diferenca-caixa?${new URLSearchParams({ de: ha120dias, ate: hoje, ...extra })}`;

  const tarefas: Promise<void>[] = [];

  // ---------- Caixa ----------
  if (financeiro && pode("/financeiro/diferenca-caixa")) {
    tarefas.push(
      (async () => {
        const [paraDecidir, aguardando, atrasadas, semFuncionario, abertasSemGestor, ontemLido, errosColeta] = await Promise.all([
          contar(quebras().eq("andamento", "justificada")),
          contar(quebras().eq("andamento", "pendente")),
          contar(quebras().eq("andamento", "pendente").lt("coletado_em", ha5dias)),
          contar(quebras().in("andamento", ["pendente", "justificada"]).is("employee_id", null)),
          contar(quebras().in("andamento", ["pendente", "justificada"]).is("gestor_id", null)),
          contar(supabase.from("caixa_coletas").select("dia", { count: "exact", head: true }).eq("dia", ontem)),
          contar(supabase.from("caixa_coletas").select("dia", { count: "exact", head: true }).eq("status", "erro").gte("dia", ha7dias)),
        ]);
        if (paraDecidir)
          out.push({
            id: "caixa-decidir",
            severidade: "alto",
            area: "Caixa",
            quantidade: paraDecidir,
            minha: true,
            href: caixa({ situacao: "justificada" }),
            titulo: `${paraDecidir} ${plural(paraDecidir, "quebra justificada esperando", "quebras justificadas esperando")} a sua decisão`,
            detalhe: "Manter o desconto na folha ou abonar.",
          });
        if (semFuncionario)
          out.push({
            id: "caixa-sem-funcionario",
            severidade: "alto",
            area: "Caixa",
            quantidade: semFuncionario,
            href: "/financeiro/diferenca-caixa/operadores?mostrar=sem",
            titulo: `${semFuncionario} ${plural(semFuncionario, "quebra sem funcionário ligado", "quebras sem funcionário ligado")}`,
            detalhe: "Não entram na folha até ligar o operador do Trier ao cadastro.",
          });
        if (abertasSemGestor)
          out.push({
            id: "caixa-sem-gestor",
            severidade: "alto",
            area: "Caixa",
            quantidade: abertasSemGestor,
            href: "/financeiro/diferenca-caixa/gestores",
            titulo: `${abertasSemGestor} ${plural(abertasSemGestor, "quebra em aberto sem gestor", "quebras em aberto sem gestor")}`,
            detalhe: "Escolha o gestor da loja para alguém justificar.",
          });
        if (atrasadas)
          out.push({
            id: "caixa-atrasadas",
            severidade: "alto",
            area: "Caixa",
            quantidade: atrasadas,
            href: caixa({ situacao: "pendente" }),
            titulo: `${atrasadas} ${plural(atrasadas, "quebra parada", "quebras paradas")} há mais de 5 dias sem justificativa`,
            detalhe: "Cobre o gestor da loja antes do fechamento da folha.",
          });
        else if (aguardando)
          out.push({
            id: "caixa-aguardando",
            severidade: "atencao",
            area: "Caixa",
            quantidade: aguardando,
            href: caixa({ situacao: "pendente" }),
            titulo: `${aguardando} ${plural(aguardando, "quebra aguardando", "quebras aguardando")} justificativa do gestor`,
          });
        if (!ontemLido)
          out.push({
            id: "caixa-ontem",
            severidade: "atencao",
            area: "Caixa",
            quantidade: 1,
            minha: true,
            href: "/financeiro/diferenca-caixa",
            titulo: "Os caixas de ontem ainda não foram buscados no Trier",
            detalhe: "Use “Buscar do Trier” com o dia de ontem.",
          });
        if (errosColeta)
          out.push({
            id: "caixa-erros",
            severidade: "atencao",
            area: "Caixa",
            quantidade: errosColeta,
            href: "/financeiro/diferenca-caixa",
            titulo: `${errosColeta} ${plural(errosColeta, "loja com erro", "lojas com erro")} na busca do Trier (últimos 7 dias)`,
            detalhe: "Busque de novo marcando “buscar de novo”.",
          });
      })(),
    );
  } else if (sessao.papel === "coordenador") {
    // coordenador de vendas: acompanha as quebras da regional (quem justifica é o gestor de cada loja)
    tarefas.push(
      (async () => {
        const n = await contar(quebras().eq("andamento", "pendente"));
        if (n)
          out.push({
            id: "caixa-regional",
            severidade: "atencao",
            area: "Caixa",
            quantidade: n,
            minha: false,
            href: "/caixa",
            titulo: `${n} ${plural(n, "quebra de caixa", "quebras de caixa")} sem justificativa na regional`,
            detalhe: "Cobre os gestores das lojas: a justificativa precisa estar registrada antes do fechamento da folha.",
          });
      })(),
    );
  } else if (pode("/caixa")) {
    // gestor (justifica) ou colaborador (só vê a dele)
    tarefas.push(
      (async () => {
        const comoGestor = await contar(
          sessao.papel === "gerente" ? quebras().eq("andamento", "pendente").or(`gestor_id.eq.${sessao.id},gestor_id.is.null`) : quebras().eq("andamento", "pendente").eq("gestor_id", sessao.id),
        );
        if (comoGestor) {
          out.push({
            id: "caixa-justificar",
            severidade: "alto",
            area: "Caixa",
            quantidade: comoGestor,
            minha: true,
            href: "/caixa",
            titulo: `${comoGestor} ${plural(comoGestor, "quebra de caixa", "quebras de caixa")} para você justificar`,
            detalhe: "Registre o que aconteceu antes do fechamento da folha.",
          });
          return;
        }
        const minhas = await contar(quebras().eq("andamento", "pendente"));
        if (minhas)
          out.push({
            id: "caixa-minhas",
            severidade: "info",
            area: "Caixa",
            quantidade: minhas,
            minha: true,
            href: "/caixa",
            titulo: `Você tem ${minhas} ${plural(minhas, "quebra de caixa", "quebras de caixa")}`,
            detalhe: "Justifique para o seu gestor: é ele quem registra no sistema.",
          });
      })(),
    );
  }

  // ---------- Conciliação ----------
  if (pode("/conciliacao/pendencias")) {
    tarefas.push(
      (async () => {
        const abertas = () => supabase.from("conc_pendencias").select("chave", { count: "exact", head: true }).in("status", ["pendente", "em_analise"]);
        const [vencidas, aVencer, minhas, total] = await Promise.all([
          contar(abertas().lt("vencimento", hoje)),
          contar(abertas().gte("vencimento", hoje).lte("vencimento", em3dias)),
          contar(abertas().eq("responsavel", sessao.id)),
          contar(abertas()),
        ]);
        if (vencidas)
          out.push({
            id: "conc-vencidas",
            severidade: "critico",
            area: "Conciliação",
            quantidade: vencidas,
            href: "/conciliacao/pendencias?ordem=vencimento",
            titulo: `${vencidas} ${plural(vencidas, "pendência de conciliação vencida", "pendências de conciliação vencidas")}`,
            detalhe: `${total} em aberto no total.`,
          });
        if (aVencer)
          out.push({
            id: "conc-a-vencer",
            severidade: "alto",
            area: "Conciliação",
            quantidade: aVencer,
            href: "/conciliacao/pendencias?ordem=vencimento",
            titulo: `${aVencer} ${plural(aVencer, "pendência vence", "pendências vencem")} em até 3 dias`,
          });
        if (minhas)
          out.push({
            id: "conc-minhas",
            severidade: "alto",
            area: "Conciliação",
            quantidade: minhas,
            minha: true,
            href: `/conciliacao/pendencias?responsavel=${sessao.id}`,
            titulo: `${minhas} ${plural(minhas, "pendência atribuída", "pendências atribuídas")} a você`,
          });
        if (!vencidas && !aVencer && total)
          out.push({
            id: "conc-abertas",
            severidade: "atencao",
            area: "Conciliação",
            quantidade: total,
            href: "/conciliacao/pendencias",
            titulo: `${total} ${plural(total, "pendência de conciliação", "pendências de conciliação")} em aberto`,
          });
      })(),
    );
  }

  // ---------- Folha (lançamentos para a contabilidade) ----------
  if (pode("/rh/lancamentos")) {
    tarefas.push(
      (async () => {
        const [obsAtual, obsAnterior] = await Promise.all([
          contar(supabase.from("folha_observacoes").select("employee_id", { count: "exact", head: true }).eq("pendente", true).eq("competencia", `${comp}-01`)),
          contar(supabase.from("folha_observacoes").select("employee_id", { count: "exact", head: true }).eq("pendente", true).eq("competencia", `${compAnterior}-01`)),
        ]);
        if (obsAnterior)
          out.push({
            id: "folha-obs-anterior",
            severidade: "alto",
            area: "Folha",
            quantidade: obsAnterior,
            href: `/rh/lancamentos?competencia=${compAnterior}&so=pendentes`,
            titulo: `${obsAnterior} ${plural(obsAnterior, "observação pendente", "observações pendentes")} na folha do mês passado`,
            detalhe: "Resolva ou desmarque “pendente” antes de mandar para a contabilidade.",
          });
        if (obsAtual)
          out.push({
            id: "folha-obs-atual",
            severidade: "atencao",
            area: "Folha",
            quantidade: obsAtual,
            href: `/rh/lancamentos?competencia=${comp}&so=pendentes`,
            titulo: `${obsAtual} ${plural(obsAtual, "observação pendente", "observações pendentes")} na folha deste mês`,
          });
      })(),
    );
  }

  // ---------- RH: ASO ----------
  if (pode("/rh/aso")) {
    tarefas.push(
      (async () => {
        const aso = () => supabase.from("employee_aso").select("id, employees!inner(status)", { count: "exact", head: true }).eq("ativo", true).neq("employees.status", "desligado");
        const [vencidos, vencendo] = await Promise.all([contar(aso().lt("data_validade", hoje)), contar(aso().gte("data_validade", hoje).lte("data_validade", em30dias))]);
        if (vencidos)
          out.push({
            id: "aso-vencidos",
            severidade: "critico",
            area: "RH",
            quantidade: vencidos,
            href: "/rh/aso?situacao=vencidos",
            titulo: `${vencidos} ${plural(vencidos, "ASO vencido", "ASOs vencidos")}`,
          });
        if (vencendo)
          out.push({
            id: "aso-vencendo",
            severidade: "atencao",
            area: "RH",
            quantidade: vencendo,
            href: "/rh/aso?situacao=proximos",
            titulo: `${vencendo} ${plural(vencendo, "ASO vence", "ASOs vencem")} nos próximos 30 dias`,
          });
      })(),
    );
  }

  // ---------- Chamados ----------
  if (pode("/chamados")) {
    tarefas.push(
      (async () => {
        const abertos = () => supabase.from("tickets").select("id", { count: "exact", head: true }).not("status", "in", "(resolvido,cancelado)");
        const atende = ["admin", "ti", "rh", "financeiro", "manutencao", "compras", "marketing"].includes(sessao.papel);
        const [slaEstourado, criticos, semResponsavel, aguardandoMim, meusAtendimentos] = await Promise.all([
          atende ? contar(abertos().is("primeira_resposta_em", null).or(filtroSlaEstourado())) : Promise.resolve(0),
          contar(abertos().eq("prioridade", "critica")),
          atende ? contar(abertos().is("responsavel", null)) : Promise.resolve(0),
          contar(abertos().eq("status", "aguardando_usuario").eq("solicitante", sessao.id)),
          contar(abertos().eq("responsavel", sessao.id)),
        ]);
        if (slaEstourado)
          out.push({
            id: "chamados-sla",
            severidade: "critico",
            area: "Chamados",
            quantidade: slaEstourado,
            href: "/chamados?sla=estourado",
            titulo: `${slaEstourado} ${plural(slaEstourado, "chamado com SLA estourado", "chamados com SLA estourado")}`,
            detalhe: "Passou do prazo de primeira resposta e ninguém respondeu.",
          });
        if (criticos)
          out.push({
            id: "chamados-criticos",
            severidade: "critico",
            area: "Chamados",
            quantidade: criticos,
            href: "/chamados?prioridade=critica",
            titulo: `${criticos} ${plural(criticos, "chamado crítico", "chamados críticos")} em aberto`,
          });
        if (aguardandoMim)
          out.push({
            id: "chamados-aguardando",
            severidade: "alto",
            area: "Chamados",
            quantidade: aguardandoMim,
            minha: true,
            href: "/chamados?status=aguardando_usuario&visao=meus",
            titulo: `${aguardandoMim} ${plural(aguardandoMim, "chamado seu espera", "chamados seus esperam")} uma resposta sua`,
          });
        if (semResponsavel)
          out.push({
            id: "chamados-sem-responsavel",
            severidade: "alto",
            area: "Chamados",
            quantidade: semResponsavel,
            href: "/chamados?status=aberto",
            titulo: `${semResponsavel} ${plural(semResponsavel, "chamado sem responsável", "chamados sem responsável")}`,
          });
        if (meusAtendimentos)
          out.push({
            id: "chamados-meus",
            severidade: "atencao",
            area: "Chamados",
            quantidade: meusAtendimentos,
            minha: true,
            href: "/chamados?visao=atendo",
            titulo: `${meusAtendimentos} ${plural(meusAtendimentos, "chamado em atendimento", "chamados em atendimento")} com você`,
          });
      })(),
    );
  }

  // ---------- Sangrias a conferir (financeiro) ----------
  if (financeiro) {
    tarefas.push(
      (async () => {
        const aConferir = await contar(supabase.from("caixa_sangrias").select("id", { count: "exact", head: true }).eq("situacao", "pendente"));
        if (aConferir)
          out.push({
            id: "sangrias-conferir",
            severidade: "atencao",
            area: "Caixa",
            quantidade: aConferir,
            minha: true,
            href: `/financeiro/sangrias?situacao=pendente&de=${ha120dias}`,
            titulo: `${aConferir} ${plural(aConferir, "sangria a conferir", "sangrias a conferir")} com o extrato`,
          });
      })(),
    );
  }

  // ---------- DRE do contador que já devia ter chegado (quem importa: admin, financeiro, contador) ----------
  if (pode("/financeiro/dre") && (financeiro || sessao.papel === "contador")) {
    tarefas.push(
      (async () => {
        const [{ data: cfg }, { data: importacoes }] = await Promise.all([
          supabase.from("sistema_config").select("valor").eq("chave", CHAVE_LEMBRETE_DRE).maybeSingle(),
          supabase.from("dre_contabil_importacoes").select("empresa, meses"),
        ]);
        const config = lerLembreteDre(cfg?.valor);
        const porEmpresa = new Map<string, string[]>();
        for (const i of importacoes ?? []) porEmpresa.set(i.empresa, [...(porEmpresa.get(i.empresa) ?? []), ...i.meses.map((m) => m.slice(0, 7))]);
        for (const [empresa, meses] of porEmpresa) {
          const faltam = mesesAtrasadosDre(meses, hoje, config);
          if (!faltam.length) continue;
          const nomes = faltam.length > 2 ? `${rotuloCompetencia(faltam[0])} a ${rotuloCompetencia(faltam.at(-1)!)}` : faltam.map(rotuloCompetencia).join(" e ");
          out.push({
            id: `dre-${empresa}`,
            severidade: faltam.length > 1 ? "alto" : "atencao",
            area: "DRE",
            quantidade: faltam.length,
            minha: true,
            href: "/financeiro/dre/importar",
            titulo: `DRE de ${nomes} da ${empresa} ainda não importada${faltam.length > 1 ? "s" : ""}`,
            detalhe: `Importe a planilha “DRE POR FILIAIS” que o contador manda (lembrete a partir do dia ${config.dia}).`,
          });
        }
      })(),
    );
  }

  // ---------- Pedidos de acesso (administrador) ----------
  if (sessao.papel === "admin") {
    tarefas.push(
      (async () => {
        const pedidos = await contar(supabase.from("acesso_solicitacoes").select("id", { count: "exact", head: true }).eq("status", "pendente"));
        if (pedidos)
          out.push({
            id: "acessos-pedidos",
            severidade: "alto",
            area: "Acessos",
            quantidade: pedidos,
            minha: true,
            href: "/configuracoes/acessos",
            titulo: `${pedidos} ${plural(pedidos, "pedido de acesso esperando", "pedidos de acesso esperando")} a sua resposta`,
          });
      })(),
    );
  }

  // ---------- Denúncias (só o comitê) ----------
  tarefas.push(
    (async () => {
      const { data: comite } = await supabase.from("denuncia_responsaveis").select("user_id").eq("user_id", sessao.id).maybeSingle();
      if (!comite) return;
      const novas = await contar(supabase.from("denuncias").select("id", { count: "exact", head: true }).eq("status", "recebida"));
      if (novas)
        out.push({
          id: "denuncias-novas",
          severidade: "alto",
          area: "Denúncias",
          quantidade: novas,
          minha: true,
          href: "/denuncias/recebidas",
          titulo: `${novas} ${plural(novas, "denúncia nova", "denúncias novas")} para o comitê analisar`,
        });
    })(),
  );

  await Promise.all(tarefas);
  return out.sort((a, b) => ORDEM_SEVERIDADE.indexOf(a.severidade) - ORDEM_SEVERIDADE.indexOf(b.severidade) || Number(!!b.minha) - Number(!!a.minha) || b.quantidade - a.quantidade);
}
