-- 0160 — Digital já liberada no relógio da filial (Luiz, 23/11/2026: "quero que já venha com a digital liberada").
-- Antes, o login do relógio (e gerente/coordenador) só ativava o leitor no 1º computador da filial; os outros pediam
-- admin, TI ou RH. Agora o login do relógio da própria filial (aberto pelo link do relógio) ativa o leitor em qualquer
-- computador, sozinho. Para tirar um computador do ar: "Desativar e desconectar" o link da filial.
do $$
declare
  def text;
  de text := 'v_gestor := private.sou_admin() or private.tem_papel(''rh'', ''ti'');';
  para text := 'v_gestor := private.sou_admin() or private.tem_papel(''rh'', ''ti'') or private.relogio_da_filial(p_branch);';
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ponto_leitor_garantir';
  if position(de in def) = 0 then raise exception 'Trecho do ponto_leitor_garantir não encontrado.'; end if;
  execute replace(def, de, para);
end
$$;
