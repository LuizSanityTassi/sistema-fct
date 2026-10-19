import Link from "next/link";
import { Plus, Search, TriangleAlert } from "lucide-react";
import { AvisoSucesso, SelectNativo } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { contarPorPapel, lerFiltrosUsuarios, listarUsuarios, TAMANHO_PAGINA } from "@/lib/data/usuarios";
import { formatarDataHora } from "@/lib/formatos";
import { PAPEIS, PAPEL_LABEL } from "@/lib/roles";
import { enviarRedefinicaoSenha } from "./actions";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage({ searchParams }: PageProps<"/configuracoes/usuarios">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/configuracoes/usuarios"), searchParams]);
  const filtros = lerFiltrosUsuarios(sp);
  const [resultado, porPapel] = await Promise.all([listarUsuarios(filtros), contarPorPapel()]);
  const params = { q: filtros.q, papel: filtros.papel, situacao: filtros.situacao };
  const temFiltro = Boolean(filtros.q || filtros.papel || filtros.situacao !== "ativos");
  const temConvite = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        titulo="Usuários"
        descricao="Quem acessa o sistema, com qual papel e em quais unidades."
        acoes={
          <Button nativeButton={false} render={<Link href="/configuracoes/usuarios/novo" />}>
            <Plus data-icon="inline-start" />
            Convidar usuário
          </Button>
        }
      />

      {sp.convidado === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem={sp.modo === "confirmacao" ? "Conta criada. A pessoa recebe o e-mail de confirmação do Supabase e define a senha no primeiro acesso." : "Convite enviado. A pessoa recebe um e-mail para criar a senha."} />
        </div>
      )}
      {sp.salvo === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem="Usuário salvo." />
        </div>
      )}
      {sp.reset === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem="E-mail de redefinição de senha enviado (se o endereço existir)." />
        </div>
      )}
      {!temConvite && (
        <div role="note" className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Sem <code>SUPABASE_SERVICE_ROLE_KEY</code> no servidor, “Convidar” cria a conta e manda o e-mail de <strong>confirmação</strong> do Supabase (a pessoa define a senha no primeiro acesso) em vez do convite formal. Para o convite formal e para o agente do Itaú, veja Administração → Integrações.
          </p>
        </div>
      )}

      <section className="mb-4 flex flex-wrap gap-2">
        {PAPEIS.map((p) => (
          <Link key={p} href={`/configuracoes/usuarios?papel=${p}`} className="rounded-full border bg-card px-3 py-1 text-sm hover:border-primary/40">
            {PAPEL_LABEL[p]} <span className="font-semibold tabular-nums">{porPapel[p] ?? 0}</span>
          </Link>
        ))}
      </section>

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Nome ou e-mail" className="pl-8" aria-label="Buscar usuário" />
        </div>
        <SelectNativo name="papel" defaultValue={filtros.papel ?? ""} aria-label="Papel" className="sm:w-40">
          <option value="">Todos os papéis</option>
          {PAPEIS.map((p) => (
            <option key={p} value={p}>
              {PAPEL_LABEL[p]}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="situacao" defaultValue={filtros.situacao} aria-label="Situação" className="sm:w-32">
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </SelectNativo>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {temFiltro ? (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/configuracoes/usuarios" />}>
            Limpar
          </Button>
        ) : (
          <span />
        )}
      </form>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead className="hidden md:table-cell">Unidade principal</TableHead>
              <TableHead className="hidden lg:table-cell">Último acesso</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-44 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="vazio">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            ) : (
              resultado.itens.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link href={`/configuracoes/usuarios/${u.id}/editar`} className="font-medium hover:underline">
                      {u.nome || "(sem nome)"}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {u.email}
                      {u.id === sessao.id ? " · você" : ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{PAPEL_LABEL[u.papel]}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {u.unidade ? (
                      <>
                        <span className="font-mono text-xs text-fct-tinta">{u.unidade.codigo}</span> {u.unidade.nome}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{u.ultimo_acesso ? formatarDataHora(u.ultimo_acesso) : "nunca"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={u.ativo ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted text-muted-foreground"}>
                      {u.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {u.email && (
                        <ConfirmarAcao
                          titulo="Enviar redefinição de senha?"
                          descricao={`${u.email} recebe um link para criar uma nova senha.`}
                          rotuloBotao="Redefinir senha"
                          rotuloConfirmar="Enviar"
                          action={enviarRedefinicaoSenha}
                          campos={{ email: u.email }}
                        />
                      )}
                      <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/configuracoes/usuarios/${u.id}/editar`} />}>
                        Editar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3">
          <Paginacao pagina={resultado.pagina} paginas={resultado.paginas} total={resultado.total} tamanho={TAMANHO_PAGINA} params={params} />
        </div>
      </div>
    </>
  );
}
