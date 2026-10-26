import Link from "next/link";
import { CalendarX2 } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { exigirAcesso } from "@/lib/auth/session";
import { lerMes, listarAusencias, listarEquipe, rotuloMes } from "@/lib/data/ponto";
import { formatarData, formatarDataHora } from "@/lib/formatos";
import { AUSENCIA_LABEL, diasEntre, hojeLocal, limitesMes, TIPOS_AUSENCIA, type TipoAusencia } from "@/lib/ponto/calculo";
import type { Tom } from "@/lib/tons";
import { BarraFiltrosPonto, lerFiltrosPonto } from "../_ui/filtros";
import { lancarAusencia, removerAusencia } from "./actions";
import { AusenciaForm } from "./ausencia-form";

export const metadata = { title: "Ausências" };

const TOM: Record<TipoAusencia, Tom> = { ferias: "info", afastamento: "alerta", atestado: "atencao", licenca: "destaque", abono: "sucesso", folga_compensatoria: "neutro" };

export default async function AusenciasPage({ searchParams }: PageProps<"/ponto/ausencias">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto/ausencias"), searchParams]);
  const filtros = lerFiltrosPonto(sp, sessao.papel === "gerente" ? sessao.branchId : null);
  const mes = lerMes(sp.mes);
  const tipo = typeof sp.tipo === "string" && (TIPOS_AUSENCIA as readonly string[]).includes(sp.tipo) ? (sp.tipo as TipoAusencia) : undefined;
  const { de, ate } = limitesMes(mes);
  const hoje = hojeLocal();
  const equipe = await listarEquipe({ filial: filtros.filial, departamento: filtros.departamento, q: filtros.q });
  const nomes = new Map(equipe.map((f) => [f.id, f]));
  const ausencias = (await listarAusencias(equipe.map((f) => f.id), de, ate)).filter((a) => !tipo || a.tipo === tipo).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const podeEditar = sessao.papel !== "coordenador";

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo={`Ausências · ${rotuloMes(mes)}`}
        descricao="Férias, atestados, afastamentos, licenças, abonos e folgas compensatórias. Dia com ausência não vira falta. A situação do cadastro (férias, afastado) continua sendo do RH."
      />
      {podeEditar && (
        <Painel className="mb-4" titulo="Lançar ausência">
          <AusenciaForm action={lancarAusencia} funcionarios={equipe.map((f) => ({ id: f.id, nome: f.nome, filial: f.filialCodigo }))} hoje={hoje} />
        </Painel>
      )}
      <BarraFiltrosPonto
        rota="/ponto/ausencias"
        filtros={filtros}
        mes={mes}
        extra={
          <SelectNativo name="tipo" defaultValue={tipo ?? ""} aria-label="Tipo" className="w-auto">
            <option value="">Todos os tipos</option>
            {Object.entries(AUSENCIA_LABEL).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </SelectNativo>
        }
      />
      <Painel titulo={`${ausencias.length} ausência(s) no mês`}>
        {ausencias.length === 0 ? (
          <EstadoVazio icone={CalendarX2} titulo="Nenhuma ausência neste filtro" compacto />
        ) : (
          <ul className="border-t">
            {ausencias.map((a) => {
              const f = nomes.get(a.employee_id);
              const dias = diasEntre(a.inicio, a.fim) + 1;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-5 py-2.5 text-sm last:border-0">
                  <Status tom={TOM[a.tipo]}>{AUSENCIA_LABEL[a.tipo]}</Status>
                  <Link href={`/ponto/espelho?funcionario=${a.employee_id}&mes=${mes}`} className="min-w-0 flex-1 font-medium hover:underline">
                    {f?.nome ?? "—"} <span className="text-xs font-normal text-muted-foreground">{f?.filialCodigo}</span>
                  </Link>
                  <span className="tabular-nums">
                    {formatarData(a.inicio)}
                    {a.fim !== a.inicio && ` a ${formatarData(a.fim)}`} <span className="text-muted-foreground">({dias} dia{dias > 1 ? "s" : ""})</span>
                  </span>
                  {a.observacao && <span className="w-full text-xs text-muted-foreground sm:w-auto">{a.observacao}</span>}
                  <span className="text-xs text-muted-foreground">lançada {formatarDataHora(a.registrado_em)}</span>
                  {podeEditar && (
                    <ConfirmarAcao titulo="Remover ausência?" descricao="Os dias voltam a ser cobrados pela jornada (podem virar falta). Meses fechados não aceitam a mudança." rotuloBotao="Remover" variant="outline" action={removerAusencia} campos={{ id: a.id }} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Painel>
    </>
  );
}
