<#
.SYNOPSIS
    Regenerates prismagent\Assets\familyprism.ico from the Family Prism brand mark.

.DESCRIPTION
    The geometry and colors below mirror the BrandMark SVG in prism-api/app/ui/icons.tsx
    (24x24 viewBox: a gray shackle over a yellow lock body with a dark slot). Keep the two
    in sync; if the brand mark changes, update this script and rerun it.

    Each icon size is rendered separately (supersampled, then downscaled) so the small tray
    sizes stay crisp rather than being shrunk from the 256px image. Sizes below 256 are
    stored as 32-bit BMP entries for maximum compatibility; 256 is stored as PNG.
#>
[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'prismagent\Assets\familyprism.ico')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$sizes = 16, 20, 24, 32, 40, 48, 64, 256
$supersample = 8

# Square crop of the 24-unit brand mark viewBox that hugs the artwork
# (outer stroke edges span x 3..21, y 1..22.5).
$viewX = 1.0
$viewY = 0.75
$viewSize = 22.0

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

function New-BrandBitmap([int]$size) {
    $canvas = $size * $supersample
    $large = [System.Drawing.Bitmap]::new($canvas, $canvas, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($large)
    try {
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)

        $scale = [float]($canvas / $viewSize)
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

    $small = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($small)
    try {
        $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
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

function Get-BmpIconEntry([System.Drawing.Bitmap]$bitmap) {
    $size = $bitmap.Width
    $rect = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
    $data = $bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $stride = $size * 4
        $pixels = [byte[]]::new($stride * $size)
        for ($row = 0; $row -lt $size; $row++) {
            # ICO DIBs are bottom-up.
            $source = [IntPtr]::Add($data.Scan0, $row * $data.Stride)
            [System.Runtime.InteropServices.Marshal]::Copy($source, $pixels, ($size - 1 - $row) * $stride, $stride)
        }
    }
    finally {
        $bitmap.UnlockBits($data)
    }

    $maskStride = [int]([Math]::Ceiling($size / 32.0) * 4)
    $mask = [byte[]]::new($maskStride * $size)

    $stream = [System.IO.MemoryStream]::new()
    $writer = [System.IO.BinaryWriter]::new($stream)
    $writer.Write([uint32]40)           # biSize
    $writer.Write([int32]$size)         # biWidth
    $writer.Write([int32]($size * 2))   # biHeight (XOR + AND masks)
    $writer.Write([uint16]1)            # biPlanes
    $writer.Write([uint16]32)           # biBitCount
    $writer.Write([uint32]0)            # biCompression (BI_RGB)
    $writer.Write([uint32]($pixels.Length + $mask.Length))
    $writer.Write([int32]0)
    $writer.Write([int32]0)
    $writer.Write([uint32]0)
    $writer.Write([uint32]0)
    $writer.Write($pixels)
    $writer.Write($mask)
    $writer.Flush()
    return , $stream.ToArray()
}

function Get-PngIconEntry([System.Drawing.Bitmap]$bitmap) {
    $stream = [System.IO.MemoryStream]::new()
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    return , $stream.ToArray()
}

$entries = foreach ($size in $sizes) {
    $bitmap = New-BrandBitmap $size
    try {
        $bytes = if ($size -ge 256) { Get-PngIconEntry $bitmap } else { Get-BmpIconEntry $bitmap }
        [pscustomobject]@{ Size = $size; Bytes = $bytes }
    }
    finally {
        $bitmap.Dispose()
    }
}

$output = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($output)
$writer.Write([uint16]0)                # reserved
$writer.Write([uint16]1)                # type: icon
$writer.Write([uint16]$entries.Count)

$offset = 6 + 16 * $entries.Count
foreach ($entry in $entries) {
    $dimension = if ($entry.Size -ge 256) { 0 } else { $entry.Size }
    $writer.Write([byte]$dimension)     # width
    $writer.Write([byte]$dimension)     # height
    $writer.Write([byte]0)              # palette colors
    $writer.Write([byte]0)              # reserved
    $writer.Write([uint16]1)            # color planes
    $writer.Write([uint16]32)           # bits per pixel
    $writer.Write([uint32]$entry.Bytes.Length)
    $writer.Write([uint32]$offset)
    $offset += $entry.Bytes.Length
}
foreach ($entry in $entries) {
    $writer.Write([byte[]]$entry.Bytes)
}
$writer.Flush()

$directory = Split-Path -Parent $OutputPath
if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
}
[System.IO.File]::WriteAllBytes($OutputPath, $output.ToArray())
Write-Host "Wrote $OutputPath ($($entries.Count) sizes: $($sizes -join ', '))"
