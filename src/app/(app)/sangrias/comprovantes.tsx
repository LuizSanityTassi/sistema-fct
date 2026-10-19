"use client";

import * as React from "react";
import { Camera, FileText, Paperclip, X } from "lucide-react";
import { ACCEPT_ANEXO, BUCKET_ANEXOS_CAIXA, erroDoAnexo, MAX_ANEXOS_POR_ENVIO, tamanhoLegivel, type AnexoEnviado } from "@/lib/caixa/anexos";
import { nomeFotoCupom, reduzirFoto } from "@/lib/caixa/foto";
import { caminhoAnexoSangria } from "@/lib/sangrias/rotulos";
import { createClient } from "@/lib/supabase/client";

/** Mensagens do Storage em português. */
export function motivoDoErroStorage(msg: string) {
  if (/row-level security|unauthorized|not allowed|permission/i.test(msg)) return "você não pode anexar nesta sangria (só enquanto está a conferir). Se a sessão expirou, entre de novo.";
  if (/maximum allowed size|too large|payload/i.test(msg)) return "arquivo maior que 20 MB.";
  if (/mime type|invalid.*type/i.test(msg)) return "tipo de arquivo não aceito (use foto ou PDF).";
  if (/fetch|network/i.test(msg)) return "falha de conexão. Tente de novo.";
  return msg;
}

/** Envia os arquivos direto do navegador para o Storage (sangrias/<id>/); devolve a lista para registrar. */
export async function enviarComprovantes(sangriaId: string, arquivos: File[]): Promise<{ enviados: AnexoEnviado[]; erro?: string }> {
  const supabase = createClient();
  const enviados: AnexoEnviado[] = [];
  for (const arquivo of arquivos) {
    const caminho = caminhoAnexoSangria(sangriaId, arquivo.name);
    const { error } = await supabase.storage.from(BUCKET_ANEXOS_CAIXA).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
    if (error) {
      if (enviados.length) await supabase.storage.from(BUCKET_ANEXOS_CAIXA).remove(enviados.map((a) => a.caminho));
      return { enviados: [], erro: `Não consegui enviar “${arquivo.name}”: ${motivoDoErroStorage(error.message)}` };
    }
    enviados.push({ caminho, nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size });
  }
  return { enviados };
}

/** Escolher o comprovante: no celular abre a câmera; foto grande é reduzida antes de subir; miniatura para conferir. */
export function EscolherComprovantes({ arquivos, onChange, desabilitado, idBase }: { arquivos: File[]; onChange: (a: File[]) => void; desabilitado?: boolean; idBase: string }) {
  const [erro, setErro] = React.useState<string | null>(null);
  const [preparando, setPreparando] = React.useState(false);
  const inputArquivo = React.useRef<HTMLInputElement>(null);
  const inputCamera = React.useRef<HTMLInputElement>(null);
  const previas = React.useMemo(() => arquivos.map((a) => (a.type.startsWith("image/") ? URL.createObjectURL(a) : null)), [arquivos]);
  React.useEffect(() => () => previas.forEach((u) => u && URL.revokeObjectURL(u)), [previas]);

  const escolher = async (lista: FileList | null, daCamera = false) => {
    setErro(null);
    const entrada = daCamera ? inputCamera.current : inputArquivo.current;
    const brutos = Array.from(lista ?? []).map((a) => (daCamera ? new File([a], nomeFotoCupom(), { type: a.type || "image/jpeg", lastModified: a.lastModified }) : a));
    if (entrada) entrada.value = "";
    if (!brutos.length) return;
    setPreparando(true);
    const prontos = await Promise.all(brutos.map(reduzirFoto));
    setPreparando(false);
    const novos = [...arquivos, ...prontos];
    const e = novos.map(erroDoAnexo).find(Boolean);
    if (e) setErro(e);
    else if (novos.length > MAX_ANEXOS_POR_ENVIO) setErro(`No máximo ${MAX_ANEXOS_POR_ENVIO} arquivos por vez.`);
    else onChange(novos);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={`${idBase}-camera`}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 md:hidden"
        >
          <Camera className="size-4" aria-hidden />
          Tirar foto do comprovante
          <input ref={inputCamera} id={`${idBase}-camera`} type="file" accept="image/*" capture="environment" className="sr-only" disabled={desabilitado} onChange={(e) => void escolher(e.target.files, true)} />
        </label>
        <label
          htmlFor={`${idBase}-arquivo`}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input px-3 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-ring hover:bg-muted/50"
        >
          <Paperclip className="size-4" aria-hidden />
          <span className="md:hidden">Escolher arquivo</span>
          <span className="hidden md:inline">Anexar comprovante (foto ou PDF)</span>
          <input ref={inputArquivo} id={`${idBase}-arquivo`} type="file" multiple accept={ACCEPT_ANEXO} className="sr-only" disabled={desabilitado} onChange={(e) => void escolher(e.target.files)} />
        </label>
      </div>
      {preparando && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          Preparando a foto…
        </p>
      )}
      {erro && (
        <p className="mt-2 text-xs font-medium text-destructive" role="alert">
          {erro}
        </p>
      )}
      {arquivos.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Comprovantes escolhidos">
          {arquivos.map((a, i) => (
            <li key={`${a.name}-${i}`} className="flex items-center gap-2.5 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm">
              {previas[i] ? (
                // eslint-disable-next-line @next/next/no-img-element -- miniatura local (blob:), não passa pelo otimizador
                <img src={previas[i]!} alt="" className="size-10 shrink-0 rounded object-cover ring-1 ring-border" />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{tamanhoLegivel(a.size)}</span>
              <button type="button" onClick={() => onChange(arquivos.filter((_, j) => j !== i))} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Tirar ${a.name}`} disabled={desabilitado}>
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
