#requires -Version 7
param(
    [Parameter(Mandatory)]
    [string] $PublishDir,

    [Parameter(Mandatory)]
    [string] $OutputDir,

    [Parameter(Mandatory)]
    [string] $Version
)

$ErrorActionPreference = 'Stop'

function Get-InnoSetupCompiler {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 7\ISCC.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 7\ISCC.exe'),
        (Join-Path $env:ProgramFiles 'Inno Setup 7\ISCC.exe')
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    $fromPath = Get-Command iscc -ErrorAction SilentlyContinue
    if ($fromPath) {
        return $fromPath.Source
    }

    throw 'Inno Setup 6.7 or later was not found. Install it from https://jrsoftware.org/isinfo.php and publish again.'
}

$publishDir = (Resolve-Path -LiteralPath $PublishDir).Path.TrimEnd('\')
$agentExe = Join-Path $publishDir 'prismagent.exe'
$serviceExe = Join-Path $publishDir 'Service\prismsvc.exe'
if (-not (Test-Path $agentExe)) {
    throw "Published agent was not found at '$agentExe'."
}
if (-not (Test-Path $serviceExe)) {
    throw "Published service was not found at '$serviceExe'."
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$outputDir = (Resolve-Path -LiteralPath $OutputDir).Path.TrimEnd('\')

$iss = Join-Path $PSScriptRoot 'FamilyPrism.iss'
$compiler = Get-InnoSetupCompiler

Write-Host "Compiling Family Prism installer $Version"
Write-Host "  ISCC: $compiler"
Write-Host "  PublishDir: $publishDir"
Write-Host "  OutputDir: $outputDir"

& $compiler `
    "/DMyAppVersion=$Version" `
    "/DPublishDir=$publishDir" `
    "/DOutputDir=$outputDir" `
    $iss

if ($LASTEXITCODE -ne 0) {
    throw "ISCC failed with exit code $LASTEXITCODE."
}

$setupExe = Join-Path $outputDir "FamilyPrismSetup-$Version.exe"
if (-not (Test-Path $setupExe)) {
    throw "Installer was not produced at '$setupExe'."
}

Write-Host "Installer written to $setupExe"
