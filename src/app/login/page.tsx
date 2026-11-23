import { LoginForm } from "./login-form";

const AVISOS: Record<string, string> = {
  inativo: "Seu acesso foi desativado. Fale com o administrador do sistema.",
  link_invalido: "O link usado é inválido ou expirou. Entre com sua senha ou peça um novo link.",
  link_relogio: "Este link do relógio não vale mais (foi desativado ou trocado). Peça um novo ao administrador.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const erro = typeof sp.erro === "string" ? sp.erro : undefined;
  const voltar = typeof sp.voltar === "string" ? sp.voltar.slice(0, 500) : undefined;
  return <LoginForm aviso={erro ? AVISOS[erro] : undefined} voltar={voltar} />;
}
