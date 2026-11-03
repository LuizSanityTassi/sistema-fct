"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { AvisoAtencao, AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EstadoPonto } from "@/lib/ponto/form";
import { capturarDigital, DEDOS, nomeDoDedo, verLeitor } from "@/lib/ponto/leitor-digital";

type Props = {
  cadastrar: (dedo: number, template: string, leitor: string) => Promise<EstadoPonto>;
  remover: (dedo: number) => Promise<EstadoPonto>;
  nome: string;
  dedos: number[];
};

/** Botão que abre o diálogo para cadastrar a digital: escolhe o dedo, a pessoa coloca no leitor e salva sozinho. */
export function DigitalForm({ cadastrar, remover, nome, dedos }: Props) {
  const [aberto, setAberto] = useState(false);
  const [leitor, setLeitor] = useState<string | null | undefined>(undefined);
  const [semLeitor, setSemLeitor] = useState<string | undefined>(undefined);
  const [dedo, setDedo] = useState(2);
  const [ocupado, setOcupado] = useState<"lendo" | "removendo" | null>(null);
  const [estado, setEstado] = useState<EstadoPonto>({});

  useEffect(() => {
    if (!aberto) return;
    let vale = true;
    verLeitor().then((r) => {
      if (!vale) return;
      setLeitor(r.leitor);
      setSemLeitor(r.erro);
    });
    return () => {
      vale = false;
      setLeitor(undefined);
    };
  }, [aberto]);

  const ler = async () => {
    setOcupado("lendo");
    setEstado({});
    try {
      const { template, leitor: nomeLeitor } = await capturarDigital();
      setEstado(await cadastrar(dedo, template, nomeLeitor));
    } catch (e) {
      setEstado({ erro: e instanceof Error && e.name === "TimeoutError" ? "O cadastro passou de 3 minutos. Tente de novo." : e instanceof TypeError ? "O agente do leitor parou de responder. Tente de novo." : e instanceof Error ? e.message : "Não consegui ler a digital. Tente de novo." });
    } finally {
      setOcupado(null);
    }
  };

  const tirar = async (d: number) => {
    setOcupado("removendo");
    setEstado(await remover(d));
    setOcupado(null);
  };

  return (
    <>
      <Button type="button" size="xs" variant="outline" onClick={() => setAberto(true)}>
        <Fingerprint aria-hidden /> {dedos.length ? "Digitais" : "Cadastrar digital"}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Digital · {nome}</DialogTitle>
            <DialogDescription>Escolha o dedo, clique em Ler digital e siga a janela do leitor. O sistema guarda só um código gerado a partir da digital, nunca a imagem do dedo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ErroFormulario mensagem={estado.erro} />
            <AvisoSucesso mensagem={estado.ok} />
            {leitor === null && <AvisoAtencao mensagem={semLeitor} />}
            {ocupado === "lendo" && <p className="text-sm text-muted-foreground">Siga a janela do leitor e cadastre o mesmo dedo. Ela pode abrir atrás do navegador; se não aparecer, olhe na barra de tarefas.</p>}
            {leitor && <p className="text-xs text-muted-foreground">Leitor: {leitor}</p>}
            <div className="flex flex-wrap items-end gap-2">
              <Campo id="digital-dedo" label="Dedo">
                <SelectNativo id="digital-dedo" value={dedo} onChange={(e) => setDedo(Number(e.target.value))} className="w-52">
                  {DEDOS.map(([d, rotulo]) => (
                    <option key={d} value={d}>
                      {rotulo}
                      {dedos.includes(d) ? " (já cadastrado)" : ""}
                    </option>
                  ))}
                </SelectNativo>
              </Campo>
              <Button type="button" onClick={ler} disabled={!leitor || !!ocupado}>
                <Fingerprint data-icon="inline-start" />
                {ocupado === "lendo" ? "Aguardando o leitor…" : "Ler digital"}
              </Button>
            </div>
            {dedos.length > 0 && (
              <ul className="divide-y rounded-lg border text-sm">
                {dedos.map((d) => (
                  <li key={d} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    {nomeDoDedo(d)}
                    <Button type="button" size="xs" variant="ghost" onClick={() => tirar(d)} disabled={!!ocupado}>
                      <Trash2 aria-hidden /> Remover
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
