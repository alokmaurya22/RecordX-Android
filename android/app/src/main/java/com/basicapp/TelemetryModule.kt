package com.basicapp

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.app.ActivityManager
import android.os.Debug
import android.content.Context
import android.os.Build
import java.io.RandomAccessFile
import java.util.Timer
import java.util.TimerTask
import org.json.JSONObject
import org.json.JSONArray

class TelemetryModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {
    
    private var monitoringTimer: Timer? = null
    private var metricsHistory = mutableListOf<JSONObject>()
    private var lastCpuStats: CpuStats? = null
    private var isMonitoring = false
    
    override fun getName(): String {
        return "TelemetryModule"
    }
    
    // Data classes
    data class CpuStats(val total: Long, val idle: Long)
    data class MemoryMetrics(
        val systemTotalMb: Long,
        val systemUsedMb: Long,
        val systemAvailMb: Long,
        val appHeapMb: Double,
        val appNativeMb: Double,
        val appGraphicsMb: Double,
        val appTotalMb: Double
    )
    
    /**
     * Start monitoring system metrics
     */
    @ReactMethod
    fun startMonitoring(promise: Promise) {
        try {
            if (isMonitoring) {
                promise.resolve("Already monitoring")
                return
            }
            
            stopMonitoring(null) // Stop any existing timer
            
            metricsHistory.clear()
            lastCpuStats = readCpuStats() // Initialize baseline
            isMonitoring = true
            
            monitoringTimer = Timer()
            monitoringTimer?.scheduleAtFixedRate(object : TimerTask() {
                override fun run() {
                    try {
                        val metrics = collectMetrics()
                        metricsHistory.add(metrics)
                        
                        // Keep only last 300 entries (5 minutes at 1s interval)
                        if (metricsHistory.size > 300) {
                            metricsHistory.removeAt(0)
                        }
                        
                        // Emit event to React Native
                        emitMetricsEvent(metrics)
                    } catch (e: Exception) {
                        // Silently handle errors to prevent timer crash
                    }
                }
            }, 0, 1000) // Every 1 second
            
            promise.resolve("Monitoring started")
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message)
        }
    }
    
    /**
     * Stop monitoring system metrics
     */
    @ReactMethod
    fun stopMonitoring(promise: Promise?) {
        try {
            isMonitoring = false
            monitoringTimer?.cancel()
            monitoringTimer = null
            promise?.resolve("Monitoring stopped")
        } catch (e: Exception) {
            promise?.reject("STOP_ERROR", e.message)
        }
    }
    
    /**
     * Get current metrics snapshot
     */
    @ReactMethod
    fun getCurrentMetrics(promise: Promise) {
        try {
            val metrics = collectMetrics()
            val map = Arguments.createMap()
            map.putString("data", metrics.toString())
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("METRICS_ERROR", e.message)
        }
    }
    
    /**
     * Get metrics history
     */
    @ReactMethod
    fun getMetricsHistory(promise: Promise) {
        try {
            val array = JSONArray()
            metricsHistory.forEach { array.put(it) }
            
            val map = Arguments.createMap()
            map.putString("data", array.toString())
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("HISTORY_ERROR", e.message)
        }
    }
    
    /**
     * Collect all metrics at current moment
     */
    private fun collectMetrics(): JSONObject {
        val metrics = JSONObject()
        
        // Timestamp
        metrics.put("timestamp", System.currentTimeMillis())
        
        // CPU Usage
        val cpuUsage = getCpuUsage()
        metrics.put("cpu_usage", cpuUsage)
        
        // Memory Metrics
        val memoryMetrics = getMemoryMetrics()
        val memoryObj = JSONObject()
        memoryObj.put("system_total_mb", memoryMetrics.systemTotalMb)
        memoryObj.put("system_used_mb", memoryMetrics.systemUsedMb)
        memoryObj.put("system_available_mb", memoryMetrics.systemAvailMb)
        memoryObj.put("app_heap_mb", memoryMetrics.appHeapMb)
        memoryObj.put("app_native_mb", memoryMetrics.appNativeMb)
        memoryObj.put("app_graphics_mb", memoryMetrics.appGraphicsMb)
        memoryObj.put("app_total_mb", memoryMetrics.appTotalMb)
        metrics.put("memory", memoryObj)
        
        // GPU Usage (may be null)
        val gpuUsage = getGpuUsage()
        if (gpuUsage != null) {
            metrics.put("gpu_usage", gpuUsage)
        } else {
            metrics.put("gpu_usage", JSONObject.NULL)
        }
        
        return metrics
    }
    
    /**
     * Calculate CPU usage percentage
     */
    private fun getCpuUsage(): Double {
        try {
            val currentStats = readCpuStats()
            val previousStats = lastCpuStats
            
            if (previousStats == null) {
                lastCpuStats = currentStats
                return 0.0
            }
            
            val totalDelta = currentStats.total - previousStats.total
            val idleDelta = currentStats.idle - previousStats.idle
            
            lastCpuStats = currentStats
            
            if (totalDelta == 0L) return 0.0
            
            val usage = ((totalDelta - idleDelta).toDouble() / totalDelta) * 100.0
            return usage.coerceIn(0.0, 100.0)
        } catch (e: Exception) {
            return 0.0
        }
    }
    
    /**
     * Read CPU stats from /proc/stat
     */
    private fun readCpuStats(): CpuStats {
        return try {
            val reader = RandomAccessFile("/proc/stat", "r")
            val line = reader.readLine()
            reader.close()
            
            // Parse: cpu  user nice system idle iowait irq softirq
            val parts = line.split("\\s+".toRegex())
            val user = parts[1].toLong()
            val nice = parts[2].toLong()
            val system = parts[3].toLong()
            val idle = parts[4].toLong()
            val iowait = parts[5].toLong()
            val irq = parts[6].toLong()
            val softirq = parts[7].toLong()
            
            val total = user + nice + system + idle + iowait + irq + softirq
            CpuStats(total, idle)
        } catch (e: Exception) {
            // Fallback for permission denied or file not accessible
            // Return dummy values to prevent crash
            CpuStats(100, 50)
        }
    }
    
    /**
     * Get memory usage metrics
     */
    private fun getMemoryMetrics(): MemoryMetrics {
        val activityManager = reactApplicationContext
            .getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        
        // System memory
        val memoryInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memoryInfo)
        val totalMem = memoryInfo.totalMem / (1024 * 1024) // Convert to MB
        val availMem = memoryInfo.availMem / (1024 * 1024)
        val usedMem = totalMem - availMem
        
        // App memory
        val pid = android.os.Process.myPid()
        val processMemoryInfo = activityManager.getProcessMemoryInfo(intArrayOf(pid))
        val appMemInfo = processMemoryInfo[0]
        
        val heapMb = appMemInfo.dalvikPrivateDirty / 1024.0
        val nativeMb = appMemInfo.nativePrivateDirty / 1024.0
        val graphicsMb = appMemInfo.otherPrivateDirty / 1024.0
        val totalAppMb = heapMb + nativeMb + graphicsMb
        
        return MemoryMetrics(
            systemTotalMb = totalMem,
            systemUsedMb = usedMem,
            systemAvailMb = availMem,
            appHeapMb = heapMb,
            appNativeMb = nativeMb,
            appGraphicsMb = graphicsMb,
            appTotalMb = totalAppMb
        )
    }
    
    /**
     * Get GPU usage (device-dependent)
     */
    private fun getGpuUsage(): Double? {
        // Try multiple paths for different chipsets
        val gpuPaths = listOf(
            "/sys/class/kgsl/kgsl-3d0/gpubusy_percentage",  // Qualcomm
            "/sys/devices/platform/gpu/utilization",         // Generic
            "/sys/kernel/gpu/gpu_busy"                       // Samsung Exynos
        )
        
        for (path in gpuPaths) {
            val usage = readGpuFromSysfs(path)
            if (usage != null) return usage
        }
        
        return null // GPU metrics not available
    }
    
    /**
     * Read GPU usage from sysfs file
     */
    private fun readGpuFromSysfs(path: String): Double? {
        return try {
            val file = java.io.File(path)
            if (!file.exists()) return null
            
            val content = file.readText().trim()
            content.toDoubleOrNull()
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Emit metrics event to React Native
     */
    private fun emitMetricsEvent(metrics: JSONObject) {
        try {
            val params = Arguments.createMap()
            params.putString("data", metrics.toString())
            
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("TelemetryMetrics", params)
        } catch (e: Exception) {
            // Silently handle - React Native context may not be ready
        }
    }
}
