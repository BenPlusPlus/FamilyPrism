#requires -Version 7
param(
    [Parameter(Mandatory)]
    [string] $PublishDir,

    [Parameter(Mandatory)]
    [string] $ZipPath,

    [Parameter(Mandatory)]
    [string] $Version
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$publishDir = (Resolve-Path -LiteralPath $PublishDir).Path.TrimEnd('\')
$agentExe = Join-Path $publishDir 'prismagent.exe'
$serviceExe = Join-Path $publishDir 'Service\prismsvc.exe'
if (-not (Test-Path -LiteralPath $agentExe)) {
    throw "Published agent was not found at '$agentExe'."
}
if (-not (Test-Path -LiteralPath $serviceExe)) {
    throw "Published service was not found at '$serviceExe'."
}

$zipDirectory = Split-Path -Parent $ZipPath
if ($zipDirectory) {
    New-Item -ItemType Directory -Force -Path $zipDirectory | Out-Null
}

if (Test-Path -LiteralPath $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
}

[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $publishDir,
    $ZipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false)

$sha256 = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()

Write-Host "Client package written to $ZipPath"
Write-Host "CLIENT_PACKAGE_VERSION=$Version"
Write-Host "CLIENT_PACKAGE_SHA256=$sha256"
