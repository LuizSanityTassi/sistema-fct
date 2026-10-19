import Link from "next/link";
import { Landmark, Pencil, Plus } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { nomeBanco, TIPOS_CONTA, type ContaBancaria, type TipoConta } from "@/lib/financeiro/carteira";
import { createClient } from "@/lib/supabase/server";
import { RotuloGrupo } from "../badges-fin";

export const metadata = { title: "Carteira" };

export default async function CarteiraPage({ searchParams }: PageProps<"/financeiro/carteira">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/carteira"), searchParams]);
  const escreve = sessao.papel === "admin" || sessao.papel === "financeiro";
  const verInativas = sp.inativas === "1";
  const supabase = await createClient();
  const { data } = await supabase.from("fin_contas_bancarias").select("id, apelido, banco, agencia, conta, tipo, grupo, ativa, observacao, atualizado_em").order("apelido");
  const todas = (data ?? []) as ContaBancaria[];
  const inativas = todas.filter((c) => !c.ativa).length;
  const lista = verInativas ? todas : todas.filter((c) => c.ativa);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="Carteira"
        descricao="As contas da empresa: bancos, aplicações, caixas e cofres, com agência e conta."
        acoes={
          escreve ? (
            <Button nativeButton={false} render={<Link href="/financeiro/carteira/nova" />}>
              <Plus data-icon="inline-start" />
              Nova conta
            </Button>
          ) : undefined
        }
      />
      {sp.salvo === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem="Conta salva." />
        </div>
      )}

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold">
            {lista.length} {lista.length === 1 ? "conta" : "contas"}
            {!verInativas && inativas > 0 ? " ativas" : ""}
          </h2>
          {inativas > 0 && (
            <Link href={verInativas ? "/financeiro/carteira" : "/financeiro/carteira?inativas=1"} className="text-xs font-medium text-muted-foreground hover:text-foreground">
              {verInativas ? "Esconder inativas" : `Mostrar ${inativas === 1 ? "a inativa" : `as ${inativas} inativas`}`}
            </Link>
          )}
        </div>
        {lista.length === 0 ? (
          <EstadoVazio compacto icone={Landmark} titulo="Nenhuma conta cadastrada" descricao={escreve ? "Cadastre a primeira em Nova conta." : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Apelido</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead className="text-right">Agência</TableHead>
                <TableHead className="text-right">Conta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Empresa</TableHead>
                {escreve && <TableHead className="w-12 text-right">Editar</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((c) => (
                <TableRow key={c.id} className={c.ativa ? undefined : "opacity-60"}>
                  <TableCell>
                    <span className="font-medium">{c.apelido}</span>
                    {!c.ativa && (
                      <Status tom="neutro" className="ml-2">
                        Inativa
                      </Status>
                    )}
                    {c.observacao && <span className="block text-xs text-muted-foreground">{c.observacao}</span>}
                  </TableCell>
                  <TableCell>
                    {c.banco ? (
                      <>
                        {nomeBanco(c.banco)} <span className="font-mono text-xs text-muted-foreground">{c.banco}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{c.agencia ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{c.conta ?? "—"}</TableCell>
                  <TableCell>{TIPOS_CONTA[c.tipo as TipoConta] ?? c.tipo}</TableCell>
                  <TableCell>{c.grupo ? <RotuloGrupo grupo={c.grupo} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                  {escreve && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" aria-label={`Editar ${c.apelido}`} nativeButton={false} render={<Link href={`/financeiro/carteira/${c.id}`} />}>
                        <Pencil />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
