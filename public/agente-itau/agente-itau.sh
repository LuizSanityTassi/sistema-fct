#!/usr/bin/env bash
# Agente FCT (Linux): manda para o Sistema FCT (Conciliação) os retornos de DDA que o cliente SFTP do Itaú salva neste
# servidor. Roda pelo cron (instale com instalar-linux.sh). Só LÊ os arquivos: nunca apaga, move nem altera nada, e não
# conversa com o banco (quem baixa do Itaú continua sendo o programa de sempre; um 2º cliente na caixa "roubaria" o retorno).
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/agente.log"
CFG="$DIR/config.env"
EST="$DIR/enviados.tsv" # sha256, quando, nome, resultado

log() {
  if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 1048576 ]; then mv -f "$LOG" "$LOG.antigo"; fi
  echo "$(date '+%d/%m/%Y %H:%M:%S')  $*" >>"$LOG"
}
anotar() { printf '%s\t%s\t%s\t%s\n' "$1" "$(date '+%Y-%m-%dT%H:%M:%S')" "$2" "$3" >>"$EST"; }

# uma execução por vez
exec 9>"$DIR/agente.lock"
flock -n 9 || exit 0

[ -f "$CFG" ] || { log "ERRO: falta config.env (rode instalar-linux.sh)"; exit 1; }
# PASTAS (separadas por ":"), URL, CHAVE, DIAS
. "$CFG"
touch "$EST"
destino="${URL%/}/api/conciliacao/agente"
novos=0
falhas=0
parar=0

IFS=':' read -r -a pastas <<<"$PASTAS"
for pasta in "${pastas[@]}"; do
  [ "$parar" = 1 ] && break
  [ -d "$pasta" ] || { log "ERRO: pasta não encontrada: $pasta"; continue; }
  # mais antigos primeiro; só arquivos dos últimos DIAS dias, até 4 MB
  while IFS= read -r -d '' arq; do
    h=$(sha256sum "$arq" | cut -d' ' -f1)
    grep -q "^$h" "$EST" && continue
    nome=$(basename "$arq")
    if [ "$(head -c 3 "$arq")" != "341" ]; then
      anotar "$h" "$nome" "ignorado (não é arquivo do Itaú)"
      continue
    fi
    # a chave vai pela configuração do curl (stdin), não pela linha de comando: não aparece no "ps"
    resp=$(printf 'header = "X-Agente: %s"\n' "$CHAVE" | curl -sS --max-time 120 -K - -w '\n%{http_code}' -F "arquivo=@$arq;filename=$nome" "$destino" 2>&1)
    cod=$(printf '%s' "$resp" | tail -n1)
    corpo=$(printf '%s' "$resp" | sed '$d')
    case "$cod" in
      200)
        if printf '%s' "$corpo" | grep -q '"ignorado":true'; then res="ignorado pelo sistema"
        elif printf '%s' "$corpo" | grep -q '"repetido":true'; then res="já estava no sistema"
        else res="enviado $(printf '%s' "$corpo" | sed -n 's/.*"mensagem":"\([^"]*\)".*/(\1)/p')"; fi
        anotar "$h" "$nome" "$res"
        novos=$((novos + 1))
        log "$nome: $res"
        ;;
      401) log "ERRO: chave do agente recusada (revogada ou errada). Parei."; parar=1; break ;;
      503) log "ERRO: o servidor ainda não está com o agente habilitado. Tento de novo depois."; parar=1; break ;;
      *) falhas=$((falhas + 1)); log "FALHA $nome: HTTP $cod $corpo" ;;
    esac
  done < <(find "$pasta" -type f -size +0 -size -4096k -mtime "-$DIAS" -printf '%T@ %p\0' | sort -zn | cut -z -d' ' -f2-)
done
if [ "$novos" -gt 0 ] || [ "$falhas" -gt 0 ]; then log "fim: $novos arquivo(s) processado(s), $falhas falha(s)"; fi
