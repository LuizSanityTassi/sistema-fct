import Link from "next/link";
import { Download, Search, TriangleAlert } from "lucide-react";
import { AvisoSucesso, SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { TIPO_ARQUIVO_LABEL } from "@/lib/conciliacao/rotulos";
import { lerFiltrosArquivos, listarArquivos, mapaFiliais, type ArquivoLista } from "@/lib/data/conciliacao";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { arquivarArquivo, desarquivarArquivo, enviarArquivos } from "../actions";
import { BadgeTipoArquivo, Filial } from "../badges-conc";
import { ArquivarForm } from "./arquivar-form";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Arquivos da conciliação" };

function descreverMeta(a: ArquivoLista) {
  const m = (a.meta ?? {}) as Record<string, unknown>;
  const partes: string[] = [];
  if (m.empresa) partes.push(String(m.empresa));
  if (m.qtd != null) partes.push(`${m.qtd} ${a.tipo === "trier" ? "título(s)" : "boleto(s)"}`);
  if (m.total != null) partes.push(formatarMoeda(Number(m.total)));
  if (m.vencIni) partes.push(`venc. ${formatarData(String(m.vencIni))} a ${formatarData(String(m.vencFim))}`);
  if (m.geracao) partes.push(`gerado ${formatarData(String(m.geracao))}`);
  if (Array.isArray(m.filiais) && m.filiais.length > 1) partes.push(`filiais ${(m.filiais as number[]).join(", ")}`);
  return partes.join(" · ");
}

const tamanho = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function ArquivosPage({ searchParams }: PageProps<"/conciliacao/arquivos">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/conciliacao/arquivos"), searchParams]);
  const filtros = lerFiltrosArquivos(sp);
  const [arquivos, filiais] = await Promise.all([listarArquivos(filtros), mapaFiliais()]);
  const escreve = podeConciliar(sessao.papel);
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const ok = sp.ok === "arquivado" ? "Arquivo arquivado." : sp.ok === "desarquivado" ? "Arquivo de volta à lista." : null;
  const temFiltro = Boolean(filtros.q || filtros.tipo || filtros.filial !== undefined || filtros.arquivados);

  return (
    <>
      <PageHeader eyebrow="DDA x Trier" titulo="Arquivos" descricao="Tudo que foi enviado fica guardado em armazenamento privado e pode ser reaproveitado em novas conciliações." />

      {ok && (
        <div className="mb-4">
          <AvisoSucesso mensagem={ok} />
        </div>
      )}
      {erro && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{erro}</p>
        </div>
      )}

      {escreve && (
        <div className="mb-6">
          <UploadForm action={enviarArquivos} />
        </div>
      )}

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 lg:grid-cols-[1fr_auto_auto_auto_auto_auto] lg:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Nome do arquivo" className="pl-8" aria-label="Buscar arquivo" />
        </div>
        <SelectNativo name="tipo" defaultValue={filtros.tipo ?? ""} aria-label="Tipo" className="lg:w-56">
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_ARQUIVO_LABEL).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </SelectNativo>
        <Input name="filial" type="number" min={1} max={9999} defaultValue={filtros.filial ?? ""} placeholder="Filial (ex.: 301)" aria-label="Filial" className="lg:w-36" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="arquivados" value="1" defaultChecked={filtros.arquivados} className="size-4 accent-fct-tinta" />
          Arquivados
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {temFiltro ? (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/conciliacao/arquivos" />}>
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
              <TableHead>Arquivo</TableHead>
              <TableHead className="hidden md:table-cell">Tipo</TableHead>
              <TableHead className="hidden w-24 lg:table-cell">Filial</TableHead>
              <TableHead className="hidden xl:table-cell">Enviado</TableHead>
              <TableHead className="w-40 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {arquivos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="vazio">
                  {filtros.arquivados ? "Nenhum arquivo arquivado." : "Nenhum arquivo enviado ainda."}
                </TableCell>
              </TableRow>
            ) : (
              arquivos.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium break-all">{a.nome}</p>
                    <p className="text-xs text-muted-foreground">{descreverMeta(a)}</p>
                    <p className="text-xs text-muted-foreground md:hidden">{TIPO_ARQUIVO_LABEL[a.tipo]}</p>
                    {a.arquivado_em && <p className="text-xs text-amber-800">Arquivado em {formatarData(a.arquivado_em)}: {a.motivo_arquivo}</p>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <BadgeTipoArquivo tipo={a.tipo} />
                    {a.origem !== "upload" && <p className="mt-1 text-xs text-muted-foreground">via {a.origem === "agente" ? "agente Itaú" : a.origem === "robo_trier" ? "robô Trier" : a.origem}</p>}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Filial filial={a.filial} nome={a.filial != null ? filiais.porFilial.get(a.filial)?.nome : null} />
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                    {formatarDataHora(a.enviado_em)}
                    <br />
                    {a.quem?.nome ?? "—"} · {tamanho(a.tamanho)}
                    {a.vezes > 1 ? ` · enviado ${a.vezes}×` : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a href={`/api/conciliacao/arquivo/${a.id}`} className="inline-flex items-center gap-1 text-sm text-fct-tinta underline" title="Baixar">
                        <Download className="size-3.5" aria-hidden />
                        Baixar
                      </a>
                      {escreve && !a.arquivado_em && <ArquivarForm id={a.id} nome={a.nome} action={arquivarArquivo} />}
                      {escreve && a.arquivado_em && (
                        <form action={desarquivarArquivo}>
                          <input type="hidden" name="id" value={a.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Desarquivar
                          </Button>
                        </form>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
