import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sistema interno 100% autenticado: toda página lê a sessão (cookies), então
  // usamos renderização dinâmica padrão em vez de pré-renderização com Cache Components.
  cacheComponents: false,
  partialPrefetching: false,
  experimental: {
    // upload de documentos/ASO via Server Action (bucket aceita até 20 MB)
    serverActions: { bodySizeLimit: "25mb" },
  },
  // Leitores da conciliação (PDF do Trier, planilhas): ficam fora do bundle e são carregados pelo Node em tempo de execução.
  serverExternalPackages: ["pdfjs-dist", "xlsx"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
