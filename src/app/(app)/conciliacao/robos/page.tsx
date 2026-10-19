import Link from "next/link";
import { Download } from "lucide-react";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar, podeConfigurarConciliacao } from "@/lib/conciliacao/permissoes";
import { CONFIG_TRIER_PADRAO, statusTrier, type ConfigTrier } from "@/lib/conciliacao/trier-robo";
import { obterConfig } from "@/lib/data/conciliacao";
import { formatarDataHora } from "@/lib/formatos";
import { credenciaisTrier } from "@/lib/integracoes/segredos";
import { createClient } from "@/lib/supabase/server";
import { buscarTrier, criarAgente, revogarAgente, salvarConfigTrier, testarTrier } from "./actions";
import { BuscarTrierForm } from "./buscar-trier-form";
import { NovoAgenteForm } from "./novo-agente-form";

export const metadata = { title: "Robôs e agente" };
// A busca no Trier pode levar minutos (login + geração do relatório + download); vale também para as Server Actions desta tela.
export const maxDuration = 300;

const ARQUIVOS_AGENTE = ["agente-itau.ps1", "instalar.ps1", "desinstalar.ps1", "LEIA-ME.txt"];

export default async function RobosPage() {
  const sessao = await exigirAcesso("/conciliacao/robos");
  const supabase = await createClient();
  const admin = podeConfigurarConciliacao(sessao.papel);
  const [cfg, { data: buscas }, { data: recebidos }, cred] = await Promise.all([
    obterConfig<ConfigTrier>("trier", CONFIG_TRIER_PADRAO),
    supabase.from("conc_arquivos").select("id, nome, enviado_em, meta, quem:profiles!conc_arquivos_enviado_por_fkey(nome)").eq("origem", "robo_trier").order("enviado_em", { ascending: false }).limit(5),
    supabase.from("conc_arquivos").select("id, nome, enviado_em, meta").eq("origem", "agente").order("enviado_em", { ascending: false }).limit(5),
    credenciaisTrier(supabase),
  ]);
  const agentes = admin ? ((await supabase.from("conc_agentes").select("id, nome, criado_em, revogado_em, ultimo_uso, uploads, criador:profiles(nome)").order("criado_em", { ascending: false })).data ?? []) : [];
  const trier = statusTrier(cred);
  const agenteHabilitado = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const periodoDe = (meta: unknown) => (meta as { robo?: { periodo?: string } } | null)?.robo?.periodo ?? "";
  const agenteDe = (meta: unknown) => (meta as { agente?: string } | null)?.agente ?? "";

  return (
    <>
      <PageHeader eyebrow="Automações" titulo="Robôs e agente" descricao="Duas automações que alimentam a conciliação sem ninguém baixar arquivo à mão: o robô que gera o relatório do Trier e o agente que manda os .RET do Itaú Mailbox." />

      <section className="mb-4 rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">{trier.configurado ? "🟢" : "⚪"} Robô do Trier — relatório “Contas a Pagar ou Pagas”</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Entra no Trier ({trier.url}), gera o relatório de todas as filiais (a pagar, detalhado, por vencimento, em Excel), traz e guarda como um arquivo da conciliação. Depois é só conciliar.
        </p>
        {!trier.configurado ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Robô ainda sem usuário e senha do Trier.{" "}
            {admin ? (
              <>
                Cadastre em{" "}
                <Link href="/configuracoes/integracoes" className="font-medium underline">
                  Administração → Integrações
                </Link>{" "}
                (use um usuário do Trier criado só para o robô, com acesso apenas a esse relatório).
              </>
            ) : (
              "Peça ao administrador para cadastrar em Administração → Integrações."
            )}{" "}
            Enquanto isso, o relatório pode ser enviado à mão em Conciliação → Arquivos.
          </p>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">
            Usuário do robô: {trier.usuario} ({trier.origem === "sistema" ? "cadastrado em Administração → Integrações" : "variáveis de ambiente do servidor"}). A senha nunca aparece no sistema.
          </p>
        )}
        <BuscarTrierForm buscar={buscarTrier} testar={testarTrier} config={cfg} configurado={trier.configurado} podeBuscar={podeConciliar(sessao.papel)} />
        {admin && (
          <form action={salvarConfigTrier} className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4">
            <p className="w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">Período padrão da busca (administrador)</p>
            <label className="text-sm">
              Dias para trás
              <Input name="diasAntes" type="number" min={0} max={90} defaultValue={cfg.diasAntes} className="mt-1 w-28" />
            </label>
            <label className="text-sm">
              Dias para a frente
              <Input name="diasDepois" type="number" min={1} max={180} defaultValue={cfg.diasDepois} className="mt-1 w-28" />
            </label>
            <Button type="submit" variant="outline" size="sm">
              Salvar padrão
            </Button>
          </form>
        )}
        {(buscas ?? []).length > 0 && (
          <div className="mt-4 border-t pt-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Últimas buscas</p>
            <ul className="space-y-0.5">
              {buscas!.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="tabular-nums">{formatarDataHora(b.enviado_em)}</span>
                  <a href={`/api/conciliacao/arquivo/${b.id}`} className="text-fct-tinta underline">
                    {b.nome}
                  </a>
                  {periodoDe(b.meta) && <span className="text-muted-foreground">período {periodoDe(b.meta)}</span>}
                  {b.quem?.nome && <span className="text-muted-foreground">por {b.quem.nome}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">{agenteHabilitado ? "🟢" : "⚪"} Agente dos arquivos do Itaú (Itaú Mailbox → conciliação)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Um script agendado no PC onde o Itaú Mailbox baixa os retornos de DDA manda cada .RET novo para <code className="rounded bg-muted px-1 text-xs">/api/conciliacao/agente</code> com uma chave própria (só serve para enviar; não entra no sistema). Arquivo repetido não duplica; o que não é do Itaú é ignorado ali mesmo.
        </p>
        {!agenteHabilitado && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            O endereço do agente só funciona com <code className="rounded bg-white/70 px-1 text-xs">SUPABASE_SERVICE_ROLE_KEY</code> definida nas variáveis de ambiente do servidor (o agente não tem sessão de usuário). Nunca no código, no Git ou no navegador.
          </p>
        )}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instalador:</span>
          {ARQUIVOS_AGENTE.map((a) => (
            <a key={a} href={`/agente-itau/${a}`} download className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:border-primary/40">
              <Download className="size-3.5" aria-hidden />
              {a}
            </a>
          ))}
          <span className="text-xs text-muted-foreground">Baixe os 4 para uma pasta do PC do Itaú Mailbox e rode instalar.ps1 (botão direito → Executar com o PowerShell).</span>
        </div>

        {admin ? (
          <>
            <NovoAgenteForm action={criarAgente} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agente</TableHead>
                  <TableHead className="hidden md:table-cell">Criado</TableHead>
                  <TableHead>Último contato</TableHead>
                  <TableHead className="text-right">Enviados</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-32 text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="vazio">
                      Nenhum agente ainda. Gere a chave acima e instale no PC do Itaú Mailbox.
                    </TableCell>
                  </TableRow>
                ) : (
                  agentes.map((a) => (
                    <TableRow key={a.id} className={a.revogado_em ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{a.nome}</TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {formatarDataHora(a.criado_em)}
                        {a.criador?.nome ? ` · ${a.criador.nome}` : ""}
                      </TableCell>
                      <TableCell className="tabular-nums">{a.ultimo_uso ? formatarDataHora(a.ultimo_uso) : "nunca"}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.uploads}</TableCell>
                      <TableCell>{a.revogado_em ? <span className="text-xs text-red-700">revogado em {formatarDataHora(a.revogado_em)}</span> : <span className="text-xs text-emerald-700">ativo</span>}</TableCell>
                      <TableCell className="text-right">
                        {!a.revogado_em && (
                          <ConfirmarAcao
                            titulo={`Revogar a chave de “${a.nome}”?`}
                            descricao="O agente desse PC para de conseguir enviar arquivos na hora. Os arquivos já recebidos continuam no sistema. Para voltar, gere uma chave nova e reinstale."
                            rotuloBotao="Revogar"
                            rotuloConfirmar="Revogar chave"
                            variant="destructive"
                            action={revogarAgente}
                            campos={{ id: a.id }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Gerar e revogar chaves de agente é tarefa do administrador.</p>
        )}

        {(recebidos ?? []).length > 0 && (
          <div className="mt-4 border-t pt-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Últimos arquivos recebidos pelo agente</p>
            <ul className="space-y-0.5">
              {recebidos!.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="tabular-nums">{formatarDataHora(b.enviado_em)}</span>
                  <Link href={`/conciliacao/arquivos?q=${encodeURIComponent(b.nome)}`} className="text-fct-tinta underline">
                    {b.nome}
                  </Link>
                  {agenteDe(b.meta) && <span className="text-muted-foreground">agente {agenteDe(b.meta)}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
