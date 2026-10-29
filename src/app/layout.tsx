import type { Metadata, Viewport } from "next";
import { Archivo_Black, Geist, Geist_Mono } from "next/font/google";
import { RegistrarApp } from "@/components/layout/app-instalavel";
import { SCRIPT_TEMA } from "@/lib/tema";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// título das páginas: a mesma fonte de destaque do site (farmaciafct.com.br)
const archivoBlack = Archivo_Black({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: { default: "Portal de Gestão FCT", template: "%s · Portal FCT" },
  description: "Sistema interno de gestão — Farmácias FCT",
  // sistema todo em português: o tradutor automático do navegador troca nomes do menu ("Funcionários" vira "/")
  other: { google: "notranslate" },
  // instalado no iPhone ("Adicionar à Tela de Início"): abre em tela cheia, com este nome embaixo do ícone
  appleWebApp: { capable: true, title: "Portal FCT", statusBarStyle: "default" },
};

// cor da barra do celular quando instalado (faixa vermelha da marca)
export const viewport: Viewport = { themeColor: "#c10510" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      translate="no"
      // o script do tema põe a classe .dark antes da hidratação
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${archivoBlack.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <RegistrarApp />
      </body>
    </html>
  );
}
