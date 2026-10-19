import { Check } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { NAV, podeVerItem } from "@/lib/nav";
import { PAPEIS, PAPEL_LABEL } from "@/lib/roles";

export const metadata = { title: "Permissões" };

// Quem pode ESCREVER em cada módulo (espelha as políticas de RLS do banco).
const ESCRITA: Record<string, string> = {
  "/dashboard": "—",
  "/rh/funcionarios": "Administrador e RH",
  "/rh/documentos": "Administrador e RH",
  "/rh/aso": "Administrador e RH",
  "/rh/folha": "Administrador e RH (reabrir competência: só administrador)",
  "/chamados": "Todos abrem; atendem: TI (exceto RH), RH (categoria RH), Financeiro, Manutenção, Compras e Marketing (cada um a sua categoria), administrador",
  "/filiais": "Administrador",
  "/ti": "Administrador e TI",
  "/relatorios": "—",
  "/financeiro": "—",
  "/financeiro/lancamentos": "Lançam e editam: Administrador, Financeiro e Contador. Excluem e fecham mês: Administrador e Financeiro. Reabrir mês: só administrador",
  "/financeiro/categorias": "Administrador, Financeiro e Contador",
  "/sangrias": "Cadastram: gerente e colaborador (só nas lojas deles), financeiro e administrador. Conferem: financeiro e administrador. Cancela quem cadastrou (antes da conferência) ou o financeiro",
  "/financeiro/carteira": "Cadastram e alteram: Administrador e Financeiro. Contador só consulta",
  "/financeiro/importar": "Importam: Administrador, Financeiro e Contador. Desfazem lote: Administrador e Financeiro",
  "/financeiro/dre": "Ajustes do contador e saldos: Administrador, Financeiro e Contador. Gerente só vê as próprias unidades",
  "/financeiro/orcamento": "Administrador e Financeiro",
  "/financeiro/caixa": "Administrador e Financeiro",
  "/financeiro/analise": "Inadimplência: Administrador e Financeiro. Ranking e comparativo: só leitura",
  "/financeiro/migrar": "Administrador",
  "/conciliacao/fornecedores": "Administrador, Financeiro e Contador (só leitura)",
  "/conciliacao/robos": "Buscar do Trier: Administrador e Financeiro. Agentes (gerar/revogar chave) e período padrão: Administrador",
  "/configuracoes/integracoes": "Administrador (as chaves ficam criptografadas no banco e nunca voltam para a tela)",
  "/conciliacao": "—",
  "/conciliacao/arquivos": "Administrador e Financeiro enviam/arquivam; Contador só consulta e baixa",
  "/conciliacao/pendencias": "Administrador e Financeiro (status, motivo, responsável)",
  "/conciliacao/de-para": "Administrador e Financeiro",
  "/conciliacao/omie": "Enviam/desfazem: Administrador e Financeiro; categoria/conta padrão: Administrador. Chaves da API só em variáveis de ambiente",
  "/configuracoes/usuarios": "Administrador",
  "/configuracoes/acessos": "Qualquer usuário pede (na tela de sem acesso); só o administrador responde",
  "/configuracoes/permissoes": "Administrador",
  "/configuracoes/auditoria": "Somente leitura (administrador)",
};

const REGRAS_BANCO = [
  "Gerente e usuário só enxergam a própria unidade (principal + adicionais); papéis corporativos (admin, RH, TI, financeiro, contador) enxergam todas.",
  "Financeiro: o gerente vê os lançamentos das próprias unidades; o contador vê e lança em todas, mas não exclui nem fecha mês. Competência fechada bloqueia inclusão, edição e exclusão para todos, exceto o administrador.",
  "Salários e folha são visíveis apenas para administrador e RH — o gerente vê o funcionário, não o valor.",
  "Documentos e ASO: lê quem pode ver o funcionário; envia e remove só administrador e RH. Arquivos ficam em bucket privado com link temporário.",
  "Chamados de RH são visíveis só para RH, administrador, quem abriu e quem atende. Os demais chamados seguem a visibilidade da unidade.",
  "Conciliação: arquivos do banco e do Trier ficam em bucket privado (link de 60 s); nada é apagado, só arquivado com motivo. Contador vê tudo e não altera.",
  "Toda alteração relevante grava auditoria com valor anterior e novo, sem CPF em claro.",
  "Nada é apagado fisicamente: unidades, funcionários, documentos e ASO usam exclusão lógica.",
];

export default async function PermissoesPage() {
  await exigirAcesso("/configuracoes/permissoes");
  const itens = NAV.flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.titulo ?? "Geral" })));

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        titulo="Permissões"
        descricao="O que cada papel enxerga e pode alterar. As regras valem no menu, nas telas e no banco (RLS)."
      />

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Módulo</TableHead>
              {PAPEIS.map((p) => (
                <TableHead key={p} className="text-center">
                  {PAPEL_LABEL[p]}
                </TableHead>
              ))}
              <TableHead className="hidden lg:table-cell">Quem altera</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((item) => (
              <TableRow key={item.href}>
                <TableCell>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.grupo}</p>
                </TableCell>
                {PAPEIS.map((p) => (
                  <TableCell key={p} className="text-center">
                    {podeVerItem(item, p) ? <Check className="mx-auto size-4 text-emerald-600" aria-label="sim" /> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ))}
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{ESCRITA[item.href] ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <section className="mt-4 rounded-xl border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Regras aplicadas no banco de dados</h2>
        <ul className="space-y-2 text-sm">
          {REGRAS_BANCO.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-fct-red" aria-hidden />
              <span>{r}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Esta página é uma referência: mudar uma regra exige alteração no código e nas políticas do banco, sempre com migração versionada.
        </p>
      </section>
    </>
  );
}
