<#
.SYNOPSIS
    Regenerates the home screen icons in public\icons from the FamilyPrism brand mark.

.DESCRIPTION
    The geometry and colors below mirror the BrandMark SVG in app/ui/icons.tsx (24x24
    viewBox: a gray shackle over a yellow lock body with a dark slot), the same mark that
    prismclient/generate-agent-icon.ps1 renders for the Windows agent. Keep them in sync;
    if the brand mark changes, update this script and rerun it.

    Every icon is an opaque square on the rail color. iOS fills transparent pixels with
    black and rounds the corners itself, so the art must not be pre-rounded or see-through.
    The maskable icon keeps the mark inside the central 80% safe zone that Android masks to.

    The file names must match WEB_APP_ICON_FILES in app/controllers/web-app.ts.
#>
[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'public\icons')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

# File name, pixel size, and how much of the square the brand mark's viewBox crop fills.
$icons = @(
    @{ File = 'apple-touch-icon.png'; Size = 180; MarkScale = 0.64 },
    @{ File = 'icon-192.png'; Size = 192; MarkScale = 0.64 },
    @{ File = 'icon-512.png'; Size = 512; MarkScale = 0.64 },
    @{ File = 'icon-maskable-512.png'; Size = 512; MarkScale = 0.56 }
)
$supersample = 4

# Square crop of the 24-unit brand mark viewBox that hugs the artwork
# (outer stroke edges span x 3..21, y 1..22.5).
$viewX = 1.0
$viewY = 0.75
$viewSize = 22.0

$background = [System.Drawing.ColorTranslator]::FromHtml('#1e2b2f')
$outline = [System.Drawing.ColorTranslator]::FromHtml('#9aa3a6')
$bodyFill = [System.Drawing.ColorTranslator]::FromHtml('#f2b705')
$slotFill = [System.Drawing.ColorTranslator]::FromHtml('#121415')

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-IconBitmap([int]$size, [double]$markScale) {
    $canvas = $size * $supersample
    $large = [System.Drawing.Bitmap]::new($canvas, $canvas, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($large)
    try {
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear($background)

        $markPixels = $canvas * $markScale
        $offset = ($canvas - $markPixels) / 2
        $g.TranslateTransform([float]$offset, [float]$offset)
        $scale = [float]($markPixels / $viewSize)
        $g.ScaleTransform($scale, $scale)
        $g.TranslateTransform([float]-$viewX, [float]-$viewY)

        $pen = [System.Drawing.Pen]::new($outline, 2.0)
        $bodyBrush = [System.Drawing.SolidBrush]::new($bodyFill)
        $slotBrush = [System.Drawing.SolidBrush]::new($slotFill)
        try {
            # <circle cx="12" cy="5" r="3" fill="none" stroke-width="2" />
            $g.DrawEllipse($pen, 9.0, 2.0, 6.0, 6.0)

            # <rect x="4" y="8.5" width="16" height="13" rx="3" stroke-width="2" />
            $body = New-RoundedRectPath 4.0 8.5 16.0 13.0 3.0
            $g.FillPath($bodyBrush, $body)
            $g.DrawPath($pen, $body)
            $body.Dispose()

            # <rect x="7" y="12.5" width="10" height="3.5" rx="0.5" />
            $slot = New-RoundedRectPath 7.0 12.5 10.0 3.5 0.5
            $g.FillPath($slotBrush, $slot)
            $slot.Dispose()
        }
        finally {
            $pen.Dispose()
            $bodyBrush.Dispose()
            $slotBrush.Dispose()
        }
    }
    finally {
        $g.Dispose()
    }

    # 24bpp: no alpha channel at all, so nothing can come out see-through.
    $small = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($small)
    try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
        $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
        $g.DrawImage(
            $large,
            [System.Drawing.Rectangle]::new(0, 0, $size, $size),
            0, 0, $canvas, $canvas,
            [System.Drawing.GraphicsUnit]::Pixel,
            $attributes)
        $attributes.Dispose()
    }
    finally {
        $g.Dispose()
        $large.Dispose()
    }

    return $small
}

if (-not (Test-Path $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
}

foreach ($icon in $icons) {
    $bitmap = New-IconBitmap $icon.Size $icon.MarkScale
    try {
        $path = Join-Path $OutputDirectory $icon.File
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Host "Wrote $path ($($icon.Size)px)"
    }
    finally {
        $bitmap.Dispose()
    }
}
