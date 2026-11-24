-- Compras: pré-pedidos (Excel "Con_0018" do Trier, um por filial) × espelho das notas de entrada (Rel_0005 do Trier).
-- O cruzamento é por filial + código do produto no Trier: as notas chegam pelas distribuidoras, não pelo laboratório.
-- Leitura e escrita: administrador e compras (o diretor de compras lê, pelas telas que o administrador marcar).
-- Só cria coisas novas.

create table if not exists public.cmp_importacoes (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('pedidos', 'notas')),
  arquivo         text not null check (char_length(arquivo) <= 300),
  resumo          jsonb not null default '{}'::jsonb,
  criado_por      uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_por_nome text,
  criado_em       timestamptz not null default now()
);
create index if not exists cmp_importacoes_idx on public.cmp_importacoes (criado_em desc);

-- notas de entrada do espelho (uma linha por nota: filial + fornecedor + número + série)
create table if not exists public.cmp_notas (
  id                 uuid primary key default gen_random_uuid(),
  filial_codigo      text not null check (char_length(filial_codigo) <= 20),
  branch_id          uuid references public.branches (id),
  fornecedor_codigo  text not null check (char_length(fornecedor_codigo) <= 20),
  fornecedor_nome    text check (char_length(fornecedor_nome) <= 200),
  transferencia      boolean not null default false,          -- fornecedor é outra loja do grupo
  numero             text not null check (char_length(numero) <= 30),
  serie              text not null default '' check (char_length(serie) <= 10),
  data_entrada       date,
  data_emissao       date,
  estoque_atualizado boolean,
  total_mercadorias  numeric(14, 2),
  total_descontos    numeric(14, 2),
  total_nota         numeric(14, 2),
  qtd_itens          integer not null default 0,
  importacao_id      uuid references public.cmp_importacoes (id) on delete set null,
  atualizado_em      timestamptz not null default now(),
  constraint cmp_notas_uk unique (filial_codigo, fornecedor_codigo, numero, serie)
);
create index if not exists cmp_notas_entrada_idx on public.cmp_notas (data_entrada desc);
create index if not exists cmp_notas_filial_idx on public.cmp_notas (filial_codigo, data_entrada) where not transferencia;

create table if not exists public.cmp_nota_itens (
  id             bigint generated always as identity primary key,
  nota_id        uuid not null references public.cmp_notas (id) on delete cascade,
  produto_codigo integer not null,
  produto        text check (char_length(produto) <= 200),
  laboratorio    text check (char_length(laboratorio) <= 120),
  barras_final   text check (char_length(barras_final) <= 20),  -- o espelho traz só os últimos dígitos
  quantidade     numeric(14, 3) not null,
  valor_unitario numeric(14, 4),
  desconto_pct   numeric(7, 2),
  valor_liquido  numeric(14, 4),
  valor_total    numeric(14, 2)
);
create index if not exists cmp_nota_itens_nota_idx on public.cmp_nota_itens (nota_id);
create index if not exists cmp_nota_itens_produto_idx on public.cmp_nota_itens (produto_codigo, nota_id);

-- pré-pedidos (um por filial, com o número do Trier)
create table if not exists public.cmp_pedidos (
  id            uuid primary key default gen_random_uuid(),
  numero        bigint not null,
  filial_codigo text not null check (char_length(filial_codigo) <= 20),
  branch_id     uuid references public.branches (id),
  laboratorio   text check (char_length(laboratorio) <= 120),
  data_pedido   date not null,
  qtd_itens     integer not null default 0,
  qtd_total     numeric(14, 3) not null default 0,
  arquivo       text check (char_length(arquivo) <= 300),
  importacao_id uuid references public.cmp_importacoes (id) on delete set null,
  criado_por    uuid references public.profiles (id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  constraint cmp_pedidos_numero_uk unique (numero)
);
create index if not exists cmp_pedidos_data_idx on public.cmp_pedidos (data_pedido desc);

create table if not exists public.cmp_pedido_itens (
  id             bigint generated always as identity primary key,
  pedido_id      uuid not null references public.cmp_pedidos (id) on delete cascade,
  produto_codigo integer not null,
  produto        text check (char_length(produto) <= 200),
  barras         text check (char_length(barras) <= 20),
  laboratorio    text check (char_length(laboratorio) <= 120),
  quantidade     numeric(14, 3) not null check (quantidade > 0)
);
create index if not exists cmp_pedido_itens_pedido_idx on public.cmp_pedido_itens (pedido_id);
create index if not exists cmp_pedido_itens_produto_idx on public.cmp_pedido_itens (produto_codigo);

-- RLS: administrador e compras (o diretor de compras só lê: tem_papel vale para ele só em consulta)
alter table public.cmp_importacoes enable row level security;
alter table public.cmp_notas enable row level security;
alter table public.cmp_nota_itens enable row level security;
alter table public.cmp_pedidos enable row level security;
alter table public.cmp_pedido_itens enable row level security;
do $$
declare t text;
begin
  foreach t in array array['cmp_importacoes', 'cmp_notas', 'cmp_nota_itens', 'cmp_pedidos', 'cmp_pedido_itens'] loop
    execute format('drop policy if exists %1$s_sel on public.%1$s', t);
    execute format('create policy %1$s_sel on public.%1$s for select to authenticated using ((select private.sou_admin()) or (select private.tem_papel(''compras'')))', t);
    execute format('drop policy if exists %1$s_ins on public.%1$s', t);
    execute format('create policy %1$s_ins on public.%1$s for insert to authenticated with check ((select private.sou_admin()) or (select private.tem_papel(''compras'')))', t);
    execute format('drop policy if exists %1$s_upd on public.%1$s', t);
    execute format('create policy %1$s_upd on public.%1$s for update to authenticated using ((select private.sou_admin()) or (select private.tem_papel(''compras''))) with check ((select private.sou_admin()) or (select private.tem_papel(''compras'')))', t);
    execute format('drop policy if exists %1$s_del on public.%1$s', t);
    execute format('create policy %1$s_del on public.%1$s for delete to authenticated using ((select private.sou_admin()) or (select private.tem_papel(''compras'')))', t);
  end loop;
end $$;

-- Cruzamento item a item. Para cada filial + produto, os pedidos entram em fila (o mais antigo primeiro) e as notas que
-- chegaram do 1º pedido da fila até o prazo de cada um (data do pedido + janela) vão sendo usadas nessa ordem; o que
-- sobra depois do último pedido da fila é "a mais". Transferências entre lojas ficam de fora.
create or replace function public.cmp_cruzamento(
  p_de date,
  p_ate date,
  p_janela integer default 7,
  p_filial text default null,
  p_laboratorio text default null,
  p_pedido uuid default null
)
returns table (
  item_id bigint, pedido_id uuid, numero bigint, filial_codigo text, laboratorio text, data_pedido date,
  produto_codigo integer, produto text, barras text, pedido numeric, recebido numeric, excedente numeric,
  ultima_entrada date, notas text, prazo date
)
language sql
stable
security invoker
set search_path = public
as $$
  with cadeia as (
    select i.id as item_id, p.id as pedido_id, p.numero, p.filial_codigo, p.laboratorio, p.data_pedido,
           i.produto_codigo, i.produto, i.barras, i.quantidade as q,
           coalesce(sum(i.quantidade) over w, 0) - i.quantidade as antes,
           coalesce(sum(i.quantidade) over w, 0) as ate_aqui,
           lead(p.data_pedido) over w as proximo,
           first_value(p.data_pedido) over w as primeiro
      from public.cmp_pedidos p
      join public.cmp_pedido_itens i on i.pedido_id = p.id
     where p.data_pedido between p_de - p_janela and p_ate + p_janela
       and (p_filial is null or p.filial_codigo = p_filial)
    window w as (partition by p.filial_codigo, i.produto_codigo order by p.data_pedido, p.numero, i.id)
  ),
  alvo as (
    select * from cadeia c
     where c.data_pedido between p_de and p_ate
       and (p_laboratorio is null or c.laboratorio = p_laboratorio)
       and (p_pedido is null or c.pedido_id = p_pedido)
  ),
  receb as (
    select a.item_id,
           coalesce(sum(x.quantidade), 0) as r,
           max(x.data_entrada) filter (where x.data_entrada >= a.data_pedido) as ultima,
           string_agg(distinct x.rotulo, ' · ') filter (where x.data_entrada >= a.data_pedido) as notas
      from alvo a
      left join lateral (
        select ni.quantidade, n.data_entrada, 'NF ' || n.numero || ' ' || coalesce(n.fornecedor_nome, '') as rotulo
          from public.cmp_nota_itens ni
          join public.cmp_notas n on n.id = ni.nota_id
         where ni.produto_codigo = a.produto_codigo
           and n.filial_codigo = a.filial_codigo
           and not n.transferencia
           and n.data_entrada between a.primeiro and a.data_pedido + p_janela
      ) x on true
     group by a.item_id
  )
  select a.item_id, a.pedido_id, a.numero, a.filial_codigo, a.laboratorio, a.data_pedido,
         a.produto_codigo, a.produto, a.barras, a.q,
         greatest(0, least(a.q, r.r - a.antes)),
         case when a.proximo is null then greatest(0, r.r - a.ate_aqui) else 0 end,
         r.ultima, r.notas, a.data_pedido + p_janela
    from alvo a
    join receb r on r.item_id = a.item_id;
$$;
revoke all on function public.cmp_cruzamento(date, date, integer, text, text, uuid) from public, anon;
grant execute on function public.cmp_cruzamento(date, date, integer, text, text, uuid) to authenticated;

-- Resumo por pré-pedido (a lista da tela), com a situação:
-- completo · a mais (veio mais do que o pedido em algum item) · aguardando (prazo aberto) · faltou (prazo vencido)
create or replace function public.cmp_pedidos_resumo(
  p_de date,
  p_ate date,
  p_janela integer default 7,
  p_filial text default null,
  p_laboratorio text default null,
  p_hoje date default current_date
)
returns table (
  pedido_id uuid, numero bigint, filial_codigo text, laboratorio text, data_pedido date, prazo date,
  itens bigint, qtd_pedida numeric, qtd_recebida numeric, qtd_excedente numeric,
  itens_completos bigint, itens_parciais bigint, itens_nao_chegaram bigint, itens_a_mais bigint,
  ultima_entrada date, situacao text
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.pedido_id, c.numero, c.filial_codigo, c.laboratorio, c.data_pedido, max(c.prazo),
         count(*), sum(c.pedido), sum(c.recebido), sum(c.excedente),
         count(*) filter (where c.recebido >= c.pedido),
         count(*) filter (where c.recebido > 0 and c.recebido < c.pedido),
         count(*) filter (where c.recebido = 0),
         count(*) filter (where c.excedente > 0),
         max(c.ultima_entrada),
         case
           when sum(c.recebido) >= sum(c.pedido) and sum(c.excedente) = 0 then 'completo'
           when sum(c.excedente) > 0 and sum(c.recebido) >= sum(c.pedido) then 'a_mais'
           when max(c.prazo) >= p_hoje then 'aguardando'
           else 'faltou'
         end
    from public.cmp_cruzamento(p_de, p_ate, p_janela, p_filial, p_laboratorio, null) c
   group by c.pedido_id, c.numero, c.filial_codigo, c.laboratorio, c.data_pedido;
$$;
revoke all on function public.cmp_pedidos_resumo(date, date, integer, text, text, date) from public, anon;
grant execute on function public.cmp_pedidos_resumo(date, date, integer, text, text, date) to authenticated;

-- Bucket privado para o PDF do espelho (passa de 4,5 MB, o limite da Vercel: vai direto do navegador para o Storage)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras', 'compras', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists compras_arquivo_select on storage.objects;
create policy compras_arquivo_select on storage.objects for select to authenticated
  using (bucket_id = 'compras' and ((select private.sou_admin()) or (select private.tem_papel('compras'))));
drop policy if exists compras_arquivo_insert on storage.objects;
create policy compras_arquivo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'compras' and ((select private.sou_admin()) or (select private.tem_papel('compras'))));
drop policy if exists compras_arquivo_delete on storage.objects;
create policy compras_arquivo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'compras' and ((select private.sou_admin()) or (select private.tem_papel('compras'))));
