"use client";

import * as React from "react";
import { useActionState } from "react";
import { Camera, FileText, Paperclip, Send, X } from "lucide-react";
import { AvisoSucesso, Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { ACCEPT_ANEXO, BUCKET_ANEXOS_CAIXA, caminhoAnexoCaixa, erroDoAnexo, MAX_ANEXOS_POR_ENVIO, tamanhoLegivel, type AnexoEnviado } from "@/lib/caixa/anexos";
import { nomeFotoCupom, reduzirFoto } from "@/lib/caixa/foto";
import { createClient } from "@/lib/supabase/client";
import type { EstadoJustificativa } from "./actions";

/** Mensagens do Storage em português. */
function motivoDoErro(msg: string) {
  if (/row-level security|unauthorized|not allowed|permission/i.test(msg))
    return "você não pode anexar nesta quebra (só o gestor dela, e só antes do financeiro decidir). Se a sessão expirou, entre de novo.";
  if (/maximum allowed size|too large|payload/i.test(msg)) return "arquivo maior que 20 MB.";
  if (/mime type|invalid.*type/i.test(msg)) return "tipo de arquivo não aceito (use foto ou PDF).";
  if (/fetch|network/i.test(msg)) return "falha de conexão. Tente de novo.";
  return msg;
}

export function JustificativaForm({ action, id, atual }: { action: (prev: EstadoJustificativa, fd: FormData) => Promise<EstadoJustificativa>; id: string; atual: string | null }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [enviandoArquivos, setEnviandoArquivos] = React.useState(false);
  const [erroArquivo, setErroArquivo] = React.useState<string | null>(null);
  const [preparando, setPreparando] = React.useState(false);
  const inputArquivo = React.useRef<HTMLInputElement>(null);
  const inputCamera = React.useRef<HTMLInputElement>(null);
  const idAnexo = `anexo-${id}`;
  const idCamera = `camera-${id}`;

  // miniatura das fotos escolhidas (para conferir se o cupom saiu legível); libera a memória ao trocar
  const previas = React.useMemo(() => arquivos.map((a) => (a.type.startsWith("image/") ? URL.createObjectURL(a) : null)), [arquivos]);
  React.useEffect(() => () => previas.forEach((u) => u && URL.revokeObjectURL(u)), [previas]);

  const escolher = async (lista: FileList | null, daCamera = false) => {
    setErroArquivo(null);
    const entrada = daCamera ? inputCamera.current : inputArquivo.current;
    const brutos = Array.from(lista ?? []).map((a) => (daCamera ? new File([a], nomeFotoCupom(), { type: a.type || "image/jpeg", lastModified: a.lastModified }) : a));
    if (entrada) entrada.value = "";
    if (!brutos.length) return;
    setPreparando(true);
    const prontos = await Promise.all(brutos.map(reduzirFoto));
    setPreparando(false);
    const novos = [...arquivos, ...prontos];
    const erro = novos.map(erroDoAnexo).find(Boolean);
    if (erro) setErroArquivo(erro);
    else if (novos.length > MAX_ANEXOS_POR_ENVIO) setErroArquivo(`No máximo ${MAX_ANEXOS_POR_ENVIO} arquivos por vez.`);
    else setArquivos(novos);
  };

  // os arquivos vão direto do navegador para o Storage (a Vercel limita 4,5 MB por envio ao servidor);
  // o servidor recebe só a lista e grava junto com a justificativa
  const submeter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErroArquivo(null);
    const enviados: AnexoEnviado[] = [];
    if (arquivos.length) {
      setEnviandoArquivos(true);
      const supabase = createClient();
      for (const arquivo of arquivos) {
        const caminho = caminhoAnexoCaixa(id, arquivo.name);
        const { error } = await supabase.storage.from(BUCKET_ANEXOS_CAIXA).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
        if (error) {
          if (enviados.length) await supabase.storage.from(BUCKET_ANEXOS_CAIXA).remove(enviados.map((a) => a.caminho));
          setEnviandoArquivos(false);
          setErroArquivo(`Não consegui enviar “${arquivo.name}”: ${motivoDoErro(error.message)}`);
          return;
        }
        enviados.push({ caminho, nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size });
      }
      setEnviandoArquivos(false);
    }
    fd.set("anexos", JSON.stringify(enviados));
    React.startTransition(() => enviar(fd));
    setArquivos([]);
  };

  const ocupado = pendente || enviandoArquivos || preparando;
  return (
    <form onSubmit={submeter} className="space-y-3">
      <ErroFormulario mensagem={erroArquivo ?? estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <Campo id={`just-${id}`} label={atual ? "Corrigir a justificativa" : "O que aconteceu?"} dica="Conte com detalhe: o financeiro decide se mantém o desconto ou abona.">
        <textarea
          id={`just-${id}`}
          name="justificativa"
          rows={3}
          minLength={10}
          maxLength={2000}
          required
          defaultValue={atual ?? ""}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </Campo>

      <div>
        <div className="flex flex-wrap gap-2">
          {/* no celular: abre direto a câmera traseira para fotografar o cupom */}
          <label
            htmlFor={idCamera}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 md:hidden"
          >
            <Camera className="size-4" aria-hidden />
            Tirar foto do cupom
            <input ref={inputCamera} id={idCamera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void escolher(e.target.files, true)} aria-describedby={`${idAnexo}-dica`} />
          </label>
          <label
            htmlFor={idAnexo}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input px-3 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-ring hover:bg-muted/50"
          >
            <Paperclip className="size-4" aria-hidden />
            <span className="md:hidden">Escolher arquivo</span>
            <span className="hidden md:inline">Anexar foto ou PDF</span>
            <input ref={inputArquivo} id={idAnexo} type="file" multiple accept={ACCEPT_ANEXO} className="sr-only" onChange={(e) => void escolher(e.target.files)} aria-describedby={`${idAnexo}-dica`} />
          </label>
        </div>
        <p id={`${idAnexo}-dica`} className="mt-1 text-xs text-muted-foreground">
          Opcional: foto do cupom, do comprovante, da conferência do caixa… JPG, PNG, WebP ou PDF, {MAX_ANEXOS_POR_ENVIO} por vez. Fotos grandes são reduzidas antes de enviar.
        </p>
        {preparando && <p className="mt-2 text-xs text-muted-foreground" role="status">Preparando a foto…</p>}
        {arquivos.length > 0 && (
          <ul className="mt-2 space-y-1" aria-label="Arquivos escolhidos">
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
                <button
                  type="button"
                  onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Tirar ${a.name}`}
                  disabled={ocupado}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button type="submit" size="sm" disabled={ocupado}>
        <Send data-icon="inline-start" />
        {enviandoArquivos ? "Enviando anexos…" : pendente ? "Enviando…" : atual ? "Atualizar justificativa" : "Enviar justificativa"}
      </Button>
    </form>
  );
}
