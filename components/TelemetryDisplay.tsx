import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import TelemetryLogger from '../utils/TelemetryLogger';
import type { TelemetryMetrics } from '../types/telemetry';

interface TelemetryDisplayProps {
    visible: boolean;
    onToggle: () => void;
}

export const TelemetryDisplay: React.FC<TelemetryDisplayProps> = ({ visible, onToggle }) => {
    const [metrics, setMetrics] = useState<TelemetryMetrics | null>(null);
    const [expanded, setExpanded] = useState(false);

    if (!visible) return null;

    const handleExportLogs = () => {
        const logPath = TelemetryLogger.getLogFilePath();
        const reportPath = TelemetryLogger.getReportFilePath();

        Alert.alert(
            'Telemetry Logs',
            `Logs saved to:\n\nJSON: ${logPath}\n\nReport: ${reportPath}\n\nUse ADB to pull files:\nadb pull ${logPath}`,
            [{ text: 'OK' }]
        );
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.header}
                onPress={() => setExpanded(!expanded)}
                activeOpacity={0.7}
            >
                <Text style={styles.title}> Telemetry {expanded ? '▼' : '▶'}</Text>
                <TouchableOpacity onPress={onToggle} style={styles.closeButton}>
                    <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
            </TouchableOpacity>

            {expanded && (
                <View style={styles.content}>
                    <View style={styles.metricRow}>
                        <Text style={styles.label}>CPU:</Text>
                        <Text style={styles.value}>Monitoring...</Text>
                    </View>
                    <View style={styles.metricRow}>
                        <Text style={styles.label}>MEM:</Text>
                        <Text style={styles.value}>Monitoring...</Text>
                    </View>
                    <View style={styles.metricRow}>
                        <Text style={styles.label}>GPU:</Text>
                        <Text style={styles.value}>Monitoring...</Text>
                    </View>

                    <TouchableOpacity
                        style={styles.exportButton}
                        onPress={handleExportLogs}
                    >
                        <Text style={styles.exportText}>Export Logs</Text>
                    </TouchableOpacity>

                    <Text style={styles.hint}>
                        Check console for real-time metrics
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
        minWidth: 200,
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
    },
    label: {
        color: '#8b8b9a',
        fontSize: 12,
    },
    value: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '600',
    },
    exportButton: {
        backgroundColor: '#10b981',
        padding: 8,
        borderRadius: 6,
        marginTop: 8,
        alignItems: 'center',
    },
    exportText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '600',
    },
    hint: {
        color: '#8b8b9a',
        fontSize: 10,
        marginTop: 8,
        textAlign: 'center',
        fontStyle: 'italic',
    },
});
