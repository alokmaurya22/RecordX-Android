import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Share } from 'react-native';
import { NativeModules, NativeEventEmitter } from 'react-native';
import TelemetryLogger from '../utils/TelemetryLogger';
import type { TelemetryMetrics } from '../types/telemetry';

const { TelemetryModule } = NativeModules;
const telemetryEmitter = TelemetryModule ? new NativeEventEmitter(TelemetryModule) : null;

interface TelemetryDisplayProps {
    visible: boolean;
    onToggle: () => void;
}

export const TelemetryDisplay: React.FC<TelemetryDisplayProps> = ({ visible, onToggle }) => {
    const [metrics, setMetrics] = useState<TelemetryMetrics | null>(null);
    const [latency, setLatency] = useState<number | null>(null);
    const [expanded, setExpanded] = useState(true);
    const [updateCount, setUpdateCount] = useState(0);

    useEffect(() => {
        if (!visible || !telemetryEmitter) return;

        console.log('[TelemetryDisplay] Setting up listener...');

        const subscription = telemetryEmitter.addListener('TelemetryMetrics', (event: any) => {
            try {
                const data = JSON.parse(event.data);
                console.log('[TelemetryDisplay] Received data:', data);
                setMetrics(data);
                setUpdateCount(prev => prev + 1);
            } catch (error) {
                console.error('[TelemetryDisplay] Failed to parse metrics:', error);
            }
        });

        // Check for latency updates
        const latencyInterval = setInterval(() => {
            const logger = TelemetryLogger as any;
            if (logger.latencyMetrics && logger.latencyMetrics.total_ms) {
                setLatency(logger.latencyMetrics.total_ms);
            }
        }, 500);

        return () => {
            console.log('[TelemetryDisplay] Removing listener...');
            subscription.remove();
            clearInterval(latencyInterval);
        };
    }, [visible]);

    if (!visible) return null;

    const handleExportLogs = async () => {
        try {
            const logPath = TelemetryLogger.getLogFilePath();
            const reportPath = TelemetryLogger.getReportFilePath();

            if (!logPath || !reportPath) {
                Alert.alert('No Logs', 'No telemetry logs found. Start recording first!');
                return;
            }

            await Share.share({
                title: 'Telemetry Logs',
                message: ` Telemetry Logs\n\nJSON: ${logPath}\n\nReport: ${reportPath}\n\nAccess via file manager in:\n/sdcard/Android/data/com.basicapp/files/telemetry/`,
            });
        } catch (error: any) {
            Alert.alert('Export Failed', error.message);
        }
    };

    const cpuValue = metrics?.cpu_usage || 0;
    const memValue = metrics?.memory?.app_total_mb || 0;
    const gpuValue = metrics?.gpu_usage;

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.header}
                onPress={() => setExpanded(!expanded)}
                activeOpacity={0.7}
            >
                <Text style={styles.title}>📊 Telemetry {expanded ? '▼' : '▶'}</Text>
                <TouchableOpacity onPress={onToggle} style={styles.closeButton}>
                    <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
            </TouchableOpacity>

            {expanded && (
                <View style={styles.content}>
                    {metrics ? (
                        <>
                            <View style={styles.metricRow}>
                                <Text style={styles.label}>CPU:</Text>
                                <Text style={[styles.value, cpuValue === 0 && styles.warningValue]}>
                                    {cpuValue === 0 ? 'N/A*' : `${cpuValue.toFixed(1)}%`}
                                </Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.label}>Memory:</Text>
                                <Text style={styles.value}>{memValue.toFixed(0)} MB</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.label}>GPU:</Text>
                                <Text style={[styles.value, (gpuValue === null || gpuValue === undefined) && styles.warningValue]}>
                                    {gpuValue !== null && gpuValue !== undefined ? `${gpuValue.toFixed(1)}%` : 'N/A*'}
                                </Text>
                            </View>

                            {latency !== null && (
                                <View style={styles.metricRow}>
                                    <Text style={styles.label}>Latency:</Text>
                                    <Text style={[styles.value, styles.latencyValue]}>
                                        {latency.toFixed(0)} ms
                                    </Text>
                                </View>
                            )}

                            <View style={styles.separator} />
                            <View style={styles.statusRow}>
                                <Text style={styles.timestamp}>
                                    {new Date(metrics.timestamp).toLocaleTimeString()}
                                </Text>
                                <View style={styles.updateIndicator}>
                                    <View style={styles.updateDot} />
                                    <Text style={styles.updateText}>#{updateCount}</Text>
                                </View>
                            </View>

                            {(cpuValue === 0 || gpuValue === null || gpuValue === undefined) && (
                                <Text style={styles.noteText}>
                                    * Device/Permission limitation
                                </Text>
                            )}
                        </>
                    ) : (
                        <Text style={styles.waitingText}>Waiting for data...</Text>
                    )}

                    <TouchableOpacity
                        style={styles.exportButton}
                        onPress={handleExportLogs}
                    >
                        <Text style={styles.exportText}>📁 Export Logs</Text>
                    </TouchableOpacity>

                    <Text style={styles.hint}>
                        Real-time • Updates: {updateCount}
                    </Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 100,
        right: 10,
        backgroundColor: 'rgba(15, 15, 30, 0.98)',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#10b981',
        minWidth: 240,
        zIndex: 1000,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 14,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
    },
    title: {
        color: '#10b981',
        fontSize: 15,
        fontWeight: '700',
    },
    closeButton: {
        padding: 4,
    },
    closeText: {
        color: '#8b8b9a',
        fontSize: 18,
        fontWeight: 'bold',
    },
    content: {
        padding: 14,
        paddingTop: 12,
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        paddingVertical: 6,
        paddingHorizontal: 8,
        backgroundColor: 'rgba(42, 42, 62, 0.5)',
        borderRadius: 6,
    },
    label: {
        color: '#e0e0e8',
        fontSize: 13,
        fontWeight: '600',
    },
    value: {
        color: '#10b981',
        fontSize: 15,
        fontWeight: '700',
    },
    warningValue: {
        color: '#f59e0b',
    },
    latencyValue: {
        color: '#3b82f6',
    },
    separator: {
        height: 1,
        backgroundColor: '#2a2a3e',
        marginVertical: 10,
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    timestamp: {
        color: '#8b8b9a',
        fontSize: 11,
        fontStyle: 'italic',
    },
    updateIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    updateDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10b981',
    },
    updateText: {
        color: '#8b8b9a',
        fontSize: 10,
        fontWeight: '600',
    },
    noteText: {
        color: '#f59e0b',
        fontSize: 10,
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 8,
        fontStyle: 'italic',
    },
    waitingText: {
        color: '#8b8b9a',
        fontSize: 13,
        textAlign: 'center',
        marginVertical: 20,
        fontStyle: 'italic',
    },
    exportButton: {
        backgroundColor: '#3b82f6',
        padding: 12,
        borderRadius: 8,
        marginTop: 12,
        alignItems: 'center',
    },
    exportText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '700',
    },
    hint: {
        color: '#8b8b9a',
        fontSize: 10,
        marginTop: 10,
        textAlign: 'center',
        fontStyle: 'italic',
    },
});
