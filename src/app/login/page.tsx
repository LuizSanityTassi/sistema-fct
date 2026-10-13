import { LoginForm } from "./login-form";

const AVISOS: Record<string, string> = {
  inativo: "Seu acesso foi desativado. Fale com o administrador do sistema.",
  link_invalido: "O link usado é inválido ou expirou. Entre com sua senha ou peça um novo link.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const erro = typeof sp.erro === "string" ? sp.erro : undefined;
  return <LoginForm aviso={erro ? AVISOS[erro] : undefined} />;
}
