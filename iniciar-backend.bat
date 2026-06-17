@echo off
REM Atalho para iniciar o backend proprio do Ze na Porta.
REM Basta dar dois cliques neste arquivo.
cd /d "%~dp0"
echo Iniciando o backend do Ze na Porta...
node server.js
pause
