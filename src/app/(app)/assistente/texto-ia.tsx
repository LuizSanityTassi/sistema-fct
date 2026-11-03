import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Resposta da IA em markdown. Só deixa link para dentro do sistema e não mostra imagem: um texto malicioso num dado
 * consultado não pode levar a pessoa para fora nem vazar dados por uma URL.
 */
export function TextoIa({ texto }: { texto: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      disallowedElements={["img"]}
      unwrapDisallowed
      components={{
        a: ({ href, children }) => (href?.startsWith("/") && !href.startsWith("//") ? <Link href={href} className="font-medium underline underline-offset-2">{children}</Link> : <>{children}</>),
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
        h1: ({ children }) => <p className="mt-3 mb-1 font-semibold first:mt-0">{children}</p>,
        h2: ({ children }) => <p className="mt-3 mb-1 font-semibold first:mt-0">{children}</p>,
        h3: ({ children }) => <p className="mt-3 mb-1 font-semibold first:mt-0">{children}</p>,
        code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{children}</code>,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-lg border">
            <table className="w-full text-xs tabular-nums sm:text-sm">{children}</table>
          </div>
        ),
        th: ({ children, style }) => <th style={style} className="border-b bg-muted/50 px-2.5 py-1.5 text-left font-medium whitespace-nowrap">{children}</th>,
        td: ({ children, style }) => <td style={style} className="border-b px-2.5 py-1.5 whitespace-nowrap">{children}</td>,
      }}
    >
      {texto}
    </Markdown>
  );
}
