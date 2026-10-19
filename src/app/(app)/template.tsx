// Cada tela nova entra com um leve deslize (classe .entrada; quem pede menos movimento não vê).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="entrada">{children}</div>;
}
