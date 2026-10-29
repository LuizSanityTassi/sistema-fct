import Link from "next/link";
import { ArrowLeft, Clock, Lock, LockOpen } from "lucide-react";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { infoDaTela, perfisQueAbrem, ROTA_VALIDA } from "@/lib/acesso/pedidos";
import { getSessao } from "@/lib/auth/session";
import { formatarDataHora } from "@/lib/formatos";
import { PAPEL_LABEL } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { pedirAcesso } from "./actions";
import { PedirAcessoForm } from "./pedir-acesso-form";

export const metadata = { title: "Sem acesso" };

/** Para onde vai quem abre uma tela que o perfil não libera: explica e deixa pedir acesso ao administrador. */
export default async function SemAcessoPage({ searchParams }: PageProps<"/sem-acesso">) {
  const [sessao, sp] = await Promise.all([getSessao(), searchParams]);
  const rotaPedida = typeof sp.rota === "string" && ROTA_VALIDA.test(sp.rota) ? sp.rota : null;
  const info = rotaPedida ? infoDaTela(rotaPedida) : null;
  const jaTem = !!info?.papeis?.includes(sessao.papel);
  const perfis = info ? perfisQueAbrem(info.papeis) : null;

  const supabase = await createClient();
  const { data: ultimo } = info
    ? await supabase.from("acesso_solicitacoes").select("status, motivo, resposta, criada_em, respondida_em, respondida_por_nome").eq("solicitante", sessao.id).eq("rota", info.rota).order("criada_em", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const aguardando = ultimo?.status === "pendente";

  return (
    <div className="mx-auto max-w-xl py-4 text-center sm:py-10">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground ring-8 ring-muted/50">
        {jaTem ? <LockOpen className="size-6" aria-hidden /> : <Lock className="size-6" aria-hidden />}
      </span>

      {jaTem && info ? (
        <>
          <h1 className="mt-6 text-2xl">Você já tem acesso a {info.tela}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Seu perfil foi ajustado. Se a tela não abrir, saia do sistema e entre de novo.</p>
          <Button className="mt-6" nativeButton={false} render={<Link href={info.rota} />}>
            Abrir {info.tela}
          </Button>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-2xl text-balance">Você não tem acesso a {info?.tela ?? "esta tela"}</h1>
          <p className="mt-2 text-sm text-balance text-muted-foreground">
            Seu perfil ({PAPEL_LABEL[sessao.papel]}) não abre esta tela{perfis ? `. Quem usa: ${perfis}` : ""}. Se você precisa dela no seu trabalho, peça ao administrador.
          </p>

          <div className="mt-8 rounded-xl border bg-card p-5 text-left">
            {aguardando && ultimo ? (
              <div className="space-y-2">
                <Status tom="atencao">Pedido aguardando o administrador</Status>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="size-4" aria-hidden />
                  Enviado em {formatarDataHora(ultimo.criada_em)}. A resposta chega por e-mail e aparece aqui.
                </p>
                {ultimo.motivo && <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">“{ultimo.motivo}”</p>}
              </div>
            ) : (
              <>
                {ultimo?.status === "recusada" && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                    Seu pedido de {formatarDataHora(ultimo.criada_em)} não foi aprovado{ultimo.respondida_por_nome ? ` por ${ultimo.respondida_por_nome}` : ""}
                    {ultimo.resposta ? `: “${ultimo.resposta}”` : "."} Se a situação mudou, pode pedir de novo.
                  </div>
                )}
                {ultimo?.status === "atendida" && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    O administrador marcou seu pedido como atendido em {formatarDataHora(ultimo.respondida_em)}
                    {ultimo.resposta ? ` (“${ultimo.resposta}”)` : ""}, mas o seu perfil ainda não abre esta tela. Saia e entre de novo; se continuar assim, peça de novo.
                  </div>
                )}
                {info ? (
                  <PedirAcessoForm action={pedirAcesso} rota={info.rota} tela={info.tela} />
                ) : (
                  <p className="text-sm text-muted-foreground">Não sei qual tela você tentou abrir. Volte e tente de novo pelo menu.</p>
                )}
              </>
            )}
          </div>
        </>
      )}

      <Button variant="ghost" className="mt-6" nativeButton={false} render={<Link href="/portal" />}>
        <ArrowLeft data-icon="inline-start" />
        Voltar ao início
      </Button>
    </div>
  );
}
