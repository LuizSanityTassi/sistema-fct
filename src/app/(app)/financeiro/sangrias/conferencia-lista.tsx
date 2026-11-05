"use client";

import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";
import { CheckCheck, Paperclip } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SITUACOES_SANGRIA, TOM_SANGRIA, type SituacaoSangria } from "@/lib/sangrias/rotulos";
import type { Tom } from "@/lib/tons";
import type { EstadoAcao } from "../../sangrias/actions";

export type LinhaConferencia = {
  id: string;
  loja: string;
  lojaNome: string;
  deposito: string;
  retirada: string;
  banco: string;
  numero: string | null;
  valor: string;
  anexos: number;
  situacao: string;
  cadastro: string;
  omie: { rotulo: string; tom: Tom } | null;
};

/** Lista da conferência: marcar várias (com comprovante) e conferir de uma vez; cada linha abre a conferência dela. */
export function ConferenciaLista({ linhas, action, podeConferir }: { linhas: LinhaConferencia[]; action: (prev: EstadoAcao, fd: FormData) => Promise<EstadoAcao>; podeConferir: boolean }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const marcaveis = linhas.filter((l) => l.situacao === "pendente" && l.anexos > 0).map((l) => l.id);
  const [marcadas, setMarcadas] = React.useState<Set<string>>(new Set());
  const todas = marcaveis.length > 0 && marcaveis.every((id) => marcadas.has(id));
  const alternar = (id: string) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <form
      action={async (fd) => {
        enviar(fd);
        setMarcadas(new Set());
      }}
    >
      {podeConferir && marcaveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b bg-superficie/60 px-5 py-2.5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={todas} onChange={() => setMarcadas(todas ? new Set() : new Set(marcaveis))} className="size-4" />
            Marcar todas com comprovante ({marcaveis.length})
          </label>
          <Button type="submit" size="sm" disabled={pendente || marcadas.size === 0} className="ml-auto">
            <CheckCheck data-icon="inline-start" />
            {pendente ? "Conferindo…" : marcadas.size ? `Conferir ${marcadas.size === 1 ? "1 marcada" : `${marcadas.size} marcadas`}` : "Conferir marcadas"}
          </Button>
        </div>
      )}
      {(estado.erro || estado.ok) && (
        <div className="border-b px-5 py-3">
          <ErroFormulario mensagem={estado.erro} />
          <AvisoSucesso mensagem={estado.ok} />
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {podeConferir && <TableHead className="w-10" aria-label="Marcar" />}
            <TableHead>Filial</TableHead>
            <TableHead>Depósito</TableHead>
            <TableHead className="hidden md:table-cell">Retirada</TableHead>
            <TableHead>Banco</TableHead>
            <TableHead className="hidden lg:table-cell">Nº depósito</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="hidden xl:table-cell">Cadastro</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Omie</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => {
            const marcavel = marcaveis.includes(l.id);
            return (
              <TableRow key={l.id} className={l.situacao === "cancelada" ? "opacity-60" : marcadas.has(l.id) ? "bg-emerald-50/60" : undefined}>
                {podeConferir && (
                  <TableCell>
                    {marcavel ? (
                      <input type="checkbox" name="ids" value={l.id} checked={marcadas.has(l.id)} onChange={() => alternar(l.id)} aria-label={`Marcar sangria ${l.loja} de ${l.deposito}`} className="size-4" />
                    ) : null}
                  </TableCell>
                )}
                <TableCell>
                  <Link href={`/financeiro/sangrias/${l.id}`} className="font-medium hover:underline">
                    <span className="font-mono text-xs">{l.loja}</span> <span className="hidden xl:inline">{l.lojaNome}</span>
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">
                  <Link href={`/financeiro/sangrias/${l.id}`} className="hover:underline">
                    {l.deposito}
                  </Link>
                </TableCell>
                <TableCell className="hidden tabular-nums md:table-cell">{l.retirada}</TableCell>
                <TableCell>{l.banco}</TableCell>
                <TableCell className="hidden font-mono text-xs lg:table-cell">{l.numero ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.valor}
                  {l.anexos === 0 && l.situacao === "pendente" ? (
                    <span className="block text-[11px] text-amber-800">sem comprovante</span>
                  ) : l.anexos > 0 ? (
                    <span className="block text-[11px] text-muted-foreground">
                      <Paperclip className="mr-0.5 inline size-3 align-[-1px]" aria-hidden />
                      {l.anexos}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">{l.cadastro}</TableCell>
                <TableCell>
                  <Status tom={TOM_SANGRIA[l.situacao as SituacaoSangria] ?? "neutro"}>{SITUACOES_SANGRIA[l.situacao as SituacaoSangria] ?? l.situacao}</Status>
                </TableCell>
                <TableCell>
                  {l.omie ? (
                    <Link href={`/financeiro/sangrias/${l.id}`} className="hover:underline">
                      <Status tom={l.omie.tom}>{l.omie.rotulo}</Status>
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </form>
  );
}
