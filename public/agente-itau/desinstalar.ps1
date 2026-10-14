# Remove o agendamento do Agente FCT (os arquivos da pasta do Itaú Mailbox não são mexidos).
Unregister-ScheduledTask -TaskName 'FCT Agente Itau' -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'config.json') -ErrorAction SilentlyContinue
Write-Host 'Agente removido. Para tirar o acesso de vez, revogue a chave no Sistema FCT em Conciliação > Robôs e agente.'
Read-Host 'Enter para fechar'
