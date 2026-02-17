$p = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process powershell -ArgumentList "-NoExit", "-Command", "http-server '$p\output\course' -p 8080 -c-1"
Start-Sleep -Seconds 2
Start-Process "http://localhost:8080/player/"
& "$p\watch-build.ps1" -ProjectRoot $p
