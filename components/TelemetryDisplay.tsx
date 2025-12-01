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
    const [expanded, setExpanded] = useState(true);

    useEffect(() => {
        if (!visible || !telemetryEmitter) return;

        const subscription = telemetryEmitter.addListener('TelemetryMetrics', (event: any) => {
            try {
                const data = JSON.parse(event.data);
                setMetrics(data);
            } catch (error) {
                console.error('[TelemetryDisplay] Failed to parse metrics:', error);
            }
        });

        return () => {
            subscription.remove();
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
                message: `Telemetry logs saved to:\n\nJSON: ${logPath}\n\nReport: ${reportPath}\n\nYou can access these files using a file manager app.`,
            });
        } catch (error: any) {
            Alert.alert('Export Failed', error.message);
        }
    };

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
                                <Text style={styles.value}>{metrics.cpu_usage?.toFixed(1) || '0.0'}%</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.label}>Memory:</Text>
                                <Text style={styles.value}>{metrics.memory?.app_total_mb?.toFixed(0) || '0'} MB</Text>
                            </View>
                            <View style={styles.metricRow}>
                                <Text style={styles.label}>GPU:</Text>
                                <Text style={styles.value}>
                                    {metrics.gpu_usage !== null ? `${metrics.gpu_usage.toFixed(1)}%` : 'N/A'}
                                </Text>
                            </View>
                            <View style={styles.separator} />
                            <Text style={styles.timestamp}>
                                {new Date(metrics.timestamp).toLocaleTimeString()}
                            </Text>
                        </>
                    ) : (
                        <Text style={styles.waitingText}>Waiting for data...</Text>
                    )}

                    <TouchableOpacity
                        style={styles.exportButton}
                        onPress={handleExportLogs}
                    >
                        <Text style={styles.exportText}>📁 Export Session Logs</Text>
                    </TouchableOpacity>

                    <Text style={styles.hint}>
                        Real-time metrics • Auto-saved
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
        backgroundColor: 'rgba(15, 15, 30, 0.95)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#10b981',
        minWidth: 220,
        zIndex: 1000,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
    },
    title: {
        color: '#10b981',
        fontSize: 14,
        fontWeight: '600',
    },
    closeButton: {
        padding: 4,
    },
    closeText: {
        color: '#8b8b9a',
        fontSize: 16,
        fontWeight: 'bold',
    },
    content: {
        padding: 12,
        paddingTop: 0,
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
        paddingVertical: 4,
    },
    label: {
        color: '#8b8b9a',
        fontSize: 13,
        fontWeight: '500',
    },
    value: {
        color: '#10b981',
        fontSize: 14,
        fontWeight: '700',
    },
    separator: {
        height: 1,
        backgroundColor: '#2a2a3e',
        marginVertical: 8,
    },
    timestamp: {
        color: '#8b8b9a',
        fontSize: 10,
        textAlign: 'center',
        marginBottom: 12,
        fontStyle: 'italic',
    },
    waitingText: {
        color: '#8b8b9a',
        fontSize: 12,
        textAlign: 'center',
        marginVertical: 16,
        fontStyle: 'italic',
    },
    exportButton: {
        backgroundColor: '#3b82f6',
        padding: 10,
        borderRadius: 8,
        marginTop: 8,
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
        marginTop: 8,
        textAlign: 'center',
        fontStyle: 'italic',
    },
});
