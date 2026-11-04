#requires -Version 7
param(
    [ValidateSet('patch', 'minor', 'major')]
    [string] $Bump = 'patch',

    [string] $PropsPath = '',

    [string] $IssPath = '',

    [switch] $SelfTest
)

$ErrorActionPreference = 'Stop'

function Get-ClientVersion([string] $Path) {
    $text = [System.IO.File]::ReadAllText($Path)
    if ($text -notmatch '<Version>(\d+\.\d+\.\d+)</Version>') {
        throw "No three-part <Version> element in '$Path'."
    }

    return $Matches[1]
}

function Step-ClientVersion([string] $Version, [string] $BumpKind) {
    $parts = $Version.Split('.') | ForEach-Object { [int]$_ }
    if ($parts.Count -ne 3) {
        throw "Version '$Version' is not major.minor.patch."
    }

    switch ($BumpKind) {
        'major' {
            $parts[0]++
            $parts[1] = 0
            $parts[2] = 0
        }
        'minor' {
            $parts[1]++
            $parts[2] = 0
        }
        'patch' {
            $parts[2]++
        }
    }

    return "$($parts[0]).$($parts[1]).$($parts[2])"
}

function Set-ClientVersionFiles {
    param(
        [string] $PropsFile,
        [string] $IssFile,
        [string] $NewVersion
    )

    $props = [System.IO.File]::ReadAllText($PropsFile)
    $updatedProps = [regex]::Replace(
        $props,
        '<Version>\d+\.\d+\.\d+</Version>',
        "<Version>$NewVersion</Version>",
        1)
    if ($updatedProps -eq $props) {
        throw "Did not update <Version> in '$PropsFile'."
    }

    $iss = [System.IO.File]::ReadAllText($IssFile)
    $updatedIss = [regex]::Replace(
        $iss,
        '(#define MyAppVersion ")(\d+\.\d+\.\d+)(")',
        "`${1}$NewVersion`${3}",
        1)
    if ($updatedIss -eq $iss) {
        throw "Did not update MyAppVersion in '$IssFile'."
    }

    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($PropsFile, $updatedProps, $utf8)
    [System.IO.File]::WriteAllText($IssFile, $updatedIss, $utf8)
}

function Invoke-SelfTest {
    $cases = @(
        @{ Current = '0.1.3'; Bump = 'patch'; Expected = '0.1.4' }
        @{ Current = '0.1.3'; Bump = 'minor'; Expected = '0.2.0' }
        @{ Current = '0.1.3'; Bump = 'major'; Expected = '1.0.0' }
        @{ Current = '1.2.9'; Bump = 'patch'; Expected = '1.2.10' }
    )
    foreach ($case in $cases) {
        $got = Step-ClientVersion $case.Current $case.Bump
        if ($got -ne $case.Expected) {
            throw "Step-ClientVersion $($case.Current) $($case.Bump) => $got (expected $($case.Expected))."
        }
    }

    $root = Join-Path ([System.IO.Path]::GetTempPath()) ("fp-bump-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $root | Out-Null
    try {
        $props = Join-Path $root 'Directory.Build.props'
        $iss = Join-Path $root 'FamilyPrism.iss'
        [System.IO.File]::WriteAllText(
            $props,
            "<Project>`n  <PropertyGroup>`n    <Version>0.1.3</Version>`n  </PropertyGroup>`n</Project>`n")
        [System.IO.File]::WriteAllText(
            $iss,
            "#ifndef MyAppVersion`n  #define MyAppVersion `"0.1.3`"`n#endif`n")
        $next = Step-ClientVersion (Get-ClientVersion $props) 'patch'
        Set-ClientVersionFiles -PropsFile $props -IssFile $iss -NewVersion $next
        if ((Get-ClientVersion $props) -ne '0.1.4') {
            throw 'Self-test did not persist Directory.Build.props.'
        }
        if ([System.IO.File]::ReadAllText($iss) -notmatch '#define MyAppVersion "0.1.4"') {
            throw 'Self-test did not persist FamilyPrism.iss.'
        }
    }
    finally {
        Remove-Item -LiteralPath $root -Recurse -Force
    }

    Write-Host 'bump-client-version self-test passed'
}

if ($SelfTest) {
    Invoke-SelfTest
    return
}

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $PropsPath) {
    $PropsPath = Join-Path $PSScriptRoot 'Directory.Build.props'
}
if (-not $IssPath) {
    $IssPath = Join-Path $PSScriptRoot 'installer\FamilyPrism.iss'
}

$current = Get-ClientVersion $PropsPath
$next = Step-ClientVersion $current $Bump
Set-ClientVersionFiles -PropsFile $PropsPath -IssFile $IssPath -NewVersion $next

Write-Host "Bumped Windows client $current -> $next ($Bump)"
Write-Host "CLIENT_PACKAGE_VERSION=$next"
if ($env:GITHUB_OUTPUT) {
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "version=$next"
}
