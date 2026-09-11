@echo off
if not exist "%~dp0kole.exe" (
  echo kole: Download kole.exe from the repository release and place it beside kole.cmd. 1>&2
  exit /b 1
)
"%~dp0kole.exe" %*
exit /b %errorlevel%
