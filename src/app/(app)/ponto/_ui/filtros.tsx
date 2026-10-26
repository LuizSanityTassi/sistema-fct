import Link from "next/link";
import { Search } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listarDepartamentosDaUnidade, listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { lerUuid } from "@/lib/data/ponto";

export type FiltrosPonto = { filial?: string; departamento?: string; q?: string; mes?: string };

export function lerFiltrosPonto(sp: Record<string, string | string[] | undefined>, padraoFilial?: string | null): FiltrosPonto {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const filial = s("filial") === "todas" ? undefined : (lerUuid(s("filial")) ?? padraoFilial ?? undefined);
  return {
    filial,
    departamento: filial ? lerUuid(s("departamento")) : undefined,
    q: s("q").slice(0, 60) || undefined,
    mes: /^\d{4}-\d{2}$/.test(s("mes")) ? s("mes") : undefined,
  };
}

/** Barra de filtros do ponto (filial → departamento → nome, mês opcional). Funciona sem JavaScript (GET). */
export async function BarraFiltrosPonto({
  rota,
  filtros,
  mes,
  busca = true,
  extra,
}: {
  rota: string;
  filtros: FiltrosPonto;
  /** mostra o seletor de mês com este valor */
  mes?: string;
  busca?: boolean;
  extra?: React.ReactNode;
}) {
  const [unidades, deps] = await Promise.all([listarUnidadesParaSelecao(), filtros.filial ? listarDepartamentosDaUnidade(filtros.filial) : Promise.resolve([])]);
  return (
    <form method="get" action={rota} className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
      {mes !== undefined && <Input type="month" name="mes" defaultValue={mes} aria-label="Mês" className="h-9 w-40" />}
      <SelectNativo name="filial" defaultValue={filtros.filial ?? "todas"} aria-label="Filial" className="w-auto min-w-48 flex-1 sm:flex-none">
        <option value="todas">Todas as filiais</option>
        {unidades
          .filter((u) => u.ativo || u.id === filtros.filial)
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.codigo} — {u.nome}
            </option>
          ))}
      </SelectNativo>
      {deps.length > 0 && (
        <SelectNativo name="departamento" defaultValue={filtros.departamento ?? ""} aria-label="Departamento" className="w-auto min-w-40">
          <option value="">Todos os departamentos</option>
          {deps.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </SelectNativo>
      )}
      {busca && (
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Nome do funcionário" className="pl-8" aria-label="Buscar funcionário" />
        </div>
      )}
      {extra}
      <Button type="submit" variant="outline">
        Filtrar
      </Button>
      <Button type="button" variant="ghost" nativeButton={false} render={<Link href={rota} />}>
        Limpar
      </Button>
    </form>
  );
}
