import type { MetadataRoute } from "next";

// Manifesto do aplicativo (PWA): permite "Instalar" / "Adicionar à tela inicial" no celular e no computador.
// Servido em /manifest.webmanifest (app/manifest.webmanifest/route.ts), fora do login (src/proxy.ts), porque o
// navegador busca sem os cookies. É rota comum (não o arquivo app/manifest.ts) para o relógio poder usar o manifesto
// dele (metadata.manifest da página /relogio): cada filial instala o "Relógio <filial>" que abre pelo link.
export function manifestoPortal(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Portal de Gestão FCT",
    short_name: "Portal de Gestão FCT",
    description: "Sistema interno de gestão das Farmácias FCT.",
    lang: "pt-BR",
    start_url: "/portal",
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
