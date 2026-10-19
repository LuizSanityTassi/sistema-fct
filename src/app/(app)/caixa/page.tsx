import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { TOLERANCIA_CAIXA } from "@/lib/caixa/diferencas";
import { COR_SITUACAO, ROTULO_SITUACAO, situacaoDoCaixa, textoDiferenca } from "@/lib/caixa/rotulos";
import { anexosDasQuebras, minhasQuebras } from "@/lib/data/diferenca-caixa";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { justificarQuebra } from "./actions";
import { AnexosQuebra } from "./anexos-quebra";
import { JustificativaForm } from "./justificativa-form";
import { VisaoCoordenador } from "./visao-coordenador";

export const metadata = { title: "Quebras de caixa" };

export default async function QuebrasCaixaPage({ searchParams }: PageProps<"/caixa">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/caixa"), searchParams]);
  const financeiro = sessao.papel === "admin" || sessao.papel === "financeiro";
  const coordenador = sessao.papel === "coordenador";
  const todas = sp.ver === "todas";
  const quebras = financeiro || coordenador ? [] : await minhasQuebras(!todas);
  const anexos = await anexosDasQuebras(quebras.map((q) => q.id));

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        titulo={coordenador ? `Quebras de caixa · regional ${sessao.regional ?? "—"}` : "Quebras de caixa"}
        descricao={
          coordenador
            ? `Todas as quebras (diferença acima de ${formatarMoeda(TOLERANCIA_CAIXA)}) das lojas da sua regional, com a justificativa do gestor e os anexos. Quem justifica é o gestor de cada loja; o financeiro decide se mantém o desconto ou abona.`
            : `Quando a diferença do caixa passa de ${formatarMoeda(TOLERANCIA_CAIXA)} (faltando ou sobrando), ela vira quebra e entra no desconto da folha. Aqui o gestor da loja registra a justificativa (o colaborador vê a quebra dele e justifica para o gestor); o financeiro decide se mantém o desconto ou abona.`
        }
      />

      {coordenador ? (
        <VisaoCoordenador usuarioId={sessao.id} regional={sessao.regional} sp={sp} />
      ) : financeiro ? (
        <p className="rounded-xl border bg-card p-5 text-sm">
          Você é do financeiro: todas as diferenças estão em{" "}
          <Link href="/financeiro/diferenca-caixa" className="font-medium text-fct-tinta underline">
            Financeiro → Diferença de caixa
          </Link>
          .
        </p>
      ) : (
        <>
          <nav aria-label="Filtro" className="mb-4 flex gap-2 text-sm">
            <Link href="/caixa" aria-current={!todas ? "page" : undefined} className={`rounded-full border px-3 py-1 ${!todas ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
              Em aberto
            </Link>
            <Link href="/caixa?ver=todas" aria-current={todas ? "page" : undefined} className={`rounded-full border px-3 py-1 ${todas ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
              Todas
            </Link>
          </nav>

          {quebras.length === 0 ? (
            <p className="vazio rounded-xl border bg-card">
              {todas ? "Nenhuma quebra de caixa ligada a você ou à sua loja." : "Nada para justificar. 🎉"}
              <span className="mt-1 block text-xs">
                Se você opera caixa e acha que deveria ver algo aqui, peça ao administrador para ligar o seu usuário ao seu cadastro de funcionário. Se você é gestor, peça ao financeiro para te
                colocar como gestor da loja.
              </span>
            </p>
          ) : (
            <ul className="space-y-4">
              {quebras.map((q) => {
                const st = situacaoDoCaixa(q.classe, q.andamento);
                const dif = Number(q.diferenca);
                const aberta = q.andamento === "pendente" || q.andamento === "justificada";
                // quem justifica é o gestor da quebra (sem gestor definido: o gerente da loja); o colaborador só vê
                const souGestor = q.gestor_id === sessao.id || (!q.gestor_id && sessao.papel === "gerente");
                const manual = q.origem === "manual";
                return (
                  <li key={q.id} className="rounded-xl border bg-card p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">
                        {manual ? "Quebra lançada pelo financeiro" : `Caixa ${q.numero_caixa}`} · {q.filial?.codigo} · {formatarData(q.dia)}
                      </h2>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${COR_SITUACAO[st]}`}>{ROTULO_SITUACAO[st]}</span>
                    </div>
                    <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-xs text-muted-foreground">{manual ? "Colaborador" : "Operador"}</dt>
                        <dd className="font-medium">{q.nome_operador}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{manual ? "Motivo" : "Declarado em dinheiro"}</dt>
                        <dd className={manual ? "text-sm" : "font-medium tabular-nums"}>{manual ? (q.descricao ?? "—") : formatarMoeda(Number(q.informado))}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Diferença</dt>
                        <dd className={`font-semibold tabular-nums ${dif > 0 ? "text-red-700" : "text-sky-700"}`}>{textoDiferenca(dif)}</dd>
                      </div>
                    </dl>
                    {aberta && souGestor ? (
                      <div className="space-y-3">
                        <AnexosQuebra anexos={anexos.get(q.id) ?? []} usuarioId={sessao.id} aberta />
                        <JustificativaForm action={justificarQuebra.bind(null, q.id)} id={q.id} atual={q.justificativa} />
                      </div>
                    ) : aberta ? (
                      <div className="space-y-2 text-sm">
                        {q.justificativa && <p className="rounded-lg border bg-muted/30 p-3 whitespace-pre-wrap">{q.justificativa}</p>}
                        <AnexosQuebra anexos={anexos.get(q.id) ?? []} usuarioId={sessao.id} aberta={false} />
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                          {q.andamento === "justificada"
                            ? "Seu gestor já justificou. Agora o financeiro decide se mantém o desconto ou abona."
                            : "Justifique para o seu gestor: é ele quem registra a justificativa aqui no sistema."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 text-sm">
                        {q.justificativa && <p className="rounded-lg border bg-muted/30 p-3 whitespace-pre-wrap">{q.justificativa}</p>}
                        <AnexosQuebra anexos={anexos.get(q.id) ?? []} usuarioId={sessao.id} aberta={false} />
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
