import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { exigirAcesso } from "@/lib/auth/session";
import { LIMITE_DIA_PESSOA_USD, MAX_CARACTERES_PERGUNTA } from "@/lib/ia/config";
import { createClient } from "@/lib/supabase/server";
import { ChatAssistente, type MensagemChat } from "./chat";

export const metadata = { title: "Assistente IA" };

const SUGESTOES = ["Qual filial mais caiu em venda este mês, comparando com o mês passado?", "Quais lojas estão em situação crítica e por quê?", "Quais fornecedores têm mais pendências em aberto?", "O que mudou na DRE de setembro para agosto?"];

/** O que aparece na tela de cada mensagem guardada: o texto (a pergunta é o último bloco; o primeiro traz a data). */
function paraTela(papel: string, conteudo: string): MensagemChat | null {
  const textos = (JSON.parse(conteudo) as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text ?? "");
  if (!textos.length) return null;
  return papel === "user" ? { papel: "user", texto: textos[textos.length - 1] } : { papel: "assistant", texto: textos.join("\n\n") };
}

export default async function AssistentePage() {
  const sessao = await exigirAcesso("/assistente");
  const cabecalho = <PageHeader eyebrow="Diretoria Estratégica" titulo="Assistente IA" descricao="Pergunte em português e a IA responde com os dados do sistema. Ela vê só o que você já pode ver e não altera nada." />;
  if (!process.env.ANTHROPIC_API_KEY) {
    return (
      <>
        {cabecalho}
        <section className="rounded-xl border bg-card">
          <EstadoVazio
            icone={Sparkles}
            titulo="O assistente ainda não foi ligado"
            descricao={sessao.papel === "admin" ? "Falta cadastrar a chave da API da Anthropic na Vercel, com o nome ANTHROPIC_API_KEY, e publicar de novo." : "Fale com o administrador do sistema."}
          />
        </section>
      </>
    );
  }
  const supabase = await createClient();
  const [{ data: gastos }, { data: ultima }] = await Promise.all([supabase.rpc("ia_gastos").maybeSingle(), supabase.from("ia_conversas").select("id").order("atualizado_em", { ascending: false }).limit(1).maybeSingle()]);
  const { data: linhas } = ultima ? await supabase.from("ia_mensagens").select("papel, conteudo").eq("conversa_id", ultima.id).order("ordem") : { data: [] };
  const mensagens = (linhas ?? []).flatMap((l) => paraTela(l.papel, l.conteudo) ?? []);
  return (
    <>
      {cabecalho}
      <ChatAssistente conversaInicial={ultima?.id ?? null} mensagensIniciais={mensagens} sugestoes={SUGESTOES} gastoHoje={Number(gastos?.hoje_usuario ?? 0)} limiteDia={LIMITE_DIA_PESSOA_USD} maxCaracteres={MAX_CARACTERES_PERGUNTA} />
    </>
  );
}
