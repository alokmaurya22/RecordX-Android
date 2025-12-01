import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import RNFS from 'react-native-fs';

interface LogViewerProps {
    visible: boolean;
    onClose: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({ visible, onClose }) => {
    const [logs, setLogs] = useState<string>('No logs found');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (visible) {
            loadLogs();
        }
    }, [visible]);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const telemetryDir = `${RNFS.ExternalDirectoryPath}/telemetry`;
            const dirExists = await RNFS.exists(telemetryDir);

            if (!dirExists) {
                setLogs('No telemetry logs found yet.\n\nStart recording to generate logs!');
                setLoading(false);
                return;
            }

            const files = await RNFS.readDir(telemetryDir);
            const jsonFiles = files.filter(f => f.name.endsWith('.json')).sort((a, b) => b.mtime!.getTime() - a.mtime!.getTime());

            if (jsonFiles.length === 0) {
                setLogs('No telemetry logs found yet.\n\nStart recording to generate logs!');
                setLoading(false);
                return;
            }

            // Read latest log file
            const latestFile = jsonFiles[0];
            const content = await RNFS.readFile(latestFile.path, 'utf8');
            const data = JSON.parse(content);

            // Format for display
            let formatted = `📊 TELEMETRY REPORT\n`;
            formatted += `${'='.repeat(40)}\n\n`;
            formatted += `Session: ${data.session_id}\n`;
            formatted += `Start: ${new Date(data.start_time).toLocaleString()}\n`;
            formatted += `Duration: ${data.metrics?.length || 0} seconds\n\n`;

            if (data.metrics && data.metrics.length > 0) {
                formatted += `📈 LATEST METRICS:\n`;
                formatted += `${'-'.repeat(40)}\n`;

                // Show last 5 metrics
                const recentMetrics = data.metrics.slice(-5);
                recentMetrics.forEach((m: any) => {
                    const time = new Date(m.timestamp).toLocaleTimeString();
                    formatted += `\n[${time}]\n`;
                    formatted += `  CPU: ${m.cpu_usage?.toFixed(1) || 'N/A'}%\n`;
                    formatted += `  MEM: ${m.memory?.app_total_mb?.toFixed(0) || 'N/A'} MB\n`;
                    formatted += `  GPU: ${m.gpu_usage !== null ? m.gpu_usage.toFixed(1) + '%' : 'N/A'}\n`;
                });

                // Summary
                const cpuValues = data.metrics.map((m: any) => m.cpu_usage).filter((v: any) => v !== undefined);
                const memValues = data.metrics.map((m: any) => m.memory?.app_total_mb).filter((v: any) => v !== undefined);

                if (cpuValues.length > 0) {
                    formatted += `\n${'='.repeat(40)}\n`;
                    formatted += `📊 SUMMARY:\n`;
                    formatted += `${'-'.repeat(40)}\n`;
                    formatted += `CPU Avg: ${(cpuValues.reduce((a: number, b: number) => a + b, 0) / cpuValues.length).toFixed(1)}%\n`;
                    formatted += `CPU Peak: ${Math.max(...cpuValues).toFixed(1)}%\n`;
                    formatted += `MEM Avg: ${(memValues.reduce((a: number, b: number) => a + b, 0) / memValues.length).toFixed(0)} MB\n`;
                    formatted += `MEM Peak: ${Math.max(...memValues).toFixed(0)} MB\n`;
                }
            }

            if (data.latency) {
                formatted += `\n${'='.repeat(40)}\n`;
                formatted += `⚡ LATENCY:\n`;
                formatted += `${'-'.repeat(40)}\n`;
                formatted += `Total: ${data.latency.total_ms?.toFixed(2) || 'N/A'} ms\n`;
            }

            formatted += `\n${'='.repeat(40)}\n`;
            formatted += `\nTotal log files: ${jsonFiles.length}\n`;
            formatted += `Latest: ${latestFile.name}\n`;

            setLogs(formatted);
        } catch (error: any) {
            setLogs(`Error loading logs:\n\n${error.message}\n\nMake sure you have recorded at least once!`);
        }
        setLoading(false);
    };

    if (!visible) return null;

    return (
        <View style={styles.overlay}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>📊 Telemetry Logs</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Text style={styles.closeText}>✕</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content}>
                    <Text style={styles.logText}>{logs}</Text>
                </ScrollView>

                <View style={styles.footer}>
                    <TouchableOpacity style={styles.refreshButton} onPress={loadLogs}>
                        <Text style={styles.refreshText}>🔄 Refresh</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        zIndex: 2000,
    },
    container: {
        flex: 1,
        margin: 20,
        marginTop: 60,
        backgroundColor: '#1a1a2e',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#10b981',
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#0f0f1e',
        borderBottomWidth: 1,
        borderBottomColor: '#10b981',
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#10b981',
    },
    closeButton: {
        padding: 8,
    },
    closeText: {
        fontSize: 24,
        color: '#ffffff',
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    logText: {
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#e0e0e8',
        lineHeight: 20,
    },
    footer: {
        padding: 16,
        backgroundColor: '#0f0f1e',
        borderTopWidth: 1,
        borderTopColor: '#10b981',
    },
    refreshButton: {
        backgroundColor: '#10b981',
        padding: 14,
        borderRadius: 10,
        alignItems: 'center',
    },
    refreshText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },
});
