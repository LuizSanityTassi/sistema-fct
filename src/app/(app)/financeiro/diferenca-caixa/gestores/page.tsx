import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { gruposDeGestores } from "@/lib/caixa/gestores";
import { gestoresDasLojas, quebrasAbertasPorLoja, usuariosDoCaixa } from "@/lib/data/diferenca-caixa";
import { formatarDataHora } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { definirGestorLoja } from "../actions";
import { GestorForm } from "./gestor-form";

export const metadata = { title: "Gestores das quebras" };

export default async function GestoresPage() {
  await exigirAcesso("/financeiro/diferenca-caixa");
  const supabase = await createClient();
  const [usuarios, gestores, abertas, { data: lojas }] = await Promise.all([
    usuariosDoCaixa(),
    gestoresDasLojas(),
    quebrasAbertasPorLoja(),
    supabase.from("branches").select("id, codigo, nome").eq("ativo", true).order("codigo"),
  ]);
  const grupos = gruposDeGestores(usuarios);
  const nomeUsuario = new Map(usuarios.map((u) => [u.id, u.nome]));
  const semGerente = (lojas ?? []).filter((l) => !gestores.has(l.id) && (abertas.get(l.id)?.abertas ?? 0) > 0).length;

  return (
    <>
      <PageHeader
        eyebrow="Diferença de caixa"
        titulo="Gestores das quebras"
        descricao="O gestor é quem justifica as quebras de caixa da loja (o colaborador só vê a dele). Toda quebra nova já nasce com o gestor da loja; aqui você troca quando precisar e, se quiser, leva junto as quebras em aberto. Para trocar o gestor de uma quebra só, abra a quebra."
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/financeiro/diferenca-caixa" />}>
            <ChevronLeft data-icon="inline-start" />
            Diferença de caixa
          </Button>
        }
      />

      {usuarios.filter((u) => u.papel === "gerente").length === 0 && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ainda não há usuário com papel de gerente. Convide os gerentes em Administração → Usuários (papel “Gerente”, com a loja dele) e volte aqui para escolher.
        </p>
      )}
      {semGerente > 0 && (
        <p className="mb-4 text-sm text-amber-800">{semGerente} loja(s) com quebra em aberto e sem gestor definido: elas só aparecem para o gerente cadastrado na loja (se houver) e para o financeiro.</p>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead className="text-right">Quebras em aberto</TableHead>
              <TableHead>Gestor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(lojas ?? []).map((l) => {
              const g = gestores.get(l.id);
              const a = abertas.get(l.id);
              return (
                <TableRow key={l.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-fct-navy">{l.codigo}</span> {l.nome}
                    {g && <span className="block text-xs text-muted-foreground">desde {formatarDataHora(g.definido_em)}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a?.abertas ?? 0}
                    {a?.semGestor ? <span className="block text-xs text-amber-800">{a.semGestor} sem gestor</span> : null}
                  </TableCell>
                  <TableCell className="min-w-96">
                    <GestorForm
                      key={`${l.id}-${g?.profile_id ?? ""}`}
                      action={definirGestorLoja.bind(null, l.id)}
                      atual={g?.profile_id ?? null}
                      grupos={grupos}
                      rotulo={`Gestor das quebras da loja ${l.codigo}`}
                      mostrarMover
                    />
                    {g && !nomeUsuario.has(g.profile_id) && <span className="text-xs text-red-700">O gestor salvo está inativo: escolha outro.</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
