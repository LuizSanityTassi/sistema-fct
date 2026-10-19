import Link from "next/link";
import { ChevronLeft, Clock, Mail, MailWarning, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, LinkPainel, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { avisosLigados, configSmtp, montarAvisos, type PreviaAvisos } from "@/lib/caixa/avisos";
import { formatarData, formatarDataHora, formatarMoeda, pluralizar } from "@/lib/formatos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Tom } from "@/lib/tons";
import { alternarAvisos, enviarAvisosAgora, enviarTesteAvisos } from "./actions";
import { AlternarAvisos, EnvioAvisos } from "./avisos-form";

export const metadata = { title: "Avisos por e-mail" };
export const maxDuration = 120;

const ORIGEM: Record<string, { rotulo: string; tom: Tom }> = {
  automatico: { rotulo: "Automático", tom: "info" },
  manual: { rotulo: "Enviado agora", tom: "destaque" },
  teste: { rotulo: "Teste", tom: "neutro" },
};

export default async function AvisosCaixaPage() {
  const sessao = await exigirAcesso("/financeiro/diferenca-caixa");
  const supabase = await createClient();
  const admin = createAdminClient();
  const [ligado, { data: historico }] = await Promise.all([
    avisosLigados(supabase),
    supabase.from("caixa_avisos").select("id, dia, nome, email, quantidade, valor, origem, enviado_em, erro, profile_id").order("enviado_em", { ascending: false }).limit(30),
  ]);

  let previa: PreviaAvisos | null = null;
  let smtpOk = false;
  let remetente = "";
  let falha: string | null = null;
  if (admin) {
    try {
      const [p, s] = await Promise.all([montarAvisos(admin), configSmtp(admin)]);
      previa = p;
      smtpOk = s.configurado;
      remetente = s.usuario;
    } catch (e) {
      falha = e instanceof Error ? e.message : String(e);
    }
  }
  const temCron = Boolean(process.env.CRON_SECRET);
  const ultimoAuto = (historico ?? []).find((h) => h.origem === "automatico");
  const avisadosHoje = new Set((historico ?? []).filter((h) => previa && h.dia === previa.hoje && !h.erro && h.origem !== "teste").map((h) => h.profile_id));
  const ehAdmin = sessao.papel === "admin";

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="Avisos por e-mail"
        descricao="Toda manhã, de segunda a sábado, cada gestor que tem quebra de caixa esperando justificativa recebe um e-mail com a lista e o link para justificar. Quem não tem nada pendente não recebe nada. Ninguém recebe duas vezes no mesmo dia."
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/financeiro/diferenca-caixa" />}>
            <ChevronLeft data-icon="inline-start" />
            Diferença de caixa
          </Button>
        }
      />

      {!admin && (
        <p role="alert" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Falta a variável <code className="rounded bg-card px-1 text-xs">SUPABASE_SERVICE_ROLE_KEY</code> neste servidor: sem ela o sistema não consegue montar nem enviar os avisos.
        </p>
      )}
      {falha && (
        <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Não consegui montar a lista de hoje: {falha}
        </p>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="rotulo">Envio automático</p>
            <Status tom={ligado ? "sucesso" : "neutro"}>{ligado ? "Ligado" : "Desligado"}</Status>
          </div>
          <p className="text-sm">Segunda a sábado, por volta das 7h30.</p>
          {ehAdmin && !temCron && <p className="text-xs text-amber-800">Falta a variável CRON_SECRET no servidor: a rotina da manhã não roda sem ela.</p>}
          <div className="mt-auto pt-1">
            <AlternarAvisos action={alternarAvisos} ligado={ligado} />
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="rotulo">E-mail de envio</p>
            <Status tom={smtpOk ? "sucesso" : "atencao"}>{smtpOk ? "Pronto" : "Falta a senha"}</Status>
          </div>
          <p className="flex items-center gap-1.5 truncate text-sm">
            <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            {remetente || "nao-responda@farmaciafct.com.br"}
          </p>
          {!smtpOk && (
            <p className="text-xs text-muted-foreground">
              {ehAdmin ? (
                <>
                  Cadastre a senha dessa caixa em{" "}
                  <Link href="/configuracoes/integracoes#email" className="font-medium text-foreground underline">
                    Administração → Integrações
                  </Link>
                  .
                </>
              ) : (
                "Peça ao administrador para cadastrar a senha em Administração → Integrações."
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="rotulo">Último envio automático</p>
            <Clock className="size-4 text-muted-foreground/70" aria-hidden />
          </div>
          <p className="numero-sm">{ultimoAuto ? formatarDataHora(ultimoAuto.enviado_em) : "—"}</p>
          <p className="text-xs text-muted-foreground">{ultimoAuto ? "veja o histórico abaixo" : "ainda não rodou"}</p>
        </div>
      </div>

      <Painel
        id="hoje"
        className="mb-6"
        titulo="Quem recebe hoje"
        descricao={previa ? `${pluralizar(previa.destinatarios.length, "gestor", "gestores")} · ${pluralizar(previa.totalQuebras, "quebra pendente", "quebras pendentes")} no total` : undefined}
      >
        <div className="border-t px-5 py-4">
          <EnvioAvisos teste={enviarTesteAvisos} todos={enviarAvisosAgora} destinatarios={previa?.destinatarios.length ?? 0} podeEnviar={Boolean(admin && smtpOk)} />
        </div>
        {previa && previa.destinatarios.length === 0 ? (
          <EstadoVazio
            compacto
            icone={UsersRound}
            titulo="Ninguém para avisar hoje"
            descricao={previa.totalQuebras ? "Há quebras pendentes, mas nenhuma loja com gestor ou gerente cadastrado. Veja a lista abaixo." : "Nenhuma quebra esperando justificativa."}
          />
        ) : previa ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gestor</TableHead>
                <TableHead>Lojas</TableHead>
                <TableHead className="text-right">Quebras</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Mais antiga</TableHead>
                <TableHead>Hoje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previa.destinatarios.map((d) => {
                const lojas = [...new Set(d.quebras.map((q) => q.loja))];
                const antiga = Math.max(...d.quebras.map((q) => q.diasAberta));
                return (
                  <TableRow key={d.profileId}>
                    <TableCell>
                      <span className="font-medium">{d.nome}</span>
                      <span className="block text-xs text-muted-foreground">{d.email}</span>
                    </TableCell>
                    <TableCell className="text-xs whitespace-normal">{lojas.slice(0, 6).join(", ") + (lojas.length > 6 ? ` +${lojas.length - 6}` : "")}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.quebras.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(d.total)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${antiga >= 3 ? "text-red-700" : ""}`}>{antiga === 0 ? "hoje" : `${antiga} dia(s)`}</TableCell>
                    <TableCell>{avisadosHoje.has(d.profileId) ? <Status tom="sucesso">Avisado</Status> : <Status tom="neutro">Ainda não</Status>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </Painel>

      {previa && previa.semResponsavel.length > 0 && (
        <Painel
          id="sem-responsavel"
          className="mb-6"
          icone={MailWarning}
          titulo="Quebras sem ninguém para avisar"
          descricao="Lojas com quebra pendente sem gestor definido e sem gerente cadastrado. Defina o gestor da loja ou convide o gerente para ele começar a receber."
          acao={<LinkPainel href="/financeiro/diferenca-caixa/gestores">Gestores das lojas</LinkPainel>}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead className="text-right">Quebras</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previa.semResponsavel.map((l) => (
                <TableRow key={l.branchId}>
                  <TableCell>
                    <span className="font-mono text-xs">{l.loja}</span> <span className="text-xs text-muted-foreground">{l.nome}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.quantidade}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Painel>
      )}

      <Painel id="historico" titulo="Histórico" descricao="Os últimos 30 e-mails enviados (inclusive os testes).">
        {(historico ?? []).length === 0 ? (
          <EstadoVazio compacto icone={Mail} titulo="Nenhum aviso enviado ainda" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Para</TableHead>
                <TableHead className="text-right">Quebras</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(historico ?? []).map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="tabular-nums">
                    {formatarDataHora(h.enviado_em)}
                    <span className="block text-xs text-muted-foreground">dia {formatarData(h.dia)}</span>
                  </TableCell>
                  <TableCell>
                    {h.nome}
                    <span className="block text-xs text-muted-foreground">{h.email}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{h.quantidade}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(h.valor)}</TableCell>
                  <TableCell>
                    <Status tom={ORIGEM[h.origem]?.tom ?? "neutro"}>{ORIGEM[h.origem]?.rotulo ?? h.origem}</Status>
                  </TableCell>
                  <TableCell className="max-w-72 text-xs whitespace-normal">{h.erro ? <span className="text-red-700">Falhou: {h.erro}</span> : <span className="text-emerald-700">Enviado</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Painel>
    </>
  );
}
