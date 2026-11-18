-- 0153 — Escala 5x2 no período da folha e escala que segue até ser alterada.
--   • inicio: 1º dia do período. As opções novas vão do dia 21 do mês anterior ao dia 20 do mês (competência = mês do
--     dia 20, como a folha e a quebra de caixa). Nulo = opção antiga, do mês civil (continua aparecendo igual).
--   • continua: a escala oficial segue valendo nos próximos períodos (repetindo as semanas dela) até outra ser
--     publicada para a filial. Pode ser ligada ao publicar e desligada depois ("parar de seguir").
alter table public.esc_simulacoes add column if not exists inicio date;
alter table public.esc_simulacoes add column if not exists continua boolean not null default false;

create or replace function private.esc_simulacao_regras()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  quer_continua boolean;
begin
  if tg_op = 'INSERT' then
    if new.situacao <> 'rascunho' then
      raise exception 'A opção nasce como rascunho.';
    end if;
    new.criado_por := coalesce(auth.uid(), new.criado_por);
    new.criado_em := now();
    new.atualizado_em := now();
    return new;
  end if;
  -- escala oficial (ou substituída) não muda: só passa de oficial para substituída quando outra é publicada,
  -- ou liga/desliga o "segue até ser alterada"
  if old.situacao <> 'rascunho' then
    if old.situacao = 'oficial' and new.situacao = 'substituida' then
      new := old;
      new.situacao := 'substituida';
      new.atualizado_em := now();
      return new;
    end if;
    if old.situacao = 'oficial' and new.situacao = 'oficial' and new.continua is distinct from old.continua then
      quer_continua := new.continua;
      new := old;
      new.continua := quer_continua;
      new.atualizado_em := now();
      return new;
    end if;
    raise exception 'Escala oficial não pode ser alterada. Gere uma nova opção e publique.';
  end if;
  if new.situacao = 'substituida' then
    raise exception 'Só uma escala oficial pode ser substituída.';
  end if;
  if new.situacao = 'oficial' then
    if new.analise_pendente then
      raise exception 'Atualize as pendências antes de publicar.';
    end if;
    if jsonb_array_length(coalesce(new.alertas, '[]'::jsonb)) > 0 then
      raise exception 'Resolva as pendências da auditoria antes de publicar a escala oficial.';
    end if;
    new.publicado_por := auth.uid();
    new.publicado_em := now();
  end if;
  -- o que identifica a opção não muda
  new.lote := old.lote;
  new.branch_id := old.branch_id;
  new.opcao := old.opcao;
  new.ano := old.ano;
  new.mes := old.mes;
  new.inicio := old.inicio;
  new.jornada_semanal := old.jornada_semanal;
  new.folgas_permitidas := old.folgas_permitidas;
  new.config := old.config;
  new.criado_por := old.criado_por;
  new.criado_em := old.criado_em;
  new.atualizado_em := now();
  return new;
end;
$$;
