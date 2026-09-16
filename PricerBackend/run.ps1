$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force out | Out-Null
javac -d out src/com/finance/pricer/*.java
java -cp out com.finance.pricer.PricerSelfTest
Write-Host 'Build complete. Example:'
java -cp out com.finance.pricer.PricerApp option BLACK_SCHOLES 100 1 CALL true 100 0.05 0.20 0.01
