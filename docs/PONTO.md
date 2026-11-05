# Módulo Ponto (controle de jornada)

Integrado ao RH: o funcionário é o mesmo cadastro de `employees` (filial, departamento, matrícula, cargo, admissão,
desligamento). Nada do RH é duplicado; o ponto só guarda jornada, marcações e o que deriva delas.

## Hierarquia e acesso

Empresa → filial → departamento → funcionário (as mesmas tabelas do RH). Quem vê o quê é decidido no banco (RLS):

| Papel | Vê | Faz |
|---|---|---|
| Funcionário (usuário ligado a um cadastro em `profiles.employee_id`) | o próprio ponto | registra, pede ajuste, vê espelho e banco |
| Gerente | a(s) filial(is) dele | equipe, jornada do funcionário, escalas, ausências, PIN, aprova ajustes |
| Coordenador | as filiais da regional | só consulta |
| RH / Administrador | tudo | modelos de jornada, feriados, jornada padrão da filial, banco manual, fechamento |
| Administrador | tudo | reabre mês fechado e decide ajuste em mês fechado (com motivo) |

Funções de acesso (`private`): `pode_ponto_filial`, `pode_ver_ponto_func`, `gere_ponto_func`, `admin_ou_rh`,
`meu_employee`. `employees` continua restrita (admin, RH, gerente); o ponto lê o funcionário pela função
`ponto_equipe`, que devolve só nome, matrícula, cargo, filial, departamento e situação (nunca CPF, salário ou contato).

## Tabelas (migrações 0069–0072)

| Tabela | Para quê |
|---|---|
| `ponto_jornadas` + `ponto_jornada_dias` | modelo de jornada: semanal (dom…sáb) ou ciclo (12x36, 6x2…) a partir de uma data; tolerância |
| `ponto_vinculos` | jornada de cada funcionário por período (trocar = encerra a anterior; histórico fica) |
| `ponto_config_filial` | jornada padrão da filial, a partir de quando vale (`inicio_controle`), exigir localização |
| `ponto_programacao` | escala do dia (troca de horário, folga, plantão) — vale no lugar da jornada |
| `ponto_feriados` | nacionais (sem filial) e da filial |
| `ponto_ausencias` | férias, afastamento, atestado, licença, abono, folga compensatória |
| `ponto_marcacoes` | cada registro: momento, tipo, método, origem, aparelho, IP, localização, NSR, quem registrou |
| `ponto_ajustes` | pedido de correção (incluir / corrigir / anular) com motivo; pendente → aprovado/recusado/cancelado |
| `ponto_fechamentos` | mês fechado por filial, com resumo; reabertura com motivo |
| `ponto_banco_movimentos` | saldo de mês fechado, compensação, pagamento, ajuste, saldo inicial |
| `ponto_pins` | PIN do relógio (só o hash bcrypt; ninguém lê a tabela) |

Regras garantidas no banco:

- marcação **nunca é apagada nem reescrita**: correção = marcação nova (origem `ajuste`) + a antiga **anulada** (quem,
  quando, motivo). Marcação só entra pelas funções `ponto_registrar` e `ponto_decidir_ajuste`;
- **mês fechado trava** marcações, ajustes, escalas, ausências e banco da filial; a liberação do administrador vale só
  dentro da função que a pediu;
- ninguém decide o próprio pedido (só o administrador); recusar exige motivo;
- PIN: 5 erros bloqueiam por 15 minutos;
- tudo vai para `audit_logs` por trigger (antes e depois, com o motivo quando houver).

## Métodos de registro

A marcação já guarda o método (`web`, `celular`, `relogio_pin`, `qrcode`, `biometria`, `facial`, `importacao`,
`ajuste`), o aparelho, o IP e a localização. Hoje funcionam:

- **Meu ponto** (`/ponto/registrar`): o funcionário com usuário no sistema registra pelo computador ou celular
  (localização opcional; obrigatória no celular se a filial exigir);
- **Relógio da filial** (`/ponto/relogio`): tela aberta no computador/tablet da loja; matrícula + PIN, ou matrícula +
  dedo (`biometria`) quando a pessoa tem digital cadastrada e o computador tem leitor ativado.

QR Code e reconhecimento facial entram como novos valores de `p_metodo` em `ponto_registrar`, sem mudar tabelas.

### Digital no relógio

A biblioteca do leitor (Hamster DX) só roda no Windows da loja, então a comparação do dedo não acontece no servidor. Para o
servidor não ter de confiar no navegador:

1. O leitor se ativa sozinho ao abrir o relógio (`ponto_leitor_garantir`): nasce um segredo que fica cifrado no banco e, no
   computador, protegido pelo Windows (`leitor.dat`, DPAPI). Cada computador tem o seu. Administrador, TI e RH ativam em qualquer
   filial; o login do relógio, o gerente e o coordenador só no primeiro computador da filial. Leitor desativado só volta por um dos
   três primeiros.
2. A tela do relógio fica esperando o dedo no programa do leitor (`Desktop\agente-digital`, POST `/esperar`), sem passar pelo
   servidor. Só quando há dedo lido, `ponto_digital_iniciar_filial` devolve as digitais da filial do leitor, cada uma cifrada
   com uma chave que depende do segredo, da leitura e do dono da digital. O navegador só repassa: se trocar o dono de uma
   digital, o programa não consegue abrir, e não sai assinatura em nome de outra pessoa.
3. O programa compara com todas (POST `/identificar`). Se bater com duas pessoas, recusa. Se bater com uma, assina
   `desafio|nonce|employee|dedo`. `ponto_digital_identificar` confere a assinatura e prende a leitura àquela pessoa; o relógio
   mostra o nome para a pessoa escolher o tipo.
4. `ponto_registrar_digital` confere de novo, usa a leitura uma vez só (vence em 3 minutos) e grava a marcação. Assinatura
   errada fica em `audit_logs`.

A matrícula com o PIN continua valendo: é a saída quando o leitor falha ou a pessoa não tem digital. O portal só usa o dedo com
o programa na versão 2 ou maior (`versao` em GET `/status`); com a versão antiga, o relógio abre no teclado.

### Batidas normais e extras

As 4 batidas (1ª entrada, 1ª saída, 2ª entrada, 2ª saída) são livres. Os códigos no banco continuam `entrada`,
`intervalo_inicio`, `intervalo_fim` e `saida`; só os nomes na tela mudaram.

Entrada e saída extra (`entrada_extra`, `saida_extra`) dependem de liberação do RH/DP:

1. Alguém abre um chamado de RH/DP do tipo "Liberação de entrada/saída extra" (`subcategoria = liberacao_extra`).
2. O RH/DP clica em "Liberar extra" no funcionário (ficha, aba Ponto, ou `/ponto/equipe`), escolhe o dia e o chamado. O chamado
   recebe um comentário e continua aberto até o RH/DP resolver: um pedido pode valer para mais de uma pessoa.
3. No dia liberado, o relógio mostra "Entrada extra". Depois dela, só "Saída extra". Cada liberação vale uma entrada extra.

`private.ponto_tipo_valido` confere isso nas duas formas de bater o ponto (PIN e dedo). Incluir extra por ajuste é só do RH/DP.

## Cálculo (`src/lib/ponto/calculo.ts`)

Funções puras usadas pelo espelho, banco, painel, relatórios e fechamento (as mesmas regras em todo lugar):

- previsto do dia: escala do dia > feriado > jornada (vínculo ou padrão da filial); ausência por cima de tudo;
  antes do início do controle / da admissão e depois do desligamento não conta;
- marcações agrupadas por turno (turno da noite que passa da meia-noite fica no dia da entrada);
- trabalhado = soma dos pares; tolerância diária (padrão 10 min, CLT art. 58 §1º);
- extras (100% em folga/feriado), débito, falta, atraso e saída antecipada (> 5 min), adicional noturno (22h–5h);
- inconsistências: marcação faltando, sem intervalo / intervalo < 1h acima de 6h, mais de 10h, interjornada < 11h,
  sequência fora de ordem, trabalho sem jornada.

Testes: `teste_ponto.mjs` (jiti) cobre 38 casos.

## Banco de horas

Saldo = lançamentos gravados (saldo de cada mês fechado, compensações, pagamentos, ajustes, saldo inicial) + saldo
calculado dos meses ainda abertos. No fechamento, o saldo do mês de cada funcionário vira um lançamento; reabrir
apaga esses lançamentos e o mês volta a ser calculado.

## Telas

| Rota | O quê |
|---|---|
| `/ponto` | painel: agora (trabalhando, intervalo, não marcou, ausentes), mês, saldo por dia, rankings, alertas |
| `/ponto/registrar` | Meu ponto: relógio, botão do próximo registro, confirmação "Entrada registrada às 08:02", hoje, 7 dias, PIN |
| `/ponto/relogio` | relógio da filial (quiosque) |
| `/ponto/espelho` | espelho mensal com totais, ocorrências, ajuste por dia; Excel, CSV, PDF com assinatura |
| `/ponto/banco` | banco da equipe e extrato por funcionário; lançamentos manuais (RH) |
| `/ponto/ajustes` | pedir, aprovar/recusar, cancelar; histórico |
| `/ponto/equipe` | jornada de cada um (em lote), PIN, situação agora |
| `/ponto/escalas` | grade do mês (funcionário × dia) e programação de escala por período |
| `/ponto/jornadas` | modelos de jornada, jornada padrão por filial, feriados |
| `/ponto/ausencias` | férias, atestados etc. |
| `/ponto/relatorios` | horas, espelho, extras, faltas, inconsistências, banco, marcações |
| `/ponto/fechamento` | inconsistências por filial, fechar, reabrir |
| `/ponto/auditoria` | histórico de alterações (função `ponto_auditoria`) |
| ficha do RH → aba Ponto | jornada, PIN, mês e banco do funcionário |

Pendências no sino: ajustes para decidir, pedido recusado, mês anterior sem fechamento.

## Começar a usar

1. Modelos de jornada → criar os modelos da empresa (ex.: comercial 44h, 6x1, 12x36).
2. Jornada padrão por filial (com a data de início) **ou** jornada por funcionário em "Equipe e jornadas".
3. Cadastrar o PIN de quem vai usar o relógio da loja (o próprio funcionário pode, em "Meu ponto").
4. Abrir `/ponto/relogio` no computador da loja (login do gerente) em tela cheia.
5. Quem tem usuário no sistema: ligar o usuário ao cadastro (Administração → Usuários) para usar "Meu ponto".
