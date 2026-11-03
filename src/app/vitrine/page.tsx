// Vitrine dos componentes com dados fictícios, só no ambiente local (em produção responde 404 e nem é rota pública).
// Serve para conferir visual e acessibilidade sem precisar de login.
import { notFound } from "next/navigation";
import { Banknote, CalendarX2, Download, Plus, Scale, Search, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { BoasVindas } from "@/components/layout/boas-vindas";
import { TabelaFiliais } from "@/app/(app)/dashboard/desempenho-filiais";
import { ListaPrioridades, NiveisPrioridade, resumirNiveis } from "@/app/(app)/dashboard/prioridades";
import { ResumoExecutivo } from "@/app/(app)/dashboard/resumo-executivo";
import type { LinhaFilialOperacao } from "@/lib/data/dashboard-filiais";
import type { Pendencia } from "@/lib/data/pendencias";
import { BadgeAtivo, BadgeStatusFuncionario } from "@/components/layout/badge-status";
import { BarrasDuplas, ColunasResultado } from "@/components/graficos";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Indicador, LinkPainel, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Esqueleto } from "@/components/ui/skeleton";
import { Paginacao } from "@/components/layout/paginacao";
import { AvisoAtencao, AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnexosQuebra } from "@/app/(app)/caixa/anexos-quebra";
import { ChamadoForm } from "@/app/(app)/chamados/chamado-form";
import { SangriaForm } from "@/app/(app)/sangrias/nova/sangria-form";
import { ConferenciaLista } from "@/app/(app)/financeiro/sangrias/conferencia-lista";
import { ExcluirUsuario } from "@/app/(app)/configuracoes/usuarios/[id]/editar/excluir-usuario";
import type { EstadoChamado } from "@/app/(app)/chamados/actions";
import { assuntoAviso, htmlAviso, type Destinatario } from "@/lib/caixa/avisos-email";
import { JustificativaForm } from "@/app/(app)/caixa/justificativa-form";
import { ImportarPosForm } from "@/app/(app)/financeiro/diferenca-caixa/importar/importar-form";
import type { EstadoPos } from "@/app/(app)/financeiro/diferenca-caixa/importar/actions";

export const metadata = { title: "Vitrine" };

// dados fictícios do painel geral
const PENDENCIAS_VITRINE: Pendencia[] = [
  { id: "a", severidade: "critico", area: "Conciliação", quantidade: 231, prazo: "vencido", total: 1078, href: "#t-botoes", titulo: "231 pendências de conciliação vencidas", detalhe: "1078 em aberto no total." },
  { id: "b", severidade: "alto", area: "Caixa", quantidade: 512, href: "#t-botoes", titulo: "512 quebras paradas há mais de 5 dias sem justificativa", detalhe: "Cobre o gestor da loja antes do fechamento da folha." },
  { id: "c", severidade: "alto", area: "Conciliação", quantidade: 18, prazo: "vencendo", href: "#t-botoes", titulo: "18 pendências vencem em até 3 dias" },
  { id: "d", severidade: "atencao", area: "Caixa", quantidade: 4, minha: true, href: "#t-botoes", titulo: "4 sangrias a conferir com o extrato" },
];
const filialVitrine = (codigo: string, nome: string, regional: string, status: LinhaFilialOperacao["status"], quebrasValor: number, quebrasAbertas: number, concVencidas: number, concPct: number | null, pendencias: string[]): LinhaFilialOperacao => ({
  id: codigo,
  codigo,
  nome,
  regional,
  status,
  pendencias,
  quebrasTotal: quebrasAbertas,
  quebrasAbertas,
  quebrasParadas: quebrasAbertas,
  quebrasValor,
  concAbertas: concVencidas,
  concVencidas,
  concPct,
  chamados: 0,
  asoVencidos: 0,
  pctRitmo: null,
});
const FILIAIS_VITRINE = [
  filialVitrine("F001", "LOJA MATRIZ", "Sul", "critica", 1340, 18, 96, 2.1, ["96 conciliações vencidas", "12 quebras paradas há +5 dias"]),
  filialVitrine("F301", "LOJA OESTE", "Oeste", "critica", 528, 10, 80, 90.3, ["80 conciliações vencidas", "7 quebras paradas há +5 dias"]),
  filialVitrine("F106", "LOJA SERRA", "Serra", "atencao", 415, 12, 0, null, ["8 quebras paradas há +5 dias"]),
  filialVitrine("F204", "LOJA EM DIA", "Sul", "em_dia", 0, 0, 0, null, []),
];

const PESSOAS = [
  { nome: "Maria Exemplo da Silva", cargo: "Atendente", filial: "F101", status: "ativo", salario: "R$ 2.150,00" },
  { nome: "João Fictício Souza", cargo: "Farmacêutico", filial: "F112", status: "ferias", salario: "R$ 4.380,00" },
  { nome: "Ana Teste Pereira", cargo: "Gerente", filial: "F301", status: "afastado", salario: "R$ 5.900,00" },
  { nome: "Carlos Modelo Lima", cargo: "Estoquista", filial: "F002", status: "desligado", salario: "R$ 1.980,00" },
];

const EMAIL_EXEMPLO: Destinatario = {
  chave: "maria@exemplo.local",
  profileId: "exemplo",
  nome: "Maria Exemplo da Silva",
  email: "maria@exemplo.local",
  temAcesso: true,
  total: 103.28,
  minhas: [{ id: "4", loja: "F002", lojaNome: "Centro", dia: "2026-10-16", caixa: 4690, operador: "MARIA EXEMPLO", diferenca: 9.5, valor: 9.5, manual: false, diasAberta: 3, quemJustifica: "Carla" }],
  totalMinhas: 9.5,
  quebras: [
    { id: "1", loja: "F002", lojaNome: "Centro", dia: "2026-10-14", caixa: 4667, operador: "ADILSON EXEMPLO", diferenca: 68.1, valor: 68.1, manual: false, diasAberta: 5 },
    { id: "2", loja: "F002", lojaNome: "Centro", dia: "2026-10-17", caixa: 4702, operador: "JOANA TESTE", diferenca: -12.4, valor: 12.4, manual: false, diasAberta: 2 },
    { id: "3", loja: "F108", lojaNome: "Bairro", dia: "2026-10-18", caixa: null, operador: "CARLOS MODELO", diferenca: 22.78, valor: 22.78, manual: true, diasAberta: 1 },
  ],
};

export default function VitrinePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  async function sair() {
    "use server";
  }
  async function conferirSangriasExemplo(): Promise<{ erro?: string; ok?: string }> {
    "use server";
    return { ok: "Exemplo: nada foi conferido." };
  }
  async function excluirExemplo(): Promise<{ erro?: string }> {
    "use server";
    return { erro: "Exemplo: nada foi excluído." };
  }
  async function abrirExemplo(): Promise<EstadoChamado> {
    "use server";
    return { erro: "Exemplo: nada foi gravado." };
  }
  async function justificarExemplo(): Promise<{ ok: string }> {
    "use server";
    return { ok: "Exemplo: nada foi gravado." };
  }
  async function conferirExemplo(): Promise<EstadoPos> {
    "use server";
    const base = { aba: "Varela", pagamento: "Cartão POS", status: "LANÇADO", branchId: "b", pelaNome: false, folhaTravada: false, codTrier: 1 };
    const f = (nome: string, cargo: string) => ({ id: nome, nome, cargo, filial: "F108" });
    return {
      nomeArquivo: "POS Folha de Quebra de Caixa (exemplo).xlsx",
      previa: {
        corte: "2026-10-20",
        competencia: "2026-10",
        abas: ["Varela", "Nazário"],
        linhas: [
          { ...base, linha: 3, filial: "F001", dia: "2026-10-17", venda: "172047", valor: 80, vendedor: 2163, nome: "MARIA EXEMPLO", chave: "a", situacao: "lancar", funcionario: f("MARIA EXEMPLO DA SILVA", "BALCONISTA") },
          { ...base, linha: 4, filial: "F108", dia: "2026-10-18", venda: "87099", valor: 22.78, vendedor: 2274, nome: "JOAO TESTE", chave: "b", situacao: "lancar", folhaTravada: true, funcionario: f("JOAO TESTE SOUZA", "ATENDENTE") },
          { ...base, linha: 5, filial: "F015", dia: "2026-10-02", venda: "67446", valor: 6.99, vendedor: 56799, nome: "ANA MODELO", chave: "c", situacao: "lancar", pelaNome: true, codTrier: null, funcionario: f("ANA MODELO PEREIRA", "ATENDENTE") },
          { ...base, linha: 6, filial: "F306", dia: "2026-10-09", venda: "219844", valor: 128.93, vendedor: 56299, nome: "CARLA FARMA", chave: "d", situacao: "farmaceutico", funcionario: f("CARLA FARMA LIMA", "FARMACEUTICO (A)") },
          { ...base, linha: 7, filial: "F305", dia: "2026-10-04", venda: "289627", valor: 8, vendedor: 99999, nome: "SEM CADASTRO", chave: "e", situacao: "sem_funcionario", funcionario: null },
          { ...base, linha: 8, filial: "F304", dia: "2026-09-25", venda: "107751", valor: 37, vendedor: 56195, nome: "PEDRO EXEMPLO", chave: "g", situacao: "duplicada", funcionario: f("PEDRO EXEMPLO", "ATENDENTE") },
        ],
      },
    };
  }
  async function lancarExemplo(): Promise<EstadoPos> {
    "use server";
    return { resultado: { lote: "x", lancadas: 3, valor: 109.77, ignoradas: 3 } };
  }
  const ANEXOS = [
    { id: "00000000-0000-0000-0000-000000000001", diferenca_id: "x", nome: "cupom-sangria.jpg", mime: "image/jpeg", tamanho: 2_340_000, enviado_por: "eu", enviado_por_nome: "Gerente de Exemplo", criado_em: "2026-10-16T14:05:00Z" },
    { id: "00000000-0000-0000-0000-000000000002", diferenca_id: "x", nome: "conferencia-caixa-4708.pdf", mime: "application/pdf", tamanho: 180_000, enviado_por: "outro", enviado_por_nome: "Financeiro", criado_em: "2026-10-16T15:20:00Z" },
  ];
  return (
    <AppShell usuario={{ nome: "Usuária de Exemplo", email: "exemplo@fct.local", papel: "admin" }} onSair={sair}>
      <BoasVindas data="Sexta-feira, 16 de outubro" titulo="Olá, Usuária" situacao={{ tom: "perigo", rotulo: "Exige ação", texto: "20 filiais críticas · 231 pendências vencidas" }}>
        Administrador · números de todas as unidades
      </BoasVindas>
      <ResumoExecutivo
        atualizadoAs="14:32"
        filiais={{ contagem: { total: 44, critica: 20, atencao: 22, em_dia: 2 }, meta: "Nenhuma filial com meta de venda em novembro." }}
        metricas={[
          { chave: "q", rotulo: "Quebras em aberto", icone: Banknote, valor: "R$ 44.131", contexto: "782 quebras · 99,7% do total", variacao: { texto: "8%", direcao: "sobe", tom: "perigo" }, comparado: "novas em novembro: R$ 2.325", href: "#t-botoes" },
          { chave: "c", rotulo: "Conciliação", icone: Scale, valor: "28,8%", tom: "perigo", contexto: "Varela 2,1% (29/10) · Nazário 90,3% (14/10)", variacao: { texto: "0,1 p.p.", direcao: "desce", tom: "perigo" }, comparado: "vs. as conciliações anteriores", href: "#t-botoes" },
          { chave: "v", rotulo: "Pendências vencidas", icone: CalendarX2, valor: "231", tom: "perigo", contexto: "21,4% das 1.078 de conciliação em aberto", href: "#t-botoes" },
        ]}
      />
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Painel id="v-prioridades" titulo={<span className="text-base">Central de prioridades</span>} descricao="O que precisa da sua atenção. Clique em um nível para abrir a lista filtrada." acao={<LinkPainel href="#t-botoes">Ver todas (4)</LinkPainel>} className="lg:col-span-2">
          <NiveisPrioridade resumo={resumirNiveis(PENDENCIAS_VITRINE, [{ area: "Caixa" }, { area: "Conciliação" }, { area: "Folha" }, { area: "Chamados" }, { area: "Ponto" }])} className="px-5 pb-4" />
          <ListaPrioridades pendencias={PENDENCIAS_VITRINE} />
        </Painel>
        <Painel id="v-sem-prioridades" titulo={<span className="text-base">Sem nada pendente</span>} descricao="Os níveis apagados, sem cor">
          <NiveisPrioridade resumo={resumirNiveis([], [{ area: "Caixa" }, { area: "Folha" }])} className="px-5 pb-4 lg:grid-cols-2!" />
        </Painel>
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador href="#t-botoes" rotulo="Venda do mês" valor="R$ 1.248.320,10" variacao={{ texto: "6%", direcao: "sobe", tom: "sucesso" }} comparadoCom="melhor que out/26 até dia 3" detalhe="hoje parcial, lido às 14:30" meta={{ texto: "R$ 13.500.000", pct: 9.2, ritmo: 10 }} serie={[310, 402, 380, 455, 420, 510, 498]} />
        <Indicador href="#t-botoes" rotulo="Quebras de caixa" valor="R$ 2.325,37" variacao={{ texto: "12%", direcao: "sobe", tom: "perigo" }} comparadoCom="pior que out/26 até dia 3" detalhe="35 quebra(s): 20 falta(s), 15 sobra(s)" serie={[120, 90, 240, 180, 310, 260, 420]} />
        <Indicador href="#t-botoes" rotulo="Conciliação automática" valor="28,8%" variacao={{ texto: "0,1 p.p.", direcao: "desce", tom: "perigo" }} comparadoCom="pior que as conciliações anteriores" detalhe="última de cada empresa · Varela 2,1% (29/10) · Nazário 90,3% (14/10)" />
        <Indicador href="#t-botoes" rotulo="Admissões" valor="7" comparadoCom="sem base para comparar ainda" detalhe="2 desligamento(s)" />
      </div>
      <Painel id="v-desempenho" titulo={<span className="text-base">Desempenho por filial</span>} descricao="As 4 que mais pedem atenção agora" acao={<LinkPainel href="#t-botoes">Ver todas as filiais (44)</LinkPainel>} className="mb-8">
        <TabelaFiliais linhas={FILIAIS_VITRINE} veConciliacao abreFicha />
      </Painel>
      <PageHeader
        eyebrow="Vitrine"
        titulo="Componentes do sistema"
        descricao="Página só do ambiente local, com dados fictícios, para conferir visual e acessibilidade."
        acoes={
          <>
            <Button variant="outline">
              <Download data-icon="inline-start" />
              Exportar
            </Button>
            <Button>
              <Plus data-icon="inline-start" />
              Novo
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador href="#t-botoes" rotulo="Quebras de caixa" valor="R$ 1.284,40" variacao={{ texto: "12%", direcao: "desce", tom: "sucesso" }} comparadoCom="× set/26 até dia 19" detalhe="out/26 até dia 19 · 41 quebra(s)" serie={[3, 8, 2, 9, 4, 6, 12, 5, 7, 3, 9, 4, 6, 2, 8, 5, 3, 7, 4]} />
        <Indicador href="#t-botoes" rotulo="Chamados abertos" valor="38" variacao={{ texto: "9%", direcao: "sobe", tom: "perigo" }} comparadoCom="× set/26 até dia 19" serie={[1, 2, 4, 2, 3, 5, 2, 1, 3, 4, 2, 6, 3, 2, 4, 1, 2, 3, 5]} />
        <Indicador rotulo="1ª resposta no prazo" valor="87%" variacao={{ texto: "4 p.p.", direcao: "sobe", tom: "sucesso" }} comparadoCom="× set/26" />
        <Indicador rotulo="Admissões" valor="7" comparadoCom="sem base para comparar ainda" detalhe="2 desligamento(s)" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Painel id="v-atencao" titulo="Precisa da sua atenção" descricao="3 itens · 1 crítico" acao={<LinkPainel href="#t-botoes">Central</LinkPainel>} className="lg:col-span-2">
          <ul className="divide-y border-t">
            {(
              [
                ["12 quebras de caixa sem justificativa", "Caixa · mais antiga de 05/10", "perigo", "Crítico"],
                ["4 chamados com SLA estourado", "Chamados", "alerta", "Pendente"],
                ["ASO de 3 funcionários vence em 30 dias", "RH", "atencao", "Atenção"],
              ] as const
            ).map(([t, a, tom, r]) => (
              <li key={t} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t}</span>
                  <span className="block text-xs text-muted-foreground">{a}</span>
                </span>
                <Status tom={tom}>{r}</Status>
              </li>
            ))}
          </ul>
        </Painel>
        <Painel id="v-vazio" titulo="Chamados urgentes" acao={<LinkPainel href="#t-botoes">Ver fila</LinkPainel>}>
          <EstadoVazio compacto titulo="Nenhum chamado urgente" descricao="Nada de prioridade alta ou crítica em aberto." />
        </Painel>
      </div>

      <Painel id="v-lucro" titulo="Lucro / prejuízo mês a mês" descricao="Gráfico da DRE: verde = lucro, vermelho = prejuízo" className="mb-6">
        <div className="px-5 pb-5">
          <ColunasResultado
            titulo="Lucro ou prejuízo por mês"
            rotuloValor="Lucro / prejuízo"
            dados={(
              [
                ["dez/25", 182000],
                ["jan/26", -45000],
                ["fev/26", 64000],
                ["mar/26", 120500],
                ["abr/26", -210300],
                ["mai/26", -96000],
                ["jun/26", 15000],
                ["jul/26", 0],
                ["ago/26", -276423],
                ["set/26", -374733],
              ] as const
            ).map(([r, v]) => ({ rotulo: r, valor: v, texto: `R$ ${v.toLocaleString("pt-BR")}` }))}
          />
        </div>
      </Painel>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Painel id="v-fin" titulo="Receitas × despesas" descricao="Últimos 6 meses lançados no financeiro" className="lg:col-span-2">
          <div className="px-5 pb-5">
            <BarrasDuplas
              titulo="Receitas e despesas por mês"
              rotuloA="Receitas"
              rotuloB="Despesas"
              dados={(
                [
                  ["mai/26", 820, 610],
                  ["jun/26", 760, 690],
                  ["jul/26", 910, 720],
                  ["ago/26", 870, 800],
                  ["set/26", 990, 760],
                  ["out/26", 640, 520],
                ] as const
              ).map(([r, a, b]) => ({ rotulo: r, a, b, textoA: `R$ ${a} mil`, textoB: `R$ ${b} mil` }))}
            />
          </div>
        </Painel>
        <Painel id="v-status" titulo="Situações e carregando" descricao="Os tons valem para o sistema todo">
          <div className="flex flex-wrap gap-2 border-t px-5 py-4">
            <Status tom="sucesso">Resolvido</Status>
            <Status tom="atencao">Aguardando</Status>
            <Status tom="alerta">Atrasado</Status>
            <Status tom="perigo">Crítico</Status>
            <Status tom="info">Em andamento</Status>
            <Status tom="destaque">Justificada</Status>
            <Status tom="neutro">Cancelado</Status>
          </div>
          <div className="space-y-2 border-t px-5 py-4">
            <Esqueleto className="h-4 w-3/4" />
            <Esqueleto className="h-4 w-1/2" />
            <Esqueleto className="h-4 w-2/3" />
          </div>
        </Painel>
      </div>

      <section aria-labelledby="t-botoes" className="mb-6 rounded-xl border bg-card p-5">
        <h2 id="t-botoes" className="mb-3 text-sm font-semibold">
          Botões e etiquetas
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Principal</Button>
          <Button variant="outline">Contorno</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="ghost">Discreto</Button>
          <Button variant="destructive">Excluir</Button>
          <Button variant="link">Link</Button>
          <Button size="sm">Pequeno</Button>
          <Button size="icon" aria-label="Buscar">
            <Search />
          </Button>
          <Button disabled>Desabilitado</Button>
          <Badge>Padrão</Badge>
          <Badge variant="secondary">Secundária</Badge>
          <Badge variant="destructive">Erro</Badge>
          <Badge variant="outline">Contorno</Badge>
          <BadgeAtivo ativo />
          <BadgeAtivo ativo={false} />
        </div>
      </section>

      <section aria-labelledby="t-form" className="mb-6 rounded-xl border bg-card p-5">
        <h2 id="t-form" className="mb-3 text-sm font-semibold">
          Formulário
        </h2>
        <form className="grid gap-4 sm:grid-cols-3">
          <Campo id="v-nome" label="Nome completo" obrigatorio dica="Como está no documento.">
            <Input id="v-nome" name="nome" defaultValue="Maria Exemplo" />
          </Campo>
          <Campo id="v-cpf" label="CPF" erro="CPF inválido: confira os dígitos.">
            <Input id="v-cpf" name="cpf" defaultValue="123.456.789-00" />
          </Campo>
          <Campo id="v-filial" label="Filial">
            <SelectNativo id="v-filial" name="filial" defaultValue="F112">
              <option value="F101">F101 · Lages 109</option>
              <option value="F112">F112 · UPA</option>
            </SelectNativo>
          </Campo>
        </form>
        <div className="mt-4 grid gap-2">
          <ErroFormulario mensagem="Não foi possível salvar: confira os campos destacados." />
          <AvisoSucesso mensagem="Cadastro salvo." />
          <AvisoAtencao mensagem="Há 3 funcionários sem matrícula nesta filial." />
          <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>Mensagem de erro de página.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="t-pos" className="mb-6">
        <h2 id="t-pos" className="mb-2 text-sm font-semibold">
          Importar planilha POS (exemplo: escolha qualquer .xlsx e clique em Conferir)
        </h2>
        <ImportarPosForm conferir={conferirExemplo} lancar={lancarExemplo} naFolha />
      </section>

      <section aria-labelledby="t-quebra" className="mb-6 space-y-3 rounded-xl border bg-card p-5">
        <h2 id="t-quebra" className="text-sm font-semibold">
          Justificativa de quebra com anexo
        </h2>
        <AnexosQuebra anexos={ANEXOS} usuarioId="eu" aberta />
        <JustificativaForm action={justificarExemplo} id="00000000-0000-0000-0000-00000000000a" atual={null} />
      </section>

      <section aria-labelledby="t-conferencia" className="mb-6 rounded-xl border bg-card">
        <h2 id="t-conferencia" className="px-5 pt-4 pb-3 text-sm font-semibold">
          Conferência de sangrias (exemplo)
        </h2>
        <ConferenciaLista
          action={conferirSangriasExemplo}
          podeConferir
          linhas={[
            { id: "a1", loja: "F001", lojaNome: "FRETTA", deposito: "19/10/2026", retirada: "18/10/2026", banco: "ITAU VARELA 2025", numero: "000123", valor: "R$ 2.530,00", anexos: 1, situacao: "pendente", cadastro: "Maria Exemplo" },
            { id: "a2", loja: "F101", lojaNome: "LAGES DOM PEDRO", deposito: "18/10/2026", retirada: "18/10/2026", banco: "SICREDI 2025", numero: "88771", valor: "R$ 1.140,50", anexos: 2, situacao: "pendente", cadastro: "João Teste" },
            { id: "a3", loja: "F108", lojaNome: "BAIRRO", deposito: "17/10/2026", retirada: "16/10/2026", banco: "BRADESCO", numero: null, valor: "R$ 640,00", anexos: 0, situacao: "pendente", cadastro: "Ana Modelo" },
            { id: "a4", loja: "F002", lojaNome: "CENTRO", deposito: "15/10/2026", retirada: "15/10/2026", banco: "ITAU FILIAL", numero: "77654", valor: "R$ 3.010,00", anexos: 1, situacao: "conferida", cadastro: "Carlos Exemplo" },
          ]}
        />
      </section>

      <section aria-labelledby="t-sangria" className="mb-6">
        <h2 id="t-sangria" className="mb-2 text-sm font-semibold">
          Cadastro de sangria (exemplo: não grava)
        </h2>
        <SangriaForm
          lojas={[{ id: "00000000-0000-0000-0000-000000000001", codigo: "F001", nome: "FRETTA" }]}
          contas={[
            { id: "00000000-0000-0000-0000-000000000002", apelido: "ITAU VARELA 2025" },
            { id: "00000000-0000-0000-0000-000000000003", apelido: "SICREDI 2025" },
          ]}
          hoje="2026-10-19"
        />
      </section>

      <section aria-labelledby="t-excluir" className="mb-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/40 p-5 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="t-excluir" className="text-sm font-semibold text-red-800">
          Excluir usuário (exemplo)
        </h2>
        <ExcluirUsuario action={excluirExemplo} nome="Maria Exemplo" confirmacao="maria@exemplo.local" />
      </section>

      <section aria-labelledby="t-chamado" className="mb-6">
        <h2 id="t-chamado" className="mb-2 text-sm font-semibold">
          Abrir chamado (tipos do chamado)
        </h2>
        <ChamadoForm action={abrirExemplo} unidades={[{ id: "u1", codigo: "F002", nome: "Centro", grupo: "Varela" }]} unidadePadrao="u1" />
      </section>

      <section aria-labelledby="t-email" className="mb-6 rounded-xl border bg-card p-5">
        <h2 id="t-email" className="mb-1 text-sm font-semibold">
          E-mail diário das quebras (prévia)
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">Assunto: {assuntoAviso(EMAIL_EXEMPLO)}</p>
        <iframe title="Prévia do e-mail de aviso das quebras" srcDoc={htmlAviso(EMAIL_EXEMPLO, "https://portal.farmaciafct.com.br")} className="h-[720px] w-full rounded-lg border bg-white" />
      </section>

      <section aria-labelledby="t-tabela" className="rounded-xl border bg-card">
        <h2 id="t-tabela" className="px-5 pt-4 pb-3 text-sm font-semibold">
          Tabela
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Salário</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PESSOAS.map((p) => (
              <TableRow key={p.nome}>
                <TableCell className="font-medium">
                  <a href="#t-tabela" className="hover:underline">
                    {p.nome}
                  </a>
                </TableCell>
                <TableCell>{p.cargo}</TableCell>
                <TableCell>{p.filial}</TableCell>
                <TableCell>
                  <BadgeStatusFuncionario status={p.status} />
                </TableCell>
                <TableCell className="text-right">{p.salario}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t px-5 py-3">
          <Paginacao pagina={2} paginas={5} total={118} tamanho={25} params={{}} />
        </div>
      </section>
    </AppShell>
  );
}
