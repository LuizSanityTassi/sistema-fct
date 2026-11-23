"use client";

import { useActionState, useState } from "react";
import { Check, CircleCheck, Copy, TriangleAlert } from "lucide-react";
import { CampoSenha } from "@/components/form/campo-senha";
import { Campo, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoAcessoRelogio, EstadoLinkRelogio } from "./actions";

/** Gerar o link do relógio de uma filial (abre direto no relógio, sem senha). O link aparece uma vez só. */
export function FormLinkRelogio({
  acao,
  filiais,
}: {
  acao: (prev: EstadoLinkRelogio, fd: FormData) => Promise<EstadoLinkRelogio>;
  filiais: { id: string; codigo: string; nome: string; temLink: boolean }[];
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    if (!estado.link) return;
    try {
      await navigator.clipboard.writeText(estado.link);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <div className="space-y-3 px-5 pb-5">
      <form action={enviar} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Campo id="link-filial" label="Filial">
          <SelectNativo id="link-filial" name="filial" required defaultValue="">
            <option value="" disabled>
              Escolha…
            </option>
            {filiais.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo} — {f.nome}
                {f.temLink ? " (gerar outro: o atual para de funcionar)" : ""}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Button type="submit" disabled={pendente} onClick={() => setCopiado(false)}>
          {pendente ? "Gerando…" : "Gerar link"}
        </Button>
      </form>
      {estado.erro && (
        <p role="alert" className="flex items-start gap-2 text-sm text-red-700">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {estado.erro}
        </p>
      )}
      {estado.link && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p role="status" className="flex items-start gap-2 text-sm text-emerald-800">
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            {estado.ok}
          </p>
          <div className="flex gap-2">
            <Input readOnly value={estado.link} aria-label="Link do relógio" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" onClick={copiar}>
              {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type Props = {
  acao: (
    prev: EstadoAcessoRelogio,
    fd: FormData,
  ) => Promise<EstadoAcessoRelogio>;
  filiais: { id: string; codigo: string; nome: string; temAcesso: boolean }[];
};

/** Criar o login do relógio de uma filial (ou trocar a senha, se já existir). */
export function FormAcessoRelogio({ acao, filiais }: Props) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  return (
    <form
      action={enviar}
      className="grid gap-3 px-5 pb-5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
    >
      <Campo id="acesso-filial" label="Filial">
        <SelectNativo id="acesso-filial" name="filial" required defaultValue="">
          <option value="" disabled>
            Escolha…
          </option>
          {filiais.map((f) => (
            <option key={f.id} value={f.id}>
              {f.codigo} — {f.nome}
              {f.temAcesso ? " (trocar senha)" : ""}
            </option>
          ))}
        </SelectNativo>
      </Campo>
      <Campo id="acesso-senha" label="Senha do relógio">
        <CampoSenha
          id="acesso-senha"
          name="senha"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Campo>
      <Campo id="acesso-senha2" label="Repita a senha">
        <CampoSenha
          id="acesso-senha2"
          name="senha2"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Campo>
      <Button type="submit" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar acesso"}
      </Button>
      {(estado.erro || estado.ok) && (
        <p
          role={estado.erro ? "alert" : "status"}
          className={`flex items-start gap-2 text-sm sm:col-span-4 ${estado.erro ? "text-red-700" : "text-emerald-700"}`}
        >
          {estado.erro ? (
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          {estado.erro ?? estado.ok}
        </p>
      )}
    </form>
  );
}
