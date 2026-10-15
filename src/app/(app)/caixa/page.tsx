import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { TOLERANCIA_CAIXA } from "@/lib/caixa/diferencas";
import { COR_SITUACAO, ROTULO_SITUACAO, situacaoDoCaixa, textoDiferenca } from "@/lib/caixa/rotulos";
import { minhasQuebras } from "@/lib/data/diferenca-caixa";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { justificarQuebra } from "./actions";
import { JustificativaForm } from "./justificativa-form";

export const metadata = { title: "Quebras de caixa" };

export default async function QuebrasCaixaPage({ searchParams }: PageProps<"/caixa">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/caixa"), searchParams]);
  const financeiro = sessao.papel === "admin" || sessao.papel === "financeiro";
  const todas = sp.ver === "todas";
  const quebras = financeiro ? [] : await minhasQuebras(!todas);

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        titulo="Quebras de caixa"
        descricao={`Quando a diferença do caixa passa de ${formatarMoeda(TOLERANCIA_CAIXA)} (faltando ou sobrando), ela vira quebra e entra no desconto da folha. Aqui o colaborador do caixa, o responsável ou o gerente da loja contam o que aconteceu; o financeiro decide se mantém o desconto ou abona.`}
      />

      {financeiro ? (
        <p className="rounded-xl border bg-card p-5 text-sm">
          Você é do financeiro: todas as diferenças estão em{" "}
          <Link href="/financeiro/diferenca-caixa" className="font-medium text-fct-navy underline">
            Financeiro → Diferença de caixa
          </Link>
          .
        </p>
      ) : (
        <>
          <nav aria-label="Filtro" className="mb-4 flex gap-2 text-sm">
            <Link href="/caixa" aria-current={!todas ? "page" : undefined} className={`rounded-full border px-3 py-1 ${!todas ? "border-fct-navy bg-fct-navy text-white" : "bg-card"}`}>
              Em aberto
            </Link>
            <Link href="/caixa?ver=todas" aria-current={todas ? "page" : undefined} className={`rounded-full border px-3 py-1 ${todas ? "border-fct-navy bg-fct-navy text-white" : "bg-card"}`}>
              Todas
            </Link>
          </nav>

          {quebras.length === 0 ? (
            <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              {todas ? "Nenhuma quebra de caixa ligada a você ou à sua loja." : "Nada para justificar. 🎉"}
              <span className="mt-1 block text-xs">Se você opera caixa e acha que deveria ver algo aqui, peça ao administrador para ligar o seu usuário ao seu cadastro de funcionário.</span>
            </p>
          ) : (
            <ul className="space-y-4">
              {quebras.map((q) => {
                const st = situacaoDoCaixa(q.classe, q.andamento);
                const dif = Number(q.diferenca);
                const aberta = q.andamento === "pendente" || q.andamento === "justificada";
                return (
                  <li key={q.id} className="rounded-xl border bg-card p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">
                        Caixa {q.numero_caixa} · {q.filial?.codigo} · {formatarData(q.dia)}
                      </h2>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${COR_SITUACAO[st]}`}>{ROTULO_SITUACAO[st]}</span>
                    </div>
                    <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-xs text-muted-foreground">Operador</dt>
                        <dd className="font-medium">{q.nome_operador}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Declarado em dinheiro</dt>
                        <dd className="font-medium tabular-nums">{formatarMoeda(Number(q.informado))}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Diferença</dt>
                        <dd className={`font-semibold tabular-nums ${dif > 0 ? "text-red-700" : "text-sky-700"}`}>{textoDiferenca(dif)}</dd>
                      </div>
                    </dl>
                    {aberta ? (
                      <JustificativaForm action={justificarQuebra.bind(null, q.id)} id={q.id} atual={q.justificativa} />
                    ) : (
                      <div className="space-y-2 text-sm">
                        {q.justificativa && <p className="rounded-lg border bg-muted/30 p-3 whitespace-pre-wrap">{q.justificativa}</p>}
                        <p className="text-muted-foreground">
                          {q.andamento === "abonada" ? "O financeiro abonou: não há desconto." : "O financeiro manteve o desconto na folha."}
                          {q.justificada_em && ` Justificada em ${formatarDataHora(q.justificada_em)}.`}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
