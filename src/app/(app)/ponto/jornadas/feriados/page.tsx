import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { administraPonto, listarFeriados } from "@/lib/data/ponto";
import { formatarData } from "@/lib/formatos";
import { DIAS_SEMANA, diaSemana, hojeLocal } from "@/lib/ponto/calculo";
import { removerFeriado, salvarFeriado } from "../actions";
import { FeriadoForm } from "./feriado-form";

export const metadata = { title: "Feriados" };

const ABRANGENCIA: Record<string, string> = { nacional: "Nacional", estadual: "Estadual", municipal: "Municipal", empresa: "Da empresa" };

export default async function FeriadosPage({ searchParams }: PageProps<"/ponto/jornadas/feriados">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto/jornadas/feriados"), searchParams]);
  const anoAtual = Number(hojeLocal().slice(0, 4));
  const ano = typeof sp.ano === "string" && /^\d{4}$/.test(sp.ano) ? Number(sp.ano) : anoAtual;
  const [feriados, unidades] = await Promise.all([listarFeriados(`${ano}-01-01`, `${ano}-12-31`), listarUnidadesParaSelecao()]);
  const pode = administraPonto(sessao);
  const filialDe = new Map(unidades.map((u) => [u.id, u]));

  return (
    <>
      <PageHeader
        eyebrow="Ponto · jornadas"
        titulo="Feriados"
        descricao="Feriado sem escala vira folga para todos da filial; trabalhar nele conta como extra a 100%. Nacionais valem para todas as filiais; municipais, só para a filial escolhida."
        acoes={
          <form method="get" className="flex gap-2">
            <SelectNativo name="ano" defaultValue={String(ano)} aria-label="Ano" className="w-28">
              {[anoAtual - 1, anoAtual, anoAtual + 1].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </SelectNativo>
            <Button type="submit" variant="outline">
              Ver
            </Button>
          </form>
        }
      />
      {pode && (
        <Painel className="mb-4" titulo="Adicionar feriado">
          <FeriadoForm action={salvarFeriado} filiais={unidades.filter((u) => u.ativo)} />
        </Painel>
      )}
      <Painel titulo={`${feriados.length} feriado(s) em ${ano}`}>
        {feriados.length === 0 ? (
          <EstadoVazio icone={CalendarDays} titulo={`Nenhum feriado cadastrado em ${ano}`} descricao="Cadastre os nacionais e os municipais de cada cidade." compacto />
        ) : (
          <ul className="border-t">
            {feriados.map((f) => {
              const filial = f.branch_id ? filialDe.get(f.branch_id) : null;
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-5 py-2.5 text-sm last:border-0">
                  <span className="w-24 tabular-nums">{formatarData(f.data)}</span>
                  <span className="w-20 text-muted-foreground">{DIAS_SEMANA[diaSemana(f.data)]}</span>
                  <span className="min-w-0 flex-1 font-medium">{f.nome}</span>
                  <Status tom={filial ? "info" : "neutro"}>{filial ? `${filial.codigo} ${filial.nome}` : ABRANGENCIA[f.abrangencia] ?? f.abrangencia}</Status>
                  {pode && (
                    <ConfirmarAcao titulo="Remover feriado?" descricao={`${f.nome} (${formatarData(f.data)}) deixa de ser folga. Meses já fechados não mudam.`} rotuloBotao="Remover" variant="destructive" action={removerFeriado} campos={{ id: f.id }} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Painel>
      <p className="mt-3 text-xs text-muted-foreground">
        <Link href="/ponto/jornadas" className="underline">
          Voltar para os modelos de jornada
        </Link>
      </p>
    </>
  );
}
