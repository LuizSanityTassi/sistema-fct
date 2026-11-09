# Instala o Agente FCT (Itaú Mailbox -> Sistema FCT / DDA x Trier). Rode com: botão direito > "Executar com o PowerShell"
# ou, se essa opção não aparecer, abra o PowerShell nesta pasta e rode:  powershell -ExecutionPolicy Bypass -File .\instalar.ps1
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host ''
Write-Host '=== Agente FCT: Itaú Mailbox -> Sistema FCT (DDA x Trier) ===' -ForegroundColor Cyan
Write-Host ''
# Nunca dentro da pasta do Itaú Mailbox: o agente grava o próprio config.json e estragaria o config.json do IMB (caixa, senha, chave).
if ((Test-Path (Join-Path $dir 'imb.exe')) -or (Test-Path (Join-Path $dir 'Keys'))) {
  Write-Host "Esta pasta ($dir) é a do Itaú Mailbox. Crie outra pasta só para o agente (ex.: C:\FCT\agente-itau), copie os 4 arquivos para lá e rode de novo." -ForegroundColor Red
  Read-Host 'Enter para sair'; exit 1
}
$pasta = Read-Host 'Pasta onde o Itaú Mailbox salva os arquivos RECEBIDOS do produto 025 (ex.: C:\ItauMailbox\NJESCRITO\RETORNO\PROD\025)'
$pasta = $pasta.Trim('"', ' ')
if (-not (Test-Path $pasta)) { Write-Host "A pasta '$pasta' não existe. Confira e rode de novo." -ForegroundColor Red; Read-Host 'Enter para sair'; exit 1 }
$url = Read-Host 'Endereço do sistema [Enter = https://portal.farmaciafct.com.br]'
if (-not $url) { $url = 'https://portal.farmaciafct.com.br' }
$tok = Read-Host 'Cole a CHAVE DO AGENTE (gerada em Automações > Robôs e agente)' -AsSecureString
if ($tok.Length -lt 40) { Write-Host 'Chave muito curta. Confira e rode de novo.' -ForegroundColor Red; Read-Host 'Enter para sair'; exit 1 }
# a chave fica criptografada pelo Windows (só este usuário, neste PC, consegue ler)
$cfg = [ordered]@{ url = $url; pasta = $pasta; diasParaTras = 30; token = ($tok | ConvertFrom-SecureString) }
($cfg | ConvertTo-Json) | Set-Content -Path (Join-Path $dir 'config.json') -Encoding UTF8

$script = Join-Path $dir 'agente-itau.ps1'
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$gat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$conf = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'FCT Agente Itau' -Action $acao -Trigger $gat -Settings $conf -Description 'Manda os retornos de DDA do Itau Mailbox para o Sistema FCT (Conciliacao)' -Force | Out-Null
Write-Host ''
Write-Host 'Instalado! Rodando agora a primeira vez...' -ForegroundColor Green
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script
$log = Join-Path $dir 'agente.log'
if (Test-Path $log) { Write-Host ''; Write-Host '--- últimas linhas do agente.log ---'; Get-Content $log -Tail 15 } else { Write-Host 'Nenhum arquivo novo para enviar agora.' }
Write-Host ''
Write-Host 'Daqui pra frente ele roda sozinho a cada 15 minutos (Agendador de Tarefas: "FCT Agente Itau").'
Read-Host 'Enter para fechar'
