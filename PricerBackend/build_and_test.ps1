$ErrorActionPreference = 'Stop'
$rootDir = $PSScriptRoot
Set-Location $rootDir
$jdkBin = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot\bin'
$javac = Join-Path $jdkBin 'javac.exe'
$java = Join-Path $jdkBin 'java.exe'

New-Item -ItemType Directory -Force (Join-Path $rootDir 'out') | Out-Null

$srcFiles = Get-ChildItem -Path (Join-Path $rootDir 'src\com\finance\pricer') -Filter *.java -Recurse | 
    Where-Object { $_.FullName -notmatch '\\api\\' } | 
    Select-Object -ExpandProperty FullName

& $javac -d (Join-Path $rootDir 'out') $srcFiles
if ($LASTEXITCODE -ne 0) {
    Write-Error "Compilation failed"
    exit $LASTEXITCODE
}

Write-Host "Compilation succeeded. Running SelfTest..."
& $java -cp (Join-Path $rootDir 'out') com.finance.pricer.PricerSelfTest
& $java -cp (Join-Path $rootDir 'out') com.finance.pricer.ComprehensiveCoreSelfTest
& $java -cp (Join-Path $rootDir 'out') com.finance.pricer.ComprehensivePhase2SelfTest
& $java -cp (Join-Path $rootDir 'out') com.finance.pricer.ComprehensivePhase3And4SelfTest
& $java -cp (Join-Path $rootDir 'out') com.finance.pricer.ComprehensivePhase5SelfTest
& $java -cp (Join-Path $rootDir 'out') com.finance.pricer.ComprehensivePhase6And7SelfTest
