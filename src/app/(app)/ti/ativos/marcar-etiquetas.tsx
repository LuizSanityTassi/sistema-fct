"use client";

/** Marca ou desmarca todos os equipamentos da página para imprimir as etiquetas juntas. */
export function MarcarTodosEtiquetas() {
  return (
    <input
      type="checkbox"
      aria-label="Marcar todos desta página para etiqueta"
      title="Marcar todos desta página"
      className="size-4 accent-fct-tinta"
      onChange={(e) => {
        for (const c of document.querySelectorAll<HTMLInputElement>('input[name="id"][form="form-etiquetas"]')) c.checked = e.currentTarget.checked;
      }}
    />
  );
}
