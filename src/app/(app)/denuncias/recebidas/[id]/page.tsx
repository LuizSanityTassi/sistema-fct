import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { CATEGORIAS_DENUNCIA, COR_STATUS, ehStatusDenuncia, STATUS_DENUNCIA } from "@/lib/denuncias/rotulos";
import { formatarData } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { responderDenuncia } from "../../actions";
import { RespostaForm } from "./resposta-form";

export const metadata = { title: "Denúncia" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DenunciaPage({ params }: PageProps<"/denuncias/recebidas/[id]">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/denuncias"), params]);
  const supabase = await createClient();
  const { data: souComite } = await supabase.from("denuncia_responsaveis").select("user_id").eq("user_id", sessao.id).maybeSingle();
  if (!souComite) redirect("/denuncias");
  if (!UUID.test(id)) notFound();

  const [{ data: d }, { data: mensagens }] = await Promise.all([
    supabase.from("denuncias").select("id, protocolo, categoria, descricao, local_texto, quando, envolvidos, identificacao, status, recebida_em").eq("id", id).maybeSingle(),
    supabase.from("denuncia_mensagens").select("id, autor, responsavel_nome, interna, texto, criada_em").eq("denuncia_id", id).order("seq"),
  ]);
  if (!d) notFound();
  const st = ehStatusDenuncia(d.status) ? d.status : "recebida";

  const linha = (rotulo: string, valor: string | null) => (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm">{valor || "—"}</dd>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Denúncia recebida"
        titulo={`Protocolo ${d.protocolo}`}
        descricao={`${CATEGORIAS_DENUNCIA[d.categoria as keyof typeof CATEGORIAS_DENUNCIA] ?? d.categoria} · recebida em ${formatarData(d.recebida_em)}`}
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/denuncias/recebidas" />}>
            <ChevronLeft data-icon="inline-start" />
            Recebidas
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section aria-labelledby="t-relato" className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 id="t-relato" className="text-base font-semibold">
                Relato
              </h2>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${COR_STATUS[st]}`}>{STATUS_DENUNCIA[st]}</span>
            </div>
            <dl className="mb-4 grid gap-3 sm:grid-cols-2">
              {linha("Onde aconteceu", d.local_texto)}
              {linha("Quando aconteceu", d.quando)}
              {linha("Pessoas envolvidas", d.envolvidos)}
              {linha("Quem denunciou", d.identificacao ? `Identificou-se: ${d.identificacao}` : "Anônimo")}
            </dl>
            <p className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{d.descricao}</p>
          </section>

          <section aria-labelledby="t-conversa" className="rounded-xl border bg-card p-5">
            <h2 id="t-conversa" className="mb-3 text-base font-semibold">
              Conversa e anotações
            </h2>
            <ol className="space-y-2">
              {(mensagens ?? []).length === 0 && <li className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</li>}
              {(mensagens ?? []).map((m) => (
                <li
                  key={m.id}
                  className={`rounded-lg px-3 py-2 text-sm ${m.interna ? "border border-amber-200 bg-amber-50" : m.autor === "denunciante" ? "border bg-muted/40" : "ml-6 border border-primary/15 bg-fct-tinta/5"}`}
                >
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">
                    {m.autor === "denunciante" ? "Quem denunciou" : m.responsavel_nome ?? "Comitê"} · {formatarData(m.criada_em)}
                    {m.interna && " · anotação interna (quem denunciou não vê)"}
                  </p>
                  <p className="whitespace-pre-wrap">{m.texto}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section aria-labelledby="t-responder" className="h-fit rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 id="t-responder" className="mb-3 text-base font-semibold">
            Responder ou mudar a situação
          </h2>
          <RespostaForm action={responderDenuncia.bind(null, d.id)} status={st} />
        </section>
      </div>
    </>
  );
}
