"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Send } from "lucide-react";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cadastrarSangria, registrarComprovantes } from "../actions";
import { enviarComprovantes, EscolherComprovantes } from "../comprovantes";

type Props = {
  lojas: { id: string; codigo: string; nome: string; empresa: string | null }[];
  /** empresas = em que Omie a conta existe (a loja só vê os bancos da empresa dela) */
  contas: { id: string; apelido: string; empresas: string[] }[];
  hoje: string;
};

/**
 * Cadastro da sangria em 3 passos, sem a pessoa perceber: grava a sangria, envia o comprovante direto ao Storage
 * (a Vercel limita 4,5 MB por envio ao servidor) e registra o comprovante. Se o arquivo falhar, a sangria fica
 * gravada e o comprovante pode ser anexado de novo no detalhe.
 */
export function SangriaForm({ lojas, contas, hoje }: Props) {
  const router = useRouter();
  const [erro, setErro] = React.useState<string | null>(null);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [etapa, setEtapa] = React.useState<"" | "gravando" | "enviando">("");
  const [loja, setLoja] = React.useState(lojas.length === 1 ? lojas[0].id : "");
  const ocupado = etapa !== "";
  const empresaDaLoja = lojas.find((l) => l.id === loja)?.empresa ?? null;
  const contasDaLoja = loja ? contas.filter((c) => !empresaDaLoja || c.empresas.includes(empresaDaLoja)) : [];

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErro(null);
    setErros({});
    if (!arquivos.length) {
      setErros({ comprovante: "Anexe a foto ou o PDF do comprovante do depósito." });
      setErro("Confira os campos destacados.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    setEtapa("gravando");
    const r = await cadastrarSangria({}, fd);
    if (!r.id) {
      setEtapa("");
      setErro(r.erro ?? "Não consegui cadastrar.");
      setErros(r.erros ?? {});
      return;
    }
    setEtapa("enviando");
    const envio = await enviarComprovantes(r.id, arquivos);
    const registro = envio.erro ? { erro: envio.erro } : await registrarComprovantes(r.id, envio.enviados);
    router.push(`/sangrias/${r.id}?${registro.erro ? "sem_comprovante=1" : "nova=1"}`);
  };

  const erroDe = (c: string) => erros[c];
  return (
    <form onSubmit={enviar} noValidate className="space-y-6">
      <ErroFormulario mensagem={erro ?? undefined} />
      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="branch_id" label="Filial" obrigatorio erro={erroDe("branch_id")} className="sm:col-span-2">
            <SelectNativo id="branch_id" name="branch_id" value={loja} onChange={(e) => setLoja(e.target.value)} aria-invalid={!!erroDe("branch_id")}>
              {lojas.length !== 1 && <option value="">Escolha a filial…</option>}
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} — {l.nome}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="conta_id" label="Banco" obrigatorio erro={erroDe("conta_id")} className="sm:col-span-2" dica="A conta da carteira onde o dinheiro foi depositado">
            <SelectNativo key={loja} id="conta_id" name="conta_id" defaultValue="" aria-invalid={!!erroDe("conta_id")} disabled={!loja}>
              <option value="">{loja ? "Escolha o banco…" : "Escolha a filial primeiro"}</option>
              {contasDaLoja.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.apelido}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="data_retirada" label="Data da retirada" obrigatorio erro={erroDe("data_retirada")}>
            <Input id="data_retirada" name="data_retirada" type="date" max={hoje} defaultValue={hoje} aria-invalid={!!erroDe("data_retirada")} />
          </Campo>
          <Campo id="data_deposito" label="Data do depósito" obrigatorio erro={erroDe("data_deposito")}>
            <Input id="data_deposito" name="data_deposito" type="date" max={hoje} defaultValue={hoje} aria-invalid={!!erroDe("data_deposito")} />
          </Campo>
          <Campo id="numero_deposito" label="Nº do depósito (CTR)" erro={erroDe("numero_deposito")} dica="O número que vem no comprovante">
            <Input id="numero_deposito" name="numero_deposito" maxLength={40} autoComplete="off" className="font-mono" aria-invalid={!!erroDe("numero_deposito")} />
          </Campo>
          <Campo id="valor" label="Valor" obrigatorio erro={erroDe("valor")}>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <Input id="valor" name="valor" inputMode="decimal" placeholder="0,00" autoComplete="off" className="pl-9 tabular-nums" aria-invalid={!!erroDe("valor")} />
            </div>
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
              Comprovante <span className="text-destructive" aria-hidden>*</span>
            </p>
            <EscolherComprovantes arquivos={arquivos} onChange={setArquivos} desabilitado={ocupado} idBase="sangria" />
            {erroDe("comprovante") && (
              <p className="mt-1 text-xs font-medium text-destructive" role="alert">
                {erroDe("comprovante")}
              </p>
            )}
          </div>
        </div>
      </section>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={ocupado}>
          <Send data-icon="inline-start" />
          {etapa === "gravando" ? "Cadastrando…" : etapa === "enviando" ? "Enviando comprovante…" : "Cadastrar sangria"}
        </Button>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/sangrias" />} disabled={ocupado}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
