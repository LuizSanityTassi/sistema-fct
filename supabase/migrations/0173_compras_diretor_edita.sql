-- Compras: quem altera (importa pré-pedidos e notas, busca no Trier, desfaz importação). Administrador, compras e o
-- diretor de compras quando o administrador marcou "pode editar" na tela Compras → Importar (acesso_telas.pode_editar).
-- Pedido do Luiz (24/11/2026): "libera 100% pra ele a aba compras". Só troca as regras das tabelas cmp_* e do bucket.

create or replace function private.pode_escrever_compras()
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select private.sou_admin() or private.tem_papel('compras')
      or exists (
        select 1
          from public.profiles p
          join public.acesso_telas a on a.user_id = p.id
         where p.id = auth.uid() and p.ativo and p.papel::text = 'diretor_compras'
           and a.rota = '/compras/importar' and a.pode_editar
      );
$$;
revoke all on function private.pode_escrever_compras() from public, anon;
grant execute on function private.pode_escrever_compras() to authenticated;

-- a tela pergunta se mostra os botões de importar
create or replace function public.compras_pode_escrever()
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select private.pode_escrever_compras();
$$;
revoke all on function public.compras_pode_escrever() from public, anon;
grant execute on function public.compras_pode_escrever() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['cmp_importacoes', 'cmp_notas', 'cmp_nota_itens', 'cmp_pedidos', 'cmp_pedido_itens'] loop
    -- leitura: quem lê compras (o diretor em consulta pelo tem_papel) e quem escreve (o insert devolve a linha)
    execute format('alter policy %1$s_sel on public.%1$s using ((select private.sou_admin()) or (select private.tem_papel(''compras'')) or (select private.pode_escrever_compras()))', t);
    execute format('alter policy %1$s_ins on public.%1$s with check ((select private.pode_escrever_compras()))', t);
    execute format('alter policy %1$s_upd on public.%1$s using ((select private.pode_escrever_compras())) with check ((select private.pode_escrever_compras()))', t);
    execute format('alter policy %1$s_del on public.%1$s using ((select private.pode_escrever_compras()))', t);
  end loop;
end $$;

alter policy compras_arquivo_select on storage.objects
  using (bucket_id = 'compras' and ((select private.sou_admin()) or (select private.tem_papel('compras')) or (select private.pode_escrever_compras())));
alter policy compras_arquivo_insert on storage.objects
  with check (bucket_id = 'compras' and (select private.pode_escrever_compras()));
alter policy compras_arquivo_delete on storage.objects
  using (bucket_id = 'compras' and (select private.pode_escrever_compras()));
