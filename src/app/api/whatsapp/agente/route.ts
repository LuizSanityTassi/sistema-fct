// Agente WhatsApp do escritório (Desktop\agente-whatsapp): a cada rodada manda como está (número, conectado, grupos em
// que o número participa e o resultado do que enviou) e recebe o que mandar agora. Sem sessão de usuário: autentica pela
// chave do agente (cabeçalho X-Agente; no banco só o SHA-256) e usa a service_role no servidor.
import { NextResponse } from "next/server";
import { hashToken, mesmoHash, tokenDoPedido } from "@/lib/conciliacao/agentes";
import { createAdminClient } from "@/lib/supabase/admin";
import { pendentesDaFila } from "@/lib/whatsapp/chamados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (corpo: Record<string, unknown>, status = 200) => NextResponse.json(corpo, { status });

type Pedido = {
  numero?: unknown;
  conectado?: unknown;
  situacao?: unknown;
  grupos?: unknown;
  resultados?: unknown;
};

export async function POST(req: Request) {
  const token = tokenDoPedido(req);
  if (!token) return json({ erro: "Chave do agente ausente ou inválida." }, 401);
  const admin = createAdminClient();
  if (!admin) return json({ erro: "Agente não habilitado neste servidor (falta SUPABASE_SERVICE_ROLE_KEY)." }, 503);
  const hash = hashToken(token);
  const { data: agente } = await admin.from("wpp_agente").select("token_hash").eq("id", 1).maybeSingle();
  if (!agente?.token_hash || !mesmoHash(agente.token_hash, hash)) return json({ erro: "Chave do agente inválida ou trocada." }, 401);

  let p: Pedido;
  try {
    p = (await req.json()) as Pedido;
  } catch {
    return json({ erro: "Mande JSON." }, 400);
  }
  const agora = new Date().toISOString();
  const conectado = p.conectado === true;
  await admin
    .from("wpp_agente")
    .update({
      ultimo_contato: agora,
      conectado,
      numero: typeof p.numero === "string" ? p.numero.replace(/\D/g, "").slice(0, 20) || null : null,
      situacao: typeof p.situacao === "string" ? p.situacao.slice(0, 200) : null,
    })
    .eq("id", 1);

  // grupos em que o número está (manda de vez em quando): substitui a lista
  if (Array.isArray(p.grupos)) {
    const grupos = p.grupos
      .filter((g): g is { jid: string; nome: string } => !!g && typeof g.jid === "string" && /@g\.us$/.test(g.jid) && typeof g.nome === "string")
      .slice(0, 500)
      .map((g) => ({ jid: g.jid, nome: g.nome.slice(0, 120) || g.jid, atualizado_em: agora }));
    await admin.from("wpp_grupos").delete().not("jid", "in", `(${grupos.map((g) => `"${g.jid}"`).join(",") || '""'})`);
    if (grupos.length) await admin.from("wpp_grupos").upsert(grupos);
  }

  // resultado do que o agente mandou na rodada anterior
  if (Array.isArray(p.resultados)) {
    for (const r of p.resultados.slice(0, 50) as { id?: unknown; ok?: unknown; erro?: unknown }[]) {
      if (typeof r?.id !== "number") continue;
      if (r.ok === true) await admin.from("wpp_fila").update({ enviado_em: agora, erro: null }).eq("id", r.id).is("enviado_em", null);
      else {
        const { data: f } = await admin.from("wpp_fila").select("tentativas").eq("id", r.id).maybeSingle();
        await admin
          .from("wpp_fila")
          .update({ tentativas: (f?.tentativas ?? 0) + 1, erro: typeof r.erro === "string" ? r.erro.slice(0, 300) : "falhou" })
          .eq("id", r.id);
      }
    }
  }

  return json({ ok: true, pendentes: conectado ? await pendentesDaFila(admin) : [] });
}

export function GET() {
  return json({ erro: "Use POST com o cabeçalho X-Agente." }, 405);
}
