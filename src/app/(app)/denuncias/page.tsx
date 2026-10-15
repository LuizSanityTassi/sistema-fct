import Link from "next/link";
import { EyeOff, Inbox, KeyRound, Lock, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { acompanharDenuncia, enviarDenuncia } from "./actions";
import { AcompanharForm, NovaDenunciaForm } from "./formularios";

export const metadata = { title: "Canal de denúncias" };

const GARANTIAS = [
  { icone: EyeOff, titulo: "Anônimo de verdade", texto: "A denúncia não fica ligada ao seu usuário. O sistema não registra quem enviou nem a hora do envio." },
  { icone: Lock, titulo: "Só o comitê lê", texto: "Apenas as pessoas autorizadas pela diretoria acessam as denúncias. Nem o administrador do sistema lê sem estar autorizado." },
  { icone: KeyRound, titulo: "Acompanhe sem se identificar", texto: "Você recebe um protocolo e uma chave para ver o andamento e conversar com o comitê." },
];

export default async function CanalDenunciasPage() {
  const sessao = await exigirAcesso("/denuncias");
  const supabase = await createClient();
  const { data: souComite } = await supabase.from("denuncia_responsaveis").select("user_id").eq("user_id", sessao.id).maybeSingle();
  const { count: novas } = souComite ? await supabase.from("denuncias").select("id", { count: "exact", head: true }).eq("status", "recebida") : { count: 0 };

  // quem forma o comitê (só os nomes, para quem denuncia saber com quem está falando)
  const admin = createAdminClient();
  const { data: comite } = admin
    ? await admin.from("denuncia_responsaveis").select("perfil:profiles!denuncia_responsaveis_user_id_fkey(nome, ativo)")
    : { data: null };
  const nomes = (comite ?? [])
    .map((c) => (c.perfil as { nome: string; ativo: boolean } | null))
    .filter((p): p is { nome: string; ativo: boolean } => !!p?.ativo)
    .map((p) => p.nome)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <>
      <PageHeader
        eyebrow="Ética e conduta"
        titulo="Canal de denúncias"
        descricao="Viu ou sofreu assédio, discriminação, fraude ou outra conduta errada? Conte aqui com segurança. Toda denúncia é analisada com sigilo."
        acoes={
          souComite ? (
            <Button nativeButton={false} render={<Link href="/denuncias/recebidas" />}>
              <Inbox data-icon="inline-start" />
              Denúncias recebidas{novas ? ` (${novas} nova${novas > 1 ? "s" : ""})` : ""}
            </Button>
          ) : undefined
        }
      />

      <ul className="mb-6 grid gap-3 md:grid-cols-3">
        {GARANTIAS.map(({ icone: Icone, titulo, texto }) => (
          <li key={titulo} className="flex gap-3 rounded-xl border bg-card p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-fct-navy/6 text-fct-navy">
              <Icone className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold">{titulo}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{texto}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-5">
        <section aria-labelledby="t-nova" className="rounded-xl border bg-card p-5 lg:col-span-3">
          <h2 id="t-nova" className="mb-4 text-base font-semibold">
            Fazer uma denúncia
          </h2>
          <NovaDenunciaForm action={enviarDenuncia} />
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section aria-labelledby="t-acompanhar" className="rounded-xl border bg-card p-5">
            <h2 id="t-acompanhar" className="mb-1 text-base font-semibold">
              Acompanhar uma denúncia
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">Use o protocolo e a chave que apareceram quando você enviou.</p>
            <AcompanharForm action={acompanharDenuncia} />
          </section>

          <section aria-labelledby="t-comite" className="rounded-xl border bg-card p-5">
            <h2 id="t-comite" className="mb-2 flex items-center gap-2 text-base font-semibold">
              <UsersRound className="size-4 text-fct-navy" aria-hidden />
              Quem recebe as denúncias
            </h2>
            {nomes.length ? (
              <>
                <ul className="flex flex-wrap gap-1.5">
                  {nomes.map((n) => (
                    <li key={n} className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-sm">
                      {n}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">Se a denúncia envolver alguém desta lista, conte isso no texto: a apuração é feita pelos demais.</p>
              </>
            ) : (
              <p className="text-sm text-amber-800">O comitê ainda não foi definido. As denúncias ficam guardadas até alguém ser autorizado.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
