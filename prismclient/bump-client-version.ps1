#requires -Version 7
param(
    [ValidateSet('patch', 'minor', 'major')]
    [string] $Bump = 'patch',

    [string] $PropsPath = '',

    [string] $IssPath = '',

    [switch] $SelfTest
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

function Get-ClientVersion([string] $Path) {
    $text = [System.IO.File]::ReadAllText($Path)
    if ($text -notmatch '<Version>(\d+\.\d+\.\d+)</Version>') {
        throw "No three-part <Version> element in '$Path'."
    }

    return $Matches[1]
}

function ConvertTo-ClientVersion([string] $Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $null
    }

    if ($Value.Trim() -notmatch '^v?(\d+)\.(\d+)\.(\d+)$') {
        return $null
    }

    return [version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
}

function ConvertFrom-ClientTagNames([string[]] $TagNames) {
    foreach ($name in @($TagNames)) {
        $parsed = ConvertTo-ClientVersion $name
        if ($parsed) {
            $parsed.ToString()
        }
    }
}

function Get-HighestClientVersion([string[]] $Versions) {
    $parsed = foreach ($value in @($Versions)) {
        ConvertTo-ClientVersion $value
    }
    $parsed = @($parsed | Where-Object { $_ })
    if ($parsed.Count -eq 0) {
        throw 'No three-part versions to compare.'
    }

    $best = $parsed | Sort-Object -Descending | Select-Object -First 1
    return $best.ToString()
}

function Get-GitTagVersions {
    $output = git tag -l 'v*.*.*'
    if ($LASTEXITCODE -ne 0) {
        throw "git tag -l failed with exit $LASTEXITCODE."
    }

    $names = @(
        @($output) |
            ForEach-Object { "$_".Trim() } |
            Where-Object { $_ }
    )
    return @(ConvertFrom-ClientTagNames $names | Where-Object { $_ })
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
    $highestCases = @(
        @{ Versions = @('0.1.6', '0.1.7', '0.1.5'); Expected = '0.1.7' }
        @{ Versions = @('0.1.9', '0.1.10'); Expected = '0.1.10' }
        @{ Versions = @('v0.1.7', '0.1.6'); Expected = '0.1.7' }
    )
    foreach ($case in $highestCases) {
        $got = Get-HighestClientVersion $case.Versions
        if ($got -ne $case.Expected) {
            throw "Get-HighestClientVersion $($case.Versions -join ',') => $got (expected $($case.Expected))."
        }
    }

    $tagVersions = @(ConvertFrom-ClientTagNames @('v0.1.7', 'v0.1.5', 'not-a-tag', 'v0.1', 'v0.1.10'))
    if (($tagVersions -join ',') -ne '0.1.7,0.1.5,0.1.10') {
        throw "ConvertFrom-ClientTagNames => $($tagVersions -join ',') (expected 0.1.7,0.1.5,0.1.10)."
    }

    $fromPropsAndTag = Get-HighestClientVersion @('0.1.6', '0.1.7')
    $nextFromTag = Step-ClientVersion $fromPropsAndTag 'patch'
    if ($nextFromTag -ne '0.1.8') {
        throw "Bump from max(props 0.1.6, tag 0.1.7) => $nextFromTag (expected 0.1.8)."
    }

    $noTags = @(ConvertFrom-ClientTagNames @() | Where-Object { $_ })
    if ($noTags.Count -ne 0) {
        throw 'ConvertFrom-ClientTagNames of no tags should be empty.'
    }
    $propsOnly = Get-HighestClientVersion (@('0.1.6') + $noTags)
    if ($propsOnly -ne '0.1.6') {
        throw "Highest with no tags => $propsOnly (expected 0.1.6)."
    }

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

$fromProps = Get-ClientVersion $PropsPath
$fromTags = @(Get-GitTagVersions | Where-Object { $_ })
$current = Get-HighestClientVersion (@($fromProps) + $fromTags)
$next = Step-ClientVersion $current $Bump
Set-ClientVersionFiles -PropsFile $PropsPath -IssFile $IssPath -NewVersion $next

if ($fromTags.Count -gt 0) {
    Write-Host "Version sources: Directory.Build.props=$fromProps latest-tag=$(Get-HighestClientVersion $fromTags)"
}
else {
    Write-Host "Version sources: Directory.Build.props=$fromProps (no v*.*.* tags)"
}
Write-Host "Bumped Windows client $current -> $next ($Bump)"
Write-Host "CLIENT_PACKAGE_VERSION=$next"
if ($env:GITHUB_OUTPUT) {
    Add-Content -LiteralPath $env:GITHUB_OUTPUT -Value "version=$next"
}
