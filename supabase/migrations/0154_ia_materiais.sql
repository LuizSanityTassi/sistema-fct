-- 0154 — Materiais de estudo para o Assistente IA (pedido do Luiz, 19/11/2026).
-- Texto dos materiais de gestão financeira (cursos que o Luiz enviou), uma linha por página/slide, para a IA buscar e
-- citar material e página. O conteúdo é carregado direto no banco (não vai para o Git). Todos que usam o assistente
-- leem; ninguém grava pelo app (só carga administrativa).
create table if not exists public.ia_materiais (
  id        bigint generated always as identity primary key,
  chave     text not null check (chave ~ '^[a-z_]{2,40}$'),
  material  text not null check (char_length(material) between 2 and 160),
  pagina    integer not null check (pagina between 1 and 5000),
  texto     text not null check (char_length(texto) between 1 and 20000),
  busca     tsvector generated always as (to_tsvector('portuguese', private.sem_acento(material || ' ' || texto))) stored,
  criado_em timestamptz not null default now(),
  unique (chave, pagina)
);
create index if not exists ia_materiais_busca_idx on public.ia_materiais using gin (busca);

alter table public.ia_materiais enable row level security;
drop policy if exists iamat_sel on public.ia_materiais;
create policy iamat_sel on public.ia_materiais for select to authenticated using (true);
revoke insert, update, delete on public.ia_materiais from anon, authenticated;

-- Busca por palavras (qualquer uma, sem acento, com radical do português), as páginas que mais casam primeiro.
create or replace function public.ia_buscar_materiais(p_busca text, p_chave text default null, p_limite integer default 6)
returns table (chave text, material text, pagina integer, texto text, relevancia real)
language sql
stable
security invoker
set search_path = public, private
as $$
  with q as (
    select nullif(replace(plainto_tsquery('portuguese', private.sem_acento(coalesce(p_busca, '')))::text, '&', '|'), '')::tsquery as q
  )
  select m.chave, m.material, m.pagina, m.texto, ts_rank_cd(m.busca, q.q) as relevancia
    from public.ia_materiais m, q
   where q.q is not null
     and m.busca @@ q.q
     and (p_chave is null or m.chave = p_chave)
   order by ts_rank_cd(m.busca, q.q) desc, m.chave, m.pagina
   limit least(greatest(coalesce(p_limite, 6), 1), 12);
$$;
revoke all on function public.ia_buscar_materiais(text, text, integer) from public, anon;
grant execute on function public.ia_buscar_materiais(text, text, integer) to authenticated;
