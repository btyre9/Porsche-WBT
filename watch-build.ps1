param(
  [string]$ProjectRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path),
  [int]$DebounceMs = 800,
  [switch]$NoInitialBuild,
  [switch]$FastDesign
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectPath = (Resolve-Path $ProjectRoot).Path
$watchRoots = @(
  "storyboard",
  "templates",
  "config",
  "builder"
)

$python = "C:\Users\ALIBI8I\AppData\Local\Programs\Python\Python314\python.exe"
if (-not (Test-Path $python)) {
  Write-Error "Python was not found at $python."
}

$state = [ordered]@{
  Pending   = $false
  LastEvent = Get-Date
  Building  = $false
}

function Invoke-Build {
  $state.Building = $true
  try {
    $start = Get-Date
    Write-Host "[watch] Rebuilding at $($start.ToString('HH:mm:ss'))..."
    Push-Location $projectPath
    try {
      $buildArgs = @("builder/main.py", "--project-root", $projectPath)
      if ($FastDesign) {
        $buildArgs += "--skip-captions"
      }

      & python @buildArgs
      if ($LASTEXITCODE -eq 0) {
        $elapsed = [int]((Get-Date) - $start).TotalSeconds
        Write-Host "[watch] Build complete in ${elapsed}s."
      } else {
        Write-Host "[watch] Build failed (exit code $LASTEXITCODE)."
      }
    } finally {
      Pop-Location
    }
  } finally {
    $state.Building = $false
  }
}

$watchers = @()
$eventIds = @()

try {
  foreach ($root in $watchRoots) {
    $path = Join-Path $projectPath $root
    if (-not (Test-Path $path)) {
      continue
    }

    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path = $path
    $watcher.IncludeSubdirectories = $true
    $watcher.EnableRaisingEvents = $true
    $watcher.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, DirectoryName, CreationTime, Size'

    $watchers += $watcher

    foreach ($eventName in @("Changed", "Created", "Deleted", "Renamed")) {
      $sourceId = "watch-$root-$eventName-" + [guid]::NewGuid().ToString("N")
      $null = Register-ObjectEvent -InputObject $watcher -EventName $eventName -SourceIdentifier $sourceId
      $eventIds += $sourceId
    }
  }

  if ($FastDesign) {
    Write-Host "[watch] Fast design mode enabled (skip captions)."
  }
  Write-Host "[watch] Watching for changes in: $($watchRoots -join ', ')"
  Write-Host "[watch] Press Ctrl+C to stop."

  if (-not $NoInitialBuild) {
    Invoke-Build
  }

  while ($true) {
    $pendingEvents = Get-Event
    if ($pendingEvents) {
      foreach ($evt in $pendingEvents) {
        $state.Pending = $true
        $state.LastEvent = Get-Date
        Remove-Event -EventIdentifier $evt.EventIdentifier -ErrorAction SilentlyContinue
      }
    }

    Start-Sleep -Milliseconds 200
    if (-not $state.Pending) {
      continue
    }
    if ($state.Building) {
      continue
    }

    $ageMs = ((Get-Date) - $state.LastEvent).TotalMilliseconds
    if ($ageMs -lt $DebounceMs) {
      continue
    }

    $state.Pending = $false
    Invoke-Build
  }
} finally {
  foreach ($id in $eventIds) {
    Unregister-Event -SourceIdentifier $id -ErrorAction SilentlyContinue
    Remove-Job -Name $id -Force -ErrorAction SilentlyContinue
  }
  foreach ($watcher in $watchers) {
    try {
      $watcher.EnableRaisingEvents = $false
      $watcher.Dispose()
    } catch {
      # No-op on cleanup.
    }
  }
}
