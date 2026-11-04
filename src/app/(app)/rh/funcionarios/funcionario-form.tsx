"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTRATO_LABEL, ESCOLARIDADES, ESTADOS_CIVIS, RACAS_CORES } from "@/lib/rh/rotulos";
import type { EstadoFormulario } from "./actions";

export type OpcaoUnidade = { id: string; codigo: string; nome: string; ativo: boolean; grupo: string };

export type ValoresFuncionario = Partial<{
  branch_id: string | null;
  nome: string | null;
  matricula: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  tipo_contrato: string | null;
  categoria: string | null;
  horas_mes: number | string | null;
  num_filhos: number | string | null;
  num_dependentes: number | string | null;
  contribui_sindicato: boolean | null;
  optante_fgts: boolean | null;
  data_admissao: string | null;
  observacoes: string | null;
  salario: number | string | null;
  pis: string | null;
  nome_mae: string | null;
  nome_pai: string | null;
  endereco: string | null;
  endereco_numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  celular: string | null;
  escolaridade: string | null;
  estado_civil: string | null;
  rg: string | null;
  rg_emissao: string | null;
  rg_emissor: string | null;
  rg_uf: string | null;
  raca_cor: string | null;
  titulo_eleitor: string | null;
  titulo_zona: string | null;
  titulo_secao: string | null;
  cnh: string | null;
  cnh_emissao: string | null;
  cnh_vencimento: string | null;
  cnh_categoria: string | null;
  reservista: string | null;
  reservista_categoria: string | null;
  horario_trabalho: string | null;
  periodo_experiencia: string | null;
  adicionais: string | null;
}>;

type Props = {
  action: (prev: EstadoFormulario, fd: FormData) => Promise<EstadoFormulario>;
  unidades: OpcaoUnidade[];
  valores?: ValoresFuncionario;
  /** Mostra o campo de salário (admin/RH). */
  podeSalario: boolean;
  voltarPara: string;
};

const CATEGORIAS = ["Mensalista", "Horista", "Diarista", "Tarefeiro"];

export function FuncionarioForm({ action, unidades, valores = {}, podeSalario, voltarPara }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (campo: string) => estado.erros?.[campo];
  const v = (campo: keyof ValoresFuncionario) => {
    const valor = valores[campo];
    return valor === null || valor === undefined ? "" : String(valor);
  };

  const grupos = new Map<string, OpcaoUnidade[]>();
  for (const u of unidades) grupos.set(u.grupo, [...(grupos.get(u.grupo) ?? []), u]);

  const texto = (campo: keyof ValoresFuncionario, label: string, maxLength: number, className?: string) => (
    <Campo id={campo} label={label} erro={erro(campo)} className={className}>
      <Input id={campo} name={campo} defaultValue={v(campo)} maxLength={maxLength} aria-invalid={!!erro(campo)} />
    </Campo>
  );
  const data = (campo: keyof ValoresFuncionario, label: string) => (
    <Campo id={campo} label={label} erro={erro(campo)}>
      <Input id={campo} name={campo} type="date" defaultValue={v(campo)} aria-invalid={!!erro(campo)} />
    </Campo>
  );
  const lista = (campo: keyof ValoresFuncionario, label: string, opcoes: string[]) => {
    const atual = v(campo);
    return (
      <Campo id={campo} label={label} erro={erro(campo)}>
        <SelectNativo id={campo} name={campo} defaultValue={atual}>
          <option value="">—</option>
          {(atual && !opcoes.includes(atual) ? [...opcoes, atual] : opcoes).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </SelectNativo>
      </Campo>
    );
  };

  const categoriaAtual = v("categoria");
  const categorias = categoriaAtual && !CATEGORIAS.includes(categoriaAtual) ? [...CATEGORIAS, categoriaAtual] : CATEGORIAS;

  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Vínculo</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="branch_id" label="Unidade" obrigatorio erro={erro("branch_id")}>
            <SelectNativo id="branch_id" name="branch_id" defaultValue={v("branch_id")} aria-invalid={!!erro("branch_id")}>
              <option value="">Selecione…</option>
              {[...grupos.entries()].map(([grupo, lista]) => (
                <optgroup key={grupo} label={grupo}>
                  {lista.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.codigo} — {u.nome}
                      {u.ativo ? "" : " (inativa)"}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="matricula" label="Matrícula" erro={erro("matricula")} dica="Código na folha (Domínio)">
            <Input id="matricula" name="matricula" defaultValue={v("matricula")} maxLength={20} />
          </Campo>
          <Campo id="cargo" label="Cargo" erro={erro("cargo")}>
            <Input id="cargo" name="cargo" defaultValue={v("cargo")} maxLength={80} />
          </Campo>
          <Campo id="tipo_contrato" label="Tipo de contrato" erro={erro("tipo_contrato")}>
            <SelectNativo id="tipo_contrato" name="tipo_contrato" defaultValue={v("tipo_contrato")}>
              <option value="">—</option>
              {Object.entries(CONTRATO_LABEL).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="categoria" label="Categoria" erro={erro("categoria")}>
            <SelectNativo id="categoria" name="categoria" defaultValue={categoriaAtual}>
              <option value="">—</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="horas_mes" label="Horas por mês" erro={erro("horas_mes")}>
            <Input id="horas_mes" name="horas_mes" inputMode="decimal" defaultValue={v("horas_mes")} aria-invalid={!!erro("horas_mes")} />
          </Campo>
          <Campo id="data_admissao" label="Admissão" erro={erro("data_admissao")}>
            <Input id="data_admissao" name="data_admissao" type="date" defaultValue={v("data_admissao")} aria-invalid={!!erro("data_admissao")} />
          </Campo>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Dados pessoais</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="nome" label="Nome completo" obrigatorio erro={erro("nome")} className="sm:col-span-2">
            <Input id="nome" name="nome" defaultValue={v("nome")} maxLength={120} aria-invalid={!!erro("nome")} />
          </Campo>
          <Campo id="cpf" label="CPF" erro={erro("cpf")} dica="Com ou sem pontuação">
            <Input id="cpf" name="cpf" inputMode="numeric" defaultValue={v("cpf")} maxLength={14} aria-invalid={!!erro("cpf")} />
          </Campo>
          <Campo id="data_nascimento" label="Nascimento" erro={erro("data_nascimento")}>
            <Input id="data_nascimento" name="data_nascimento" type="date" defaultValue={v("data_nascimento")} aria-invalid={!!erro("data_nascimento")} />
          </Campo>
          <Campo id="email" label="E-mail" erro={erro("email")}>
            <Input id="email" name="email" type="email" defaultValue={v("email")} aria-invalid={!!erro("email")} />
          </Campo>
          <Campo id="telefone" label="Telefone" erro={erro("telefone")}>
            <Input id="telefone" name="telefone" defaultValue={v("telefone")} maxLength={30} />
          </Campo>
          <Campo id="num_filhos" label="Nº de filhos" erro={erro("num_filhos")}>
            <Input id="num_filhos" name="num_filhos" inputMode="numeric" defaultValue={v("num_filhos")} aria-invalid={!!erro("num_filhos")} />
          </Campo>
          <Campo id="num_dependentes" label="Nº de dependentes" erro={erro("num_dependentes")}>
            <Input id="num_dependentes" name="num_dependentes" inputMode="numeric" defaultValue={v("num_dependentes")} aria-invalid={!!erro("num_dependentes")} />
          </Campo>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Folha</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {podeSalario && (
            <Campo id="salario" label="Salário (R$)" erro={erro("salario")} dica="Mudar o valor cria uma nova vigência; o histórico é mantido.">
              <Input id="salario" name="salario" inputMode="decimal" defaultValue={v("salario")} aria-invalid={!!erro("salario")} />
            </Campo>
          )}
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" name="contribui_sindicato" defaultChecked={valores.contribui_sindicato ?? true} className="size-4 accent-fct-tinta" />
            Contribui com o sindicato
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" name="optante_fgts" defaultChecked={valores.optante_fgts ?? true} className="size-4 accent-fct-tinta" />
            Optante do FGTS
          </label>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Ficha de registro</h2>
        <p className="mb-4 text-xs text-muted-foreground">Estes dados saem na ficha de registro e na declaração do banco, na aba Documentos.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {texto("horario_trabalho", "Horário de trabalho", 150, "sm:col-span-2")}
          {texto("periodo_experiencia", "Período de experiência", 20)}
          {texto("adicionais", "Adicionais e benefícios", 200, "sm:col-span-2 lg:col-span-3")}
          {texto("pis", "PIS/PASEP/NIT", 20)}
          {texto("nome_mae", "Nome da mãe", 120)}
          {texto("nome_pai", "Nome do pai", 120)}
          {texto("endereco", "Endereço", 150, "sm:col-span-2")}
          {texto("endereco_numero", "Número", 20)}
          {texto("bairro", "Bairro", 80)}
          {texto("cidade", "Cidade", 80)}
          {texto("uf", "UF", 2)}
          {texto("cep", "CEP", 10)}
          {texto("celular", "Celular", 30)}
          {lista("escolaridade", "Escolaridade", ESCOLARIDADES)}
          {lista("estado_civil", "Estado civil", ESTADOS_CIVIS)}
          {lista("raca_cor", "Raça/cor", RACAS_CORES)}
          {texto("rg", "RG", 20)}
          {data("rg_emissao", "Emissão do RG")}
          {texto("rg_emissor", "Emissor do RG", 20)}
          {texto("rg_uf", "UF do RG", 2)}
          {texto("titulo_eleitor", "Título de eleitor", 20)}
          {texto("titulo_zona", "Zona", 10)}
          {texto("titulo_secao", "Seção", 10)}
          {texto("cnh", "CNH", 20)}
          {data("cnh_emissao", "Emissão da CNH")}
          {data("cnh_vencimento", "Vencimento da CNH")}
          {texto("cnh_categoria", "Categoria da CNH", 5)}
          {texto("reservista", "Reservista", 20)}
          {texto("reservista_categoria", "Categoria do reservista", 10)}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <Campo id="observacoes" label="Observações" erro={erro("observacoes")}>
          <textarea
            id="observacoes"
            name="observacoes"
            defaultValue={v("observacoes")}
            maxLength={2000}
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </Campo>
      </section>

      <div className="flex items-center gap-2">
        <BotaoSalvar />
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href={voltarPara} />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
