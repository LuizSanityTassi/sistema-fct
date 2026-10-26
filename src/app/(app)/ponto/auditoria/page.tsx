import { History } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Input } from "@/components/ui/input";
import { exigirAcesso } from "@/lib/auth/session";
import { lerData } from "@/lib/data/ponto";
import { formatarDataHora } from "@/lib/formatos";
import { local } from "@/lib/ponto/calculo";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { Tom } from "@/lib/tons";
import { BarraFiltrosPonto, lerFiltrosPonto } from "../_ui/filtros";

export const metadata = { title: "Auditoria do ponto" };

const TAMANHO = 50;

const ENTIDADES: Record<string, string> = {
  ponto_marcacoes: "Marcação",
  ponto_ajustes: "Ajuste",
  ponto_fechamentos: "Fechamento",
  ponto_banco_movimentos: "Banco de horas",
  ponto_vinculos: "Jornada do funcionário",
  ponto_programacao: "Escala",
  ponto_ausencias: "Ausência",
  ponto_jornadas: "Modelo de jornada",
  ponto_jornada_dias: "Horário do modelo",
  ponto_config_filial: "Configuração da filial",
  ponto_feriados: "Feriado",
  ponto_pins: "PIN",
  ponto_relatorios: "Exportação",
};
const ACAO: Record<string, [string, Tom]> = { criar: ["Criou", "sucesso"], editar: ["Alterou", "info"], excluir: ["Excluiu", "perigo"], exportar: ["Exportou", "neutro"] };
const OCULTOS = new Set(["id", "created_at", "updated_at", "registrado_em", "definido_em", "solicitado_em", "pin_hash", "nsr", "created_by"]);

function legivel(v: Json | undefined, chave: string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const l = local(v);
    return `${l.data.split("-").reverse().join("/")} ${String(Math.floor(l.min / 60)).padStart(2, "0")}:${String(l.min % 60).padStart(2, "0")}`;
  }
  if (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v)) return chave.endsWith("_id") || chave.endsWith("_por") ? "…" + v.slice(-6) : v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** O que mudou: só os campos diferentes (na criação, os preenchidos). */
function Mudancas({ anterior, novo }: { anterior: Json | null; novo: Json | null }) {
  const a = anterior && typeof anterior === "object" && !Array.isArray(anterior) ? anterior : {};
  const n = novo && typeof novo === "object" && !Array.isArray(novo) ? novo : {};
  const chaves = [...new Set([...Object.keys(a), ...Object.keys(n)])].filter((k) => !OCULTOS.has(k) && JSON.stringify(a[k]) !== JSON.stringify(n[k]) && !(k in a === false && (n[k] === null || n[k] === "")));
  if (!chaves.length) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="space-y-0.5 text-xs">
      {chaves.slice(0, 10).map((k) => (
        <li key={k} className="break-all">
          <span className="font-mono text-muted-foreground">{k}</span>: {k in a && <span className="text-red-700 line-through">{legivel(a[k], k)}</span>}
          {k in a && k in n && " → "}
          {k in n && <span className="text-emerald-700">{legivel(n[k], k)}</span>}
        </li>
      ))}
      {chaves.length > 10 && <li className="text-muted-foreground">… e mais {chaves.length - 10}</li>}
    </ul>
  );
}

export default async function AuditoriaPontoPage({ searchParams }: PageProps<"/ponto/auditoria">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto/auditoria"), searchParams]);
  const filtros = lerFiltrosPonto(sp, sessao.papel === "gerente" ? sessao.branchId : null);
  const de = lerData(sp.de);
  const ate = lerData(sp.ate);
  const entidade = typeof sp.entidade === "string" && sp.entidade in ENTIDADES ? sp.entidade : undefined;
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ponto_auditoria", { p_branch: filtros.filial ?? null, p_de: de ?? null, p_ate: ate ?? null, p_entidade: entidade ?? null, p_limite: TAMANHO, p_pagina: pagina });
  const linhas = data ?? [];
  const total = Number(linhas[0]?.total ?? 0);
  const params = { filial: filtros.filial ?? (sp.filial === "todas" ? "todas" : undefined), de, ate, entidade };

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo="Auditoria do ponto"
        descricao="Tudo o que mudou no ponto: registros, ajustes (antes e depois), aprovações, escalas, ausências, fechamentos, reaberturas e exportações, com quem fez e quando."
      />
      <BarraFiltrosPonto
        rota="/ponto/auditoria"
        filtros={filtros}
        busca={false}
        extra={
          <>
            <SelectNativo name="entidade" defaultValue={entidade ?? ""} aria-label="O quê" className="w-auto">
              <option value="">Tudo</option>
              {Object.entries(ENTIDADES).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </SelectNativo>
            <Input type="date" name="de" defaultValue={de ?? ""} aria-label="De" className="h-9 w-40" />
            <Input type="date" name="ate" defaultValue={ate ?? ""} aria-label="Até" className="h-9 w-40" />
          </>
        }
      />
      <Painel>
        {error ? (
          <p className="px-5 py-4 text-sm text-destructive">Não foi possível ler a auditoria: {error.message}</p>
        ) : linhas.length === 0 ? (
          <EstadoVazio icone={History} titulo="Nada registrado neste filtro" compacto />
        ) : (
          <>
            <ul>
              {linhas.map((l) => {
                const [acao, tom] = ACAO[l.acao] ?? [l.acao, "neutro" as Tom];
                const motivo = l.valor_novo && typeof l.valor_novo === "object" && !Array.isArray(l.valor_novo) ? (l.valor_novo.motivo as string | null | undefined) : null;
                return (
                  <li key={l.id} className="grid gap-2 border-b px-5 py-3 last:border-0 md:grid-cols-[11rem_1fr_1.4fr]">
                    <div className="text-xs text-muted-foreground">
                      <p className="tabular-nums">{formatarDataHora(l.criado_em)}</p>
                      <p className="font-medium text-foreground">{l.autor}</p>
                    </div>
                    <div className="text-sm">
                      <p className="flex flex-wrap items-center gap-2">
                        <Status tom={tom}>{acao}</Status>
                        <span className="font-medium">{ENTIDADES[l.entidade] ?? l.entidade}</span>
                      </p>
                      {l.funcionario && <p className="mt-0.5 text-xs text-muted-foreground">{l.funcionario}</p>}
                      {motivo && <p className="mt-0.5 text-xs text-amber-800">Motivo: {motivo}</p>}
                    </div>
                    <Mudancas anterior={l.valor_anterior} novo={l.valor_novo} />
                  </li>
                );
              })}
            </ul>
            <div className="border-t px-4 py-3">
              <Paginacao pagina={pagina} paginas={Math.max(1, Math.ceil(total / TAMANHO))} total={total} tamanho={TAMANHO} params={params} />
            </div>
          </>
        )}
      </Painel>
    </>
  );
}
