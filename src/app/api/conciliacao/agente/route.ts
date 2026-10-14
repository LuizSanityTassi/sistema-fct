// Recebe os retornos de DDA (.RET do Itaú) mandados pelo agente instalado no PC do Itaú Mailbox.
// Sem sessão de usuário: autentica pela chave do agente (SHA-256 em conc_agentes) e usa a service_role no servidor
// (variável de ambiente), só para gravar o arquivo como os uploads normais. Só aceita arquivo que começa com "341".
import { NextResponse } from "next/server";
import { hashToken, mesmoHash, tokenDoPedido } from "@/lib/conciliacao/agentes";
import { guardarArquivo, MAX_ARQUIVO } from "@/lib/conciliacao/servico";
import { montarMapaFiliais } from "@/lib/data/conciliacao";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const json = (corpo: Record<string, unknown>, status = 200) => NextResponse.json(corpo, { status });

export async function POST(req: Request) {
  const token = tokenDoPedido(req);
  if (!token) return json({ erro: "Chave do agente ausente ou inválida." }, 401);
  const admin = createAdminClient();
  if (!admin) return json({ erro: "Agente não habilitado neste servidor (falta SUPABASE_SERVICE_ROLE_KEY)." }, 503);

  const hash = hashToken(token);
  const { data: agente } = await admin.from("conc_agentes").select("id, nome, criado_por, uploads, token_hash").eq("token_hash", hash).is("revogado_em", null).maybeSingle();
  if (!agente || !mesmoHash(agente.token_hash, hash)) return json({ erro: "Chave do agente inválida ou revogada." }, 401);

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return json({ erro: "Envie o arquivo como multipart/form-data (campo 'arquivo')." }, 400);
  }
  const arquivo = fd.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return json({ erro: "Nenhum arquivo enviado." }, 400);
  if (arquivo.size > MAX_ARQUIVO) return json({ erro: "Arquivo maior que 40 MB." }, 413);

  const agora = new Date().toISOString();
  const marcar = (novo: boolean) => admin.from("conc_agentes").update({ ultimo_uso: agora, uploads: agente.uploads + (novo ? 1 : 0) }).eq("id", agente.id);

  const inicio = Buffer.from(await arquivo.slice(0, 3).arrayBuffer()).toString("latin1");
  if (inicio !== "341") {
    await marcar(false);
    return json({ ok: true, ignorado: true, motivo: "não é um arquivo de retorno do Itaú (não começa com 341)" });
  }

  const nome = arquivo.name.replace(/\\/g, "/").split("/").pop() || "retorno.ret";
  const arq = /\.(ret|txt)$/i.test(nome) ? arquivo : new File([await arquivo.arrayBuffer()], `${nome}.ret`, { type: "application/octet-stream" });
  const filiais = await montarMapaFiliais(admin);
  const r = await guardarArquivo(admin, agente.criado_por, arq, "dda_ret", "agente", { filiais, meta: { agente: agente.nome } });
  if (!r.ok) {
    await marcar(false);
    // .RET sem boletos (ou danificado) é ignorado, não é erro do agente
    const semBoletos = /segmento G|sem boletos|não parece|CNAB/i.test(r.mensagem);
    return semBoletos ? json({ ok: true, ignorado: true, motivo: r.mensagem }) : json({ erro: r.mensagem }, 422);
  }
  await marcar(!r.repetido);
  return json({ ok: true, repetido: !!r.repetido, id: r.id, boletos: /^(\d+) boleto/.exec(r.mensagem)?.[1] ?? null, mensagem: r.mensagem });
}

export function GET() {
  return json({ erro: "Use POST multipart/form-data com o campo 'arquivo' e o cabeçalho X-Agente." }, 405);
}
