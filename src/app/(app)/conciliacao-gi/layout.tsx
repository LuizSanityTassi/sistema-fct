import { notFound } from "next/navigation";

// Conciliação GI desligada em 19/11/2026 (pedido do Luiz: "não vamos usar mais"). Saiu do menu e nenhuma tela abre,
// nem pelo endereço. O código e os dados (tabelas gi_conc_* e arquivos) ficam guardados: para voltar, apagar este
// layout, devolver o grupo em src/lib/nav.ts e liberar a rota em src/app/api/conciliacao-gi/arquivo/[id]/route.ts.
export default function ConciliacaoGiDesligada(): never {
  notFound();
}
