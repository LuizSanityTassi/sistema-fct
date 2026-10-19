"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Copy, Search, Send, ShieldCheck } from "lucide-react";
import { AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarData } from "@/lib/formatos";
import { CATEGORIAS_DENUNCIA, COR_STATUS, EXPLICACAO_STATUS, STATUS_DENUNCIA } from "@/lib/denuncias/rotulos";
import type { EstadoAcompanhar, EstadoEnvio } from "./actions";

const AREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive";

function Copiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [copiado, setCopiado] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(valor).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-fct-tinta hover:bg-muted"
      aria-label={`Copiar ${rotulo}`}
    >
      <Copy className="size-3.5" aria-hidden />
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

type Acao<T> = (prev: T, fd: FormData) => Promise<T>;

export function NovaDenunciaForm({ action }: { action: Acao<EstadoEnvio> }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const [identificar, setIdentificar] = React.useState(false);
  const [tamanho, setTamanho] = React.useState(0);
  // envio manual: com <form action> o React apagaria o texto quando volta um erro de validação
  const aoEnviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    React.startTransition(() => enviar(fd));
  };
  const erro = (c: string) => estado.erros?.[c];

  if (estado.protocolo && estado.chave) {
    return (
      <div role="status" className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            <strong>Denúncia enviada.</strong> Obrigado pela coragem. O comitê vai analisar com sigilo.
          </p>
        </div>
        <div className="rounded-xl border-2 border-dashed border-primary/30 bg-muted/40 p-4">
          <p className="mb-3 text-sm font-semibold">Guarde estes dois códigos para acompanhar a denúncia:</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-card px-3 py-2">
              <dt className="text-xs text-muted-foreground">Protocolo</dt>
              <dd className="flex items-center justify-between gap-2 font-mono text-lg font-semibold tracking-wider">
                {estado.protocolo}
                <Copiar valor={estado.protocolo} rotulo="protocolo" />
              </dd>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <dt className="text-xs text-muted-foreground">Chave</dt>
              <dd className="flex items-center justify-between gap-2 font-mono text-lg font-semibold tracking-wider">
                {estado.chave}
                <Copiar valor={estado.chave} rotulo="chave" />
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Eles aparecem só agora e não ficam guardados em lugar nenhum ligado a você. Sem eles não dá para acompanhar a denúncia nem responder ao comitê. Anote em um lugar seguro.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          Fazer outra denúncia
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4">
      <ErroFormulario mensagem={estado.erro} />
      <Campo id="categoria" label="Assunto" obrigatorio erro={erro("categoria")}>
        <SelectNativo id="categoria" name="categoria" defaultValue="" required>
          <option value="" disabled>
            Escolha…
          </option>
          {Object.entries(CATEGORIAS_DENUNCIA).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </SelectNativo>
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="local" label="Onde aconteceu" dica="Filial, setor ou local. Opcional.">
          <Input id="local" name="local" maxLength={200} placeholder="Ex.: F112, balcão" />
        </Campo>
        <Campo id="quando" label="Quando aconteceu" dica="Data aproximada. Opcional.">
          <Input id="quando" name="quando" maxLength={120} placeholder="Ex.: 10/10, à tarde" />
        </Campo>
      </div>
      <Campo id="envolvidos" label="Pessoas envolvidas" dica="Nomes ou funções, se souber. Opcional.">
        <textarea id="envolvidos" name="envolvidos" rows={2} maxLength={1000} className={AREA} />
      </Campo>
      <Campo id="descricao" label="O que aconteceu" obrigatorio erro={erro("descricao")} dica={`Conte com o máximo de detalhe que puder: o que, como, quem viu. ${tamanho}/10.000`}>
        <textarea id="descricao" name="descricao" rows={7} maxLength={10000} required minLength={20} onChange={(e) => setTamanho(e.target.value.length)} className={AREA} />
      </Campo>
      <div className="rounded-lg border bg-muted/30 p-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="identificar" checked={identificar} onChange={(e) => setIdentificar(e.target.checked)} className="mt-0.5 size-4" />
          <span>
            <strong>Quero me identificar</strong> (opcional). Só o comitê verá. Deixe desmarcado para continuar anônimo.
          </span>
        </label>
        {identificar && (
          <div className="mt-3">
            <Campo id="identificacao" label="Seu nome e um contato" erro={erro("identificacao")}>
              <Input id="identificacao" name="identificacao" maxLength={300} placeholder="Nome, telefone ou e-mail" />
            </Campo>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Para continuar anônimo, evite contar detalhes que só você saberia. O sistema não registra quem enviou.
      </p>
      <Button type="submit" disabled={pendente}>
        <Send data-icon="inline-start" />
        {pendente ? "Enviando…" : "Enviar denúncia"}
      </Button>
    </form>
  );
}

export function AcompanharForm({ action }: { action: Acao<EstadoAcompanhar> }) {
  const [estado, formAction, pendente] = useActionState(action, {});
  const d = estado.denuncia;

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <ErroFormulario mensagem={!d ? estado.erro : undefined} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="ac-protocolo" label="Protocolo">
            <Input id="ac-protocolo" name="protocolo" defaultValue={estado.protocolo ?? ""} autoComplete="off" placeholder="XXXX-XXXX" className="font-mono uppercase" />
          </Campo>
          <Campo id="ac-chave" label="Chave">
            <Input id="ac-chave" name="chave" type="password" defaultValue={estado.chave ?? ""} autoComplete="off" placeholder="XXXX-XXXX-XXXX" className="font-mono uppercase" />
          </Campo>
        </div>
        <Button type="submit" variant="outline" disabled={pendente}>
          <Search data-icon="inline-start" />
          {pendente ? "Consultando…" : "Consultar"}
        </Button>
      </form>

      {d && (
        <section aria-label={`Denúncia ${d.protocolo}`} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{d.protocolo}</span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${COR_STATUS[d.status]}`}>{STATUS_DENUNCIA[d.status]}</span>
            <span className="text-xs text-muted-foreground">
              {CATEGORIAS_DENUNCIA[d.categoria as keyof typeof CATEGORIAS_DENUNCIA] ?? d.categoria} · recebida em {formatarData(d.recebidaEm)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{EXPLICACAO_STATUS[d.status]}</p>
          <ol className="space-y-2" aria-label="Conversa com o comitê">
            {d.mensagens.length === 0 && <li className="text-sm text-muted-foreground">Ainda não há mensagens.</li>}
            {d.mensagens.map((m, i) => (
              <li key={i} className={`rounded-lg px-3 py-2 text-sm ${m.autor === "comite" ? "border border-primary/15 bg-fct-tinta/5" : "ml-6 border bg-muted/40"}`}>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  {m.autor === "comite" ? "Comitê" : "Você"} · {formatarData(m.data)}
                </p>
                <p className="whitespace-pre-wrap">{m.texto}</p>
              </li>
            ))}
          </ol>
          <form action={formAction} className="space-y-2 border-t pt-3">
            <input type="hidden" name="protocolo" value={d.protocolo} />
            <input type="hidden" name="chave" value={estado.chave ?? ""} />
            <AvisoSucesso mensagem={estado.ok} />
            <ErroFormulario mensagem={estado.erro} />
            <Campo id="complemento" label="Acrescentar informação ou responder ao comitê">
              <textarea id="complemento" name="complemento" rows={3} maxLength={5000} required className={AREA} />
            </Campo>
            <Button type="submit" size="sm" disabled={pendente}>
              <ShieldCheck data-icon="inline-start" />
              {pendente ? "Enviando…" : "Enviar mensagem anônima"}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
