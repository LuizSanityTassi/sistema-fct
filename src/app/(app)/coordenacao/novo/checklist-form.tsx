"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Send } from "lucide-react";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DIRETRIZES_CHECKLIST, ITENS_CHECKLIST, OBJETIVO_CHECKLIST } from "@/lib/coordenacao/checklist";
import { salvarChecklist } from "../actions";
import { EscolherEstrelas } from "../estrelas";

type Props = {
  lojas: { id: string; codigo: string; nome: string }[];
  gerentes: { id: string; nome: string; lojas: string[] }[];
  coordenador: string;
  hoje: string;
};

const AREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

/** Check-list Coordenador Regional: loja, gerente, notas de 0 a 5 estrelas, direcionamentos e o que ficou acordado. */
export function ChecklistForm({ lojas, gerentes, coordenador, hoje }: Props) {
  const router = useRouter();
  const [erro, setErro] = React.useState<string | null>(null);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [enviando, setEnviando] = React.useState(false);
  const gerentesDa = (l: string) => gerentes.filter((g) => l && g.lojas.includes(l));
  // loja com um gerente só: já vem escolhido
  const unico = (l: string) => {
    const lista = gerentesDa(l);
    return lista.length === 1 ? lista[0].id : "";
  };
  const [loja, setLoja] = React.useState(lojas.length === 1 ? lojas[0].id : "");
  const [gerente, setGerente] = React.useState(() => unico(loja));
  const daLoja = gerentesDa(loja);
  const outros = gerentes.filter((g) => !daLoja.includes(g));
  const trocarLoja = (l: string) => {
    setLoja(l);
    setGerente(unico(l));
  };

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErro(null);
    setErros({});
    setEnviando(true);
    const r = await salvarChecklist({}, new FormData(e.currentTarget));
    if (r.id) {
      router.push(`/coordenacao/${r.id}?novo=1`);
      return;
    }
    setEnviando(false);
    setErro(r.erro ?? "Não consegui gravar.");
    setErros(r.erros ?? {});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-6">
      <ErroFormulario mensagem={erro ?? undefined} />
      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="branch_id" label="Loja" obrigatorio erro={erros.branch_id}>
            <SelectNativo id="branch_id" name="branch_id" value={loja} onChange={(e) => trocarLoja(e.target.value)} aria-invalid={!!erros.branch_id}>
              {lojas.length !== 1 && <option value="">Escolha a loja…</option>}
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} — {l.nome}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="data" label="Data da visita" obrigatorio erro={erros.data}>
            <Input id="data" name="data" type="date" max={hoje} defaultValue={hoje} aria-invalid={!!erros.data} />
          </Campo>
          <Campo id="gerente_id" label="Gerente" obrigatorio erro={erros.gerente_id} dica="É ele quem confirma o checklist no usuário dele">
            <SelectNativo id="gerente_id" name="gerente_id" value={gerente} onChange={(e) => setGerente(e.target.value)} aria-invalid={!!erros.gerente_id}>
              <option value="">{gerentes.length ? "Escolha o gerente…" : "Nenhum gerente com usuário no sistema"}</option>
              {daLoja.length > 0 && (
                <optgroup label="Gerentes da loja">
                  {daLoja.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
                </optgroup>
              )}
              {outros.length > 0 && (
                <optgroup label={daLoja.length ? "Outros gerentes" : "Gerentes"}>
                  {outros.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
                </optgroup>
              )}
            </SelectNativo>
          </Campo>
          <Campo id="coordenador" label="Coordenador">
            <Input id="coordenador" value={coordenador} readOnly disabled />
          </Campo>
        </div>
        <dl className="mt-4 grid gap-3 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-[8rem_1fr]">
          <dt className="font-semibold">Objetivo</dt>
          <dd className="text-muted-foreground">{OBJETIVO_CHECKLIST}</dd>
          <dt className="font-semibold">Diretrizes de uso</dt>
          <dd className="text-muted-foreground">{DIRETRIZES_CHECKLIST.join(" · ")}</dd>
        </dl>
      </section>

      <section className="rounded-xl border bg-card">
        <header className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Itens avaliados</h2>
          <span className="text-xs text-muted-foreground">0 a 5 estrelas</span>
        </header>
        {erros.notas && (
          <p className="px-5 pt-3 text-xs font-medium text-destructive" role="alert">
            {erros.notas}
          </p>
        )}
        <ul className="divide-y">
          {ITENS_CHECKLIST.map((i) => (
            <li key={i.chave} className="flex flex-col gap-2 px-5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">{i.item}</span>
              <EscolherEstrelas nome={`nota_${i.chave}`} rotulo={i.item} invalido={!!erros.notas} />
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <label htmlFor="direcionamentos" className="text-sm font-semibold">
            Direcionamentos
          </label>
          <p className="mb-2 text-xs text-muted-foreground">As orientações que você deu ao gerente. Uma por linha.</p>
          <textarea id="direcionamentos" name="direcionamentos" rows={6} maxLength={8000} className={AREA} placeholder={"Ex.: Repor a gôndola de dermocosméticos\nReforçar a abordagem do Fortvigor no caixa"} />
        </div>
        <div className="rounded-xl border bg-card p-5">
          <label htmlFor="acordos" className="text-sm font-semibold">
            Acordado com o gerente
          </label>
          <p className="mb-2 text-xs text-muted-foreground">O que ficou combinado (com prazo, se tiver). Uma por linha.</p>
          <textarea id="acordos" name="acordos" rows={6} maxLength={8000} className={AREA} placeholder={"Ex.: Escala de dezembro pronta até 20/11\nRuptura zerada na próxima visita"} />
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={enviando}>
          <Send data-icon="inline-start" />
          {enviando ? "Gravando…" : "Enviar para o gerente"}
        </Button>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/coordenacao" />} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
