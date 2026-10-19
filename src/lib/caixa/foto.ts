// Fotos tiradas no celular (12 MP, 3–6 MB) ficam leves antes de subir: lado maior até 1800 px, JPEG 82%.
// Dá ~300–600 KB, legível para cupom e comprovante, e não pesa no 4G da loja. PDF e imagem pequena passam direto.
// Só no navegador (usa canvas).

const LADO_MAX = 1800;
const QUALIDADE = 0.82;
const REDUZIR_ACIMA_DE = 1_200_000;

export async function reduzirFoto(arquivo: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/i.test(arquivo.type) || arquivo.size < REDUZIR_ACIMA_DE) return arquivo;
  try {
    // "from-image" respeita a orientação da câmera (foto em pé continua em pé)
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    ctx.fillStyle = "#ffffff"; // PNG com transparência não vira fundo preto no JPEG
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALIDADE));
    if (!blob || blob.size >= arquivo.size) return arquivo;
    const nome = `${arquivo.name.replace(/\.[a-z0-9]+$/i, "") || "foto"}.jpg`;
    return new File([blob], nome, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return arquivo; // navegador antigo: sobe a original (o limite de 20 MB continua valendo)
  }
}

/** Nome legível para a foto tirada na hora (a câmera manda "image.jpg" ou um número). */
export function nomeFotoCupom(agora = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `foto-${p(agora.getDate())}-${p(agora.getMonth() + 1)}-${p(agora.getHours())}h${p(agora.getMinutes())}.jpg`;
}
