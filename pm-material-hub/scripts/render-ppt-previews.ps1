param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)

if (-not (Test-Path -LiteralPath $resolvedOutput)) {
  New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
}

$powerPoint = $null
$presentation = $null

try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $presentation = $powerPoint.Presentations.Open($resolvedInput, $true, $true, $false)

  $slideWidth = [double]$presentation.PageSetup.SlideWidth
  $slideHeight = [double]$presentation.PageSetup.SlideHeight
  $exportWidth = 1600
  $exportHeight = [Math]::Max(1, [Math]::Round($exportWidth * $slideHeight / $slideWidth))

  foreach ($slide in $presentation.Slides) {
    $target = Join-Path $resolvedOutput ("slide-{0}.png" -f $slide.SlideNumber)
    $slide.Export($target, 'PNG', $exportWidth, $exportHeight)
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($slide) | Out-Null
  }

  [pscustomobject]@{
    success = $true
    slides = $presentation.Slides.Count
    width = $exportWidth
    height = $exportHeight
  } | ConvertTo-Json -Compress
}
finally {
  if ($presentation) {
    $presentation.Close()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) | Out-Null
  }
  if ($powerPoint) {
    $powerPoint.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
