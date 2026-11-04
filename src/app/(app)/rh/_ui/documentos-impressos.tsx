import Image from "next/image";
import { Emblema } from "@/components/layout/marca";

// Ficha de registro e declaração do banco, prontas para imprimir ou salvar em PDF (só apresentação, sem acesso a dados).

export type DadosFicha = {
  empresa: string;
  nome: string;
  admissao: string;
  cargo: string;
  salario: string;
  adicionais: string;
  horario: string;
  experiencia: string;
  pis: string;
  nascimento: string;
  mae: string;
  pai: string;
  endereco: string;
  bairro: string;
  cidade: string;
  cep: string;
  numero: string;
  uf: string;
  celular: string;
  telefone: string;
  email: string;
  escolaridade: string;
  estadoCivil: string;
  rg: string;
  rgEmissao: string;
  rgEmissor: string;
  rgUf: string;
  cpf: string;
  raca: string;
  titulo: string;
  zona: string;
  secao: string;
  cnh: string;
  cnhEmissao: string;
  cnhVencimento: string;
  cnhCategoria: string;
  reservista: string;
  reservistaCategoria: string;
  geradoEm: string;
};

const FOLHA = "relative mx-auto flex min-h-[1020px] w-full max-w-[794px] flex-col bg-white px-10 py-8 font-sans text-[13px] text-neutral-900 shadow-sm [print-color-adjust:exact] print:min-h-[265mm] print:max-w-none print:p-0 print:shadow-none";
const R = "border border-neutral-400 px-1.5 py-1 font-semibold";
const V = "border border-neutral-400 px-1.5 py-1";

/** Só a primeira tabela: rótulo à esquerda, valor à direita. */
function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <tr>
      <th scope="row" className={`${R} w-[30%] text-left`}>
        {rotulo}
      </th>
      <td className={`${V} ${forte ? "font-semibold" : ""}`}>{valor}</td>
    </tr>
  );
}

export function FichaRegistro({ d }: { d: DadosFicha }) {
  return (
    <article className={FOLHA}>
      <header className="mb-5 flex flex-col items-center gap-3 text-center">
        <Emblema largura={120} />
        <p className="text-base">DEPARTAMENTO DE PESSOAL</p>
        <h1 className="text-base font-bold">FICHA PARA REGISTRO DE EMPREGADO</h1>
      </header>
      <table className="mb-5 w-full border-collapse">
        <tbody>
          <Linha rotulo="Empresa:" valor={d.empresa} forte />
          <Linha rotulo="Nome do empregado:" valor={d.nome} forte />
          <Linha rotulo="Data de admissão:" valor={d.admissao} />
          <Linha rotulo="Cargo/Função:" valor={d.cargo} />
          <Linha rotulo="Salário:" valor={d.salario} />
          <Linha rotulo="Adicionais/Benefícios:" valor={d.adicionais} />
          <Linha rotulo="Horário de trabalho/Jornada:" valor={d.horario} />
          <Linha rotulo="Período de experiência:" valor={d.experiencia} />
        </tbody>
      </table>
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[17%]" />
          <col className="w-[10%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
        </colgroup>
        <tbody>
          <tr>
            <th className={`${R} text-left`}>PIS/PASEP/NIT:</th>
            <td className={V} colSpan={3}>{d.pis}</td>
            <th className={`${R} text-left`}>Nascimento:</th>
            <td className={V} colSpan={3}>{d.nascimento}</td>
          </tr>
          <tr>
            <th className={`${R} text-left`}>Nome da mãe:</th>
            <td className={V} colSpan={7}>{d.mae}</td>
          </tr>
          <tr>
            <th className={`${R} text-left`}>Nome do pai:</th>
            <td className={V} colSpan={7}>{d.pai}</td>
          </tr>
          <tr>
            <th className={`${R} text-left`}>Endereço:</th>
            <td className={V} colSpan={3}>{d.endereco}</td>
            <th className={`${R} text-left`}>Bairro:</th>
            <td className={V} colSpan={3}>{d.bairro}</td>
          </tr>
          <tr>
            <th className={`${R} text-left`}>Cidade:</th>
            <td className={V}>{d.cidade}</td>
            <th className={`${R} text-left`}>Cep:</th>
            <td className={V}>{d.cep}</td>
            <th className={`${R} text-left`}>Número:</th>
            <td className={V}>{d.numero}</td>
            <th className={`${R} text-left`}>UF:</th>
            <td className={V}>{d.uf}</td>
          </tr>
          <tr>
            <th className={`${R} text-left`}>Celular:</th>
            <td className={V} colSpan={3}>{d.celular}</td>
            <th className={`${R} text-left`}>Telefone:</th>
            <td className={V} colSpan={3}>{d.telefone}</td>
          </tr>
          <tr>
            <th className={`${R} text-left`}>Email:</th>
            <td className={`${V} break-words`} colSpan={7}>{d.email}</td>
          </tr>
          <tr>
            <th className={`${R} text-left`}>Escolaridade:</th>
            <td className={V} colSpan={3}>{d.escolaridade}</td>
            <th className={`${R} text-left`}>Estado civil:</th>
            <td className={V} colSpan={3}>{d.estadoCivil}</td>
          </tr>
          <tr>
            <th className={`${R} text-left`}>Rg:</th>
            <td className={V}>{d.rg}</td>
            <th className={`${R} text-left`}>Emissão:</th>
            <td className={V}>{d.rgEmissao}</td>
            <th className={`${R} text-left`}>Emissor:</th>
            <td className={V}>{d.rgEmissor}</td>
            <th className={`${R} text-left`}>UF:</th>
            <td className={V}>{d.rgUf}</td>
          </tr>
          <tr>
            <th className={`${R} text-left`}>Cpf:</th>
            <td className={V} colSpan={3}>{d.cpf}</td>
            <th className={`${R} text-left`}>Raça/Cor:</th>
            <td className={V} colSpan={3}>{d.raca}</td>
          </tr>
          <tr>
            <th className={`${R} text-left`}>Título eleitoral:</th>
            <td className={V}>{d.titulo}</td>
            <th className={`${R} text-left`}>Zona:</th>
            <td className={V}>{d.zona}</td>
            <th className={`${R} text-left`}>Seção:</th>
            <td className={V} colSpan={3}>{d.secao}</td>
          </tr>
          <tr>
            <th className={`${R} text-left`}>Cnh:</th>
            <td className={V}>{d.cnh}</td>
            <th className={`${R} text-left`}>Emissão:</th>
            <td className={V}>{d.cnhEmissao}</td>
            <th className={`${R} text-left`}>Vencimento:</th>
            <td className={V}>{d.cnhVencimento}</td>
            <th className={`${R} text-left`}>Categ.:</th>
            <td className={V}>{d.cnhCategoria}</td>
          </tr>
          <tr>
            <th className={`${R} text-left`}>Reservista:</th>
            <td className={V} colSpan={3}>{d.reservista}</td>
            <th className={`${R} text-left`}>Categoria:</th>
            <td className={V} colSpan={3}>{d.reservistaCategoria}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-auto pt-8 text-center text-xs">Documento gerado pelo Portal FCT em {d.geradoEm}.</p>
    </article>
  );
}

export type DadosDeclaracao = {
  socioNome: string;
  socioCpf: string;
  razaoSocial: string;
  cnpj: string;
  enderecoEmpresa: string;
  funcionario: string;
  cpf: string;
  cidade: string;
  uf: string;
  data: string;
  /** Imagem da assinatura do sócio; sem ela, sai só a linha para assinar à mão. */
  assinatura?: string | null;
};

export function DeclaracaoBanco({ d }: { d: DadosDeclaracao }) {
  return (
    <article className={FOLHA}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center opacity-10">
        <Emblema largura={480} />
      </div>
      <header className="relative flex items-center justify-center gap-4 border-b-2 border-[#8f1d1f] pb-3">
        <Emblema largura={110} />
        <p className="text-xl leading-tight font-extrabold tracking-wide text-[#1b2a6b]">
          FARMÁCIA DO
          <br />
          TRABALHADOR
        </p>
      </header>
      <div className="relative mt-5 text-[15px] leading-relaxed">
        <h1 className="mb-4 text-xl font-bold">DECLARAÇÃO</h1>
        <p className="mb-4">
          Eu, {d.socioNome}, brasileiro, empresário, inscrito no CPF nº {d.socioCpf}, sócio administrador da empresa {d.razaoSocial}, CNPJ {d.cnpj}, declaro para os devidos fins e a quem interessar possa, que <strong>{d.funcionario}</strong>, brasileiro (a), inscrito no CPF nº <strong>{d.cpf}</strong>, residente e domiciliado em {d.cidade} - {d.uf}, é funcionário (a) de minha empresa, <u>portanto, é necessária a abertura de conta salário junto ao Banco Itaú.</u>
        </p>
        <p className="mb-4">Declaro, ainda que as informações aqui prestadas são exatas e verdadeiras e de minha inteira responsabilidade, sob pena de caracterização do crime tipificado no art. 299 do Código Penal.</p>
        <p>Criciúma, {d.data}</p>
        <div className={`mx-auto w-80 ${d.assinatura ? "mt-8" : "mt-24"}`}>
          {d.assinatura && <Image src={d.assinatura} alt={`Assinatura de ${d.socioNome}`} width={320} height={65} unoptimized className="mx-auto -mb-1 h-auto w-full" />}
          <div className="border-t border-neutral-800 pt-1 text-center text-sm">
            {d.socioNome}
            <br />
            Sócio administrador
          </div>
        </div>
      </div>
      <footer className="relative mt-auto bg-[#8f1d1f] px-4 py-2 text-center text-xs leading-snug font-semibold text-white">
        FARMÁCIAS FCT – FARMÁCIA DO TRABALHADOR
        <br />
        {d.enderecoEmpresa}
        <br />
        CNPJ: {d.cnpj}
      </footer>
    </article>
  );
}
