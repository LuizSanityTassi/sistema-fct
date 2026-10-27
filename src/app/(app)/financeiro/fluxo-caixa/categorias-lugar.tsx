"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FORA, LUGARES, NAO_CLASSIFICADA, rotuloLugar } from "@/lib/fluxo-caixa/classes";
import { salvarLugar } from "./actions";

export type ItemCategoria = { grupo: string; categoria: string; lugar: string; por: "categoria" | "nome" | "grupo" | null; noAPagar: number };

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const COMO: Record<string, { texto: string; cor: string }> = {
  categoria: { texto: "planilha", cor: "text-emerald-700" },
  nome: { texto: "planilha", cor: "text-emerald-700" },
  grupo: { texto: "pelo grupo do Omie", cor: "text-amber-700" },
  sem: { texto: "sem lugar", cor: "text-red-700 font-semibold" },
};

/** Onde cada categoria de despesa do Omie entra no relatório; trocar o lugar vale para a frente e para trás. */
export function CategoriasLugar({ itens, podeEditar }: { itens: ItemCategoria[]; podeEditar: boolean }) {
  const router = useRouter();
  const [busca, setBusca] = React.useState("");
  const [so, setSo] = React.useState<"todas" | "pendentes" | "fora">("todas");
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState<string | null>(null);
  const semLugar = itens.filter((i) => i.lugar === NAO_CLASSIFICADA);
  const fora = itens.filter((i) => i.lugar === FORA);
  const peloGrupo = itens.filter((i) => i.por === "grupo");
  const t = busca.trim().toLowerCase();
  const lista = itens
    .filter((i) => (so === "fora" ? i.lugar === FORA : i.lugar !== FORA && (so === "todas" || i.lugar === NAO_CLASSIFICADA || i.por === "grupo")))
    .filter((i) => !t || `${i.grupo} ${i.categoria} ${i.lugar}`.toLowerCase().includes(t));
  const ordem = (l: string) => (l === NAO_CLASSIFICADA ? -1 : LUGARES.findIndex((x) => x.chave === l));
  lista.sort((a, b) => ordem(a.lugar) - ordem(b.lugar) || a.categoria.localeCompare(b.categoria, "pt-BR"));

  const mudar = async (i: ItemCategoria, lugar: string) => {
    setSalvando(`${i.grupo}|${i.categoria}`);
    const r = await salvarLugar({ grupo: i.grupo, categoria: i.categoria, lugar });
    setSalvando(null);
    if (r.erro) setErro(r.erro);
    else {
      setErro(null);
      router.refresh();
    }
  };

  return (
    <details className="rounded-xl border bg-card p-4" open={semLugar.length > 0}>
      <summary className="cursor-pointer text-sm font-semibold">
        Categorias do Omie no relatório{" "}
        <span className={`font-normal ${semLugar.length ? "text-red-700" : "text-muted-foreground"}`}>
          · {itens.length - fora.length} categorias{semLugar.length ? ` · ${semLugar.length} SEM LUGAR` : " · todas com lugar"}
          {peloGrupo.length ? ` · ${peloGrupo.length} pelo grupo (fora da planilha)` : ""}
        </span>
      </summary>
      <div className="mt-3 space-y-2 text-sm">
        <p className="text-xs text-muted-foreground">
          Cada categoria de despesa do Omie entra num lugar do relatório (o “total de despesas” do contador aqui se divide em <strong>Despesas fixas</strong> e <strong>Despesas variáveis</strong>). “Planilha” = está na planilha de categorias do fluxo; “pelo grupo” = não está na planilha e entrou pelo grupo do Omie; “sem lugar” = aparece em vermelho no relatório até alguém escolher. {podeEditar ? "Troque o lugar no seletor: muda o relatório na hora, inclusive os dias passados." : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar categoria ou grupo" className="w-64 rounded-lg border border-input bg-background px-2 py-1 text-sm" aria-label="Buscar categoria" />
          <select value={so} onChange={(e) => setSo(e.target.value === "pendentes" || e.target.value === "fora" ? e.target.value : "todas")} className="rounded-lg border border-input bg-background px-2 py-1 text-sm" aria-label="Filtro">
            <option value="todas">Todas</option>
            <option value="pendentes">Só sem lugar e pelo grupo</option>
            <option value="fora">Fora do relatório ({fora.length})</option>
          </select>
          {erro && <span className="text-xs text-red-700">{erro}</span>}
        </div>
        <div className="max-h-[480px] overflow-y-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Categoria do Omie</th>
                <th className="px-2 py-1.5 text-left">Grupo no Omie</th>
                <th className="px-2 py-1.5 text-right">No a pagar</th>
                <th className="px-2 py-1.5 text-left">Como entrou</th>
                <th className="px-2 py-1.5 text-left">Lugar no relatório</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => {
                const como = COMO[i.por ?? "sem"];
                const chave = `${i.grupo}|${i.categoria}`;
                return (
                  <tr key={chave} className={`border-t ${i.lugar === NAO_CLASSIFICADA ? "bg-red-50" : ""}`}>
                    <td className="px-2 py-1 font-medium">{i.categoria}</td>
                    <td className="px-2 py-1 text-muted-foreground">{i.grupo || "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{i.noAPagar ? moeda(i.noAPagar) : "—"}</td>
                    <td className={`px-2 py-1 ${como.cor}`}>{como.texto}</td>
                    <td className="px-2 py-1">
                      {podeEditar ? (
                        <select
                          value={i.lugar === NAO_CLASSIFICADA ? "" : i.lugar}
                          onChange={(e) => e.target.value && mudar(i, e.target.value)}
                          disabled={salvando === chave}
                          className={`w-72 rounded border bg-background px-1.5 py-0.5 ${i.lugar === NAO_CLASSIFICADA ? "border-red-400" : "border-input"}`}
                          aria-label={`Lugar de ${i.categoria}`}
                        >
                          {i.lugar === NAO_CLASSIFICADA && <option value="">— escolha o lugar —</option>}
                          {LUGARES.map((l) => (
                            <option key={l.chave} value={l.chave}>
                              {rotuloLugar(l.chave)}
                            </option>
                          ))}
                          <option value={FORA}>Fora do relatório (não é despesa)</option>
                        </select>
                      ) : (
                        rotuloLugar(i.lugar)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
