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
  serverExternalPackages: ["pdfjs-dist", "xlsx", "sql.js"],
  // não anuncia a tecnologia do servidor
  poweredByHeader: false,
  // Cabeçalhos de segurança (auditoria 06/11/2026, BA-04): o portal não pode ser aberto dentro de outro site
  // (clickjacking), o navegador não "adivinha" tipo de arquivo, e o endereço completo não vaza para outros sites.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=()" },
        ],
      },
    ];
  },
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
