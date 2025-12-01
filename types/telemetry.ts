export interface TelemetryMetrics {
    timestamp: number;
    cpu_usage: number;
    memory: {
        system_total_mb: number;
        system_used_mb: number;
        system_available_mb: number;
        app_heap_mb: number;
        app_native_mb: number;
        app_graphics_mb: number;
        app_total_mb: number;
    };
    gpu_usage: number | null;
}

export interface LatencyMetrics {
    button_to_start_ms: number;
    start_to_callback_ms: number;
    total_ms: number;
}

export interface TelemetryReport {
    session_id: string;
    start_time: string;
    end_time: string;
    duration_seconds: number;
    device_info: {
        model: string;
        android_version: string;
        cpu_cores: number;
        total_ram_mb: number;
    };
    cpu: {
        average: number;
        peak: number;
        min: number;
    };
    memory: {
        average_mb: number;
        peak_mb: number;
        min_mb: number;
    };
    gpu: {
        average?: number;
        peak?: number;
        available: boolean;
    };
    latency?: LatencyMetrics;
    bottlenecks: string[];
    recommendations: string[];
}

export interface TelemetrySession {
    session_id: string;
    start_time: string;
    metrics: TelemetryMetrics[];
    latency?: LatencyMetrics;
}
