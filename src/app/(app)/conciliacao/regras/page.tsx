import Link from "next/link";
import { Plus, TriangleAlert, Workflow } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { BadgeAtivo } from "@/components/layout/badge-status";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { descreverAcoes, descreverCondicoes, listarRegras, previaPendencias, previaUltimaConciliacao } from "@/lib/conciliacao/regras";
import { formatarData, formatarDataHora, pluralizar } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { aplicarRegrasAgora, excluirRegra } from "./actions";

export const metadata = { title: "Regras automáticas" };

const EXEMPLOS = [
  ["Nome contém CLARO", "categoria Telefonia"],
  ["CNPJ da Celesc", "categoria Energia elétrica, departamento 423 - ADMINISTRATIVO"],
  ["Só no Trier + nome contém UNIMED", "resolver: débito automático, não vem boleto"],
  ["Nome contém TEMPLI", "justificar: cobrança indevida, não pagar"],
];

export default async function RegrasPage({ searchParams }: PageProps<"/conciliacao/regras">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/conciliacao/regras"), searchParams]);
  const escreve = podeConciliar(sessao.papel);
  const supabase = await createClient();
  const regras = await listarRegras(supabase);
  const [pend, ultima] = await Promise.all([previaPendencias(supabase, regras), previaUltimaConciliacao(supabase, regras)]);
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const aviso = typeof sp.aviso === "string" ? sp.aviso : null;
  const aplicou = typeof sp.aplicou === "string" ? Number(sp.aplicou) : null;
  const reabriu = typeof sp.reabriu === "string" ? Number(sp.reabriu) : 0;
  const ativas = regras.filter((r) => r.ativo).length;
  const tratadasHoje = [...pend.tratadas.values()].reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHeader
        eyebrow="Conciliação"
        titulo="Regras automáticas"
        descricao="Regras do tipo “nome contém CLARO → categoria Telefonia”. Valem na conciliação (tratam pendências sozinhas) e no envio à Omie (categoria e departamento). Para cada ação vale a primeira regra ativa que casa, pela ordem."
        acoes={
          escreve ? (
            <>
              {regras.some((r) => r.pendencia_acao) && (
                <ConfirmarAcao
                  titulo="Aplicar as regras nas pendências agora?"
                  descricao={`Trata as pendências em aberto que casam com regras ativas e reabre as que uma regra tratou e não vale mais. Decisões de pessoas e pendências em análise não mudam. Hoje há ${pluralizar(pend.abertas, "pendência em aberto", "pendências em aberto")}.`}
                  rotuloBotao="Aplicar nas pendências"
                  action={aplicarRegrasAgora}
                />
              )}
              <Button nativeButton={false} render={<Link href="/conciliacao/regras/nova" />}>
                <Plus data-icon="inline-start" />
                Nova regra
              </Button>
            </>
          ) : undefined
        }
      />

      {sp.ok === "1" && !aviso && (
        <div className="mb-4">
          <AvisoSucesso mensagem="Salvo. Vale a partir da próxima conciliação e do próximo envio à Omie." />
        </div>
      )}
      {aplicou !== null && (
        <div className="mb-4">
          <AvisoSucesso
            mensagem={
              aplicou || reabriu
                ? `Regras aplicadas: ${pluralizar(aplicou, "pendência tratada", "pendências tratadas")}${reabriu ? `, ${pluralizar(reabriu, "reaberta", "reabertas")}` : ""}.`
                : "Nenhuma pendência mudou: nada em aberto casa com as regras ativas."
            }
          />
        </div>
      )}
      {(erro || aviso) && (
        <div
          role="alert"
          className={`mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${erro ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{erro ?? aviso}</p>
        </div>
      )}

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Regras ativas", String(ativas), regras.length > ativas ? `${regras.length - ativas} inativa(s)` : null],
          ["Pendências tratadas por regra", String(tratadasHoje), "resolvidas ou justificadas sem ninguém mexer"],
          ["Pendências em aberto", String(pend.abertas), "esperando alguém (ou uma regra)"],
          ["Última conciliação", ultima.conciliacao ? formatarData(ultima.conciliacao.criado_em) : "—", ultima.conciliacao ? "prévia das regras de categoria e departamento" : null],
        ].map(([r, v, nota]) => (
          <div key={r} className="rounded-xl border bg-card p-4">
            <p className="rotulo">{r}</p>
            <p className="mt-1 numero">{v}</p>
            {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
          </div>
        ))}
      </section>

      {regras.length === 0 ? (
        <section className="rounded-xl border bg-card px-6 py-10 text-center">
          <Workflow className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">Nenhuma regra ainda</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">Crie regras para o que se repete todo mês e o financeiro deixa de tratar à mão. Alguns exemplos:</p>
          <ul className="mx-auto mt-4 max-w-xl space-y-1.5 text-left text-sm">
            {EXEMPLOS.map(([quando, entao]) => (
              <li key={quando} className="rounded-lg border bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground">Quando</span> {quando} <span className="text-muted-foreground">→</span> {entao}
              </li>
            ))}
          </ul>
          {escreve && (
            <Button className="mt-5" nativeButton={false} render={<Link href="/conciliacao/regras/nova" />}>
              <Plus data-icon="inline-start" />
              Criar a primeira regra
            </Button>
          )}
        </section>
      ) : (
        <section className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 text-right">Ordem</TableHead>
                <TableHead>Regra</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead>Então</TableHead>
                <TableHead className="hidden lg:table-cell">Hoje</TableHead>
                <TableHead className="hidden text-right md:table-cell">Usada</TableHead>
                {escreve && <TableHead className="w-40" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {regras.map((r) => {
                const casamPend = pend.casam.get(r.id) ?? 0;
                const tratadas = pend.tratadas.get(r.id) ?? 0;
                const casamConc = ultima.casam.get(r.id);
                return (
                  <TableRow key={r.id} className={r.ativo ? undefined : "opacity-60"}>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.ordem}</TableCell>
                    <TableCell>
                      <p className="font-medium">{r.nome}</p>
                      <BadgeAtivo ativo={r.ativo} className="mt-1" />
                    </TableCell>
                    <TableCell className="text-sm">
                      <ul className="space-y-0.5">
                        {descreverCondicoes(r).map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell className="text-sm">
                      <ul className="space-y-0.5">
                        {descreverAcoes(r).map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {r.pendencia_acao && (
                        <p>
                          {pluralizar(casamPend, "pendência casa", "pendências casam")}
                          {tratadas ? ` · ${tratadas} tratada(s) por ela` : ""}
                        </p>
                      )}
                      {casamConc !== undefined && (r.categoria_omie || r.departamento_omie) && <p>{pluralizar(casamConc, "conta", "contas")} na última conciliação</p>}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {r.vezes}×{r.ultima_vez && <p className="text-xs text-muted-foreground">{formatarDataHora(r.ultima_vez)}</p>}
                    </TableCell>
                    {escreve && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/conciliacao/regras/${r.id}/editar`} className="text-sm text-fct-tinta underline">
                            Editar
                          </Link>
                          <ConfirmarAcao
                            titulo={`Excluir a regra “${r.nome}”?`}
                            descricao={`Ela deixa de valer nas próximas conciliações e envios.${tratadas ? ` As ${tratadas} pendência(s) que ela tratou voltam a ficar pendentes (ou passam para outra regra que case).` : ""} A auditoria guarda o que foi excluído.`}
                            rotuloBotao="Excluir"
                            variant="destructive"
                            action={excluirRegra}
                            campos={{ id: r.id }}
                          />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
    </>
  );
}
