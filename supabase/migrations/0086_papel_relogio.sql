-- Login do relógio de ponto da filial (um por loja): só abre o relógio e bate o ponto com matrícula + PIN.
alter type public.app_role add value if not exists 'relogio';
