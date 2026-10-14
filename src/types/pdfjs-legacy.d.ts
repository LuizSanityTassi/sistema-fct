// A build "legacy" do pdf.js (usada no servidor Node) tem a mesma API da principal.
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export * from "pdfjs-dist";
}
