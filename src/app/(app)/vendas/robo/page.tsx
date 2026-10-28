import { Bot } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { RELATORIOS_VENDAS, type RelatorioVendas } from "@/lib/conciliacao/trier-robo";
import { formatarData, formatarDataHora } from "@/lib/formatos";
import { credenciaisTrier } from "@/lib/integracoes/segredos";
import { createClient } from "@/lib/supabase/server";
import { INICIO_HISTORICO, ontemNoBrasil, RELATORIOS_COLETA } from "@/lib/vendas/coleta";
import { buscarVendasAgora, relerVendas } from "./actions";
import { BuscarVendasForm, RelerVendasForm } from "./buscar-form";

export const metadata = { title: "Robô de vendas" };
// gera vários relatórios no Trier: precisa do tempo máximo da função
export const maxDuration = 300;

const TOM_STATUS = { ok: "sucesso", vazio: "neutro", erro: "perigo" } as const;
const ROTULO_STATUS = { ok: "guardado", vazio: "sem movimento", erro: "erro" } as const;

export default async function RoboVendasPage() {
  await exigirAcesso("/vendas/robo");
  const supabase = await createClient();
  const [cred, { data: coletas }, { data: cobertura }] = await Promise.all([
    credenciaisTrier(supabase),
    supabase.from("vendas_coletas").select("id, relatorio, de, ate, coletado_em, status, erro, ms, tamanho, lido_em, linhas").order("coletado_em", { ascending: false }).limit(40),
    supabase.from("vendas_filial_dia").select("data").order("data").limit(1),
  ]);
  const configurado = Boolean(cred.usuario && cred.senha);
  const rotulo = (r: string) => RELATORIOS_VENDAS[r as RelatorioVendas]?.rotulo ?? r;
  const ontem = ontemNoBrasil();
  const desde = cobertura?.[0]?.data ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Automações"
        titulo="Robô de vendas"
        descricao="Busca no Trier os relatórios de vendas de todas as filiais (por data, CMV por grupo e por laboratório, vendedores e tele-entrega) e já lê os números para o painel de vendas. Roda sozinho toda madrugada com o dia anterior e, no tempo que sobra, vai trazendo o histórico desde jan/2025."
      />
      <Painel
        titulo="Buscar agora"
        icone={Bot}
        className="mb-4"
        descricao={configurado ? `Só lê: não muda nada no Trier.${desde ? ` Vendas guardadas desde ${formatarData(desde)}.` : ""}` : "Falta o usuário e a senha do robô do Trier em Administração → Integrações."}
      >
        <div className="border-t px-5 py-4">
          <BuscarVendasForm action={buscarVendasAgora} ontem={ontem} inicioHistorico={INICIO_HISTORICO} relatorios={RELATORIOS_COLETA.map((chave) => ({ chave, rotulo: RELATORIOS_VENDAS[chave].rotulo }))} configurado={configurado} />
        </div>
      </Painel>
      <Painel titulo="Ler de novo" className="mb-4" descricao="Os Excel buscados ficam guardados por 40 dias: se a leitura falhou (ou o leitor foi corrigido), dá para ler outra vez sem ir ao Trier.">
        <div className="border-t px-5 py-4">
          <RelerVendasForm action={relerVendas} />
        </div>
      </Painel>
      <Painel titulo="Últimas buscas">
        {!coletas?.length ? (
          <EstadoVazio icone={Bot} titulo="Nenhuma busca ainda" descricao="Use “Buscar do Trier agora” ou espere a rodada da madrugada." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Relatório</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="hidden text-right md:table-cell">Linhas</TableHead>
                <TableHead className="hidden text-right md:table-cell">Tamanho</TableHead>
                <TableHead className="hidden text-right md:table-cell">Tempo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coletas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs tabular-nums">{formatarDataHora(c.coletado_em)}</TableCell>
                  <TableCell className="text-sm">{rotulo(c.relatorio)}</TableCell>
                  <TableCell className="text-xs tabular-nums">{c.de === c.ate ? formatarData(c.de) : `${formatarData(c.de)} a ${formatarData(c.ate)}`}</TableCell>
                  <TableCell>
                    {c.status === "ok" && c.lido_em ? (
                      <Status tom="sucesso">lido</Status>
                    ) : (
                      <Status tom={c.erro ? "perigo" : (TOM_STATUS[c.status as keyof typeof TOM_STATUS] ?? "neutro")}>{c.status === "ok" ? "não lido" : (ROTULO_STATUS[c.status as keyof typeof ROTULO_STATUS] ?? c.status)}</Status>
                    )}
                    {c.erro && <span className="mt-0.5 block max-w-md text-xs text-red-700">{c.erro}</span>}
                  </TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums md:table-cell">{c.linhas ?? "—"}</TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums md:table-cell">{c.tamanho ? `${Math.max(1, Math.round(c.tamanho / 1024))} KB` : "—"}</TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums md:table-cell">{c.ms ? `${Math.round(c.ms / 1000)} s` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Painel>
    </>
  );
}
