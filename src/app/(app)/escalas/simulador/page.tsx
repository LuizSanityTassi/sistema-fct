import Link from "next/link";
import { CalendarCheck, History, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { exigirAcesso } from "@/lib/auth/session";
import { escalasOficiais, filiaisDaEscala, lotesRecentes } from "@/lib/data/escalas";
import { ROTULO_FUNCAO, diasAbertos, eh12x36 } from "@/lib/escalas/motor";
import { proximoMes, rotuloCompetencia, rotuloDaEscala } from "@/lib/escalas/resumo";
import { formatarDataHora } from "@/lib/formatos";
import { AbasEscala } from "../abas";
import { SecoesFilial } from "../_ui/secoes-filial";
import { SimularForm } from "./simular-form";

export const metadata = { title: "Simulador de escala 5x2" };

export default async function SimuladorPage({ searchParams }: PageProps<"/escalas/simulador">) {
  const [, sp] = await Promise.all([exigirAcesso("/escalas"), searchParams]);
  const [filiais, lotes, oficiais] = await Promise.all([filiaisDaEscala(), lotesRecentes(15), escalasOficiais()]);
  const ref = proximoMes();
  // do período que está correndo até 12 à frente (cada um do dia 21 ao dia 20, como a folha)
  const meses = Array.from({ length: 14 }, (_, i) => {
    const t = ref.ano * 12 + (ref.mes - 1) - 1 + i;
    const ano = Math.floor(t / 12);
    const mes = (t % 12) + 1;
    return { valor: `${ano}-${String(mes).padStart(2, "0")}`, rotulo: rotuloCompetencia(ano, mes) };
  });
  const filialInicial = typeof sp.filial === "string" && filiais.some((f) => f.id === sp.filial) ? sp.filial : filiais.length === 1 ? filiais[0].id : "";
  const selecionada = filiais.find((f) => f.id === filialInicial);

  return (
    <>
      <PageHeader
        eyebrow="Ponto · Escala 5x2"
        titulo="Simulador de escala 5x2"
        descricao="Compare distribuições de folga para uma filial ou para a rede, ajuste dia a dia e publique a escala oficial. Cada escala vai do dia 21 ao dia 20 do mês seguinte, como a folha. Nada muda no ponto: é planejamento."
      />
      <AbasEscala ativa="/escalas/simulador" />

      <Painel titulo="Gerar opções" icone={Sparkles} className="mb-4">
        <SimularForm
          filiais={filiais.map((f) => ({ id: f.id, codigo: f.codigo, nome: f.nome, folgas: f.config.folgasPermitidas, diasAbertos: diasAbertos(f.config).length,
            equipe: f.equipe.filter((p) => p.situacao === "ativo").map((p) => ({ id: p.id, nome: p.nome, funcao: ROTULO_FUNCAO[p.funcao], doze: eh12x36(p) })),
          }))}
          filialInicial={filialInicial}
          meses={meses}
          mesInicial={`${ref.ano}-${String(ref.mes).padStart(2, "0")}`}
        />
      </Painel>

      {selecionada && <SecoesFilial f={selecionada} folgasNoSimulador />}

      <div className="grid gap-4 xl:grid-cols-2">
        <Painel titulo="Gerações recentes" icone={History} descricao="Rascunhos ficam até alguém descartar; a escala oficial fica no histórico.">
          {lotes.length === 0 ? (
            <EstadoVazio icone={History} titulo="Nenhuma opção gerada ainda" compacto />
          ) : (
            <ul className="px-5 pb-4 text-sm">
              {lotes.map((l) => (
                <li key={l.lote} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0">
                  <div className="min-w-0">
                    <Link href={`/escalas/simulacao/${l.lote}`} className="font-medium hover:underline">
                      {l.filiais.length === 1 ? `${l.filiais[0].codigo} · ${l.filiais[0].nome}` : `${l.filiais.length} filiais`} · {rotuloDaEscala(l)} · {l.jornada} h
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatarDataHora(l.criadoEm)}
                      {l.autor ? ` · ${l.autor}` : ""} · {l.opcoes} opção(ões)
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {l.oficiais > 0 && <Status tom="sucesso">{l.oficiais} oficial</Status>}
                    <Status tom={l.semPendencia ? "info" : "atencao"}>{l.semPendencia} sem pendência</Status>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Painel>

        <Painel titulo="Escalas oficiais" icone={CalendarCheck} descricao="A publicada de cada filial e período (só sem pendências na auditoria). “Segue” = continua valendo nos próximos períodos até outra ser publicada.">
          {oficiais.length === 0 ? (
            <EstadoVazio icone={CalendarCheck} titulo="Nenhuma escala oficial publicada" compacto />
          ) : (
            <ul className="px-5 pb-4 text-sm">
              {oficiais.slice(0, 60).map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0">
                  <Link href={`/escalas/simulacao/${o.lote}?filial=${o.branch_id}&op=${o.id}`} className="font-medium hover:underline">
                    {o.filial.codigo} · {o.filial.nome} · {rotuloDaEscala(o)}
                  </Link>
                  {o.continua && <Status tom="info">Segue até ser alterada</Status>}
                  <span className="text-xs text-muted-foreground">
                    opção {o.opcao} · {o.jornada_semanal} h · {o.publicado_em ? formatarDataHora(o.publicado_em) : ""}
                    {o.publicador?.nome ? ` · ${o.publicador.nome}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </div>
    </>
  );
}
