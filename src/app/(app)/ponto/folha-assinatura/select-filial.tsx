"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ComponentProps } from "react";
import { SelectNativo } from "@/components/form/campo";

/**
 * Seletor de filial que recarrega a lista de colaboradores ao trocar (o formulário em si vai para a impressão).
 * Leva junto as datas já digitadas para não perdê-las.
 */
export function SelectFilial({ rota, ...props }: ComponentProps<"select"> & { rota: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <SelectNativo
      {...props}
      disabled={pendente || props.disabled}
      onChange={(e) => {
        const form = e.currentTarget.form;
        const qs = new URLSearchParams({ filial: e.currentTarget.value });
        for (const nome of ["de", "ate"]) {
          const v = (form?.elements.namedItem(nome) as HTMLInputElement | null)?.value;
          if (v) qs.set(nome, v);
        }
        iniciar(() => router.replace(`${rota}?${qs}`));
      }}
    />
  );
}
