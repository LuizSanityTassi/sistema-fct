"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { listarRegras, opcoesOmie, reaplicarRegras } from "@/lib/conciliacao-gi/regras";
import { ehProblema } from "@/lib/conciliacao/rotulos";
import { ehUuid } from "@/lib/data/filiais";
import { lerValorDigitado } from "@/lib/rh/lancamentos";
import { createClient } from "@/lib/supabase/server";
import { normOmie } from "@/lib/conciliacao/omie-api";

export type EstadoRegra = { erro?: string; erros?: Record<string, string> };

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

async function exigirConciliar() {
  const sessao = await getSessao();
  return podeConciliar(sessao.papel) ? sessao : null;
}

function revalidar() {
  revalidatePath("/conciliacao-gi/regras");
  revalidatePath("/conciliacao-gi/pendencias");
  revalidatePath("/conciliacao-gi");
}

const esquema = z.object({
  nome: z.string({ error: "Dê um nome para a regra." }).trim().min(2, "Mínimo de 2 caracteres.").max(80, "Máximo de 80 caracteres."),
  ordem: z.coerce.number({ error: "Ordem inválida." }).int("Use um número inteiro.").min(0, "De 0 a 9999.").max(9999, "De 0 a 9999."),
  nome_contem: z.string().trim().min(2, "Mínimo de 2 caracteres.").max(80, "Máximo de 80 caracteres.").optional(),
  categoria_omie: z.string().trim().min(2, "Mínimo de 2 caracteres.").max(70, "Máximo de 70 caracteres.").optional(),
  departamento_omie: z.string().trim().min(2, "Mínimo de 2 caracteres.").max(80, "Máximo de 80 caracteres.").optional(),
  pendencia_acao: z.enum(["resolvido", "justificado"]).optional(),
  pendencia_motivo: z.string().trim().min(3, "Mínimo de 3 caracteres.").max(200, "Máximo de 200 caracteres.").optional(),
});

export async function salvarRegra(id: string | null, _prev: EstadoRegra, fd: FormData): Promise<EstadoRegra> {
  const sessao = await exigirConciliar();
  if (!sessao) return { erro: "Só Administrador e Financeiro alteram as regras." };
  if (id && !ehUuid(id)) return { erro: "Regra inválida." };
  const r = esquema.safeParse({
    nome: texto(fd, "nome"),
    ordem: texto(fd, "ordem") ?? "100",
    nome_contem: texto(fd, "nome_contem"),
    categoria_omie: texto(fd, "categoria_omie"),
    departamento_omie: texto(fd, "departamento_omie"),
    pendencia_acao: texto(fd, "pendencia_acao"),
    pendencia_motivo: texto(fd, "pendencia_motivo"),
  });
  const erros: Record<string, string> = {};
  if (!r.success) {
    const { fieldErrors } = z.flattenError(r.error);
    for (const [k, v] of Object.entries(fieldErrors)) erros[k] = (v as string[] | undefined)?.[0] ?? "";
  }

  // raiz do CNPJ: aceita o CNPJ inteiro (com ou sem pontuação) ou só os 8 primeiros dígitos
  const cnpjTxt = texto(fd, "cnpj_raiz");
  const cnpjDig = (cnpjTxt ?? "").replace(/\D/g, "");
  if (cnpjTxt && cnpjDig.length !== 8 && cnpjDig.length !== 14) erros.cnpj_raiz = "Informe o CNPJ (14 dígitos) ou a raiz (8 dígitos).";
  // filiais: "301, 302" ou "F301 F302"
  const filTxt = texto(fd, "filiais");
  const partes = (filTxt ?? "").split(/[\s,;]+/).filter(Boolean);
  if (partes.some((p) => !/^F?\d{1,3}$/i.test(p))) erros.filiais = "Use os números das filiais separados por vírgula. Ex.: 301, 302";
  const filiais = [...new Set(partes.map((p) => Number(p.replace(/^F/i, ""))))].sort((a, b) => a - b);
  const valorMin = texto(fd, "valor_min") ? lerValorDigitado(texto(fd, "valor_min")!) : null;
  const valorMax = texto(fd, "valor_max") ? lerValorDigitado(texto(fd, "valor_max")!) : null;
  if (valorMin !== null && Number.isNaN(valorMin)) erros.valor_min = "Valor inválido. Ex.: 150,00";
  if (valorMax !== null && Number.isNaN(valorMax)) erros.valor_max = "Valor inválido. Ex.: 150,00";
  if (valorMin !== null && valorMax !== null && !Number.isNaN(valorMin) && !Number.isNaN(valorMax) && valorMin > valorMax) erros.valor_max = "O máximo precisa ser maior que o mínimo.";
  const problemas = [...new Set(fd.getAll("problemas").filter(ehProblema))];

  if (Object.keys(erros).length || !r.success) return { erro: "Confira os campos destacados.", erros };
  const d = r.data;
  const temCondicao = !!d.nome_contem || !!cnpjTxt || filiais.length > 0 || valorMin !== null || valorMax !== null || problemas.length > 0;
  if (!temCondicao) return { erro: "Preencha pelo menos uma condição (nome, CNPJ, filial, valor ou tipo de divergência)." };
  if (!d.categoria_omie && !d.departamento_omie && !d.pendencia_acao) return { erro: "Escolha pelo menos uma ação: categoria, departamento ou o que fazer com a pendência." };
  if (d.pendencia_acao && !d.pendencia_motivo) return { erro: "Confira os campos destacados.", erros: { pendencia_motivo: "Escreva o motivo que vai aparecer na pendência." } };

  const registro = {
    nome: d.nome,
    ordem: d.ordem,
    nome_contem: d.nome_contem?.toUpperCase() ?? null,
    cnpj_raiz: cnpjTxt ? cnpjDig.slice(0, 8) : null,
    filiais,
    valor_min: valorMin,
    valor_max: valorMax,
    problemas,
    categoria_omie: d.categoria_omie ?? null,
    departamento_omie: d.departamento_omie ?? null,
    pendencia_acao: d.pendencia_acao ?? null,
    pendencia_motivo: d.pendencia_acao ? (d.pendencia_motivo ?? null) : null,
    ativo: id && fd.has("ativo_presente") ? fd.get("ativo") === "on" : true,
  };

  const supabase = await createClient();
  if (id) {
    const { data: atual } = await supabase.from("gi_conc_regras").select("*").eq("id", id).maybeSingle();
    if (!atual) return { erro: "Regra não encontrada." };
    const { error } = await supabase.from("gi_conc_regras").update(registro).eq("id", id);
    if (error) return { erro: error.message };
    const dif = diferencas(atual, registro);
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "gi_conc_regras", registroId: id, anterior: dif.anterior, novo: dif.novo });
  } else {
    const { data: criado, error } = await supabase
      .from("gi_conc_regras")
      .insert({ ...registro, criado_por: sessao.id })
      .select("id")
      .single();
    if (error) return { erro: error.message };
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "gi_conc_regras", registroId: criado.id, novo: registro });
  }

  // nome que a Omie não conhece: salva, mas avisa (a planilha ou a API recusariam a conta)
  const op = await opcoesOmie(supabase);
  const avisos: string[] = [];
  if (op.buscou && registro.categoria_omie && !op.categorias.some((c) => normOmie(c) === normOmie(registro.categoria_omie)))
    avisos.push(`a categoria “${registro.categoria_omie}” não está entre as categorias de despesa buscadas da Omie`);
  if (op.buscou && registro.departamento_omie && !op.departamentos.some((c) => normOmie(c) === normOmie(registro.departamento_omie)))
    avisos.push(`o departamento “${registro.departamento_omie}” não está entre os departamentos buscados da Omie`);
  revalidar();
  redirect(`/conciliacao-gi/regras?ok=1${avisos.length ? `&aviso=${encodeURIComponent(`Regra salva, mas ${avisos.join(" e ")}. Confira o nome exato.`)}` : ""}`);
}

/** Exclui a regra; as pendências que ela tratou voltam a ficar pendentes (ou passam para outra regra que case). */
export async function excluirRegra(fd: FormData) {
  const sessao = await exigirConciliar();
  if (!sessao) return;
  const id = texto(fd, "id");
  if (!id || !ehUuid(id)) return;
  const supabase = await createClient();
  const regras = await listarRegras(supabase);
  const atual = regras.find((r) => r.id === id);
  if (!atual) return;
  let reabertas = 0;
  try {
    reabertas = (
      await reaplicarRegras(
        supabase,
        regras.filter((r) => r.id !== id),
        id,
      )
    ).reabertas;
  } catch (e) {
    redirect("/conciliacao-gi/regras?erro=" + encodeURIComponent(e instanceof Error ? e.message : "Não consegui reabrir as pendências da regra."));
  }
  const { error } = await supabase.from("gi_conc_regras").delete().eq("id", id);
  if (error) redirect("/conciliacao-gi/regras?erro=" + encodeURIComponent(error.message));
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "gi_conc_regras", registroId: id, anterior: atual, novo: { pendencias_reabertas: reabertas } });
  revalidar();
  redirect(`/conciliacao-gi/regras?ok=1${reabertas ? `&aviso=${encodeURIComponent(`${reabertas} pendência(s) que a regra tratava voltaram a ficar pendentes.`)}` : ""}`);
}

/** Passa as regras nas pendências agora (sem esperar a próxima conciliação). */
export async function aplicarRegrasAgora() {
  const sessao = await exigirConciliar();
  if (!sessao) return;
  const supabase = await createClient();
  let r: Awaited<ReturnType<typeof reaplicarRegras>>;
  try {
    r = await reaplicarRegras(supabase, await listarRegras(supabase));
  } catch (e) {
    redirect("/conciliacao-gi/regras?erro=" + encodeURIComponent(e instanceof Error ? e.message : "Não consegui aplicar as regras."));
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "gi_conc_pendencias", novo: { regras_aplicadas: true, tratadas: r.tratadas, reabertas: r.reabertas } });
  revalidar();
  redirect(`/conciliacao-gi/regras?aplicou=${r.tratadas}&reabriu=${r.reabertas}`);
}
