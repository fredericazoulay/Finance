@echo off
setlocal
if not exist out mkdir out
javac -d out src\com\finance\pricer\*.java
if errorlevel 1 exit /b %errorlevel%
java -cp out com.finance.pricer.PricerSelfTest
java -cp out com.finance.pricer.PricerApp option BLACK_SCHOLES 100 1 CALL true 100 0.05 0.20 0.01
