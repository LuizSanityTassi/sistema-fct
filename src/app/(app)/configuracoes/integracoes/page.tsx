import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { EMPRESAS_OMIE, statusChaves, type EmpresaOmie } from "@/lib/conciliacao/omie-api";
import { credenciaisTrier, SEGREDOS, statusSegredos } from "@/lib/integracoes/segredos";
import { formatarDataHora } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { salvarOmie, salvarTrier } from "./actions";
import { OmieForm, TrierForm } from "./formularios";

export const metadata = { title: "Integrações" };

const Estado = ({ ok, texto }: { ok: boolean; texto: string }) => <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{ok ? "🟢" : "⚪"} {texto}</span>;

export default async function IntegracoesPage() {
  const sessao = await exigirAcesso("/configuracoes/integracoes");
  if (sessao.papel !== "admin") redirect("/dashboard?erro=sem_permissao");
  const supabase = await createClient();
  const [segredos, cred, omie, { count: agentes }] = await Promise.all([
    statusSegredos(supabase),
    credenciaisTrier(supabase),
    statusChaves(supabase),
    supabase.from("conc_agentes").select("id", { count: "exact", head: true }).is("revogado_em", null),
  ]);
  const temServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const trierOk = Boolean(cred.usuario && cred.senha);
  const quando = (nome: keyof typeof SEGREDOS) => segredos[SEGREDOS[nome]].atualizadoEm;

  return (
    <>
      <PageHeader eyebrow="Configurações" titulo="Integrações" descricao="Tudo que precisa de chave ou senha para o sistema conversar com os outros: Trier, Omie, agente do Itaú e convite por e-mail. Os valores ficam criptografados no banco (Vault) e nunca voltam para a tela." />

      <section className="mb-4 rounded-xl border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Trier — robô do relatório “Contas a Pagar ou Pagas”</h2>
          <Estado ok={trierOk} texto={trierOk ? `configurado (${cred.origem === "sistema" ? "aqui" : "ambiente"})` : "falta usuário e senha"} />
          {quando("trier_senha") && <span className="text-xs text-muted-foreground">senha alterada em {formatarDataHora(quando("trier_senha")!)}</span>}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Crie no Trier um usuário só para o robô, com acesso apenas ao relatório “Contas a Pagar ou Pagas” (Rel 0010), e cadastre aqui. Depois é só usar “Buscar do Trier agora” em{" "}
          <Link href="/conciliacao/robos" className="text-fct-navy underline">
            Conciliação → Robôs e agente
          </Link>
          .
        </p>
        <TrierForm action={salvarTrier} status={{ url: cred.url, usuario: segredos[SEGREDOS.trier_usuario].configurado, senha: segredos[SEGREDOS.trier_senha].configurado, origemAmbiente: cred.origem === "ambiente" }} />
      </section>

      {(["nazario", "varela"] as EmpresaOmie[]).map((e) => {
        const key = e === "nazario" ? SEGREDOS.omie_nazario_app_key : SEGREDOS.omie_varela_app_key;
        const secret = e === "nazario" ? SEGREDOS.omie_nazario_app_secret : SEGREDOS.omie_varela_app_secret;
        return (
          <section key={e} className="mb-4 rounded-xl border bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">Omie {EMPRESAS_OMIE[e]} — API de contas a pagar</h2>
              <Estado ok={omie[e].configurado} texto={omie[e].configurado ? `configurada (${omie[e].origem === "sistema" ? "aqui" : "ambiente"})` : "sem chaves: só planilha"} />
              {segredos[key].atualizadoEm && <span className="text-xs text-muted-foreground">alterada em {formatarDataHora(segredos[key].atualizadoEm!)}</span>}
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Na Omie da {EMPRESAS_OMIE[e]}: Configurações → Aplicativos (ou peça ao suporte) → gere a app_key e a app_secret. {e === "nazario" ? "Filiais 300 em diante e TRIO." : "Filiais abaixo de 300 (Varela e Itajaí)."} “Salvar e testar” já busca conta corrente, categoria e departamentos.
            </p>
            <OmieForm action={salvarOmie} empresa={e} nome={EMPRESAS_OMIE[e]} status={{ appKey: segredos[key].configurado, appSecret: segredos[secret].configurado, final: segredos[key].final, origemAmbiente: omie[e].origem === "ambiente" }} />
          </section>
        );
      })}

      <section className="mb-4 rounded-xl border bg-card p-5 text-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Agente dos .RET do Itaú (PC do Itaú Mailbox)</h2>
          <Estado ok={temServiceRole} texto={temServiceRole ? `pronto · ${agentes ?? 0} agente(s) ativo(s)` : "precisa de 1 variável no servidor"} />
        </div>
        <p className="text-muted-foreground">
          A chave de cada PC é gerada em{" "}
          <Link href="/conciliacao/robos" className="text-fct-navy underline">
            Conciliação → Robôs e agente
          </Link>{" "}
          (não precisa de nada aqui). O endereço que recebe os arquivos roda sem login de usuário, por isso é a única parte que depende de uma variável no servidor:
        </p>
        {!temServiceRole && (
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Supabase → projeto sistema-fct → Settings → API → copie a <strong>service_role</strong> (secret).</li>
            <li>
              Vercel → projeto sistema-fct → Settings → Environment Variables → nova variável <code className="rounded bg-muted px-1 text-xs">SUPABASE_SERVICE_ROLE_KEY</code> (Production) → Save → Deployments → Redeploy.
            </li>
            <li>Isso também liga o convite de usuários por e-mail. Nunca cole essa chave em outro lugar (nem aqui, nem no Git).</li>
          </ol>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5 text-sm">
        <h2 className="mb-2 text-sm font-semibold">Login por e-mail (“Esqueci minha senha” e convites)</h2>
        <p className="text-muted-foreground">Para os links dos e-mails do Supabase voltarem para o sistema, confira uma vez no painel do Supabase (Authentication → URL Configuration):</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Site URL: <code className="rounded bg-muted px-1 text-xs">https://portal.farmaciafct.com.br</code>
          </li>
          <li>
            Redirect URLs: <code className="rounded bg-muted px-1 text-xs">https://portal.farmaciafct.com.br/**</code>,{" "}
            <code className="rounded bg-muted px-1 text-xs">https://sistema-fct.vercel.app/**</code> e <code className="rounded bg-muted px-1 text-xs">http://localhost:3000/**</code>
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Convite de usuário: com a <code className="rounded bg-muted px-1 text-xs">SUPABASE_SERVICE_ROLE_KEY</code> o convite sai por e-mail; sem ela, o sistema cria a conta e manda o e-mail de confirmação (a pessoa define a senha no primeiro acesso).
        </p>
      </section>
    </>
  );
}
