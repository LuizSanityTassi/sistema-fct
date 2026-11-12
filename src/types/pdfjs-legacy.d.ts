// A build "legacy" do pdf.js (usada no servidor Node) tem a mesma API da principal.
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export * from "pdfjs-dist";
}
// o worker carregado na mesma thread do servidor (globalThis.pdfjsWorker)
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
