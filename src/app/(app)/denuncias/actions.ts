"use server";

// Canal de denúncias. O ENVIO e o ACOMPANHAMENTO usam a chave de serviço do servidor e nunca leem nem gravam quem
// está logado: a denúncia não fica ligada a usuário nenhum (nem no registro de requisições do banco). Só o comitê
// (quem tem o acesso liberado) lê e responde, com o próprio login, e o RLS garante isso.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { ehCategoria, ehStatusDenuncia, type CategoriaDenuncia, type StatusDenuncia } from "@/lib/denuncias/rotulos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I para não confundir
const gerar = (n: number) => Array.from({ length: n }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
const emGrupos = (s: string) => s.match(/.{1,4}/g)!.join("-");
const limpar = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashChave = (protocolo: string, chave: string) => createHash("sha256").update(`${limpar(protocolo)}:${limpar(chave)}`).digest("hex");
const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Só confere que há alguém logado: não lê o perfil nem atualiza o "último acesso" (nenhuma pista de quem enviou). */
async function exigirLogin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
}

function mesmaChave(hashGuardado: string, protocolo: string, chave: string) {
  const a = Buffer.from(hashGuardado, "hex");
  const b = Buffer.from(hashChave(protocolo, chave), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- enviar ----------

export type EstadoEnvio = { erro?: string; erros?: Record<string, string>; protocolo?: string; chave?: string };

export async function enviarDenuncia(_prev: EstadoEnvio, fd: FormData): Promise<EstadoEnvio> {
  await exigirLogin(); // só quem tem acesso ao sistema envia; o usuário NÃO é usado nem gravado
  const admin = createAdminClient();
  if (!admin) return { erro: "O canal está indisponível no momento (configuração do servidor). Avise a TI." };

  const categoria = texto(fd, "categoria");
  const descricao = texto(fd, "descricao");
  const identificar = fd.get("identificar") === "on";
  const identificacao = texto(fd, "identificacao");
  const erros: Record<string, string> = {};
  if (!ehCategoria(categoria)) erros.categoria = "Escolha o assunto.";
  if (descricao.length < 20) erros.descricao = "Conte com um pouco mais de detalhe (mínimo de 20 caracteres).";
  if (descricao.length > 10000) erros.descricao = "Texto muito longo (máximo de 10 mil caracteres).";
  if (identificar && identificacao.length < 3) erros.identificacao = "Informe seu nome e um contato, ou desmarque a opção.";
  const local = texto(fd, "local").slice(0, 200);
  const quando = texto(fd, "quando").slice(0, 120);
  const envolvidos = texto(fd, "envolvidos").slice(0, 1000);
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const protocolo = emGrupos(gerar(8));
    const chave = emGrupos(gerar(12));
    const { error } = await admin.from("denuncias").insert({
      protocolo,
      chave_hash: hashChave(protocolo, chave),
      categoria: categoria as CategoriaDenuncia,
      descricao,
      local_texto: local || null,
      quando: quando || null,
      envolvidos: envolvidos || null,
      identificacao: identificar ? identificacao.slice(0, 300) : null,
    });
    if (!error) {
      revalidatePath("/denuncias");
      return { protocolo, chave };
    }
    if (error.code !== "23505") return { erro: "Não foi possível enviar agora. Tente de novo em instantes." };
  }
  return { erro: "Não foi possível gerar o protocolo. Tente de novo." };
}

// ---------- acompanhar (quem denunciou) ----------

export type MensagemPublica = { autor: "denunciante" | "comite"; texto: string; data: string };
export type DenunciaAcompanhada = { protocolo: string; categoria: string; status: StatusDenuncia; recebidaEm: string; mensagens: MensagemPublica[] };
export type EstadoAcompanhar = { erro?: string; ok?: string; denuncia?: DenunciaAcompanhada; protocolo?: string; chave?: string };

export async function acompanharDenuncia(_prev: EstadoAcompanhar, fd: FormData): Promise<EstadoAcompanhar> {
  await exigirLogin();
  const admin = createAdminClient();
  if (!admin) return { erro: "O canal está indisponível no momento (configuração do servidor). Avise a TI." };
  const protocoloLimpo = limpar(texto(fd, "protocolo"));
  const chaveLimpa = limpar(texto(fd, "chave"));
  const negado = { erro: "Protocolo ou chave não conferem. Confira os códigos que apareceram quando você enviou." };
  if (protocoloLimpo.length !== 8 || chaveLimpa.length !== 12) return negado;
  const protocolo = emGrupos(protocoloLimpo);

  const { data: d } = await admin.from("denuncias").select("id, protocolo, categoria, status, recebida_em, chave_hash").eq("protocolo", protocolo).maybeSingle();
  if (!d || !mesmaChave(d.chave_hash, protocolo, chaveLimpa)) return negado;

  let ok: string | undefined;
  const complemento = texto(fd, "complemento");
  if (complemento) {
    if (complemento.length > 5000) return { erro: "Texto muito longo (máximo de 5 mil caracteres).", protocolo, chave: emGrupos(chaveLimpa) };
    const { error } = await admin.from("denuncia_mensagens").insert({ denuncia_id: d.id, autor: "denunciante", texto: complemento });
    if (error) return { erro: "Não foi possível enviar a mensagem agora. Tente de novo.", protocolo, chave: emGrupos(chaveLimpa) };
    ok = "Mensagem enviada ao comitê.";
    revalidatePath("/denuncias/recebidas");
  }

  const { data: msgs } = await admin
    .from("denuncia_mensagens")
    .select("autor, texto, criada_em")
    .eq("denuncia_id", d.id)
    .eq("interna", false)
    .order("seq");
  return {
    ok,
    protocolo,
    chave: emGrupos(chaveLimpa),
    denuncia: {
      protocolo: d.protocolo,
      categoria: d.categoria,
      status: (ehStatusDenuncia(d.status) ? d.status : "recebida") as StatusDenuncia,
      recebidaEm: d.recebida_em,
      mensagens: (msgs ?? []).map((m) => ({ autor: m.autor === "denunciante" ? "denunciante" : "comite", texto: m.texto, data: m.criada_em })),
    },
  };
}

// ---------- responder (comitê) ----------

export type EstadoResposta = { erro?: string; ok?: string };

export async function responderDenuncia(id: string, _prev: EstadoResposta, fd: FormData): Promise<EstadoResposta> {
  const sessao = await getSessao();
  const supabase = await createClient();
  const { data: atual } = await supabase.from("denuncias").select("id, status").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Sem acesso a esta denúncia." };

  const status = texto(fd, "status");
  const mensagem = texto(fd, "mensagem");
  const interna = fd.get("interna") === "on";
  if (!ehStatusDenuncia(status)) return { erro: "Situação inválida." };
  if (mensagem.length > 5000) return { erro: "Mensagem muito longa (máximo de 5 mil caracteres)." };
  if (!mensagem && status === atual.status) return { erro: "Escreva uma mensagem ou mude a situação." };

  if (mensagem) {
    const { error } = await supabase
      .from("denuncia_mensagens")
      .insert({ denuncia_id: id, autor: "responsavel", responsavel_id: sessao.id, responsavel_nome: sessao.nome, interna, texto: mensagem });
    if (error) return { erro: `Não foi possível gravar a mensagem: ${error.message}` };
  }
  if (status !== atual.status) {
    const { error } = await supabase.from("denuncias").update({ status }).eq("id", id);
    if (error) return { erro: `Não foi possível mudar a situação: ${error.message}` };
    // auditoria só da mudança de situação (sem conteúdo da denúncia)
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "denuncias", registroId: id, anterior: { status: atual.status }, novo: { status } });
  }
  revalidatePath(`/denuncias/recebidas/${id}`);
  revalidatePath("/denuncias/recebidas");
  return { ok: mensagem && status !== atual.status ? "Mensagem enviada e situação atualizada." : mensagem ? (interna ? "Anotação interna gravada." : "Mensagem enviada a quem denunciou.") : "Situação atualizada." };
}
