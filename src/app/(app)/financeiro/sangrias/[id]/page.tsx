import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { BUCKET_ANEXOS_CAIXA } from "@/lib/caixa/anexos";
import { obterSangria } from "@/lib/data/sangrias";
import { formatarData } from "@/lib/formatos";
import { SITUACOES_SANGRIA, situacaoNoOmie, TOM_SANGRIA, type SituacaoSangria } from "@/lib/sangrias/rotulos";
import { createClient } from "@/lib/supabase/server";
import { enviarSangriaAoOmie, mudarSituacao, vincularSangriaOmie } from "../../../sangrias/actions";
import { AcoesSangria } from "../../../sangrias/[id]/acoes-sangria";
import { DadosSangria, ListaComprovantes } from "../../../sangrias/dados-sangria";
import { AcoesOmie } from "./acoes-omie";

export const metadata = { title: "Conferir sangria" };
// conferir já lança no Omie
export const maxDuration = 120;

/** Conferência de uma sangria: o comprovante aparece na tela, ao lado do valor e do nº do depósito. */
export default async function ConferirSangriaPage({ params }: PageProps<"/financeiro/sangrias/[id]">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/financeiro/sangrias"), params]);
  const s = await obterSangria(id);
  if (!s) notFound();
  const filial = s.filial as { codigo: string; nome: string } | null;
  const situacao = s.situacao as SituacaoSangria;
  const financeiro = sessao.papel === "admin" || sessao.papel === "financeiro";
  const omie = situacaoNoOmie(s);

  // foto do comprovante na própria tela (link assinado de 10 min; PDF continua para baixar)
  const supabase = await createClient();
  const previas = new Map<string, string>();
  await Promise.all(
    s.anexos
      .filter((a) => a.mime?.startsWith("image/"))
      .map(async (a) => {
        const { data } = await supabase.storage.from(BUCKET_ANEXOS_CAIXA).createSignedUrl(a.storage_path, 600);
        if (data?.signedUrl) previas.set(a.id, data.signedUrl);
      }),
  );

  return (
    <>
      <PageHeader
        eyebrow="Financeiro · Conferência de sangrias"
        titulo={`Conferir ${filial?.codigo ?? ""} · ${formatarData(s.data_deposito)}`}
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/financeiro/sangrias" />}>
            <ChevronLeft data-icon="inline-start" />
            Conferência
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Painel id="dados" titulo="O que a loja informou" acao={<Status tom={TOM_SANGRIA[situacao] ?? "neutro"}>{SITUACOES_SANGRIA[situacao] ?? situacao}</Status>}>
          <DadosSangria s={s} />
          {financeiro && situacao !== "cancelada" && s.omie_codigo == null && (
            <div className="border-t px-5 py-4">
              <AcoesSangria action={mudarSituacao.bind(null, s.id)} situacao={situacao} podeConferir podeCancelar />
            </div>
          )}
        </Painel>
        {omie && (
          <Painel id="omie" titulo="Omie" acao={<Status tom={omie.tom}>{omie.rotulo}</Status>} className="lg:col-span-2">
            <div className="space-y-3 border-t px-5 py-4 text-sm">
              {s.omie_codigo != null ? (
                <p>
                  {s.omie_vinculada ? "Ligada ao lançamento que já estava no Omie" : "Lançada no Omie"}: <span className="font-mono">{s.omie_codigo}</span>. Para desfazer ou cancelar, acerte primeiro no Omie e fale com o administrador.
                </p>
              ) : s.omie_mensagem ? (
                <p className={s.omie_situacao === "parecida" ? "text-amber-900" : "text-red-800"}>{s.omie_mensagem}.</p>
              ) : (
                <p className="text-muted-foreground">Ainda não foi ao Omie.</p>
              )}
              {financeiro && s.omie_codigo == null && (
                <AcoesOmie enviar={enviarSangriaAoOmie.bind(null, s.id)} vincular={vincularSangriaOmie.bind(null, s.id)} situacao={s.omie_situacao} sugerido={s.omie_sugerido != null ? String(s.omie_sugerido) : null} />
              )}
            </div>
          </Painel>
        )}
        <Painel id="comprovantes" titulo="Comprovante" descricao={s.anexos.length ? "Confira com o extrato do banco" : "A loja ainda não anexou o comprovante"}>
          <ListaComprovantes s={s} previas={previas} />
        </Painel>
      </div>
    </>
  );
}
