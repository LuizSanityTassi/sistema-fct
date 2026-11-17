-- 0148 — Papel "Líder de loja" (pedido do Luiz em 17/11/2026): as mesmas permissões do gerente, um nível abaixo dele.
-- Nas regras do banco o líder vale como gerente (private.tem_papel('gerente') responde sim para ele) e também justifica as
-- quebras da loja sem gestor. Ele NÃO conta como "o gerente" da loja onde a hierarquia importa: avaliação da
-- coordenação (coord_gerentes / coord_checklist_carimbar) continua só com gerentes.
-- Compara o papel como texto para não usar o valor novo do enum na mesma transação em que ele é criado.

alter type public.app_role add value if not exists 'lider_loja' after 'gerente';

create or replace function private.tem_papel(variadic papeis app_role[])
 returns boolean
 language sql
 stable security definer
 set search_path to 'private', 'public'
as $function$
  select coalesce((
    select ativo and (
      papel = any (papeis)
      or (papel::text = 'lider_loja' and 'gerente'::app_role = any (papeis))
      or (admin_sistema and 'admin'::app_role = any (papeis))
      or (papel::text = 'diretor_compras' and papeis_leitura && papeis::text[] and current_setting('transaction_read_only') = 'on')
    )
    from public.profiles where id = auth.uid()), false);
$function$;

create or replace function private.pode_justificar_quebra(p_gestor uuid, p_branch uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'private', 'public'
as $function$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.ativo
       and ((p_gestor is not null and p.id = p_gestor)
         or (p_gestor is null and p.papel::text in ('gerente', 'lider_loja')
             and (p.branch_id = p_branch or exists (select 1 from public.user_branch_access u where u.user_id = p.id and u.branch_id = p_branch)))));
$function$;
