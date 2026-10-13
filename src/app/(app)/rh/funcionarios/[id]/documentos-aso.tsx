import { Download } from "lucide-react";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listarAsoDoFuncionario, listarDocumentosDoFuncionario } from "@/lib/data/documentos";
import { formatarData, formatarDataHora } from "@/lib/formatos";
import { ASO_TIPO_LABEL, CATEGORIA_DOC_LABEL, situacaoAso } from "@/lib/rh/rotulos";
import { removerAso, salvarAso } from "../../aso/actions";
import { enviarDocumento, removerDocumento } from "../../documentos/actions";
import { AsoForm } from "./aso-form";
import { DocumentoForm } from "./documento-form";

const CLASSE_SITUACAO = {
  valido: "border-emerald-200 bg-emerald-50 text-emerald-700",
  vencendo: "border-amber-200 bg-amber-50 text-amber-800",
  vencido: "border-red-200 bg-red-50 text-red-700",
  sem_validade: "border-border bg-muted text-muted-foreground",
} as const;

export function BadgeAso({ validade }: { validade: string | null }) {
  const s = situacaoAso(validade);
  return (
    <Badge variant="outline" className={CLASSE_SITUACAO[s.codigo]}>
      {s.rotulo}
    </Badge>
  );
}

type Props = { employeeId: string; podeEditar: boolean };

/** Seções "Documentos" e "ASO" da ficha do funcionário. */
export async function DocumentosEAso({ employeeId, podeEditar }: Props) {
  const [documentos, asos] = await Promise.all([
    listarDocumentosDoFuncionario(employeeId),
    listarAsoDoFuncionario(employeeId),
  ]);

  return (
    <>
      <section id="documentos" className="mt-4 rounded-xl border bg-card">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-semibold">Documentos ({documentos.length})</h2>
        </div>
        {documentos.length === 0 ? (
          <p className="border-t px-5 py-5 text-sm text-muted-foreground">Nenhum documento enviado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                <TableHead className="hidden md:table-cell">Data</TableHead>
                <TableHead className="hidden lg:table-cell">Enviado</TableHead>
                <TableHead className="w-40 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documentos.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <p className="font-medium">{d.nome}</p>
                    {d.descricao && <p className="text-xs text-muted-foreground">{d.descricao}</p>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{CATEGORIA_DOC_LABEL[d.categoria]}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatarData(d.data_documento)}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {formatarDataHora(d.created_at)}
                    {d.enviado_por?.nome ? ` · ${d.enviado_por.nome}` : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`/api/arquivos/documento/${d.id}`}
                        className="inline-flex items-center gap-1 text-sm text-fct-navy underline"
                      >
                        <Download className="size-3.5" aria-hidden /> Baixar
                      </a>
                      {podeEditar && (
                        <ConfirmarAcao
                          titulo="Remover documento?"
                          descricao={`"${d.nome}" sai da ficha. O arquivo continua guardado e a remoção fica na auditoria.`}
                          rotuloBotao="Remover"
                          variant="destructive"
                          action={removerDocumento}
                          campos={{ id: d.id }}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {podeEditar && (
          <div className="border-t p-4">
            <DocumentoForm action={enviarDocumento.bind(null, employeeId)} />
          </div>
        )}
      </section>

      <section id="aso" className="mt-4 rounded-xl border bg-card">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-semibold">ASO — exames ocupacionais ({asos.length})</h2>
        </div>
        {asos.length === 0 ? (
          <p className="border-t px-5 py-5 text-sm text-muted-foreground">Nenhum ASO registrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden sm:table-cell">Exame</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-40 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {asos.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium">{ASO_TIPO_LABEL[a.tipo]}</p>
                    {a.observacoes && <p className="text-xs text-muted-foreground">{a.observacoes}</p>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{formatarData(a.data_realizacao)}</TableCell>
                  <TableCell>{formatarData(a.data_validade)}</TableCell>
                  <TableCell>
                    <BadgeAso validade={a.data_validade} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {a.storage_path ? (
                        <a href={`/api/arquivos/aso/${a.id}`} className="inline-flex items-center gap-1 text-sm text-fct-navy underline">
                          <Download className="size-3.5" aria-hidden /> Laudo
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">sem laudo</span>
                      )}
                      {podeEditar && (
                        <ConfirmarAcao
                          titulo="Remover ASO?"
                          descricao="O registro sai da ficha; a remoção fica na auditoria."
                          rotuloBotao="Remover"
                          variant="destructive"
                          action={removerAso}
                          campos={{ id: a.id }}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {podeEditar && (
          <div className="border-t p-4">
            <AsoForm action={salvarAso.bind(null, employeeId)} />
          </div>
        )}
      </section>
    </>
  );
}
