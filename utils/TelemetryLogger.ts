import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import type { TelemetryMetrics, TelemetryReport, LatencyMetrics, TelemetrySession } from '../types/telemetry';

const { TelemetryModule } = NativeModules;
const telemetryEmitter = TelemetryModule ? new NativeEventEmitter(TelemetryModule) : null;

class TelemetryLogger {
    private sessionId: string = '';
    private isMonitoring: boolean = false;
    private metricsBuffer: TelemetryMetrics[] = [];
    private eventSubscription: any = null;
    private logFilePath: string = '';
    private reportFilePath: string = '';

    // Latency tracking
    private latencyStartTime: number = 0;
    private latencyCallbackTime: number = 0;
    private latencyMetrics: LatencyMetrics | null = null;

    /**
     * Start telemetry monitoring
     */
    async start(sessionId: string): Promise<void> {
        if (!TelemetryModule) {
            console.warn('[TELEMETRY] Native module not available');
            return;
        }

        if (this.isMonitoring) {
            console.warn('[TELEMETRY] Already monitoring');
            return;
        }

        try {
            this.sessionId = sessionId;
            this.isMonitoring = true;
            this.metricsBuffer = [];
            this.latencyMetrics = null;

            // Create log directory
            const telemetryDir = `${RNFS.ExternalDirectoryPath}/telemetry`;
            const dirExists = await RNFS.exists(telemetryDir);
            if (!dirExists) {
                await RNFS.mkdir(telemetryDir);
            }

            // Create log file paths
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
            this.logFilePath = `${telemetryDir}/telemetry_${timestamp}.json`;
            this.reportFilePath = `${telemetryDir}/report_${timestamp}.md`;

            // Start native monitoring
            await TelemetryModule.startMonitoring();

            // Subscribe to metrics events
            if (telemetryEmitter) {
                this.eventSubscription = telemetryEmitter.addListener(
                    'TelemetryMetrics',
                    this.handleMetricsUpdate.bind(this)
                );
            }

            console.log(`[TELEMETRY] Monitoring started: ${sessionId}`);
            console.log(`[TELEMETRY] Log file: ${this.logFilePath}`);
        } catch (error) {
            console.error('[TELEMETRY] Failed to start:', error);
            this.isMonitoring = false;
        }
    }

    /**
     * Stop telemetry monitoring and generate report
     */
    async stop(): Promise<TelemetryReport | null> {
        if (!this.isMonitoring) {
            return null;
        }

        try {
            this.isMonitoring = false;

            // Stop native monitoring
            if (TelemetryModule) {
                await TelemetryModule.stopMonitoring();
            }

            // Unsubscribe from events
            if (this.eventSubscription) {
                this.eventSubscription.remove();
                this.eventSubscription = null;
            }

            // Save final log
            await this.saveToFile();

            // Generate report
            const report = this.generateReport();

            // Save report to markdown file
            await this.saveReport(report);

            console.log(`[TELEMETRY] Monitoring stopped. Report generated.`);
            console.log(`[TELEMETRY] Report file: ${this.reportFilePath}`);

            return report;
        } catch (error) {
            console.error('[TELEMETRY] Failed to stop:', error);
            return null;
        }
    }

    /**
     * Record latency start timestamp
     */
    recordLatencyStart(): void {
        this.latencyStartTime = Date.now();
    }

    /**
     * Record latency callback timestamp
     */
    recordLatencyCallback(): void {
        if (this.latencyStartTime === 0) return;

        this.latencyCallbackTime = Date.now();
        const totalLatency = this.latencyCallbackTime - this.latencyStartTime;

        this.latencyMetrics = {
            button_to_start_ms: 0,
            start_to_callback_ms: totalLatency,
            total_ms: totalLatency,
        };

        console.log(`[TELEMETRY] Latency: ${totalLatency.toFixed(2)}ms`);
    }

    /**
     * Handle metrics update from native module
     */
    private handleMetricsUpdate(event: any): void {
        try {
            const data = JSON.parse(event.data);
            this.metricsBuffer.push(data);

            // Console log (formatted)
            this.logToConsole(data);

            // Save to file every 5 seconds
            if (this.metricsBuffer.length % 5 === 0) {
                this.saveToFile();
            }
        } catch (error) {
            console.error('[TELEMETRY] Failed to handle metrics:', error);
        }
    }

    /**
     * Log metrics to console
     */
    private logToConsole(metrics: TelemetryMetrics): void {
        const cpu = metrics.cpu_usage.toFixed(1);
        const mem = metrics.memory.app_total_mb.toFixed(0);
        const gpu = metrics.gpu_usage !== null ? metrics.gpu_usage.toFixed(1) : 'N/A';

        const time = new Date(metrics.timestamp).toLocaleTimeString();
        console.log(
            `[TELEMETRY] ${time} | CPU: ${cpu}% | MEM: ${mem}MB | GPU: ${gpu}%`
        );
    }

    /**
     * Save metrics to file
     */
    private async saveToFile(): Promise<void> {
        if (this.metricsBuffer.length === 0) return;

        try {
            const session: TelemetrySession = {
                session_id: this.sessionId,
                start_time: new Date(this.metricsBuffer[0].timestamp).toISOString(),
                metrics: this.metricsBuffer,
                latency: this.latencyMetrics || undefined,
            };

            const data = JSON.stringify(session, null, 2);
            await RNFS.writeFile(this.logFilePath, data, 'utf8');
        } catch (error) {
            console.error('[TELEMETRY] Failed to save log:', error);
        }
    }

    /**
     * Generate performance report
     */
    private generateReport(): TelemetryReport {
        const cpuValues = this.metricsBuffer.map(m => m.cpu_usage);
        const memValues = this.metricsBuffer.map(m => m.memory.app_total_mb);
        const gpuValues = this.metricsBuffer
            .map(m => m.gpu_usage)
            .filter(v => v !== null) as number[];

        const report: TelemetryReport = {
            session_id: this.sessionId,
            start_time: this.metricsBuffer.length > 0
                ? new Date(this.metricsBuffer[0].timestamp).toISOString()
                : new Date().toISOString(),
            end_time: this.metricsBuffer.length > 0
                ? new Date(this.metricsBuffer[this.metricsBuffer.length - 1].timestamp).toISOString()
                : new Date().toISOString(),
            duration_seconds: this.metricsBuffer.length,
            device_info: {
                model: Platform.OS === 'android' ? 'Android Device' : 'iOS Device',
                android_version: Platform.Version.toString(),
                cpu_cores: 0,
                total_ram_mb: 0,
            },
            cpu: {
                average: this.average(cpuValues),
                peak: Math.max(...cpuValues, 0),
                min: Math.min(...cpuValues, 0),
            },
            memory: {
                average_mb: this.average(memValues),
                peak_mb: Math.max(...memValues, 0),
                min_mb: Math.min(...memValues, 0),
            },
            gpu: gpuValues.length > 0 ? {
                average: this.average(gpuValues),
                peak: Math.max(...gpuValues),
                available: true,
            } : {
                available: false,
            },
            latency: this.latencyMetrics || undefined,
            bottlenecks: this.identifyBottlenecks(),
            recommendations: this.generateRecommendations(),
        };

        return report;
    }

    /**
     * Save report to markdown file
     */
    private async saveReport(report: TelemetryReport): Promise<void> {
        try {
            const markdown = this.generateMarkdownReport(report);
            await RNFS.writeFile(this.reportFilePath, markdown, 'utf8');
        } catch (error) {
            console.error('[TELEMETRY] Failed to save report:', error);
        }
    }

    /**
     * Generate markdown report
     */
    private generateMarkdownReport(report: TelemetryReport): string {
        const duration = this.formatDuration(report.duration_seconds);

        let md = `# 📊 Telemetry Performance Report\n\n`;
        md += `**Session:** ${report.session_id}  \n`;
        md += `**Date:** ${new Date(report.start_time).toLocaleString()}  \n`;
        md += `**Duration:** ${duration}  \n\n`;
        md += `---\n\n`;

        md += `## 📱 Device Information\n`;
        md += `- **Model:** ${report.device_info.model}\n`;
        md += `- **Android Version:** ${report.device_info.android_version}\n\n`;
        md += `---\n\n`;

        md += `## 📈 Resource Usage Summary\n`;
        md += `*(react-native-vision-camera with CameraX backend)*\n\n`;

        md += `### 🔥 CPU Usage\n`;
        md += `- **Average:** ${report.cpu.average.toFixed(1)}%\n`;
        md += `- **Peak:** ${report.cpu.peak.toFixed(1)}%\n`;
        md += `- **Minimum:** ${report.cpu.min.toFixed(1)}%\n\n`;

        md += `### 💾 Memory Usage\n`;
        md += `- **Average:** ${report.memory.average_mb.toFixed(0)} MB\n`;
        md += `- **Peak:** ${report.memory.peak_mb.toFixed(0)} MB\n`;
        md += `- **Minimum:** ${report.memory.min_mb.toFixed(0)} MB\n\n`;

        md += `### 🎮 GPU Usage\n`;
        if (report.gpu.available && report.gpu.average !== undefined) {
            md += `- **Average:** ${report.gpu.average.toFixed(1)}%\n`;
            md += `- **Peak:** ${report.gpu.peak?.toFixed(1)}%\n`;
            md += `- **Status:** ✅ Available\n\n`;
        } else {
            md += `- **Status:** ❌ Not Available (device-dependent)\n\n`;
        }

        if (report.latency) {
            md += `### ⚡ Latency Analysis\n`;
            md += `- **Recording Start Latency:** ${report.latency.start_to_callback_ms.toFixed(2)}ms\n`;
            md += `- **Total Latency:** ${report.latency.total_ms.toFixed(2)}ms\n`;
            md += `- **Status:** ${report.latency.total_ms < 100 ? '✅' : '⚠️'} ${report.latency.total_ms < 100 ? 'Within acceptable range (<100ms)' : 'High latency detected'}\n\n`;
        }

        md += `---\n\n`;

        md += `## ⚠️ Identified Bottlenecks\n`;
        if (report.bottlenecks.length > 0) {
            report.bottlenecks.forEach((bottleneck, index) => {
                md += `${index + 1}. ${bottleneck}\n`;
            });
        } else {
            md += `✅ No significant bottlenecks detected\n`;
        }
        md += `\n---\n\n`;

        md += `## 💡 Improvement Recommendations\n`;
        if (report.recommendations.length > 0) {
            report.recommendations.forEach((rec, index) => {
                md += `${index + 1}. ${rec}\n`;
            });
        } else {
            md += `✅ Performance is optimal\n`;
        }
        md += `\n---\n\n`;

        md += `**Generated:** ${new Date().toLocaleString()}  \n`;
        md += `**Tool:** React Native Telemetry Logger v1.0\n`;

        return md;
    }

    /**
     * Calculate average of array
     */
    private average(values: number[]): number {
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    /**
     * Identify performance bottlenecks
     */
    private identifyBottlenecks(): string[] {
        const bottlenecks: string[] = [];

        if (this.metricsBuffer.length === 0) return bottlenecks;

        const cpuValues = this.metricsBuffer.map(m => m.cpu_usage);
        const memValues = this.metricsBuffer.map(m => m.memory.app_total_mb);
        const gpuValues = this.metricsBuffer
            .map(m => m.gpu_usage)
            .filter(v => v !== null) as number[];

        const maxCpu = Math.max(...cpuValues);
        const maxMem = Math.max(...memValues);
        const avgCpu = this.average(cpuValues);

        if (maxCpu > 80) {
            bottlenecks.push(`🔴 High CPU usage detected (peak: ${maxCpu.toFixed(1)}%)`);
        } else if (avgCpu > 60) {
            bottlenecks.push(`🟡 Elevated CPU usage (average: ${avgCpu.toFixed(1)}%)`);
        }

        if (maxMem > 500) {
            bottlenecks.push(`🔴 High memory usage detected (peak: ${maxMem.toFixed(0)}MB)`);
        } else if (maxMem > 300) {
            bottlenecks.push(`🟡 Elevated memory usage (peak: ${maxMem.toFixed(0)}MB)`);
        }

        if (gpuValues.length > 0) {
            const maxGpu = Math.max(...gpuValues);
            if (maxGpu > 80) {
                bottlenecks.push(`🔴 High GPU usage detected (peak: ${maxGpu.toFixed(1)}%)`);
            }
        }

        if (this.latencyMetrics && this.latencyMetrics.total_ms > 100) {
            bottlenecks.push(`🔴 High latency detected (${this.latencyMetrics.total_ms.toFixed(2)}ms)`);
        }

        return bottlenecks;
    }

    /**
     * Generate optimization recommendations
     */
    private generateRecommendations(): string[] {
        const recommendations: string[] = [];

        if (this.metricsBuffer.length === 0) return recommendations;

        const cpuValues = this.metricsBuffer.map(m => m.cpu_usage);
        const memValues = this.metricsBuffer.map(m => m.memory.app_total_mb);

        const avgCpu = this.average(cpuValues);
        const avgMem = this.average(memValues);

        if (avgCpu > 60) {
            recommendations.push('📉 Reduce video resolution from 1080p to 720p (expected CPU reduction: ~20%)');
            recommendations.push('📉 Lower bitrate from 8Mbps to 5Mbps (expected CPU reduction: ~15%)');
        }

        if (avgMem > 300) {
            recommendations.push('💾 Reduce circular buffer duration to minimize memory usage');
            recommendations.push('💾 Implement more aggressive segment cleanup');
        }

        if (avgCpu > 50 || avgMem > 250) {
            recommendations.push('⚙️ Verify MediaCodec is using hardware encoder (not software)');
            recommendations.push('⚙️ Consider using lower frame rate (24fps instead of 30fps)');
        }

        return recommendations;
    }

    /**
     * Format duration in human-readable format
     */
    private formatDuration(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    }

    /**
     * Get log file path
     */
    getLogFilePath(): string {
        return this.logFilePath;
    }

    /**
     * Get report file path
     */
    getReportFilePath(): string {
        return this.reportFilePath;
    }
}

export default new TelemetryLogger();
