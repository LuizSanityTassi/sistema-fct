// QR Code das etiquetas de patrimônio (só servidor). Aponta para a ficha do equipamento no sistema.
import { headers } from "next/headers";
import QRCode from "qrcode";

/** Endereço do sistema que está atendendo (produção, preview ou local), para o link do QR. */
export async function origemDoSistema() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "portal.farmaciafct.com.br";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const linkDoAtivo = (origem: string, id: string) => `${origem}/ti/ativos/${id}`;

/** SVG do QR (sem margem extra; correção média, aguenta etiqueta um pouco riscada). */
export function svgQr(texto: string) {
  return QRCode.toString(texto, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0b1f3a", light: "#ffffff" } });
}
