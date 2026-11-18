Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot "..\icons"
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }
$out = (Resolve-Path $out).Path

foreach ($s in 16, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)

  # Background rounded circle
  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 12, 16, 29))
  $g.FillEllipse($bg, 0, 0, $s - 1, $s - 1)

  # Gauge arc
  $w = [Math]::Max(2, $s * 0.11)
  $m = $s * 0.18
  $rect = New-Object System.Drawing.RectangleF $m, $m, ($s - 2 * $m), ($s - 2 * $m)
  $track = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 38, 47, 74)), $w
  $track.StartCap = 'Round'; $track.EndCap = 'Round'
  $g.DrawArc($track, $rect, 150, 240)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 0, 102, 255)), ([System.Drawing.Color]::FromArgb(255, 0, 229, 255)), 0.0
  $pen = New-Object System.Drawing.Pen $grad, $w
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  $g.DrawArc($pen, $rect, 150, 170)

  # Needle
  $c = $s / 2
  $len = ($s / 2 - $m) * 0.85
  $ang = (-50) * [Math]::PI / 180
  $x2 = $c + $len * [Math]::Cos($ang); $y2 = $c + $len * [Math]::Sin($ang)
  $np = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(1.5, $s * 0.07))
  $np.StartCap = 'Round'; $np.EndCap = 'Round'
  $g.DrawLine($np, [float]$c, [float]$c, [float]$x2, [float]$y2)
  $hub = [Math]::Max(2, $s * 0.12)
  $g.FillEllipse([System.Drawing.Brushes]::White, [float]($c - $hub / 2), [float]($c - $hub / 2), [float]$hub, [float]$hub)

  $g.Dispose()
  $bmp.Save((Join-Path $out "icon-$s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Write-Output "Icons generated in $out"
