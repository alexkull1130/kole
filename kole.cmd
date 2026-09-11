@echo off
node "%~dp0src\cli.mjs" %*
exit /b %errorlevel%
