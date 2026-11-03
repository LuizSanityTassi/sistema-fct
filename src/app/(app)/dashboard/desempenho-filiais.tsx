import Link from "next/link";
import { cn } from "cn";
import { Status } from "@/components/layout/status";
import { SetaLink } from "@/components/layout/seta-link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ORDEM_STATUS, ROTULO_STATUS, TOM_STATUS, type LinhaFilialOperacao, type StatusFilial } from "@/lib/data/dashboard-filiais";
import { pluralizar } from "@/lib/formatos";
import { PONTO } from "@/lib/tons";

export const moedaInteira = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const pctTexto = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export type ContagemStatus = Record<StatusFilial, number> & { total: number };

export function contarStatus(linhas: { status: StatusFilial }[]): ContagemStatus {
  return { total: linhas.length, critica: linhas.filter((l) => l.status === "critica").length, atencao: linhas.filter((l) => l.status === "atencao").length, em_dia: linhas.filter((l) => l.status === "em_dia").length };
}

/** Barra única com a proporção das filiais em cada situação. */
export function BarraSituacao({ contagem, className }: { contagem: ContagemStatus; className?: string }) {
  const { total } = contagem;
  return (
    <div role="img" aria-label={ORDEM_STATUS.map((s) => `${contagem[s]} ${ROTULO_STATUS[s].toLowerCase()}`).join(", ")} className={cn("flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted", className)}>
      {ORDEM_STATUS.map((s) => (contagem[s] ? <span key={s} className={cn("h-full transition-[width] duration-500", PONTO[TOM_STATUS[s]])} style={{ width: `${(contagem[s] / total) * 100}%` }} /> : null))}
    </div>
  );
}

/** Tabela da situação de cada filial; a linha inteira abre a ficha da filial (quando a pessoa pode abrir). */
export function TabelaFiliais({ linhas, veConciliacao, abreFicha }: { linhas: LinhaFilialOperacao[]; veConciliacao: boolean; abreFicha: boolean }) {
  return (
    <div className="overflow-x-auto border-t">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filial</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="text-right">Quebras em aberto</TableHead>
            {veConciliacao && <TableHead className="hidden text-right sm:table-cell">Conciliação</TableHead>}
            <TableHead className="hidden lg:table-cell">Principais pendências</TableHead>
            {abreFicha && (
              <TableHead className="w-8">
                <span className="sr-only">Abrir</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => {
            const nome = (
              <>
                <span className="font-mono text-xs text-muted-foreground">{l.codigo}</span> <span className="text-sm font-medium">{l.nome}</span>
              </>
            );
            return (
              <TableRow key={l.id} className="group relative transition-colors hover:bg-muted/50">
                <TableCell className="whitespace-normal">
                  {abreFicha ? (
                    <Link href={`/filiais/${l.id}`} className="outline-none after:absolute after:inset-0 focus-visible:underline">
                      {nome}
                    </Link>
                  ) : (
                    nome
                  )}
                  {l.regional && <span className="block text-xs text-muted-foreground">{l.regional}</span>}
                  <span className="block text-xs text-muted-foreground lg:hidden">{l.pendencias.slice(0, 2).join(" · ")}</span>
                </TableCell>
                <TableCell>
                  <Status tom={TOM_STATUS[l.status]}>{ROTULO_STATUS[l.status]}</Status>
                </TableCell>
                <TableCell className="text-right">
                  <span className="block font-semibold tabular-nums">{l.quebrasValor ? moedaInteira(l.quebrasValor) : "—"}</span>
                  {l.quebrasAbertas > 0 && <span className="block text-xs text-muted-foreground tabular-nums">{pluralizar(l.quebrasAbertas, "quebra", "quebras")}</span>}
                </TableCell>
                {veConciliacao && (
                  <TableCell className="hidden text-right sm:table-cell">
                    <span className="block font-semibold tabular-nums">{l.concPct === null ? "—" : pctTexto(l.concPct)}</span>
                    {l.concVencidas > 0 ? <span className="block text-xs font-medium text-red-700 tabular-nums">{pluralizar(l.concVencidas, "vencida", "vencidas")}</span> : l.concAbertas > 0 ? <span className="block text-xs text-muted-foreground tabular-nums">{pluralizar(l.concAbertas, "em aberto", "em aberto")}</span> : null}
                  </TableCell>
                )}
                <TableCell className="hidden max-w-80 whitespace-normal text-sm text-muted-foreground lg:table-cell">{l.pendencias.slice(0, 3).join(" · ") || "Nada pendente"}</TableCell>
                {abreFicha && (
                  <TableCell className="w-8 pl-0">
                    <SetaLink />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
