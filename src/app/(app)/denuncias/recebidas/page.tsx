import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Search } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { CATEGORIAS_DENUNCIA, COR_STATUS, ehCategoria, ehStatusDenuncia, STATUS_DENUNCIA } from "@/lib/denuncias/rotulos";
import { formatarData } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Denúncias recebidas" };

export default async function DenunciasRecebidasPage({ searchParams }: PageProps<"/denuncias/recebidas">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/denuncias"), searchParams]);
  const supabase = await createClient();
  const { data: souComite } = await supabase.from("denuncia_responsaveis").select("user_id").eq("user_id", sessao.id).maybeSingle();
  if (!souComite) redirect("/denuncias");

  const situacao = typeof sp.situacao === "string" ? sp.situacao : "abertas";
  const categoria = typeof sp.categoria === "string" && ehCategoria(sp.categoria) ? sp.categoria : "";
  let consulta = supabase.from("denuncias").select("id, protocolo, categoria, local_texto, recebida_em, status, identificacao").order("seq", { ascending: false }).limit(500);
  if (situacao === "abertas") consulta = consulta.in("status", ["recebida", "em_analise"]);
  else if (ehStatusDenuncia(situacao)) consulta = consulta.eq("status", situacao);
  if (categoria) consulta = consulta.eq("categoria", categoria);
  const [{ data: denuncias, error }, { data: mensagens }] = await Promise.all([
    consulta,
    supabase.from("denuncia_mensagens").select("denuncia_id, autor, interna, seq").order("seq"),
  ]);
  if (error) throw new Error(error.message);

  // última mensagem visível de cada denúncia: se foi de quem denunciou, está esperando o comitê
  const ultima = new Map<string, string>();
  const qtd = new Map<string, number>();
  for (const m of mensagens ?? []) {
    if (m.interna) continue;
    ultima.set(m.denuncia_id, m.autor);
    qtd.set(m.denuncia_id, (qtd.get(m.denuncia_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        eyebrow="Canal de denúncias"
        titulo="Denúncias recebidas"
        descricao="Só quem está no comitê vê esta lista. Nada aqui mostra quem enviou, a não ser que a pessoa tenha escolhido se identificar."
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/denuncias" />}>
            <ChevronLeft data-icon="inline-start" />
            Canal
          </Button>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <SelectNativo name="situacao" defaultValue={situacao} aria-label="Situação" className="w-48">
          <option value="abertas">Abertas</option>
          {Object.entries(STATUS_DENUNCIA).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
          <option value="todas">Todas</option>
        </SelectNativo>
        <SelectNativo name="categoria" defaultValue={categoria} aria-label="Assunto" className="w-64">
          <option value="">Todos os assuntos</option>
          {Object.entries(CATEGORIAS_DENUNCIA).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </SelectNativo>
        <Button type="submit" variant="outline" size="sm">
          <Search data-icon="inline-start" />
          Filtrar
        </Button>
      </form>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocolo</TableHead>
              <TableHead>Assunto</TableHead>
              <TableHead>Onde</TableHead>
              <TableHead>Recebida em</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Conversa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(denuncias ?? []).map((d) => {
              const st = ehStatusDenuncia(d.status) ? d.status : "recebida";
              const esperando = ultima.get(d.id) === "denunciante" && (st === "recebida" || st === "em_analise");
              return (
                <TableRow key={d.id}>
                  <TableCell className="font-mono font-semibold">
                    <Link href={`/denuncias/recebidas/${d.id}`} className="text-fct-tinta hover:underline">
                      {d.protocolo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {CATEGORIAS_DENUNCIA[d.categoria as keyof typeof CATEGORIAS_DENUNCIA] ?? d.categoria}
                    {d.identificacao && <span className="ml-2 rounded-full border px-1.5 text-[11px] text-muted-foreground">identificada</span>}
                  </TableCell>
                  <TableCell className="max-w-56 truncate">{d.local_texto ?? "—"}</TableCell>
                  <TableCell>{formatarData(d.recebida_em)}</TableCell>
                  <TableCell>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${COR_STATUS[st]}`}>{STATUS_DENUNCIA[st]}</span>
                  </TableCell>
                  <TableCell className={esperando ? "font-medium text-amber-800" : "text-muted-foreground"}>
                    {esperando ? "Aguardando o comitê" : `${qtd.get(d.id) ?? 0} mensagem(ns)`}
                  </TableCell>
                </TableRow>
              );
            })}
            {(denuncias ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="vazio">
                  Nenhuma denúncia com esses filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
