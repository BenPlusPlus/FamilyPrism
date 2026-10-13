#requires -Version 7
param(
    [string] $Configuration = 'Release',
    [string] $Runtime = 'win-x64',
    [switch] $SkipInstaller,
    [switch] $SkipZip
)

$ErrorActionPreference = 'Stop'

$project = Join-Path $PSScriptRoot 'prismagent\prismagent.csproj'
$publishDir = Join-Path $PSScriptRoot "artifacts\publish\$Runtime"
$installerProperty = $SkipInstaller ? '-p:PublishInstaller=false' : '-p:PublishInstaller=true'
$zipProperty = $SkipZip ? '-p:PublishClientZip=false' : '-p:PublishClientZip=true'

Write-Host "Publishing Family Prism client ($Configuration, $Runtime)"
dotnet publish $project `
    -c $Configuration `
    -r $Runtime `
    --self-contained false `
    -o $publishDir `
    $installerProperty `
    $zipProperty

if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish failed with exit code $LASTEXITCODE."
}
