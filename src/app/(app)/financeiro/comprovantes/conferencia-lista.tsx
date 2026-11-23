"use client";

import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";
import { CheckCheck, FileText, ImageIcon } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CONFERENCIAS, TOM_CONFERENCIA, type Conferencia } from "@/lib/comprovantes/rotulos";
import type { EstadoAcao } from "../../comprovantes/actions";

export type LinhaConferencia = {
  id: string;
  loja: string;
  lojaNome: string;
  tipo: string;
  empresa: string | null;
  cliente: string;
  valor: string;
  parcelas: number;
  compra: string;
  anexos: { id: string; nome: string; imagem: boolean }[];
  conferencia: string;
  obs: string | null;
  cancelado: boolean;
  cadastro: string;
};

/** Fila da conferência: marcar vários (com anexo) e conferir de uma vez; cada linha abre a conferência dela, com a foto. */
export function ConferenciaLista({ linhas, action, podeConferir }: { linhas: LinhaConferencia[]; action: (prev: EstadoAcao, fd: FormData) => Promise<EstadoAcao>; podeConferir: boolean }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const marcaveis = linhas.filter((l) => !l.cancelado && l.conferencia === "pendente" && l.anexos.length > 0).map((l) => l.id);
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
            Marcar todos com anexo ({marcaveis.length})
          </label>
          <Button type="submit" size="sm" disabled={pendente || marcadas.size === 0} className="ml-auto">
            <CheckCheck data-icon="inline-start" />
            {pendente ? "Conferindo…" : marcadas.size ? `Conferir ${marcadas.size === 1 ? "1 marcado" : `${marcadas.size} marcados`}` : "Conferir marcados"}
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
            <TableHead>Compra</TableHead>
            <TableHead className="hidden sm:table-cell">Tipo</TableHead>
            <TableHead className="hidden md:table-cell">Empresa</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Parc.</TableHead>
            <TableHead className="text-center">Anexo</TableHead>
            <TableHead>Conferência</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => {
            const marcavel = marcaveis.includes(l.id);
            const href = `/financeiro/comprovantes/${l.id}`;
            return (
              <TableRow key={l.id} className={l.cancelado ? "opacity-60" : marcadas.has(l.id) ? "bg-emerald-50/60" : undefined}>
                {podeConferir && (
                  <TableCell>
                    {marcavel ? (
                      <input type="checkbox" name="ids" value={l.id} checked={marcadas.has(l.id)} onChange={() => alternar(l.id)} aria-label={`Marcar ${l.cliente} (${l.loja}, ${l.compra})`} className="size-4" />
                    ) : null}
                  </TableCell>
                )}
                <TableCell>
                  <Link href={href} className="font-medium hover:underline">
                    <span className="font-mono text-xs">{l.loja}</span> <span className="hidden xl:inline">{l.lojaNome}</span>
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">{l.compra}</TableCell>
                <TableCell className="hidden sm:table-cell">{l.tipo}</TableCell>
                <TableCell className="hidden max-w-48 truncate md:table-cell" title={l.empresa ?? undefined}>
                  {l.empresa ?? "—"}
                </TableCell>
                <TableCell>
                  <Link href={href} className="hover:underline">
                    {l.cliente}
                  </Link>
                  <span className="hidden text-[11px] text-muted-foreground xl:block">{l.cadastro}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.valor}</TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">{l.parcelas}</TableCell>
                <TableCell className="text-center">
                  {l.anexos.length === 0 ? (
                    <span className="text-[11px] text-amber-800">sem anexo</span>
                  ) : (
                    <span className="inline-flex gap-1">
                      {l.anexos.map((a) => {
                        const Icone = a.imagem ? ImageIcon : FileText;
                        return (
                          <a key={a.id} href={`/api/arquivos/comprovante/${a.id}`} target="_blank" rel="noopener" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title={`Baixar ${a.nome}`} aria-label={`Baixar ${a.nome}`}>
                            <Icone className="size-4" aria-hidden />
                          </a>
                        );
                      })}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {l.cancelado ? (
                    <Status tom="neutro">Cancelado</Status>
                  ) : (
                    <Link href={href} className="hover:underline">
                      <Status tom={TOM_CONFERENCIA[l.conferencia as Conferencia] ?? "neutro"}>{CONFERENCIAS[l.conferencia as Conferencia] ?? l.conferencia}</Status>
                    </Link>
                  )}
                  {l.conferencia === "divergente" && l.obs && <span className="mt-0.5 block max-w-52 truncate text-[11px] text-red-800" title={l.obs}>{l.obs}</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </form>
  );
}
