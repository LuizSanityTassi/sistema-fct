@echo off
rem Faz o agente abrir sozinho quando este usuario entra no Windows.
cd /d "%~dp0"
schtasks /create /tn "FCT WhatsApp Chamados" /tr "\"%~dp0iniciar.bat\"" /sc onlogon /f
if errorlevel 1 (
  echo Nao consegui criar a tarefa. Rode este arquivo de novo como administrador.
) else (
  echo Pronto: o agente vai abrir sozinho quando voce entrar no Windows.
)
pause
