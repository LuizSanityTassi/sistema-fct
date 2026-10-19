import Link from "next/link";
import { LockOpen, UserCog } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { infoDaTela, perfisQueAbrem } from "@/lib/acesso/pedidos";
import { exigirAcesso } from "@/lib/auth/session";
import { formatarDataHora } from "@/lib/formatos";
import { PAPEL_LABEL, type AppRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { responderPedido } from "./actions";
import { ResponderPedidoForm } from "./responder-form";

export const metadata = { title: "Pedidos de acesso" };

const papel = (p: string) => PAPEL_LABEL[p as AppRole] ?? p;
const COLUNAS = "id, solicitante, solicitante_nome, papel_atual, rota, tela, motivo, status, resposta, criada_em, respondida_em, respondida_por_nome, perfil:profiles!acesso_solicitacoes_solicitante_fkey(email, papel, ativo)";

export default async function PedidosAcessoPage() {
  await exigirAcesso("/configuracoes/acessos");
  const supabase = await createClient();
  const [{ data: pendentes }, { data: respondidos }] = await Promise.all([
    supabase.from("acesso_solicitacoes").select(COLUNAS).eq("status", "pendente").order("criada_em"),
    supabase.from("acesso_solicitacoes").select(COLUNAS).neq("status", "pendente").order("respondida_em", { ascending: false }).limit(40),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        titulo="Pedidos de acesso"
        descricao="Quem tenta abrir uma tela que o perfil não libera pode pedir acesso. O acesso continua sendo pelo perfil: para liberar, ajuste o perfil ou as filiais da pessoa em Usuários e depois marque o pedido como atendido. Quem pediu recebe a resposta por e-mail."
      />

      <Painel id="pendentes" className="mb-6" icone={LockOpen} titulo="Esperando resposta" descricao={pendentes?.length ? `${pendentes.length} ${pendentes.length === 1 ? "pedido" : "pedidos"}, os mais antigos primeiro` : undefined}>
        {!pendentes?.length ? (
          <EstadoVazio compacto icone={LockOpen} titulo="Nenhum pedido esperando" descricao="Quando alguém pedir acesso a uma tela, o pedido aparece aqui e você recebe um e-mail." />
        ) : (
          <ul className="divide-y border-t">
            {pendentes.map((p) => {
              const perfil = p.perfil as { email: string | null; papel: string; ativo: boolean } | null;
              const quem = perfisQueAbrem(infoDaTela(p.rota).papeis);
              return (
                <li key={p.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_22rem]">
                  <div className="min-w-0 space-y-1.5 text-sm">
                    <p>
                      <span className="font-medium">{p.solicitante_nome}</span> <span className="text-muted-foreground">({papel(perfil?.papel ?? p.papel_atual)})</span> quer acesso a{" "}
                      <Link href={p.rota} className="font-medium underline-offset-2 hover:underline">
                        {p.tela}
                      </Link>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatarDataHora(p.criada_em)}
                      {perfil?.email ? ` · ${perfil.email}` : ""}
                      {perfil && !perfil.ativo ? " · usuário inativo" : ""}
                    </p>
                    {p.motivo && <p className="rounded-lg bg-muted/50 px-3 py-2 whitespace-pre-wrap">“{p.motivo}”</p>}
                    {quem && <p className="text-xs text-muted-foreground">Abrem esta tela: {quem}.</p>}
                    <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/configuracoes/usuarios/${p.solicitante}/editar`} />}>
                      <UserCog data-icon="inline-start" />
                      Ajustar perfil de {p.solicitante_nome.split(" ")[0]}
                    </Button>
                  </div>
                  <ResponderPedidoForm action={responderPedido} id={p.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Painel>

      <Painel id="respondidos" titulo="Respondidos" descricao="Os últimos 40.">
        {!respondidos?.length ? (
          <EstadoVazio compacto titulo="Nenhum pedido respondido ainda" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quem pediu</TableHead>
                <TableHead>Tela</TableHead>
                <TableHead>Resposta</TableHead>
                <TableHead>Quando</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {respondidos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <span className="font-medium">{p.solicitante_nome}</span>
                    <span className="block text-xs text-muted-foreground">era {papel(p.papel_atual)}</span>
                  </TableCell>
                  <TableCell>{p.tela}</TableCell>
                  <TableCell className="max-w-80 whitespace-normal">
                    <Status tom={p.status === "atendida" ? "sucesso" : "perigo"}>{p.status === "atendida" ? "Atendido" : "Recusado"}</Status>
                    {p.resposta && <span className="mt-1 block text-xs text-muted-foreground">“{p.resposta}”</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatarDataHora(p.respondida_em)}
                    {p.respondida_por_nome && <span className="block">por {p.respondida_por_nome}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Painel>
    </>
  );
}
