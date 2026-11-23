"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Send } from "lucide-react";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_PARCELAS, TIPOS_VENDA, type TipoVenda } from "@/lib/comprovantes/rotulos";
import { EscolherComprovantes } from "../../sangrias/comprovantes";
import { cadastrarComprovante, registrarAnexos } from "../actions";
import { enviarAnexos } from "../anexos";

type Props = {
  lojas: { id: string; codigo: string; nome: string; rede: string | null }[];
  hoje: string;
};

/**
 * Cadastro do comprovante em 3 passos, sem a pessoa perceber: grava o comprovante, envia o anexo direto ao Storage
 * (a Vercel limita 4,5 MB por envio ao servidor) e registra o anexo. Se o arquivo falhar, o comprovante fica gravado e
 * o anexo pode ser enviado de novo no detalhe.
 */
export function ComprovanteForm({ lojas, hoje }: Props) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [parecido, setParecido] = React.useState<string | null>(null);
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [etapa, setEtapa] = React.useState<"" | "gravando" | "enviando">("");
  const [tipo, setTipo] = React.useState<TipoVenda>("convenio");
  const ocupado = etapa !== "";

  const gravar = async (mesmoAssim: boolean) => {
    const form = formRef.current;
    if (!form) return;
    setErro(null);
    setErros({});
    setParecido(null);
    if (!arquivos.length) {
      setErros({ anexo: "Anexe a foto ou o PDF do comprovante assinado pelo cliente." });
      setErro("Confira os campos destacados.");
      return;
    }
    const fd = new FormData(form);
    if (mesmoAssim) fd.set("mesmo_assim", "sim");
    setEtapa("gravando");
    const r = await cadastrarComprovante({}, fd);
    if (!r.id) {
      setEtapa("");
      setErro(r.erro ?? "Não consegui cadastrar.");
      setErros(r.erros ?? {});
      setParecido(r.parecido ?? null);
      return;
    }
    setEtapa("enviando");
    const envio = await enviarAnexos(r.id, arquivos);
    const registro = envio.erro ? { erro: envio.erro } : await registrarAnexos(r.id, envio.enviados);
    router.push(`/comprovantes/${r.id}?${registro.erro ? "sem_anexo=1" : "novo=1"}`);
  };

  const erroDe = (c: string) => erros[c];
  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        void gravar(false);
      }}
      noValidate
      className="space-y-6"
    >
      <ErroFormulario mensagem={erro ?? undefined} />
      {parecido && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Pode ser o mesmo comprovante.{" "}
            <Link href={`/comprovantes/${parecido}`} target="_blank" className="font-medium underline">
              Abrir o que já existe
            </Link>
            {" "}para conferir.
          </p>
          <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => void gravar(true)}>
            É outra venda: cadastrar mesmo assim
          </Button>
        </div>
      )}
      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="branch_id" label="Filial" obrigatorio erro={erroDe("branch_id")} className="sm:col-span-2">
            <SelectNativo id="branch_id" name="branch_id" defaultValue={lojas.length === 1 ? lojas[0].id : ""} aria-invalid={!!erroDe("branch_id")}>
              {lojas.length !== 1 && <option value="">Escolha a filial…</option>}
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} — {l.nome}
                  {l.rede ? ` (${l.rede})` : ""}
                </option>
              ))}
            </SelectNativo>
          </Campo>

          <fieldset className="grid gap-1.5 sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">
              Tipo de venda <span className="text-destructive" aria-hidden>*</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TIPOS_VENDA) as TipoVenda[]).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/10">
                  <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="accent-primary" />
                  {TIPOS_VENDA[t]}
                </label>
              ))}
            </div>
            {erroDe("tipo") && <p className="text-xs font-medium text-destructive">{erroDe("tipo")}</p>}
          </fieldset>

          <Campo
            id="empresa"
            label={tipo === "convenio" ? "Nome da empresa (convênio)" : "Nome da empresa"}
            obrigatorio={tipo === "convenio"}
            erro={erroDe("empresa")}
            dica={tipo === "convenio" ? "A empresa conveniada onde o cliente trabalha" : "Opcional no crediário"}
          >
            <Input id="empresa" name="empresa" maxLength={160} autoComplete="off" aria-invalid={!!erroDe("empresa")} />
          </Campo>
          <Campo id="cliente" label="Nome do cliente" obrigatorio erro={erroDe("cliente")}>
            <Input id="cliente" name="cliente" maxLength={160} autoComplete="off" aria-invalid={!!erroDe("cliente")} />
          </Campo>
          <Campo id="valor" label="Total da venda" obrigatorio erro={erroDe("valor")}>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <Input id="valor" name="valor" inputMode="decimal" placeholder="0,00" autoComplete="off" className="pl-9 tabular-nums" aria-invalid={!!erroDe("valor")} />
            </div>
          </Campo>
          <Campo id="parcelas" label="Nº de parcelas" obrigatorio erro={erroDe("parcelas")}>
            <Input id="parcelas" name="parcelas" type="number" min={1} max={MAX_PARCELAS} step={1} defaultValue={1} inputMode="numeric" className="tabular-nums" aria-invalid={!!erroDe("parcelas")} />
          </Campo>
          <Campo id="data_compra" label="Data da compra" obrigatorio erro={erroDe("data_compra")}>
            <Input id="data_compra" name="data_compra" type="date" max={hoje} defaultValue={hoje} aria-invalid={!!erroDe("data_compra")} />
          </Campo>
          <Campo id="numero_venda" label="Nº da venda / cupom" erro={erroDe("numero_venda")} dica="O número da venda no Trier (evita cadastrar duas vezes)">
            <Input id="numero_venda" name="numero_venda" maxLength={40} autoComplete="off" className="font-mono" aria-invalid={!!erroDe("numero_venda")} />
          </Campo>
          <Campo id="observacao" label="Observação" erro={erroDe("observacao")} className="sm:col-span-2">
            <textarea
              id="observacao"
              name="observacao"
              rows={2}
              maxLength={1000}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </Campo>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-medium">
              Comprovante assinado <span className="text-destructive" aria-hidden>*</span>
            </p>
            <EscolherComprovantes arquivos={arquivos} onChange={setArquivos} desabilitado={ocupado} idBase="comprovante" />
            {erroDe("anexo") && (
              <p className="mt-1 text-xs font-medium text-destructive" role="alert">
                {erroDe("anexo")}
              </p>
            )}
          </div>
        </div>
      </section>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={ocupado}>
          <Send data-icon="inline-start" />
          {etapa === "gravando" ? "Cadastrando…" : etapa === "enviando" ? "Enviando anexo…" : "Cadastrar comprovante"}
        </Button>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/comprovantes" />} disabled={ocupado}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
