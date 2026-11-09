import Link from "next/link";
import { Download, FlaskConical, TriangleAlert } from "lucide-react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Ponto } from "@/components/layout/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { EMPRESAS_OMIE, statusChaves, type CacheOmie, type EmpresaOmie } from "@/lib/conciliacao/omie-api";
import { CONFIG_OMIE_PADRAO, listarEnvios } from "@/lib/conciliacao/omie-envio";
import { podeConciliar, podeConfigurarConciliacao } from "@/lib/conciliacao/permissoes";
import { formatarDataHora, formatarMoeda, pluralizar } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { buscarCadastrosOmie, desfazerEnvioOmie, liberarLoteOmie, salvarConfigOmie } from "../omie-actions";
import { ConfigOmieForm } from "./config-omie-form";
import { DesfazerForm } from "./desfazer-form";

export const metadata = { title: "Omie" };

type Testado = { testado?: boolean; testadoPor?: string; testadoEm?: string };

export default async function OmiePage({ searchParams }: PageProps<"/conciliacao/omie">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/conciliacao/omie"), searchParams]);
  const supabase = await createClient();
  const [{ data: cfgs }, envios] = await Promise.all([
    supabase.from("conc_config").select("chave, valor, atualizado_em").like("chave", "omie%"),
    listarEnvios(supabase),
  ]);
  const cfg = new Map((cfgs ?? []).map((c) => [c.chave, c.valor]));
  const config = (cfg.get("omie") as { categoria: string; conta: string } | undefined) ?? CONFIG_OMIE_PADRAO;
  const chaves = await statusChaves(supabase);
  const escreve = podeConciliar(sessao.papel);
  const admin = podeConfigurarConciliacao(sessao.papel);
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const ok = sp.ok === "cadastros" ? "Cadastros da Omie atualizados." : sp.ok === "liberado" ? "Envio em lote liberado." : sp.ok === "desfeito" ? `Envio desfeito: ${pluralizar(Number(sp.qtd ?? 0), "conta voltou", "contas voltaram")} para a lista.` : null;
  const opcoes = (["nazario", "varela"] as EmpresaOmie[]).map((e) => cfg.get(`omie_cache_${e}`) as CacheOmie | undefined);

  return (
    <>
      <PageHeader
        eyebrow="DDA x Trier"
        titulo="Omie"
        descricao="Como as contas conciliadas chegam ao Omie: planilha de importação ou API. Filiais 300 em diante (e TRIO) são da Nazário; abaixo de 300, da Varela."
      />

      {ok && (
        <div className="mb-4">
          <AvisoSucesso mensagem={ok} />
        </div>
      )}
      {erro && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{erro}</p>
        </div>
      )}

      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        {(["nazario", "varela"] as EmpresaOmie[]).map((e) => {
          const ch = chaves[e];
          const cache = cfg.get(`omie_cache_${e}`) as CacheOmie | undefined;
          const t = cfg.get(`omie_${e}`) as Testado | undefined;
          const pronto = ch.configurado && !!cache?.conta && !!cache?.categoria;
          return (
            <div key={e} className="rounded-xl border bg-card p-5 text-sm">
              <h2 className="mb-2 text-sm font-semibold">
                <Ponto tom={pronto ? "sucesso" : ch.configurado ? "alerta" : "neutro"} rotulo={pronto ? "Pronto" : ch.configurado ? "Com chave, falta conferir" : "Sem chave"} className="mr-1.5" />
                Omie {EMPRESAS_OMIE[e]}
              </h2>
              {!ch.configurado ? (
                <p className="text-muted-foreground">
                  Sem chave da API: contas desta empresa só pela planilha. Para habilitar, o administrador cola a app_key e a app_secret da Omie {EMPRESAS_OMIE[e]} em{" "}
                  <Link href="/configuracoes/integracoes" className="font-medium text-fct-tinta underline">
                    Administração → Integrações
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-1">
                  <li>
                    Chave ••••{ch.final} <span className="text-xs text-muted-foreground">({ch.origem === "sistema" ? "cadastrada em Integrações" : "variável de ambiente"})</span>
                  </li>
                  {cache ? (
                    <>
                      <li>
                        Conta corrente: <strong>{cache.conta ? cache.conta.nome : <span className="text-red-700">não achada</span>}</strong> · Categoria: <strong>{cache.categoria ? cache.categoria.nome : <span className="text-red-700">não achada</span>}</strong>
                      </li>
                      <li className="text-muted-foreground">
                        {cache.todos.length} departamentos na Omie · {Object.keys(cache.departamentos).length} ligados às filiais · cadastros de {formatarDataHora(cache.quando)}
                        {cache.por ? ` por ${cache.por}` : ""}
                      </li>
                      {cache.departamentosFaltando.length > 0 && <li className="text-amber-800"><TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />Departamentos não achados na Omie: {cache.departamentosFaltando.join("; ")}</li>}
                    </>
                  ) : (
                    <li className="text-amber-800">Falta buscar os cadastros (conta, categoria e departamentos).</li>
                  )}
                  <li>{t?.testado ? <span className="text-emerald-700">Envio em lote liberado{t.testadoPor ? ` por ${t.testadoPor}` : ""}.</span> : <span><FlaskConical className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />Modo teste: o próximo envio pela API lança <strong>só 1 conta</strong>; confira na Omie e libere.</span>}</li>
                </ul>
              )}
              {escreve && ch.configurado && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={buscarCadastrosOmie}>
                    <input type="hidden" name="empresa" value={e} />
                    <BotaoSalvar variant="outline" size="sm" rotuloPendente="Buscando na Omie…">
                      Buscar cadastros na Omie
                    </BotaoSalvar>
                  </form>
                  {cache && !t?.testado && (
                    <form action={liberarLoteOmie}>
                      <input type="hidden" name="empresa" value={e} />
                      <BotaoSalvar size="sm" rotuloPendente="Liberando…">
                        Já conferi a conta de teste na Omie, liberar lote
                      </BotaoSalvar>
                    </form>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="mb-4 rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Categoria e conta corrente padrão</h2>
        <p className="mb-3 text-xs text-muted-foreground">Vão em todas as contas enviadas (planilha e API). Precisam existir com esse nome na Omie.</p>
        {admin ? (
          <ConfigOmieForm action={salvarConfigOmie} valores={config} opcoesConta={[...new Set(opcoes.flatMap((c) => c?.opcoesConta ?? []))]} opcoesCategoria={[...new Set(opcoes.flatMap((c) => c?.opcoesCategoria ?? []))]} />
        ) : (
          <p className="text-sm">
            <strong>Categoria:</strong> {config.categoria} · <strong>Conta corrente:</strong> {config.conta}
          </p>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold">Envios ao Omie</h2>
          <p className="text-xs text-muted-foreground">Cada planilha gerada ou lote lançado pela API. Desfazer devolve as contas à tela de envio (fica registrado quem desfez e por quê).</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Via</TableHead>
              <TableHead className="hidden md:table-cell">Filiais</TableHead>
              <TableHead className="text-right">Contas</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="hidden lg:table-cell">Por</TableHead>
              <TableHead className="w-44 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {envios.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="vazio">
                  Nenhum envio ainda.
                </TableCell>
              </TableRow>
            ) : (
              envios.map((l) => (
                <TableRow key={l.lote}>
                  <TableCell className="tabular-nums">{formatarDataHora(l.quando)}</TableCell>
                  <TableCell>
                    {l.via === "api" ? `API${l.empresa ? ` · ${EMPRESAS_OMIE[l.empresa as EmpresaOmie] ?? l.empresa}` : ""}` : "Planilha"}
                    {l.arquivo && <p className="max-w-xs truncate text-xs text-muted-foreground" title={l.arquivo}>{l.arquivo}</p>}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">{l.filiais.map((f) => String(f).padStart(3, "0")).join(", ") || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.qtd}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{l.por ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {l.arquivoId && (
                        <a href={`/api/conciliacao/arquivo/${l.arquivoId}`} className="inline-flex items-center gap-1 text-sm text-fct-tinta underline">
                          <Download className="size-3.5" aria-hidden />
                          Baixar
                        </a>
                      )}
                      {escreve && <DesfazerForm lote={l.lote} descricao={`${l.qtd} conta(s), ${formatarMoeda(l.valor)}, ${l.via === "api" ? "lançadas pela API" : "na planilha " + (l.arquivo ?? "")}`} action={desfazerEnvioOmie} />}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
