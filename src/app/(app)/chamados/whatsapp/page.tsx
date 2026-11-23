import { redirect } from "next/navigation";
import { Bot, MessageCircle, Send } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Painel } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import type { CategoriaChamado } from "@/lib/chamados/rotulos";
import { formatarDataHora } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { SETOR_WPP } from "@/lib/whatsapp/chamados";
import { gerarChaveAgenteWpp, salvarDestinosWpp, testarGrupoWpp } from "./actions";
import { FormChaveAgente, FormDestinos } from "./formularios";

export const metadata = { title: "WhatsApp dos setores" };

/** Minutos desde o último contato do agente (agora do servidor, a cada carregamento). */
const minutosDesde = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60_000;
export const dynamic = "force-dynamic";

/** Chamados nos grupos de WhatsApp de cada setor: agente do escritório, grupo de cada setor e o que foi enviado. Só admin. */
export default async function WhatsappSetoresPage() {
  const sessao = await exigirAcesso("/chamados/whatsapp");
  if (sessao.papel !== "admin") redirect("/chamados");
  const supabase = await createClient();
  const [{ data: agente }, { data: grupos }, { data: destinos }, { data: fila }] = await Promise.all([
    supabase.from("wpp_agente").select("token_hash, numero, conectado, situacao, ultimo_contato").eq("id", 1).maybeSingle(),
    supabase.from("wpp_grupos").select("jid, nome").order("nome"),
    supabase.from("wpp_destinos").select("categoria, grupo_jid, grupo_nome, ativo"),
    supabase.from("wpp_fila").select("id, ticket_id, categoria, criado_em, enviado_em, tentativas, erro, mensagem").order("criado_em", { ascending: false }).limit(30),
  ]);
  const porSetor = new Map((destinos ?? []).map((d) => [d.categoria, d]));
  const categorias = Object.keys(SETOR_WPP) as CategoriaChamado[];
  const vivo = !!agente?.ultimo_contato && minutosDesde(agente.ultimo_contato) < 3;
  const situacao = !agente?.token_hash
    ? "Sem chave: gere a chave abaixo e instale o agente no computador do escritório."
    : !agente.ultimo_contato
      ? "Chave gerada; o agente ainda não falou com o portal."
      : !vivo
        ? `Agente parado: último contato ${formatarDataHora(agente.ultimo_contato)}. Confira se o computador está ligado e o agente aberto.`
        : agente.conectado
          ? `Conectado${agente.numero ? ` ao número ${agente.numero}` : ""}. Último contato ${formatarDataHora(agente.ultimo_contato)}.`
          : `Agente rodando, mas o WhatsApp não está conectado${agente.situacao ? ` (${agente.situacao})` : ""}: escaneie o QR code que aparece na janela do agente.`;

  return (
    <>
      <PageHeader
        eyebrow="Chamados"
        titulo="WhatsApp dos setores"
        descricao="Chamado aberto vai sozinho para o grupo de WhatsApp do setor (RH e DP no mesmo grupo). Quem manda é um número conectado pelo agente do computador do escritório, sem custo."
      />

      <Painel icone={Bot} titulo="Agente do WhatsApp" descricao={situacao} className="mb-6">
        <div className="space-y-4 px-5 pb-5 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Use um chip só para isso (não o número principal da farmácia): é conexão não oficial, como o WhatsApp Web.</li>
            <li>No computador do escritório, abra a pasta <span className="font-mono">agente-whatsapp</span> e cole a chave no <span className="font-mono">config.json</span>.</li>
            <li>Dê dois cliques em <span className="font-mono">iniciar.bat</span> e escaneie o QR code com o WhatsApp do chip (Aparelhos conectados).</li>
            <li>Coloque esse número nos grupos dos setores. Os grupos aparecem aqui em até 5 minutos; ligue cada setor ao grupo dele.</li>
          </ol>
          <FormChaveAgente acao={gerarChaveAgenteWpp} temChave={!!agente?.token_hash} />
        </div>
      </Painel>

      <Painel icone={MessageCircle} titulo="Grupo de cada setor" className="mb-6">
        <div className="space-y-3 px-5 pb-5">
          {!grupos?.length && (
            <p className="text-sm text-muted-foreground">Nenhum grupo ainda: o agente precisa estar conectado e o número dentro dos grupos.</p>
          )}
          <FormDestinos
            acao={salvarDestinosWpp}
            grupos={grupos ?? []}
            linhas={categorias.map((c) => ({ categoria: c, setor: SETOR_WPP[c], grupo: porSetor.get(c)?.grupo_jid ?? null, ativo: porSetor.get(c)?.ativo ?? true }))}
          />
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {categorias
              .filter((c) => porSetor.get(c)?.grupo_jid)
              .map((c) => (
                <form key={c} action={testarGrupoWpp}>
                  <input type="hidden" name="categoria" value={c} />
                  <Button type="submit" size="xs" variant="outline">
                    <Send aria-hidden />
                    Testar {SETOR_WPP[c]}
                  </Button>
                </form>
              ))}
          </div>
        </div>
      </Painel>

      <Painel titulo="Últimos envios">
        {fila?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Quando</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>O quê</TableHead>
                <TableHead className="pr-5">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fila.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="pl-5 text-sm">{formatarDataHora(f.criado_em)}</TableCell>
                  <TableCell className="text-sm">{f.categoria ? SETOR_WPP[f.categoria] : "—"}</TableCell>
                  <TableCell className="text-sm">{f.mensagem ? "Teste" : f.ticket_id ? <a href={`/chamados/${f.ticket_id}`} className="underline">Chamado</a> : "—"}</TableCell>
                  <TableCell className="pr-5 text-sm">
                    {f.enviado_em ? (
                      <span className="text-emerald-700">Enviado {formatarDataHora(f.enviado_em)}</span>
                    ) : f.tentativas >= 5 ? (
                      <span className="text-red-700">Não enviado{f.erro ? `: ${f.erro}` : ""}</span>
                    ) : (
                      <span className="text-amber-700">Na fila{f.erro ? ` (tentou ${f.tentativas}×: ${f.erro})` : ""}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Nada enviado ainda.</p>
        )}
      </Painel>
    </>
  );
}
