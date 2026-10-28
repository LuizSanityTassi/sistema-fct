import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Ponto } from "@/components/layout/status";
import { exigirAcesso, semAcesso } from "@/lib/auth/session";
import { SMTP_PADRAO } from "@/lib/email";
import { EMPRESAS_OMIE, statusChaves, type EmpresaOmie } from "@/lib/conciliacao/omie-api";
import { credenciaisTrier, SEGREDOS, statusSegredos } from "@/lib/integracoes/segredos";
import { formatarDataHora } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { diagnosticarRelatoriosTrier, diagnosticarRelatoriosVendasTrier, salvarOmie, salvarSmtp, salvarTrier } from "./actions";
import { DiagnosticoTrierForm, OmieForm, SmtpForm, TrierForm } from "./formularios";

export const metadata = { title: "Integrações" };
// o diagnóstico do Trier entra no sistema e gera relatórios: precisa do tempo máximo da função
export const maxDuration = 300;

const Estado = ({ ok, texto }: { ok: boolean; texto: string }) => <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}><Ponto tom={ok ? "sucesso" : "atencao"} /> {texto}</span>;

// dia anterior no horário de Brasília (UTC−3), em aaaa-mm-dd
const ontemNoBrasil = () => new Date(Date.now() - 27 * 3_600_000).toISOString().slice(0, 10);

export default async function IntegracoesPage() {
  const sessao = await exigirAcesso("/configuracoes/integracoes");
  if (sessao.papel !== "admin") semAcesso("/configuracoes/integracoes");
  const supabase = await createClient();
  const [segredos, cred, omie, { count: agentes }, { data: ultimoDiag }, { data: ultimoVendas }] = await Promise.all([
    statusSegredos(supabase),
    credenciaisTrier(supabase),
    statusChaves(supabase),
    supabase.from("conc_agentes").select("id", { count: "exact", head: true }).is("revogado_em", null),
    supabase.from("integracao_diagnosticos").select("criado_em").eq("sistema", "trier").order("criado_em", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("integracao_diagnosticos").select("criado_em").eq("sistema", "trier").eq("resumo->>tema", "vendas").order("criado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const ontem = ontemNoBrasil();
  const temServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const trierOk = Boolean(cred.usuario && cred.senha);
  const smtpOk = segredos[SEGREDOS.smtp_senha].configurado;
  const quando = (nome: keyof typeof SEGREDOS) => segredos[SEGREDOS[nome]].atualizadoEm;

  return (
    <>
      <PageHeader eyebrow="Administração" titulo="Integrações" descricao="Tudo que precisa de chave ou senha para o sistema conversar com os outros: Trier, Omie, agente do Itaú, e-mail dos avisos e convite por e-mail. Os valores ficam criptografados no banco (Vault) e nunca voltam para a tela." />

      <section className="mb-4 rounded-xl border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Trier — robô dos relatórios</h2>
          <Estado ok={trierOk} texto={trierOk ? `configurado (${cred.origem === "sistema" ? "aqui" : "ambiente"})` : "falta usuário e senha"} />
          {quando("trier_senha") && <span className="text-xs text-muted-foreground">senha alterada em {formatarDataHora(quando("trier_senha")!)}</span>}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Crie no Trier um usuário só para o robô, com acesso apenas aos relatórios “Contas a Pagar ou Pagas” (Rel 0010), “Conferência de Movimentos de Caixa” e “Fechamento de Caixa”, e cadastre aqui. Depois é só usar “Buscar do Trier agora” em{" "}
          <Link href="/conciliacao/robos" className="text-fct-tinta underline">
            Automações → Robôs e agente
          </Link>
          .
        </p>
        <TrierForm action={salvarTrier} status={{ url: cred.url, usuario: segredos[SEGREDOS.trier_usuario].configurado, senha: segredos[SEGREDOS.trier_senha].configurado, origemAmbiente: cred.origem === "ambiente" }} />
        {trierOk && (
          <div className="mt-4 space-y-4">
            <DiagnosticoTrierForm action={diagnosticarRelatoriosVendasTrier} tema="vendas" ontem={ontem} ultimo={ultimoVendas ? formatarDataHora(ultimoVendas.criado_em) : null} />
            <DiagnosticoTrierForm action={diagnosticarRelatoriosTrier} ontem={ontem} ultimo={ultimoDiag ? formatarDataHora(ultimoDiag.criado_em) : null} />
          </div>
        )}
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
          <Link href="/conciliacao/robos" className="text-fct-tinta underline">
            Automações → Robôs e agente
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

      <section id="email" className="mb-4 scroll-mt-20 rounded-xl border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">E-mail de envio dos avisos</h2>
          <Estado ok={smtpOk} texto={smtpOk ? "configurado" : "falta a senha"} />
          {quando("smtp_senha") && <span className="text-xs text-muted-foreground">senha alterada em {formatarDataHora(quando("smtp_senha")!)}</span>}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Caixa usada para mandar os avisos do sistema (ex.: quebras de caixa esperando justificativa, toda manhã). Normalmente é a mesma <strong>nao-responda@farmaciafct.com.br</strong> do login: só falta a senha dela (a do cPanel). Os outros campos já vêm com o padrão. Os avisos em si ficam em{" "}
          <Link href="/financeiro/diferenca-caixa/avisos" className="text-fct-tinta underline">
            Financeiro → Diferença de caixa → Avisos por e-mail
          </Link>
          .
        </p>
        <SmtpForm
          action={salvarSmtp}
          status={{
            host: segredos[SEGREDOS.smtp_host].configurado,
            porta: segredos[SEGREDOS.smtp_porta].configurado,
            usuario: segredos[SEGREDOS.smtp_usuario].configurado,
            senha: smtpOk,
            padrao: SMTP_PADRAO,
          }}
        />
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
