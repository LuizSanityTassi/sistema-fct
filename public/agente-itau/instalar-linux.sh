#!/usr/bin/env bash
# Instala o agente FCT no servidor Linux que recebe os retornos do Itaú: grava a configuração (só o seu usuário lê)
# e agenda no cron a cada 15 minutos. Rode como o usuário que consegue LER as pastas de retorno (não precisa ser root).
set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
chmod 700 "$DIR/agente-itau.sh"
for prog in curl flock sha256sum find crontab; do command -v "$prog" >/dev/null || { echo "Falta o programa: $prog"; exit 1; }; done

echo "Pastas onde chegam os retornos (RETORNO/PROD de cada caixa), separadas por \":\"."
padrao=$(ls -d /var/www/html/sistemafct/itau/*/RETORNO/PROD 2>/dev/null | paste -sd: - || true)
[ -n "$padrao" ] && echo "Encontrei: $padrao"
read -r -p "Pastas [Enter = as encontradas]: " pastas
pastas=${pastas:-$padrao}
[ -n "$pastas" ] || { echo "Informe ao menos uma pasta."; exit 1; }
read -r -p "Endereço do sistema [https://portal.farmaciafct.com.br]: " url
url=${url:-https://portal.farmaciafct.com.br}
read -r -s -p "Chave do agente (cole; não aparece na tela): " chave
echo
[ ${#chave} -ge 20 ] || { echo "Chave curta demais."; exit 1; }
read -r -p "Mandar arquivos de quantos dias para trás [30]: " dias
dias=${dias:-30}

umask 077
{
  printf 'PASTAS=%q\n' "$pastas"
  printf 'URL=%q\n' "$url"
  printf 'CHAVE=%q\n' "$chave"
  printf 'DIAS=%q\n' "$dias"
} >"$DIR/config.env"
chmod 600 "$DIR/config.env"

linha="*/15 * * * * $DIR/agente-itau.sh # FCT Agente Itau"
( crontab -l 2>/dev/null | grep -v "# FCT Agente Itau" || true; echo "$linha" ) | crontab -
echo "Agendado no cron a cada 15 min. Rodando a primeira vez agora..."
"$DIR/agente-itau.sh"
echo "Pronto. Acompanhe em $DIR/agente.log e no Sistema FCT (Conciliação > Robôs e agente)."
