@echo off
echo ========================================
echo   Download Telemetry Logs
echo ========================================
echo.

echo Creating logs directory...
if not exist "telemetry_logs" mkdir telemetry_logs
echo.

echo Listing telemetry files on device...
adb shell ls -lh /sdcard/Android/data/com.basicapp/files/telemetry/
echo.

echo Downloading telemetry logs...
adb pull /sdcard/Android/data/com.basicapp/files/telemetry/ telemetry_logs\
echo.

echo ========================================
echo   Logs downloaded to: telemetry_logs\
echo ========================================
echo.

echo Opening logs folder...
explorer telemetry_logs
