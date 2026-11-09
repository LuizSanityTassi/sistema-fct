# Remove o agendamento do Agente FCT (os arquivos da pasta do Itaú Mailbox não são mexidos).
Unregister-ScheduledTask -TaskName 'FCT Agente Itau' -Confirm:$false -ErrorAction SilentlyContinue
# só apaga o config.json DO AGENTE (o do Itaú Mailbox tem o mesmo nome: nunca mexer nele)
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfgP = Join-Path $dir 'config.json'
if ((Test-Path (Join-Path $dir 'imb.exe')) -or (Test-Path (Join-Path $dir 'Keys'))) {
  Write-Host 'Esta é a pasta do Itaú Mailbox: o config.json dela NÃO foi mexido.' -ForegroundColor Yellow
} elseif (Test-Path $cfgP) {
  $c = $null; try { $c = Get-Content $cfgP -Raw | ConvertFrom-Json } catch { }
  if ($c -and $c.token -and $c.diasParaTras) { Remove-Item $cfgP -ErrorAction SilentlyContinue } else { Write-Host 'config.json desta pasta não é o do agente: não foi apagado.' -ForegroundColor Yellow }
}
Write-Host 'Agente removido. Para tirar o acesso de vez, revogue a chave no Sistema FCT em Automações > Robôs e agente.'
Read-Host 'Enter para fechar'
