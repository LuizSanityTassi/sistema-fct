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
  const [dedo, setDedo] = useState(2);
  const [ocupado, setOcupado] = useState<"lendo" | "removendo" | null>(null);
  const [estado, setEstado] = useState<EstadoPonto>({});

  useEffect(() => {
    if (!aberto) return;
    let vale = true;
    verLeitor().then((l) => {
      if (vale) setLeitor(l);
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
      setEstado({ erro: e instanceof Error && e.name !== "TimeoutError" ? e.message : "O leitor não recebeu o dedo a tempo. Tente de novo." });
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
            <DialogDescription>Escolha o dedo e peça para a pessoa colocar no leitor. O sistema guarda só um código gerado a partir da digital, nunca a imagem do dedo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ErroFormulario mensagem={estado.erro} />
            <AvisoSucesso mensagem={estado.ok} />
            {leitor === null && <AvisoAtencao mensagem="Leitor não encontrado neste computador. Confira se ele está ligado e se o programa do leitor está instalado." />}
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
                {ocupado === "lendo" ? "Coloque o dedo no leitor…" : "Ler digital"}
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
