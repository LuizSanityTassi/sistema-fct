import { redirect } from "next/navigation";
import { Emblema } from "@/components/layout/marca";
import { getSessao, semAcesso } from "@/lib/auth/session";
import { lerUuid } from "@/lib/data/ponto";
import { podeAcessar } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import {
  identificarNoRelogio,
  registrarNoRelogio,
} from "../(app)/ponto/registrar/actions";
import { filiaisDoRelogio } from "../(app)/ponto/relogio/filiais";
import { Quiosque } from "../(app)/ponto/relogio/quiosque";
import { sairDoRelogio } from "./actions";
import { SairDoRelogio, TravaQuiosque } from "./trava";

export const metadata = { title: "Relógio de ponto" };
export const dynamic = "force-dynamic";

/**
 * Relógio da filial em modo quiosque: fora do menu do sistema, só o teclado de matrícula e PIN.
 * O login do relógio (papel "relogio") só enxerga esta tela; gestor que abre daqui precisa da senha para sair.
 */
export default async function RelogioQuiosquePage({
  searchParams,
}: PageProps<"/relogio">) {
  const [sessao, sp] = await Promise.all([getSessao(), searchParams]);
  const doRelogio = sessao.papel === "relogio";
  if (
    !doRelogio &&
    !podeAcessar(sessao.papel, "/ponto/relogio", sessao.telasExtras, sessao.bloqueios)
  )
    semAcesso("/ponto/relogio");

  let filial: { id: string; codigo: string; nome: string } | undefined;
  if (doRelogio) {
    if (sessao.branchId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("branches")
        .select("id, codigo, nome")
        .eq("id", sessao.branchId)
        .maybeSingle();
      filial = data ?? undefined;
    }
  } else {
    const opcoes = await filiaisDoRelogio(sessao);
    const escolhida = lerUuid(sp.filial) ?? sessao.branchId;
    filial =
      opcoes.find((u) => u.id === escolhida) ??
      (opcoes.length === 1 ? opcoes[0] : undefined);
    if (!filial) redirect("/ponto/relogio");
  }

  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-muted/40 select-none">
      <TravaQuiosque />
      <header className="flex items-center justify-between gap-3 bg-fct-red-fundo px-4 py-2.5 text-white sm:px-8">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-white p-1">
            <Emblema largura={34} prioridade />
          </span>
          <p className="font-heading text-base leading-tight sm:text-lg">
            Relógio de ponto
          </p>
        </div>
        <SairDoRelogio
          acao={sairDoRelogio}
          doRelogio={doRelogio}
          conta={sessao.email || sessao.nome}
        />
      </header>
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        {filial ? (
          <Quiosque
            key={filial.id}
            filial={filial}
            identificar={identificarNoRelogio}
            registrar={registrarNoRelogio}
          />
        ) : (
          <p className="max-w-sm rounded-xl border bg-card px-5 py-6 text-center text-sm text-muted-foreground">
            Este login de relógio não está ligado a nenhuma filial. Fale com o
            administrador do sistema.
          </p>
        )}
      </div>
    </main>
  );
}
