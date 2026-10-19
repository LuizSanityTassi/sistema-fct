import type { MetadataRoute } from "next";

// Manifesto do aplicativo (PWA): permite "Instalar" / "Adicionar à tela inicial" no celular e no computador.
// Fica em /manifest.webmanifest, fora do login (src/proxy.ts), porque o navegador busca sem os cookies.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Sistema FCT",
    short_name: "Sistema FCT",
    description: "Sistema interno de gestão das Farmácias FCT.",
    lang: "pt-BR",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#fbf9f7",
    theme_color: "#c10510",
    icons: [
      { src: "/app/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // atalhos ao segurar o ícone (Android) ou no menu do app (computador)
    shortcuts: [
      { name: "Quebras de caixa", short_name: "Quebras", url: "/caixa", icons: [{ src: "/app/icone-192.png", sizes: "192x192" }] },
      { name: "Central de pendências", short_name: "Pendências", url: "/pendencias", icons: [{ src: "/app/icone-192.png", sizes: "192x192" }] },
      { name: "Abrir chamado", short_name: "Chamado", url: "/chamados/novo", icons: [{ src: "/app/icone-192.png", sizes: "192x192" }] },
    ],
  };
}
