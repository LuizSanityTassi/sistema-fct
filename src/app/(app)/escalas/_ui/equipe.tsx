"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Pencil, Plus, Search } from "lucide-react";
import { ErroFormulario, SelectNativo } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ColaboradorDetalhe, FuncionarioRh } from "@/lib/data/escalas";
import { FUNCOES, ROTULO_FUNCAO, ROTULO_SITUACAO, SITUACOES, ehFuncao, ehSituacao } from "@/lib/escalas/motor";
import { vinculoRh } from "@/lib/escalas/vinculo";
import type { Tom } from "@/lib/tons";
import { excluirColaborador, salvarColaborador, type EstadoEscala } from "../actions";

const TOM_SIT: Record<string, Tom> = { ativo: "sucesso", afastado: "atencao", inativo: "neutro" };

function FormPessoa({ branchId, pessoa, funcionarios, aoSalvar }: { branchId: string; pessoa: ColaboradorDetalhe | null; funcionarios: FuncionarioRh[]; aoSalvar: () => void }) {
  const [estado, enviar, pendente] = useActionState(async (prev: EstadoEscala, fd: FormData) => {
    const r = await salvarColaborador(prev, fd);
    if (r.ok) aoSalvar();
    return r;
  }, {});
  const e = estado.erros ?? {};
  const [ficha, setFicha] = React.useState(pessoa?.employee_id ?? "");
  const nomeRef = React.useRef<HTMLInputElement>(null);
  const escolherFicha = (id: string) => {
    setFicha(id);
    const f = funcionarios.find((x) => x.id === id);
    if (f && nomeRef.current && !nomeRef.current.value.trim()) nomeRef.current.value = f.nome;
  };
  return (
    <form action={enviar} className="grid gap-3">
      <input type="hidden" name="branch_id" value={branchId} />
      {pessoa && <input type="hidden" name="id" value={pessoa.id} />}
      <ErroFormulario mensagem={estado.erro} />
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Ficha do RH</span>
        <SelectNativo name="employee_id" value={ficha} onChange={(ev) => escolherFicha(ev.target.value)} aria-invalid={!!e.employee_id || undefined}>
          <option value="">Sem ficha (terceirizado ou ainda não cadastrado)</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome} · {f.cargo ?? "sem cargo"} · {f.filial?.codigo ?? "—"}
              {f.status !== "ativo" ? ` (${f.status === "ferias" ? "férias" : f.status})` : ""}
            </option>
          ))}
        </SelectNativo>
        <span className="text-xs text-muted-foreground">
          Só aparecem as fichas com a filial do ponto nesta loja. Pessoa de outra filial: troque a “Filial do ponto” na ficha do RH e ela vem para cá sozinha.
        </span>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Nome</span>
        <Input ref={nomeRef} name="nome" defaultValue={pessoa?.nome ?? ""} required maxLength={120} aria-invalid={!!e.nome || undefined} />
        {e.nome && <span className="text-xs font-medium text-destructive">{e.nome}</span>}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Função na escala</span>
          <SelectNativo name="funcao" defaultValue={pessoa && ehFuncao(pessoa.funcao) ? pessoa.funcao : "atendente"}>
            {FUNCOES.map((f) => (
              <option key={f} value={f}>
                {ROTULO_FUNCAO[f]}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Situação</span>
          <SelectNativo name="situacao" defaultValue={pessoa && ehSituacao(pessoa.situacao) ? pessoa.situacao : "ativo"}>
            {SITUACOES.map((s) => (
              <option key={s} value={s}>
                {ROTULO_SITUACAO[s]}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium">Regime</span>
          <SelectNativo name="regime" defaultValue={pessoa?.regime === "12x36" ? "12x36" : "5x2"}>
            <option value="5x2">5x2 · cinco dias e duas folgas na semana</option>
            <option value="12x36">12x36 · um dia sim, um dia não, 12 horas corridas</option>
          </SelectNativo>
          <span className="text-xs text-muted-foreground">No 12x36 o turno vai da entrada à saída em 12 horas, com o intervalo dentro, e as “Horas por dia” não valem.</span>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Horas por dia</span>
          <Input name="horas_dia" type="number" min={1} max={12} step={0.1} defaultValue={pessoa?.horas_dia ?? ""} placeholder="jornada ÷ 5" aria-invalid={!!e.horas_dia || undefined} />
          {e.horas_dia && <span className="text-xs font-medium text-destructive">{e.horas_dia}</span>}
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Intervalo (minutos)</span>
          <Input name="intervalo_min" type="number" min={0} max={240} defaultValue={pessoa?.intervalo_min ?? 60} aria-invalid={!!e.intervalo_min || undefined} />
          {e.intervalo_min && <span className="text-xs font-medium text-destructive">{e.intervalo_min}</span>}
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Registro (CRF)</span>
          <Input name="registro" defaultValue={pessoa?.registro ?? ""} maxLength={40} placeholder="quando for farmacêutico" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Observações</span>
          <Input name="observacoes" defaultValue={pessoa?.observacoes ?? ""} maxLength={500} />
        </label>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}

/** Equipe da escala da filial: busca, edição e o vínculo com o RH. */
export function EquipeEscala({ branchId, equipe, funcionarios }: { branchId: string; equipe: ColaboradorDetalhe[]; funcionarios: FuncionarioRh[] }) {
  const [editando, setEditando] = React.useState<ColaboradorDetalhe | "novo" | null>(null);
  const [busca, setBusca] = React.useState("");
  const [situacao, setSituacao] = React.useState("todos");
  const termo = busca
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const lista = equipe.filter(
    (c) =>
      (situacao === "todos" || c.situacao === situacao) &&
      (!termo ||
        `${c.nome} ${ROTULO_FUNCAO[ehFuncao(c.funcao) ? c.funcao : "outros"]} ${c.observacoes ?? ""}`
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .includes(termo)),
  );
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <label className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa" className="w-56 pl-8" aria-label="Buscar pessoa" />
        </label>
        <SelectNativo value={situacao} onChange={(e) => setSituacao(e.target.value)} className="w-40" aria-label="Situação">
          <option value="todos">Todas as situações</option>
          {SITUACOES.map((s) => (
            <option key={s} value={s}>
              {ROTULO_SITUACAO[s]}
            </option>
          ))}
        </SelectNativo>
        <Button type="button" className="ml-auto" onClick={() => setEditando("novo")}>
          <Plus data-icon="inline-start" />
          Incluir pessoa
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Pessoa</th>
              <th className="px-3 py-2 font-medium">Função</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th className="px-3 py-2 font-medium">Horário de origem (seg–sex · sáb · dom)</th>
              <th className="px-3 py-2 font-medium">RH</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Ninguém com esses filtros.
                </td>
              </tr>
            )}
            {lista.map((c) => {
              const v = vinculoRh(c, branchId);
              const h = c.horario_origem ?? {};
              return (
                <tr key={c.id} className="border-b align-top last:border-0">
                  <td className="px-4 py-2">
                    <span className="font-medium">{c.nome}</span>
                    <p className="text-xs text-muted-foreground">
                      {[c.cargo_origem, c.horas_dia ? `${Number(c.horas_dia)} h/dia` : null, c.intervalo_min !== 60 ? `intervalo ${c.intervalo_min} min` : null, c.observacoes].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {c.revisar && <p className="text-xs font-medium text-amber-700">Revisar: a planilha cita outra filial.</p>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {ROTULO_FUNCAO[ehFuncao(c.funcao) ? c.funcao : "outros"]}
                    {c.regime === "12x36" && <span className="block text-xs font-medium text-sky-700">12x36</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Status tom={TOM_SIT[c.situacao] ?? "neutro"}>{ROTULO_SITUACAO[ehSituacao(c.situacao) ? c.situacao : "ativo"]}</Status>
                  </td>
                  <td className="max-w-md px-3 py-2 text-xs text-muted-foreground">{[h.semana, h.sabado, h.domingo].some(Boolean) ? [h.semana ?? "—", h.sabado ?? "—", h.domingo ?? "—"].join(" · ") : "—"}</td>
                  <td className="px-3 py-2">
                    {c.rh ? (
                      <Link href={`/rh/funcionarios/${c.rh.id}`} title={`${c.rh.nome} · ${c.rh.cargo ?? ""}`}>
                        <Status tom={v.tom}>{v.texto}</Status>
                      </Link>
                    ) : (
                      <Status tom={v.tom}>{v.texto}</Status>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(c)}>
                      <Pencil data-icon="inline-start" />
                      Editar
                    </Button>
                    <ConfirmarAcao
                      titulo={`Tirar ${c.nome} da escala?`}
                      descricao="A pessoa sai da equipe da escala desta filial. A ficha do RH e as escalas já geradas não mudam."
                      rotuloBotao="Remover"
                      rotuloConfirmar="Remover da escala"
                      variant="outline"
                      action={excluirColaborador}
                      campos={{ id: c.id }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Dialog open={editando !== null} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editando === "novo" ? "Incluir pessoa na escala" : "Editar pessoa da escala"}</DialogTitle>
            <DialogDescription>A função define a cobertura (farmacêutico conta para o mínimo por hora). Afastados e inativos ficam fora da escala.</DialogDescription>
          </DialogHeader>
          {editando !== null && (
            <FormPessoa key={editando === "novo" ? "novo" : editando.id} branchId={branchId} pessoa={editando === "novo" ? null : editando} funcionarios={funcionarios} aoSalvar={() => setEditando(null)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
