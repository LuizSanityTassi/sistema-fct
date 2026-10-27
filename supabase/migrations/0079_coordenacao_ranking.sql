-- Coordenação → Ranking das lojas: média das notas dos checklists no período, por loja (com a regional dela).
-- Só números agregados (sem comentários); quem vê: administrador e coordenadores (todas as regionais).
-- Checklist cancelado não conta. Só cria coisas novas.

create or replace function public.coord_ranking(p_de date, p_ate date)
returns table (
  branch_id uuid, codigo text, nome text, regional text, qtd integer, media numeric,
  ultima_data date, ultima_media numeric, anterior_media numeric, pior_item text, pior_nota numeric
)
language sql
stable
security definer
set search_path = public, private
as $$
  with c as (
    select k.id, k.branch_id, k.data, k.media, k.notas,
           row_number() over (partition by k.branch_id order by k.data desc, k.criado_em desc) as rn
      from public.coord_checklists k
     where k.situacao <> 'cancelado' and k.data between p_de and p_ate
  ),
  itens as (
    select c.branch_id, e ->> 'item' as item, avg((e ->> 'nota')::numeric) as nota
      from c cross join lateral jsonb_array_elements(c.notas) e
     group by 1, 2
  ),
  pior as (
    select distinct on (i.branch_id) i.branch_id, i.item, i.nota from itens i order by i.branch_id, i.nota, i.item
  )
  select b.id, b.codigo, b.nome, b.regional,
         count(c.id)::integer,
         round(avg(c.media), 2),
         max(c.data),
         max(c.media) filter (where c.rn = 1),
         max(c.media) filter (where c.rn = 2),
         p.item,
         round(p.nota, 2)
    from public.branches b
    left join c on c.branch_id = b.id
    left join pior p on p.branch_id = b.id
   where b.ativo and (private.sou_admin() or private.tem_papel('coordenador'))
   group by b.id, p.item, p.nota;
$$;
revoke all on function public.coord_ranking(date, date) from public, anon;
grant execute on function public.coord_ranking(date, date) to authenticated;
