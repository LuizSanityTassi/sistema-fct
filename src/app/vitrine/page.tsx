// Vitrine dos componentes com dados fictícios, só no ambiente local (em produção responde 404 e nem é rota pública).
// Serve para conferir visual e acessibilidade sem precisar de login.
import { notFound } from "next/navigation";
import { Download, Plus, Search, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { BoasVindas } from "@/components/layout/boas-vindas";
import { BadgeAtivo, BadgeStatusFuncionario } from "@/components/layout/badge-status";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { AvisoAtencao, AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnexosQuebra } from "@/app/(app)/caixa/anexos-quebra";
import { JustificativaForm } from "@/app/(app)/caixa/justificativa-form";

export const metadata = { title: "Vitrine" };

const PESSOAS = [
  { nome: "Maria Exemplo da Silva", cargo: "Atendente", filial: "F101", status: "ativo", salario: "R$ 2.150,00" },
  { nome: "João Fictício Souza", cargo: "Farmacêutico", filial: "F112", status: "ferias", salario: "R$ 4.380,00" },
  { nome: "Ana Teste Pereira", cargo: "Gerente", filial: "F301", status: "afastado", salario: "R$ 5.900,00" },
  { nome: "Carlos Modelo Lima", cargo: "Estoquista", filial: "F002", status: "desligado", salario: "R$ 1.980,00" },
];

export default function VitrinePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  async function sair() {
    "use server";
  }
  async function justificarExemplo(): Promise<{ ok: string }> {
    "use server";
    return { ok: "Exemplo: nada foi gravado." };
  }
  const ANEXOS = [
    { id: "00000000-0000-0000-0000-000000000001", diferenca_id: "x", nome: "cupom-sangria.jpg", mime: "image/jpeg", tamanho: 2_340_000, enviado_por: "eu", enviado_por_nome: "Gerente de Exemplo", criado_em: "2026-10-16T14:05:00Z" },
    { id: "00000000-0000-0000-0000-000000000002", diferenca_id: "x", nome: "conferencia-caixa-4708.pdf", mime: "application/pdf", tamanho: 180_000, enviado_por: "outro", enviado_por_nome: "Financeiro", criado_em: "2026-10-16T15:20:00Z" },
  ];
  return (
    <AppShell usuario={{ nome: "Usuária de Exemplo", email: "exemplo@fct.local", papel: "admin" }} onSair={sair}>
      <BoasVindas data="Sexta-feira, 16 de outubro" titulo="Olá, Usuária">
        Administrador · números de todas as unidades · 5 pendências esperando ação.
      </BoasVindas>
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

      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { r: "Funcionários em atividade", v: "342" },
          { r: "Com lançamento", v: "100" },
          { r: "Com pendência", v: "21", alerta: true },
          { r: "Folha de outubro", v: "R$ 998.706,97" },
        ].map((k) => (
          <div key={k.r} className="rounded-xl border bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{k.r}</dt>
            <dd className={`text-xl font-bold tracking-tight tabular-nums ${k.alerta ? "text-amber-700" : ""}`}>{k.v}</dd>
          </div>
        ))}
      </dl>

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

      <section aria-labelledby="t-quebra" className="mb-6 space-y-3 rounded-xl border bg-card p-5">
        <h2 id="t-quebra" className="text-sm font-semibold">
          Justificativa de quebra com anexo
        </h2>
        <AnexosQuebra anexos={ANEXOS} usuarioId="eu" aberta />
        <JustificativaForm action={justificarExemplo} id="00000000-0000-0000-0000-00000000000a" atual={null} />
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
