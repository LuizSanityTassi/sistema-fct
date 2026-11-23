@echo off
title Agente WhatsApp - Portal FCT
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Falta o Node.js neste computador. Instale em https://nodejs.org ^(versao LTS^) e abra de novo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Primeira vez: instalando as bibliotecas...
  call npm install --omit=dev
)
:volta
node agente.js
echo O agente parou. Abrindo de novo em 10 segundos... (feche esta janela para parar)
timeout /t 10 >nul
goto volta
