import Link from "next/link";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { lotesPos } from "@/lib/caixa/importar-pos";
import { formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";
import { conferirPlanilhaPos, desfazerImportacaoPos, lancarPlanilhaPos } from "./actions";
import { ImportarPosForm } from "./importar-form";

export const metadata = { title: "Importar planilha POS" };

export default async function ImportarPosPage({ searchParams }: PageProps<"/financeiro/diferenca-caixa/importar">) {
  const [, sp] = await Promise.all([exigirAcesso("/financeiro/diferenca-caixa"), searchParams]);
  const lotes = await lotesPos(await createClient());
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const desfeito = typeof sp.desfeito === "string" ? Number(sp.desfeito) : null;

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="Importar planilha POS"
        descricao="A planilha semanal “POS Folha de Quebra de Caixa” (vendas pagas em outras modalidades: PIX CNPJ, cartão POS, débito online, boleto…). Cada venda vira uma quebra do vendedor, ligada pelo código do Trier, e vai para a folha da competência escolhida. Pode importar a planilha da semana de novo: o que já entrou não duplica."
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/financeiro/diferenca-caixa" />}>
            <ChevronLeft data-icon="inline-start" />
            Diferença de caixa
          </Button>
        }
      />

      {desfeito !== null && (
        <div className="mb-4">
          <AvisoSucesso
            mensagem={desfeito ? `Importação desfeita: ${desfeito} quebra(s) apagada(s); a folha foi recalculada.` : "Nada para desfazer: as quebras desse lote já foram justificadas ou decididas."}
          />
        </div>
      )}
      {erro && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {erro}
        </p>
      )}

      <ImportarPosForm conferir={conferirPlanilhaPos} lancar={lancarPlanilhaPos} />

      <section className="mt-6 rounded-xl border bg-card">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold">Importações feitas</h2>
          <p className="text-xs text-muted-foreground">Desfazer apaga só as quebras do lote que ainda estão pendentes (sem justificativa nem decisão).</p>
        </div>
        {lotes.length === 0 ? (
          <p className="border-t px-5 py-6 text-sm text-muted-foreground">Nenhuma planilha importada ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Por</TableHead>
                <TableHead>Folha</TableHead>
                <TableHead className="text-right">Quebras</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lotes.map((l) => (
                <TableRow key={l.lote}>
                  <TableCell>{formatarDataHora(l.quando)}</TableCell>
                  <TableCell>{l.por ?? "—"}</TableCell>
                  <TableCell>{rotuloCompetencia(l.competencia.slice(0, 7))}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.qtd}
                    {l.decididas ? <span className="block text-xs text-muted-foreground">{l.decididas} já justificada(s)/decidida(s)</span> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
                  <TableCell className="text-right">
                    {l.qtd > l.decididas && (
                      <ConfirmarAcao
                        titulo="Desfazer esta importação?"
                        descricao={`Apaga ${l.qtd - l.decididas} quebra(s) ainda pendente(s) deste lote e recalcula a folha. As já justificadas ou decididas ficam.`}
                        rotuloBotao="Desfazer"
                        variant="destructive"
                        action={desfazerImportacaoPos}
                        campos={{ lote: l.lote }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
