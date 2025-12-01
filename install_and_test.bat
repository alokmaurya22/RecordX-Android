@echo off
echo ========================================
echo   Telemetry APK Install and Test
echo ========================================
echo.

echo [1/4] Checking device connection...
adb devices
echo.

echo [2/4] Installing APK...
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
echo.

echo [3/4] APK installed successfully!
echo Please open the app on your device and start recording.
echo.

echo [4/4] Monitoring telemetry logs...
echo Press Ctrl+C to stop monitoring.
echo.
adb logcat | findstr TELEMETRY
