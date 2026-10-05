param(
  [Parameter(Mandatory = $true)]
  [string]$GeneratedBackground
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$brandLogoPath = Join-Path $projectRoot 'public\logo-forjados.png'
$outputRoot = Join-Path $projectRoot 'store-assets'
$sourceRoot = Join-Path $outputRoot 'source'

New-Item -ItemType Directory -Force -Path $outputRoot, $sourceRoot | Out-Null
Copy-Item -LiteralPath $GeneratedBackground -Destination (Join-Path $sourceRoot 'feature-background-generated.png') -Force

function New-Canvas {
  param(
    [int]$Width,
    [int]$Height,
    [string]$OutputPath,
    [bool]$UseGeneratedBackground,
    [float]$LogoScale
  )

  $canvas = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Black)

  if ($UseGeneratedBackground) {
    $background = [System.Drawing.Image]::FromFile((Resolve-Path $GeneratedBackground))
    try {
      $sourceRatio = $background.Width / $background.Height
      $targetRatio = $Width / $Height
      if ($sourceRatio -gt $targetRatio) {
        $sourceHeight = $background.Height
        $sourceWidth = [int]($sourceHeight * $targetRatio)
        $sourceX = [int](($background.Width - $sourceWidth) / 2)
        $sourceY = 0
      } else {
        $sourceWidth = $background.Width
        $sourceHeight = [int]($sourceWidth / $targetRatio)
        $sourceX = 0
        $sourceY = [int](($background.Height - $sourceHeight) / 2)
      }
      $destination = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
      $graphics.DrawImage($background, $destination, $sourceX, $sourceY, $sourceWidth, $sourceHeight, [System.Drawing.GraphicsUnit]::Pixel)
      $veil = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(62, 0, 0, 0))
      $graphics.FillRectangle($veil, $destination)
      $veil.Dispose()
    } finally {
      $background.Dispose()
    }
  } else {
    $backgroundBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)),
      [System.Drawing.Color]::FromArgb(255, 8, 8, 8),
      [System.Drawing.Color]::FromArgb(255, 36, 17, 8),
      45
    )
    $graphics.FillRectangle($backgroundBrush, 0, 0, $Width, $Height)
    $backgroundBrush.Dispose()
  }

  $logo = [System.Drawing.Image]::FromFile($brandLogoPath)
  try {
    $logoWidth = [int]($Width * $LogoScale)
    $logoHeight = [int]($logoWidth * $logo.Height / $logo.Width)
    if ($logoHeight -gt [int]($Height * 0.88)) {
      $logoHeight = [int]($Height * 0.88)
      $logoWidth = [int]($logoHeight * $logo.Width / $logo.Height)
    }
    $logoX = [int](($Width - $logoWidth) / 2)
    $logoY = [int](($Height - $logoHeight) / 2)
    $graphics.DrawImage($logo, $logoX, $logoY, $logoWidth, $logoHeight)
  } finally {
    $logo.Dispose()
  }

  $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $canvas.Dispose()
}

New-Canvas -Width 1024 -Height 500 -OutputPath (Join-Path $outputRoot 'google-play-feature-1024x500.png') -UseGeneratedBackground $true -LogoScale 0.45
New-Canvas -Width 512 -Height 512 -OutputPath (Join-Path $outputRoot 'google-play-icon-512.png') -UseGeneratedBackground $false -LogoScale 0.82
New-Canvas -Width 1024 -Height 1024 -OutputPath (Join-Path $outputRoot 'apple-app-icon-1024.png') -UseGeneratedBackground $false -LogoScale 0.82

function Resize-OpaqueIcon {
  param([string]$SourcePath, [int]$Size, [string]$OutputPath)
  $source = [System.Drawing.Image]::FromFile($SourcePath)
  $target = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $drawing = [System.Drawing.Graphics]::FromImage($target)
  try {
    $drawing.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $drawing.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $drawing.Clear([System.Drawing.Color]::Black)
    $drawing.DrawImage($source, 0, 0, $Size, $Size)
    $target.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $drawing.Dispose()
    $target.Dispose()
    $source.Dispose()
  }
}

function New-AdaptiveForeground {
  param([int]$Size, [string]$OutputPath)
  $source = [System.Drawing.Image]::FromFile($brandLogoPath)
  $target = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $drawing = [System.Drawing.Graphics]::FromImage($target)
  try {
    $drawing.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $drawing.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $drawing.Clear([System.Drawing.Color]::Transparent)
    $logoWidth = [int]($Size * 0.68)
    $logoHeight = [int]($logoWidth * $source.Height / $source.Width)
    $x = [int](($Size - $logoWidth) / 2)
    $y = [int](($Size - $logoHeight) / 2)
    $drawing.DrawImage($source, $x, $y, $logoWidth, $logoHeight)
    $target.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $drawing.Dispose()
    $target.Dispose()
    $source.Dispose()
  }
}

$playIconPath = Join-Path $outputRoot 'google-play-icon-512.png'
$androidDensities = @{
  'mipmap-mdpi' = 48
  'mipmap-hdpi' = 72
  'mipmap-xhdpi' = 96
  'mipmap-xxhdpi' = 144
  'mipmap-xxxhdpi' = 192
}

foreach ($density in $androidDensities.GetEnumerator()) {
  $resourceFolder = Join-Path $projectRoot ("android\app\src\main\res\" + $density.Key)
  Resize-OpaqueIcon -SourcePath $playIconPath -Size $density.Value -OutputPath (Join-Path $resourceFolder 'ic_launcher.png')
  Resize-OpaqueIcon -SourcePath $playIconPath -Size $density.Value -OutputPath (Join-Path $resourceFolder 'ic_launcher_round.png')
  New-AdaptiveForeground -Size $density.Value -OutputPath (Join-Path $resourceFolder 'ic_launcher_foreground.png')
}

Copy-Item -LiteralPath (Join-Path $outputRoot 'apple-app-icon-1024.png') -Destination (Join-Path $projectRoot 'ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png') -Force

Write-Output "Store assets generated in $outputRoot"
