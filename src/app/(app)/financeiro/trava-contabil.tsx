import { Lock } from "lucide-react";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { listarMesesTravados, podeTravarContabil } from "@/lib/data/contabil-trava";
import { formatarDataHora } from "@/lib/formatos";
import type { AppRole } from "@/lib/roles";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { liberarMesContabil } from "./trava-contabil-actions";
import { TravarMesForm } from "./trava-contabil-form";

/** "aaaa-mm" de n meses atrás, no fuso de Brasília. */
function mesAtras(n: number) {
  const [a, m] = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Trava contábil do mês (DRE e Caixa contábil): mostra os meses travados e, para o contador e o administrador, trava o
 * mês que passou e libera. Com o mês travado o banco recusa qualquer mudança contábil nele (até do robô).
 */
export async function TravaContabil({ papel }: { papel: AppRole }) {
  const travados = await listarMesesTravados();
  const pode = podeTravarContabil(papel);
  if (!pode && !travados.length) return null;
  const jaTravado = new Set(travados.map((t) => t.competencia));
  // o mês que passou primeiro, depois o atual e os 11 anteriores
  const opcoes = [mesAtras(1), mesAtras(0), ...Array.from({ length: 11 }, (_, i) => mesAtras(i + 2))]
    .filter((m) => !jaTravado.has(m))
    .map((m) => ({ valor: m, rotulo: rotuloCompetencia(m) }));

  return (
    <section className="mb-4 rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 font-semibold">
            <Lock className="size-4" aria-hidden />
            Trava do mês (contador)
          </h2>
          <p className="text-xs text-muted-foreground">
            Mês travado não muda mais: DRE contábil, caixa contábil e lançamentos do financeiro daquele mês ficam como estão, para todo mundo, até liberar.
          </p>
        </div>
        {pode && opcoes.length > 0 && <TravarMesForm meses={opcoes} padrao={opcoes[0].valor} />}
      </div>
      {travados.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {travados.map((t) => (
            <li key={t.competencia} className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 py-1 pr-1 pl-3 text-amber-900">
              <Lock className="size-3.5" aria-hidden />
              <span>
                <strong>{rotuloCompetencia(t.competencia)}</strong>
                <span className="text-xs"> · {t.por ?? "—"}, {formatarDataHora(t.travadoEm)}</span>
              </span>
              {pode && (
                <ConfirmarAcao
                  titulo={`Liberar ${rotuloCompetencia(t.competencia)}?`}
                  descricao="Com o mês liberado, a DRE, o caixa contábil e os lançamentos dele voltam a poder mudar (importação, robô e edição). Fica registrado quem liberou."
                  rotuloBotao="Liberar"
                  rotuloConfirmar="Liberar o mês"
                  action={liberarMesContabil}
                  campos={{ mes: t.competencia }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
