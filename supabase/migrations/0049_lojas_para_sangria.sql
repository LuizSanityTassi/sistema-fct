-- Lojas em que a pessoa pode cadastrar sangria (a mesma regra do banco: administrador e financeiro todas;
-- gerente e colaborador a loja principal e as "outras filiais que ele gerencia"). Só cria uma função.
create or replace function public.lojas_para_sangria()
returns table (id uuid, codigo text, nome text)
language sql
stable
security definer
set search_path = public, private
as $$
  select b.id, b.codigo, b.nome
    from public.branches b
   where b.ativo and private.pode_cadastrar_sangria(b.id)
   order by b.codigo;
$$;
revoke all on function public.lojas_para_sangria() from public, anon;
grant execute on function public.lojas_para_sangria() to authenticated;
