import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sistema interno 100% autenticado: toda página lê a sessão (cookies), então
  // usamos renderização dinâmica padrão em vez de pré-renderização com Cache Components.
  cacheComponents: false,
  partialPrefetching: false,
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
