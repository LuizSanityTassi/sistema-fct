import Link from "next/link";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import {
  ACOES_AUDITADAS,
  ENTIDADES_AUDITADAS,
  lerFiltrosAuditoria,
  listarAuditoria,
  listarAutoresAuditoria,
  TAMANHO_PAGINA,
} from "@/lib/data/auditoria";
import { formatarDataHora } from "@/lib/formatos";
import type { Json } from "@/lib/supabase/types";

export const metadata = { title: "Auditoria" };

function valorLegivel(v: Json | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Mudancas({ anterior, novo }: { anterior: Json | null; novo: Json | null }) {
  const a = anterior && typeof anterior === "object" && !Array.isArray(anterior) ? anterior : {};
  const n = novo && typeof novo === "object" && !Array.isArray(novo) ? novo : {};
  const chaves = [...new Set([...Object.keys(a), ...Object.keys(n)])];
  if (chaves.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="space-y-0.5 text-xs">
      {chaves.slice(0, 12).map((k) => (
        <li key={k} className="break-all">
          <span className="font-mono text-muted-foreground">{k}</span>:{" "}
          {k in a && <span className="text-red-700 line-through">{valorLegivel(a[k])}</span>}
          {k in a && k in n && " → "}
          {k in n && <span className="text-emerald-700">{valorLegivel(n[k])}</span>}
        </li>
      ))}
      {chaves.length > 12 && <li className="text-muted-foreground">… e mais {chaves.length - 12}</li>}
    </ul>
  );
}

export default async function AuditoriaPage({ searchParams }: PageProps<"/configuracoes/auditoria">) {
  const [, sp] = await Promise.all([exigirAcesso("/configuracoes/auditoria"), searchParams]);
  const filtros = lerFiltrosAuditoria(sp);
  const [resultado, autores] = await Promise.all([listarAuditoria(filtros), listarAutoresAuditoria()]);
  const params = { usuario: filtros.usuario, entidade: filtros.entidade, acao: filtros.acao, de: filtros.de, ate: filtros.ate, registro: filtros.registro };
  const temFiltro = Object.values(params).some(Boolean);

  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        titulo="Auditoria"
        descricao="Quem alterou o quê e quando, com o valor anterior e o novo. Somente leitura."
      />

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 lg:grid-cols-[auto_auto_auto_auto_auto_auto_auto] lg:items-center">
        <SelectNativo name="usuario" defaultValue={filtros.usuario ?? ""} aria-label="Usuário" className="lg:w-44">
          <option value="">Todos os usuários</option>
          {autores.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="entidade" defaultValue={filtros.entidade ?? ""} aria-label="Entidade" className="lg:w-40">
          <option value="">Todas as entidades</option>
          {Object.entries(ENTIDADES_AUDITADAS).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="acao" defaultValue={filtros.acao ?? ""} aria-label="Ação" className="lg:w-36">
          <option value="">Todas as ações</option>
          {Object.entries(ACOES_AUDITADAS).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </SelectNativo>
        <Input name="de" type="date" defaultValue={filtros.de ?? ""} aria-label="De" className="lg:w-40" />
        <Input name="ate" type="date" defaultValue={filtros.ate ?? ""} aria-label="Até" className="lg:w-40" />
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {temFiltro ? (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/configuracoes/auditoria" />}>
            Limpar
          </Button>
        ) : (
          <span />
        )}
        {filtros.registro && <input type="hidden" name="registro" value={filtros.registro} />}
      </form>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Quando</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead className="hidden sm:table-cell">Entidade</TableHead>
              <TableHead className="hidden md:table-cell">Registro</TableHead>
              <TableHead>Mudanças</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhum registro de auditoria com esses filtros.
                </TableCell>
              </TableRow>
            ) : (
              resultado.itens.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{formatarDataHora(r.created_at)}</TableCell>
                  <TableCell className="font-medium">{r.usuario?.nome ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ACOES_AUDITADAS[r.acao] ?? r.acao}</Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{ENTIDADES_AUDITADAS[r.entidade] ?? r.entidade}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {r.registro_id ? (
                      <Link href={`/configuracoes/auditoria?registro=${r.registro_id}`} className="font-mono text-xs text-fct-navy hover:underline" title="Ver histórico deste registro">
                        {r.registro_id.slice(0, 8)}…
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Mudancas anterior={r.valor_anterior} novo={r.valor_novo} />
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
