"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarTaxa, taxaDivergencia } from "@/lib/auditoria/checklist";
import { formatarMoeda } from "@/lib/formatos";
import { adicionarItemPrecificacao, buscarPreco, excluirItemPrecificacao, finalizarPrecificacao, type EstadoAud } from "../../actions";

type Item = { id: string; codigo: string; produto: string; valor_sistema: number; valor_etiqueta: number; diferenca: number };
type Props = { id: string; filial: string; itens: Item[] };

const AREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

/** "8,99" → 8.99 (aceita também 8.99). */
function valor(t: string): number | null {
  const s = t.trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  const n = Number(/,\d{0,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
const moeda2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Tela da auditoria aberta: dados da auditoria, lançar os produtos com diferença e finalizar. */
export function ProdutosPrecificacao({ id, filial, itens }: Props) {
  const chave = `fct.auditoria.precificacao.${id}`;
  // cabeçalho (fica salvo no aparelho até finalizar)
  const [observacao, setObservacao] = React.useState("");
  const [qtd, setQtd] = React.useState("");
  const carregou = React.useRef(false);
  React.useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(chave) ?? "null") as { observacao?: string; qtd?: string } | null;
      /* eslint-disable react-hooks/set-state-in-effect -- restaura o rascunho uma vez, depois de montar */
      if (r?.observacao) setObservacao(r.observacao);
      if (r?.qtd) setQtd(r.qtd);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* sem armazenamento no aparelho */
    }
    carregou.current = true;
  }, [chave]);
  React.useEffect(() => {
    if (!carregou.current) return;
    try {
      localStorage.setItem(chave, JSON.stringify({ observacao, qtd }));
    } catch {
      /* ignora */
    }
  }, [chave, observacao, qtd]);

  // produto
  const [codigo, setCodigo] = React.useState("");
  const [produto, setProduto] = React.useState("");
  const [sistema, setSistema] = React.useState("");
  const [etiqueta, setEtiqueta] = React.useState("");
  const [confirmado, setConfirmado] = React.useState(false);
  const [daBase, setDaBase] = React.useState(false);
  const [buscando, setBuscando] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const ultimoBuscado = React.useRef("");
  const codigoRef = React.useRef<HTMLInputElement>(null);

  const vs = valor(sistema);
  const ve = valor(etiqueta);
  const diferenca = vs !== null && ve !== null ? Math.round((ve - vs) * 100) / 100 : null;

  const buscar = async () => {
    const c = codigo.trim();
    if (!c || c === ultimoBuscado.current) return;
    ultimoBuscado.current = c;
    setBuscando(true);
    setAviso(null);
    try {
      const p = await buscarPreco(c);
      if (p) {
        setProduto(p.descricao);
        setSistema(moeda2(p.preco));
        setDaBase(true);
        setAviso(`Valor do sistema (base de preços): R$ ${moeda2(p.preco)}. Confira antes de confirmar.`);
      } else {
        setDaBase(false);
        setAviso("Código não está na base de preços: digite o produto e o valor no sistema.");
      }
    } catch {
      setAviso("Não consegui buscar o código agora: digite o produto e o valor no sistema.");
    } finally {
      setBuscando(false);
    }
  };

  const limpar = () => {
    setCodigo("");
    setProduto("");
    setSistema("");
    setEtiqueta("");
    setConfirmado(false);
    setDaBase(false);
    setAviso(null);
    ultimoBuscado.current = "";
    codigoRef.current?.focus();
  };

  const [estado, adicionar, adicionando] = useActionState(async (prev: EstadoAud, fd: FormData) => {
    const r = await adicionarItemPrecificacao(id, prev, fd);
    if (r.ok) limpar();
    return r;
  }, {});
  const [fim, finalizar, finalizando] = useActionState(async (prev: EstadoAud, fd: FormData) => {
    const r = await finalizarPrecificacao(id, prev, fd);
    if (r.ok) {
      try {
        localStorage.removeItem(chave);
      } catch {
        /* ignora */
      }
    }
    return r;
  }, {});
  const [excluindo, startExcluir] = React.useTransition();
  const [erroExcluir, setErroExcluir] = React.useState<string | null>(null);
  const excluir = (itemId: string) =>
    startExcluir(async () => {
      const r = await excluirItemPrecificacao(id, itemId);
      setErroExcluir(r.erro ?? null);
    });

  const qtdNum = Number(qtd);
  const taxa = taxaDivergencia(itens.length, Number.isInteger(qtdNum) && qtdNum > 0 ? qtdNum : null);
  const erros = estado.erros ?? {};

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Cadastro de auditoria de precificação</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="filial" label="Filial">
            <Input id="filial" value={filial} readOnly disabled />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="qtd_verificada" label="Quantidade verificada" obrigatorio erro={fim.erros?.qtd_verificada}>
              <Input id="qtd_verificada" type="number" inputMode="numeric" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} aria-invalid={!!fim.erros?.qtd_verificada} />
            </Campo>
            <Campo id="qtd_divergente" label="Quantidade divergente">
              <Input id="qtd_divergente" value={String(itens.length)} readOnly disabled />
            </Campo>
          </div>
          <Campo id="observacao" label="Observação" className="sm:col-span-2">
            <textarea id="observacao" rows={2} maxLength={2000} className={AREA} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </Campo>
        </div>
      </section>

      <form action={adicionar} className="rounded-xl border bg-card p-5" noValidate>
        <h2 className="mb-3 text-sm font-semibold">Produtos auditados</h2>
        <ErroFormulario mensagem={estado.erro} />
        {estado.ok && !estado.erro && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-emerald-700" role="status">
            <CheckCircle2 className="size-3.5" /> {estado.ok}
          </p>
        )}
        <input type="hidden" name="da_base" value={daBase ? "1" : "0"} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="codigo" label="Código reduzido" obrigatorio erro={erros.codigo} dica="Ao sair do campo, busca o produto e o valor no sistema">
            <div className="relative">
              <Input
                ref={codigoRef}
                id="codigo"
                name="codigo"
                inputMode="numeric"
                autoComplete="off"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onBlur={buscar}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    buscar();
                  }
                }}
                maxLength={30}
                aria-invalid={!!erros.codigo}
              />
              {buscando && <Loader2 className="absolute top-2.5 right-2.5 size-4 animate-spin text-muted-foreground" aria-label="Buscando" />}
            </div>
          </Campo>
          <Campo id="produto" label="Produto" obrigatorio erro={erros.produto}>
            <Input id="produto" name="produto" value={produto} onChange={(e) => setProduto(e.target.value)} maxLength={200} aria-invalid={!!erros.produto} />
          </Campo>
          <Campo id="valor_sistema" label="Valor no sistema" obrigatorio erro={erros.valor_sistema}>
            <Input
              id="valor_sistema"
              name="valor_sistema"
              inputMode="decimal"
              placeholder="0,00"
              value={sistema}
              onChange={(e) => {
                setSistema(e.target.value);
                setDaBase(false);
              }}
              aria-invalid={!!erros.valor_sistema}
            />
          </Campo>
          <Campo id="valor_etiqueta" label="Valor na etiqueta" obrigatorio erro={erros.valor_etiqueta}>
            <Input id="valor_etiqueta" name="valor_etiqueta" inputMode="decimal" placeholder="0,00" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} aria-invalid={!!erros.valor_etiqueta} />
          </Campo>
          <Campo id="diferenca" label="Diferença" dica="Etiqueta − sistema">
            <Input
              id="diferenca"
              value={diferenca === null ? "" : moeda2(diferenca)}
              readOnly
              disabled
              className={diferenca !== null && diferenca !== 0 ? (diferenca < 0 ? "text-red-700" : "text-amber-700") : undefined}
            />
          </Campo>
        </div>
        {aviso && <p className="mt-2 text-xs text-muted-foreground">{aviso}</p>}
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" name="sistema_confirmado" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
          <span>
            Confirmo que o campo valor no sistema está correto.
            {erros.sistema_confirmado && <span className="block text-xs font-medium text-destructive">{erros.sistema_confirmado}</span>}
          </span>
        </label>
        <div className="mt-3 flex justify-end">
          <Button type="submit" disabled={adicionando}>
            <Plus data-icon="inline-start" />
            {adicionando ? "Adicionando…" : "Adicionar"}
          </Button>
        </div>
      </form>

      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Produtos adicionados</h2>
          <span className="text-xs text-muted-foreground">
            {itens.length} {itens.length === 1 ? "divergência" : "divergências"}
            {taxa !== null && <> · taxa {formatarTaxa(taxa)}</>}
          </span>
        </header>
        {erroExcluir && <p className="px-5 pt-2 text-xs font-medium text-destructive">{erroExcluir}</p>}
        {itens.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum produto com diferença lançado ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Valor sistema</TableHead>
                <TableHead className="text-right">Valor etiqueta</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead className="w-16 text-center">Excluir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <span className="font-mono text-xs">{i.codigo}</span> — {i.produto}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(i.valor_sistema)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(i.valor_etiqueta)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${Number(i.diferenca) < 0 ? "text-red-700" : "text-amber-700"}`}>{formatarMoeda(i.diferenca)}</TableCell>
                  <TableCell className="text-center">
                    <Button type="button" variant="ghost" size="icon-sm" disabled={excluindo} onClick={() => excluir(i.id)} aria-label={`Excluir ${i.produto}`}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <form action={finalizar} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="qtd_verificada" value={qtd} />
        <input type="hidden" name="observacao" value={observacao} />
        <Button type="submit" disabled={finalizando}>
          <CheckCircle2 data-icon="inline-start" />
          {finalizando ? "Finalizando…" : "Finalizar auditoria"}
        </Button>
        {fim.erro && (
          <span className="text-sm font-medium text-destructive" role="alert">
            {fim.erro}
          </span>
        )}
      </form>
    </div>
  );
}
