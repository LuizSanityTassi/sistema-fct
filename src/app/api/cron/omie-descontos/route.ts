import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { alterarValorContaPagar, consultarContaPagar, type EmpresaOmie } from "@/lib/conciliacao/omie-api";
import { normalizarBarra } from "@/lib/conciliacao/duplicidade";
import { chavesOmieServico } from "@/lib/integracoes/segredos";
import { createAdminClient } from "@/lib/supabase/admin";

// Correção única (pedido do Luiz em 06/11/2026): contas a pagar já lançadas no Omie com o valor cheio do boleto, cujo
// desconto vale pagando no vencimento, passam a ter o valor com desconto. Só vencimento de 07/11/2026 em diante, só os
// fornecedores de desconto comum (Profarma, Santa Cruz, Pharma Log; os outros ficaram para o Luiz conferir). Cada conta é
// conferida no Omie antes (a vencer, valor ainda cheio, mesmo código de barras, categoria e departamento únicos); o que
// não bater fica de fora com o motivo. Rodar de novo não altera duas vezes. Chamada com a senha do robô de vendas.
export const maxDuration = 300;
const semCache = { "Cache-Control": "no-store" };
const igual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const VENC_DESDE = "2026-11-07";
const FORNECEDORES = ["45453214", "61940292", "13485130"]; // raiz do CNPJ: Profarma, Santa Cruz, Pharma Log
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function GET(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." }, { status: 503, headers: semCache });
  const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const { data: cfg } = await admin.from("sistema_config").select("valor").eq("chave", "vendas_hoje_token").maybeSingle();
  const hash = (cfg?.valor as { hash?: string } | null)?.hash;
  const segredo = process.env.CRON_SECRET;
  const confere = token.length >= 32 && ((!!hash && igual(createHash("sha256").update(token).digest("hex"), hash)) || (!!segredo && igual(token, segredo)));
  if (!confere) return NextResponse.json({ erro: "Não autorizado." }, { status: 401, headers: semCache });

  after(async () => {
    const comeco = Date.now();
    const r = { candidatas: 0, corrigidas: 0, jaCorrigidas: 0, puladas: [] as string[], erros: [] as string[], faltam: 0 };
    try {
      // itens com desconto (da planilha do portal: sem data; do DDA: válido no vencimento)
      const itens: { chave: string; cnpj: string | null; valor: number; desconto: unknown; barra: string | null; vencimento: string }[] = [];
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await admin.from("conc_itens").select("chave, cnpj, valor, desconto, barra, vencimento").not("desconto", "is", null).gte("vencimento", VENC_DESDE).order("id").range(desde, desde + 999);
        if (error) throw new Error(error.message);
        itens.push(...((data ?? []) as typeof itens));
        if ((data?.length ?? 0) < 1000) break;
      }
      type Item = { chave: string; valor: number; desconto: number; barra: string; venc: string };
      const porChave = new Map<string, Item | null>();
      for (const i of itens) {
        const d = i.desconto as { valor?: number; noVencimento?: boolean | null } | null;
        const desc = Math.round(Number(d?.valor ?? 0) * 100) / 100;
        const raiz = String(i.cnpj ?? "").replace(/\D/g, "").slice(0, 8);
        if (!(desc > 0) || d?.noVencimento === false || !FORNECEDORES.includes(raiz)) continue;
        const it = { chave: i.chave, valor: Number(i.valor), desconto: desc, barra: normalizarBarra(i.barra), venc: i.vencimento };
        const ja = porChave.get(i.chave);
        // a mesma conta em conciliações diferentes com valor ou desconto diferentes: não decide sozinho
        if (ja === undefined) porChave.set(i.chave, it);
        else if (ja && (Math.abs(ja.valor - it.valor) > 0.004 || Math.abs(ja.desconto - it.desconto) > 0.004 || ja.barra !== it.barra)) porChave.set(i.chave, null);
      }
      const chaves = [...porChave.keys()];
      const enviados: { chave: string; empresa: string | null; omie_codigo: string | null; valor: number | null }[] = [];
      for (let i = 0; i < chaves.length; i += 200) {
        const { data, error: e2 } = await admin.from("conc_enviados_omie").select("chave, empresa, omie_codigo, valor").in("chave", chaves.slice(i, i + 200)).is("desfeito_em", null);
        if (e2) throw new Error(e2.message);
        enviados.push(...(data ?? []));
      }
      r.candidatas = enviados.length;
      const chavesOmie = new Map<EmpresaOmie, Awaited<ReturnType<typeof chavesOmieServico>>>();
      let i = 0;
      for (; i < enviados.length; i++) {
        if (Date.now() - comeco > 250_000) break;
        const e = enviados[i];
        const it = porChave.get(e.chave);
        const emp = e.empresa === "varela" || e.empresa === "nazario" ? (e.empresa as EmpresaOmie) : null;
        if (!it) {
          r.puladas.push(`${e.chave}: valores diferentes entre conciliações`);
          continue;
        }
        if (!emp || !e.omie_codigo) {
          r.puladas.push(`${e.chave}: sem empresa ou código do Omie`);
          continue;
        }
        if (!chavesOmie.has(emp)) chavesOmie.set(emp, await chavesOmieServico(admin, emp));
        const ch = chavesOmie.get(emp);
        if (!ch) {
          r.erros.push(`${emp}: sem chaves do Omie`);
          continue;
        }
        const novo = Math.round((it.valor - it.desconto) * 100) / 100;
        try {
          const c = await consultarContaPagar(ch, emp, Number(e.omie_codigo));
          if (Math.abs(c.valor - novo) < 0.005) {
            if (Math.abs(Number(e.valor ?? 0) - novo) >= 0.005) await admin.from("conc_enviados_omie").update({ valor: novo }).eq("chave", e.chave);
            r.jaCorrigidas++;
            continue;
          }
          const motivo =
            c.status !== "A VENCER" ? `situação ${c.status}` :
            Math.abs(c.valor - it.valor) > 0.005 ? `valor no Omie ${brl(c.valor)} diferente do boleto ${brl(it.valor)}` :
            normalizarBarra(c.barra) !== it.barra ? "código de barras diferente" :
            c.categorias.length > 1 ? "mais de uma categoria" :
            c.distribuicao.length !== 1 ? "departamento rateado" : null;
          if (motivo) {
            r.puladas.push(`${emp} ${e.omie_codigo} venc ${it.venc}: ${motivo}`);
            continue;
          }
          const nota = `Valor já com desconto de R$ ${brl(it.desconto)} (boleto R$ ${brl(it.valor)}), pagando até o vencimento (planilha do portal Itaú). Corrigido pelo portal em 06/11/2026.`;
          await alterarValorContaPagar(ch, emp, c.codigo, c.categorias[0]?.codigo || c.categoria, c.distribuicao[0].codigo, novo, c.observacao ? `${c.observacao} | ${nota}` : nota);
          await admin.from("conc_enviados_omie").update({ valor: novo }).eq("chave", e.chave);
          await admin.from("audit_logs").insert({ user_id: null, acao: "editar", entidade: "conc_enviados_omie", registro_id: null, valor_anterior: { chave: e.chave, omie: e.omie_codigo, empresa: emp, valor: it.valor }, valor_novo: { valor: novo, desconto: it.desconto, motivo: "desconto no vencimento (pedido do Luiz, 06/11/2026)" } });
          r.corrigidas++;
        } catch (x) {
          r.erros.push(`${emp} ${e.omie_codigo}: ${x instanceof Error ? x.message : String(x)}`);
          if (/bloqueada/i.test(String(x))) break;
        }
      }
      r.faltam = enviados.length - i;
    } catch (x) {
      r.erros.push(x instanceof Error ? x.message : String(x));
    }
    console.log("[omie-descontos]", JSON.stringify({ ...r, puladas: r.puladas.slice(0, 40), erros: r.erros.slice(0, 20), qtdPuladas: r.puladas.length, ms: Date.now() - comeco }));
  });
  return NextResponse.json({ aceito: true }, { status: 202, headers: semCache });
}
