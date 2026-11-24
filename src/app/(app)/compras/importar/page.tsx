import { Bot, FileSpreadsheet, FileText, History } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { exigirAcesso } from "@/lib/auth/session";
import { diasAtras, hojeBrasil, importacoesRecentes } from "@/lib/data/compras";
import { formatarData, formatarDataHora } from "@/lib/formatos";
import { BuscarNoTrier, DesfazerImportacao, ImportarEspelho, ImportarPrePedidos } from "./formularios";

export const metadata = { title: "Importar — Compras" };
// o espelho de vários dias tem milhares de páginas: a leitura roda no servidor
export const maxDuration = 300;

type Resumo = Record<string, unknown>;
const n = (v: unknown) => (typeof v === "number" ? v.toLocaleString("pt-BR") : "—");

export default async function ImportarComprasPage() {
  const sessao = await exigirAcesso("/compras/importar");
  const podeImportar = sessao.papel === "admin" || sessao.papel === "compras";
  const importacoes = await importacoesRecentes(25);

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        titulo="Importar pedidos e notas"
        descricao="Suba todo dia os pré-pedidos (Excel do Trier). As notas de entrada o robô busca sozinho no Trier; se precisar, busque agora ou envie o PDF do espelho. O cruzamento fica em Compras → Pedidos × notas."
      />
      {podeImportar ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Painel titulo="Notas: buscar no Trier" icone={Bot} descricao="O robô gera o “Espelho Nota Fiscal Entrada” de todas as filiais e importa" className="lg:col-span-2">
            <BuscarNoTrier ontem={diasAtras(1)} hoje={hojeBrasil()} />
          </Painel>
          <Painel titulo="Pré-pedidos" icone={FileSpreadsheet} descricao="Excel “PRÉ-PEDIDO” (Con_0018), um bloco por filial">
            <ImportarPrePedidos hoje={hojeBrasil()} />
          </Painel>
          <Painel titulo="Notas: enviar o PDF" icone={FileText} descricao="Se preferir baixar à mão: PDF “Espelho Nota Fiscal Entrada” (Rel_0005)">
            <ImportarEspelho />
          </Painel>
        </div>
      ) : (
        <p className="mb-4 rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">Você consulta as importações; quem importa é o Compras ou o administrador.</p>
      )}

      <Painel titulo="Últimas importações" icone={History}>
        {importacoes.length === 0 ? (
          <EstadoVazio compacto titulo="Nenhuma importação ainda" />
        ) : (
          <ul className="divide-y border-t">
            {importacoes.map((i) => {
              const r = (i.resumo ?? {}) as Resumo;
              const desfeita = typeof r.desfeita_em === "string";
              const avisos = Array.isArray(r.avisos) ? (r.avisos as string[]) : [];
              return (
                <li key={i.id} className={`flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-start sm:justify-between ${desfeita ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <p className="font-medium">
                      <Status tom={i.tipo === "pedidos" ? "info" : "destaque"}>{i.tipo === "pedidos" ? "Pré-pedidos" : "Notas"}</Status> <span className="ml-1 break-all">{i.arquivo}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {i.tipo === "pedidos"
                        ? `${n(r.pedidos)} pré-pedidos · ${n(r.itens)} itens · ${n(r.quantidade)} unidades · data do pedido ${typeof r.data_pedido === "string" ? formatarData(r.data_pedido) : "—"}${r.ja_existiam ? ` · ${n(r.ja_existiam)} já estavam` : ""}`
                        : typeof r.erro === "string"
                          ? `Parou no meio: ${r.erro}`
                          : `${n(r.notas)} notas (${n(r.novas)} novas, ${n(r.atualizadas)} atualizadas) · ${n(r.itens)} itens · entradas de ${typeof r.entrada_de === "string" ? formatarData(r.entrada_de) : "—"} a ${typeof r.entrada_ate === "string" ? formatarData(r.entrada_ate) : "—"}`}
                      {avisos.length ? ` · ${avisos.length} aviso(s)` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {i.criado_por_nome ?? "—"} · {formatarDataHora(i.criado_em)}
                      {desfeita ? ` · desfeita por ${String(r.desfeita_por ?? "—")}` : ""}
                    </p>
                  </div>
                  {podeImportar && i.tipo === "pedidos" && !desfeita && <DesfazerImportacao id={i.id} />}
                </li>
              );
            })}
          </ul>
        )}
      </Painel>
    </>
  );
}
