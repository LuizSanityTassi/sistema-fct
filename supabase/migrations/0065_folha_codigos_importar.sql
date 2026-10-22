-- Atualizar os códigos da Domínio pelas planilhas da contabilidade (tela RH → Lançamentos → Configurar): para cada
-- filial, troca as colunas de evento (folha_eventos_filial) e o código da empresa (folha_empresas_dominio) de uma vez —
-- tudo ou nada. Os valores das planilhas nunca entram. Security invoker: o RLS (admin e RH) continua valendo.
-- p_filiais = [{ branch_id, arquivo, codigo_dominio, colunas: [{ coluna, rotulo, codigo, evento_id }] }]

create function public.folha_codigos_dominio_importar(p_filiais jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  f jsonb;
  n integer := 0;
begin
  if not ((select private.sou_admin()) or (select private.tem_papel('rh'))) then
    raise exception 'Só Administrador e RH atualizam os códigos da Domínio.';
  end if;
  for f in select * from jsonb_array_elements(coalesce(p_filiais, '[]'::jsonb)) loop
    if jsonb_array_length(coalesce(f -> 'colunas', '[]'::jsonb)) = 0 then
      raise exception 'Planilha sem colunas de evento (%).', f ->> 'arquivo';
    end if;
    delete from public.folha_eventos_filial where branch_id = (f ->> 'branch_id')::uuid;
    insert into public.folha_eventos_filial (branch_id, coluna, rotulo, codigo, evento_id, arquivo, updated_by)
    select (f ->> 'branch_id')::uuid, (c ->> 'coluna')::smallint, c ->> 'rotulo', (c ->> 'codigo')::integer,
           nullif(c ->> 'evento_id', '')::uuid, f ->> 'arquivo', (select auth.uid())
      from jsonb_array_elements(f -> 'colunas') c;
    if nullif(f ->> 'codigo_dominio', '') is not null then
      insert into public.folha_empresas_dominio (branch_id, codigo_dominio, updated_by)
      values ((f ->> 'branch_id')::uuid, (f ->> 'codigo_dominio')::integer, (select auth.uid()))
      on conflict (branch_id) do update set codigo_dominio = excluded.codigo_dominio, updated_by = excluded.updated_by, updated_at = now();
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.folha_codigos_dominio_importar(jsonb) from public, anon;
grant execute on function public.folha_codigos_dominio_importar(jsonb) to authenticated;
