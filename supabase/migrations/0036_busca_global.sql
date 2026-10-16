-- 0036 — Busca global (Ctrl+K): uma chamada procura em funcionários, filiais, chamados, equipamentos de TI,
-- pendências da conciliação, caixas e usuários. SECURITY INVOKER: cada parte respeita o RLS de quem busca
-- (quem não vê funcionários não acha funcionário). Sem acento e sem diferença de maiúsculas; todas as palavras
-- digitadas precisam aparecer. Número de 1–2 dígitos só casa código exato (filial F005, chamado #5, matrícula).
-- CPF só serve de chave para admin/RH e nunca é devolvido.
-- ADITIVA: três funções novas.

create or replace function private.sem_acento(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(translate(coalesce(p, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'));
$$;

-- todas as palavras (já sem acento) aparecem no texto
create or replace function private.tem_todas(p_alvo text, p_palavras text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select not exists (
    select 1 from unnest(p_palavras) w
     where w <> '' and position(w in private.sem_acento(p_alvo)) = 0
  );
$$;

revoke all on function private.sem_acento(text) from public, anon;
revoke all on function private.tem_todas(text, text[]) from public, anon;
grant execute on function private.sem_acento(text) to authenticated;
grant execute on function private.tem_todas(text, text[]) to authenticated;

create or replace function public.busca_global(p_q text, p_limite integer default 6)
returns table (tipo text, id text, titulo text, detalhe text, extra text, situacao text, valor numeric, data date)
language plpgsql
stable
security invoker
set search_path = public, private
as $$
declare
  v_q   text := btrim(regexp_replace(private.sem_acento(left(coalesce(p_q, ''), 80)), '\s+', ' ', 'g'));
  v_pal text[];
  v_dig text := regexp_replace(left(coalesce(p_q, ''), 80), '\D', '', 'g');
  v_lim integer := least(greatest(coalesce(p_limite, 6), 1), 20);
  v_num bigint;      -- a busca é só um número (#123, 4667, 301)
  v_fil text;        -- número curto vira código de filial (301 → F301)
  v_rh  boolean := private.sou_admin() or private.tem_papel('rh');
  v_txt boolean;     -- procura por texto (número de 1–2 dígitos só casa código exato)
begin
  if char_length(v_q) < 2 and v_q !~ '^\d$' then
    return;
  end if;
  v_pal := string_to_array(v_q, ' ');
  v_txt := v_q !~ '^#?\d{1,2}$';
  if v_q ~ '^#?\d{1,12}$' then
    v_num := v_dig::bigint;
  end if;
  if v_q ~ '^\d{1,3}$' then
    v_fil := 'F' || lpad(v_dig, 3, '0');
  end if;

  -- funcionários (nome, matrícula; CPF completo só para admin/RH)
  return query
  select 'funcionario'::text, e.id::text, e.nome,
         concat_ws(' · ', 'Mat. ' || e.matricula, e.cargo, b.codigo), null::text,
         e.status::text, null::numeric, null::date
    from employees e
    left join branches b on b.id = e.branch_id
   where (v_txt and private.tem_todas(e.nome, v_pal))
      or (v_num is not null and e.matricula = v_dig)
      or (v_rh and char_length(v_dig) = 11 and regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = v_dig)
   order by (e.status = 'desligado'), (position(v_q in private.sem_acento(e.nome)) = 1) desc, e.nome
   limit v_lim;

  -- filiais (código, nome, cidade, razão social, CNPJ)
  return query
  select 'filial'::text, b.id::text, b.codigo || ' · ' || b.nome,
         concat_ws(' · ', nullif(concat_ws('/', b.cidade, b.estado), ''), b.regional, b.cnpj), null::text,
         case when b.ativo then 'ativa' else 'inativa' end, null::numeric, null::date
    from branches b
   where (v_txt and private.tem_todas(concat_ws(' ', b.codigo, b.nome, b.cidade, b.razao_social), v_pal))
      or (v_fil is not null and b.codigo = v_fil)
      or (char_length(v_dig) >= 8 and regexp_replace(coalesce(b.cnpj, ''), '\D', '', 'g') like v_dig || '%')
   order by (b.codigo = v_fil) desc nulls last, b.ativo desc, b.codigo
   limit v_lim;

  -- chamados (número ou título)
  return query
  select 'chamado'::text, t.id::text, '#' || t.numero || ' ' || t.titulo,
         b.codigo, t.categoria::text,
         t.status::text, null::numeric, (t.created_at at time zone 'America/Sao_Paulo')::date
    from tickets t
    left join branches b on b.id = t.branch_id
   where (v_num is not null and t.numero = v_num)
      or (v_txt and private.tem_todas(t.titulo, v_pal))
   order by (t.numero = v_num) desc nulls last, t.created_at desc
   limit v_lim;

  -- equipamentos de TI (patrimônio, descrição, nº de série, hostname, IP, AnyDesk, setor)
  return query
  select 'ativo'::text, a.id::text, concat_ws(' · ', a.patrimonio, a.descricao),
         concat_ws(' · ', b.codigo, a.setor, a.hostname), a.tipo,
         a.status::text, null::numeric, null::date
    from it_assets a
    left join branches b on b.id = a.branch_id
   where a.ativo and v_txt
     and private.tem_todas(concat_ws(' ', a.patrimonio, a.descricao, a.numero_serie, a.hostname, a.ip, a.anydesk, a.setor, a.tipo), v_pal)
   order by a.patrimonio nulls last, a.descricao
   limit v_lim;

  -- pendências da conciliação (beneficiário, documento, CNPJ)
  return query
  select 'pendencia'::text, p.chave, coalesce(p.beneficiario, p.documento, p.chave),
         concat_ws(' · ', 'F' || lpad(p.filial::text, 3, '0'), p.documento), p.problema,
         p.status::text, p.valor, p.vencimento
    from conc_pendencias p
   where (v_txt and private.tem_todas(concat_ws(' ', p.beneficiario, p.documento), v_pal))
      or (char_length(v_dig) >= 8 and regexp_replace(coalesce(p.cnpj, ''), '\D', '', 'g') like v_dig || '%')
   order by (p.status in ('pendente', 'em_analise')) desc, p.vencimento desc nulls last
   limit v_lim;

  -- caixas (número do caixa; pelo nome do operador, só os que tiveram quebra)
  return query
  select 'caixa'::text, c.id::text,
         coalesce('Caixa ' || c.numero_caixa || ' · ', 'Quebra manual · ') || coalesce(c.nome_operador, 'operador ' || c.cod_operador, '—'),
         b.codigo, c.classe,
         c.andamento::text, c.diferenca, c.dia
    from caixa_diferencas c
    left join branches b on b.id = c.branch_id
   where (v_num is not null and c.numero_caixa = v_num)
      or (v_txt and c.classe = 'quebra' and private.tem_todas(c.nome_operador, v_pal))
   order by (c.numero_caixa = v_num) desc nulls last, c.dia desc
   limit v_lim;

  -- usuários do sistema (só administrador)
  if private.sou_admin() then
    return query
    select 'usuario'::text, u.id::text, u.nome, u.email, u.papel::text,
           case when u.ativo then 'ativo' else 'inativo' end, null::numeric, null::date
      from profiles u
     where v_txt and private.tem_todas(concat_ws(' ', u.nome, u.email), v_pal)
     order by u.ativo desc, u.nome
     limit v_lim;
  end if;
end;
$$;

revoke all on function public.busca_global(text, integer) from public, anon;
grant execute on function public.busca_global(text, integer) to authenticated;
