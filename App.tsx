/**
 * TRUE Circular Buffer Recording
 * Pre-buffer: Continuous background recording
 * Post-buffer: Triggered recording on button press
 * Final: Merged pre + post video
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  useColorScheme,
  Alert,
  PermissionsAndroid,
  Platform,
  Modal,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import Video from 'react-native-video';
import RNFS from 'react-native-fs';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { Picker } from '@react-native-picker/picker';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  // Normal recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoPath, setRecordedVideoPath] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string>('Ready to record');
  const [showPreview, setShowPreview] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Circular buffer state
  const [bufferMode, setBufferMode] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [segmentQueue, setSegmentQueue] = useState<string[]>([]);
  const [preBufferDuration, setPreBufferDuration] = useState(5);
  const [postBufferDuration, setPostBufferDuration] = useState(5);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const bufferingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentRecordingRef = useRef(false);
  const camera = useRef<Camera>(null);
  const device = useCameraDevice('back');
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const { hasPermission: hasMicrophonePermission, requestPermission: requestMicrophonePermission } = useMicrophonePermission();

  const backgroundStyle = {
    backgroundColor: '#0f0f1e',
    flex: 1,
  };

  useEffect(() => {
    requestPermissions();
  }, []);

  // Start/stop buffering when buffer mode changes
  useEffect(() => {
    if (bufferMode && !isBuffering && !isCapturing) {
      startContinuousBuffering();
    } else if (!bufferMode && isBuffering) {
      stopContinuousBuffering();
    }

    return () => {
      stopContinuousBuffering();
    };
  }, [bufferMode]);

  const requestPermissions = async () => {
    if (!hasCameraPermission) {
      await requestCameraPermission();
    }
    if (!hasMicrophonePermission) {
      await requestMicrophonePermission();
    }

    if (Platform.OS === 'android') {
      try {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        ]);
      } catch (err) {
        console.warn(err);
      }
    }
  };

  // Continuous buffering - records 1s segments in background
  const startContinuousBuffering = () => {
    console.log('Starting continuous buffering...');
    setIsBuffering(true);
    setRecordingStatus(`Buffering ${preBufferDuration}s (background)...`);

    const recordSegment = async () => {
      if (!camera.current || segmentRecordingRef.current || isCapturing) return;

      segmentRecordingRef.current = true;

      try {
        camera.current.startRecording({
          onRecordingFinished: (video) => {
            setSegmentQueue(prev => {
              const newQueue = [...prev, video.path];
              // Keep only last N segments
              if (newQueue.length > preBufferDuration) {
                const removed = newQueue.shift();
                if (removed) {
                  RNFS.unlink(removed).catch(() => { });
                }
              }
              console.log(`Buffer: ${newQueue.length}/${preBufferDuration} segments`);
              return newQueue;
            });
            segmentRecordingRef.current = false;
          },
          onRecordingError: (error) => {
            console.error('Segment error:', error);
            segmentRecordingRef.current = false;
          },
        });

        // Stop after 2 seconds (1s too short, causes no-data error)
        setTimeout(async () => {
          if (camera.current && segmentRecordingRef.current) {
            await camera.current.stopRecording();
          }
        }, 2000);
      } catch (error) {
        console.error('Error starting segment:', error);
        segmentRecordingRef.current = false;
      }
    };

    // Record first segment
    recordSegment();

    // Continue recording every 2.1s
    bufferingInterval.current = setInterval(recordSegment, 2100);
  };

  const stopContinuousBuffering = () => {
    console.log('Stopping buffering...');
    setIsBuffering(false);

    if (bufferingInterval.current) {
      clearInterval(bufferingInterval.current);
      bufferingInterval.current = null;
    }

    // Clean up segments
    segmentQueue.forEach(path => {
      RNFS.unlink(path).catch(() => { });
    });
    setSegmentQueue([]);

    if (!isCapturing) {
      setRecordingStatus('Ready to record');
    }
  };

  // Capture: Save pre-buffer + record post-buffer
  const handleCircularCapture = async () => {
    if (!camera.current || isCapturing) return;

    setIsCapturing(true);
    stopContinuousBuffering();

    const preBufferSegments = [...segmentQueue];
    console.log(`Pre-buffer: ${preBufferSegments.length} segments`);

    setRecordingStatus(`Recording ${postBufferDuration}s post-buffer...`);
    setRecordingTime(0);

    // Start timer
    timerInterval.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);

    const postBufferSegments: string[] = [];

    // Record post-buffer segments (each segment = 2s)
    const segmentsNeeded = Math.ceil(postBufferDuration / 2);
    for (let i = 0; i < segmentsNeeded; i++) {
      await new Promise<void>((resolve) => {
        camera.current?.startRecording({
          onRecordingFinished: (video) => {
            postBufferSegments.push(video.path);
            resolve();
          },
          onRecordingError: (error) => {
            console.error('Post-buffer error:', error);
            resolve();
          },
        });

        setTimeout(async () => {
          await camera.current?.stopRecording();
        }, 2000);
      });
    }

    // Stop timer
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }

    console.log(`Post-buffer: ${postBufferSegments.length} segments`);
    setRecordingStatus('Merging videos...');
    setIsMerging(true);

    // Merge all segments
    const allSegments = [...preBufferSegments, ...postBufferSegments];
    await mergeAndSaveSegments(allSegments);

    // Cleanup
    allSegments.forEach(path => {
      RNFS.unlink(path).catch(() => { });
    });

    setSegmentQueue([]);
    setIsCapturing(false);
    setIsMerging(false);

    // Restart buffering
    if (bufferMode) {
      startContinuousBuffering();
    } else {
      setRecordingStatus('Ready to record');
    }
  };

  // Merge segments - WORKAROUND: Save first segment only
  // TODO: Implement proper merging with FFmpeg or native code
  const mergeAndSaveSegments = async (segments: string[]) => {
    if (segments.length === 0) {
      Alert.alert('Error', 'No segments to merge');
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
      const filename = `VID_${timestamp}.mp4`;
      const outputPath = `${RNFS.ExternalStorageDirectoryPath}/Movies/${filename}`;

      // WORKAROUND: Binary concatenation doesn't work for MP4
      // For now, save only the first segment
      // Proper solution needs FFmpeg or native MP4 muxer
      console.log(`Saving first segment out of ${segments.length} segments`);
      console.log(`Source path: ${segments[0]}`);
      console.log(`Destination path: ${outputPath}`);

      // Check if source file exists
      const fileExists = await RNFS.exists(segments[0]);
      console.log(`File exists: ${fileExists}`);

      if (!fileExists) {
        throw new Error(`Source file does not exist: ${segments[0]}`);
      }

      // Use copyFile instead of moveFile to preserve original
      await RNFS.copyFile(segments[0], outputPath);

      // Add to gallery
      try {
        await CameraRoll.save(`file://${outputPath}`, { type: 'video' });
        console.log('Video added to gallery');
      } catch (err) {
        console.warn('Failed to add to gallery:', err);
      }

      setRecordedVideoPath(outputPath);
      setRecordingStatus('Video saved!');

      // Notify user about limitation
      if (segments.length > 1) {
        Alert.alert(
          'Video Saved',
          `Note: Saved first segment only. Full merging requires FFmpeg.\nSegments: ${segments.length}, Duration: ~${segments.length * 2}s`,
        );
      } else {
        Alert.alert('Success', 'Video saved to Gallery');
      }
    } catch (error: any) {
      console.error('Save error:', error);
      setRecordingStatus('Error saving video');
      Alert.alert('Error', 'Failed to save video');
    }
  };

  // Normal recording (non-buffer mode)
  const onRecordingStarted = () => {
    setRecordingStatus('Recording...');
    setIsRecording(true);
    setRecordingTime(0);
    timerInterval.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const onRecordingStopped = async (videoPath: string) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
      const filename = `VID_${timestamp}.mp4`;
      const destPath = `${RNFS.ExternalStorageDirectoryPath}/Movies/${filename}`;
      await RNFS.moveFile(videoPath, destPath);

      try {
        await CameraRoll.save(`file://${destPath}`, { type: 'video' });
      } catch (err) {
        console.warn('Failed to add to gallery:', err);
      }

      setRecordingStatus('Recording saved!');
      setRecordedVideoPath(destPath);
      Alert.alert('Success', `Video saved: ${filename}`);
    } catch (error: any) {
      setRecordingStatus('Error saving video');
      setRecordedVideoPath(videoPath);
    }

    setIsRecording(false);
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
  };

  const handleStartRecording = async () => {
    if (!camera.current) {
      Alert.alert('Error', 'Camera not ready');
      return;
    }

    try {
      onRecordingStarted();
      camera.current.startRecording({
        onRecordingFinished: (video) => onRecordingStopped(video.path),
        onRecordingError: (error) => {
          console.error('Recording error:', error);
          setIsRecording(false);
          Alert.alert('Error', error.message);
        },
      });
    } catch (error: any) {
      console.error('Start error:', error);
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    if (!camera.current) return;
    try {
      await camera.current.stopRecording();
    } catch (error: any) {
      console.error('Stop error:', error);
    }
  };

  const handlePreviewRecording = () => {
    if (recordedVideoPath) {
      setShowPreview(true);
    } else {
      Alert.alert('No Video', 'Record a video first');
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!hasCameraPermission || !hasMicrophonePermission) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={backgroundStyle}>
          <View style={styles.container}>
            <View style={styles.permissionCard}>
              <Text style={styles.permissionTitle}>Permissions Required</Text>
              <Text style={styles.permissionText}>Requesting camera and microphone access...</Text>
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!device) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={backgroundStyle}>
          <View style={styles.container}>
            <View style={styles.permissionCard}>
              <Text style={styles.permissionTitle}>No Camera Found</Text>
              <Text style={styles.permissionText}>Configure virtual camera in AVD Manager</Text>
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={backgroundStyle}>
        <StatusBar barStyle="light-content" backgroundColor={backgroundStyle.backgroundColor} />
        <View style={styles.container}>
          <View style={styles.headerContainer}>
            <Text style={styles.header}>Video Recorder</Text>
            <Text style={styles.subtitle}>Circular Buffer Recording</Text>
          </View>

          {/* Buffer Mode Toggle */}
          <View style={styles.bufferModeCard}>
            <Text style={styles.bufferModeLabel}>Circular Buffer Mode</Text>
            <Switch
              value={bufferMode}
              onValueChange={setBufferMode}
              disabled={isRecording || isCapturing}
              trackColor={{ false: '#2a2a3e', true: '#10b981' }}
              thumbColor={bufferMode ? '#ffffff' : '#8b8b9a'}
            />
          </View>

          {/* Duration Selectors */}
          {bufferMode && (
            <View style={styles.durationCard}>
              <View style={styles.durationRow}>
                <Text style={styles.durationLabel}>Pre-Buffer:</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={preBufferDuration}
                    onValueChange={(value) => setPreBufferDuration(value)}
                    style={styles.picker}
                    mode="dropdown"
                    dropdownIconColor="#ffffff">
                    <Picker.Item label="3 seconds" value={3} />
                    <Picker.Item label="5 seconds" value={5} />
                    <Picker.Item label="10 seconds" value={10} />
                  </Picker>
                </View>
              </View>
              <View style={styles.durationRow}>
                <Text style={styles.durationLabel}>Post-Buffer:</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={postBufferDuration}
                    onValueChange={(value) => setPostBufferDuration(value)}
                    style={styles.picker}
                    mode="dropdown"
                    dropdownIconColor="#ffffff">
                    <Picker.Item label="3 seconds" value={3} />
                    <Picker.Item label="5 seconds" value={5} />
                    <Picker.Item label="10 seconds" value={10} />
                  </Picker>
                </View>
              </View>
              <Text style={styles.durationInfo}>
                Total: {preBufferDuration + postBufferDuration}s | Buffer: {segmentQueue.length * 2}s/{preBufferDuration}s
              </Text>
            </View>
          )}

          {/* Status Display */}
          <View style={styles.statusCard}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>{recordingStatus}</Text>
            {isMerging && <ActivityIndicator size="small" color="#10b981" style={{ marginLeft: 8 }} />}
          </View>

          {/* Camera Preview */}
          <View style={styles.previewCard}>
            <View style={styles.previewContainer}>
              <Camera
                ref={camera}
                style={styles.camera}
                device={device}
                isActive={true}
                video={true}
                audio={true}
              />
              {(isRecording || isCapturing) && (
                <View style={styles.recordingBadge}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>REC {formatTime(recordingTime)}</Text>
                </View>
              )}
              {isBuffering && (
                <View style={styles.bufferingBadge}>
                  <Text style={styles.bufferingText}>BUFFERING</Text>
                </View>
              )}
            </View>
          </View>

          {/* Control Buttons */}
          {!bufferMode ? (
            <View style={styles.controlsContainer}>
              <TouchableOpacity
                style={[styles.controlButton, styles.startButton, isRecording && styles.disabledButton]}
                onPress={handleStartRecording}
                disabled={isRecording}>
                <Text style={styles.buttonText}>▶ Start</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.controlButton, styles.stopButton, !isRecording && styles.disabledButton]}
                onPress={handleStopRecording}
                disabled={!isRecording}>
                <Text style={styles.buttonText}>■ Stop</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.captureButton, (isCapturing || segmentQueue.length * 2 < preBufferDuration) && styles.disabledButton]}
              onPress={handleCircularCapture}
              disabled={isCapturing || segmentQueue.length * 2 < preBufferDuration}>
              <Text style={styles.captureButtonText}>
                {segmentQueue.length * 2 < preBufferDuration
                  ? 'Buffering...'
                  : 'Capture'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Preview Button */}
          {recordedVideoPath && (
            <TouchableOpacity style={styles.previewButton} onPress={handlePreviewRecording}>
              <Text style={styles.previewButtonText}>▶ Preview Last Recording</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Video Preview Modal */}
        <Modal visible={showPreview} animationType="slide" onRequestClose={() => setShowPreview(false)}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Video Preview</Text>
              <TouchableOpacity onPress={() => setShowPreview(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            {recordedVideoPath && (
              <Video
                source={{ uri: `file://${recordedVideoPath}` }}
                style={styles.videoPlayer}
                controls={true}
                resizeMode="contain"
                repeat={true}
              />
            )}
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#0f0f1e' },
  headerContainer: { alignItems: 'center', marginBottom: 12, paddingTop: 8 },
  header: { fontSize: 32, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 14, color: '#8b8b9a', marginTop: 4 },
  bufferModeCard: {
    backgroundColor: '#1a1a2e',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  bufferModeLabel: { fontSize: 16, color: '#ffffff', fontWeight: '600' },
  durationCard: {
    backgroundColor: '#1a1a2e',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  durationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  durationLabel: { fontSize: 14, color: '#e0e0e8', fontWeight: '600' },
  durationInfo: { fontSize: 12, color: '#10b981', fontWeight: '600', textAlign: 'center', marginTop: 4 },
  pickerContainer: { backgroundColor: '#2a2a3e', borderRadius: 8, width: 150, minHeight: 50, justifyContent: 'center' },
  picker: { color: '#ffffff', height: 50, width: 150 },
  statusCard: {
    backgroundColor: '#1a1a2e',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4ade80', marginRight: 12 },
  statusText: { fontSize: 14, color: '#e0e0e8', fontWeight: '600', flex: 1 },
  previewCard: { flex: 1, marginBottom: 12, borderRadius: 16, backgroundColor: '#1a1a2e', padding: 6 },
  previewContainer: { flex: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000000' },
  camera: { flex: 1 },
  permissionCard: { backgroundColor: '#1a1a2e', padding: 32, borderRadius: 20, alignItems: 'center' },
  permissionTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', marginBottom: 12 },
  permissionText: { fontSize: 16, color: '#8b8b9a', textAlign: 'center' },
  recordingBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ffffff', marginRight: 8 },
  recordingText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  bufferingBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  bufferingText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  controlsContainer: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  controlButton: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  startButton: { backgroundColor: '#10b981' },
  stopButton: { backgroundColor: '#ef4444' },
  captureButton: { backgroundColor: '#3b82f6', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  captureButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  disabledButton: { backgroundColor: '#2a2a3e', opacity: 0.5 },
  previewButton: { backgroundColor: '#8b5cf6', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  previewButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  modalContainer: { flex: 1, backgroundColor: '#0f0f1e' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1a1a2e',
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2a2a3e', alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { color: '#ffffff', fontSize: 24, fontWeight: 'bold' },
  videoPlayer: { flex: 1, backgroundColor: '#000000' },
});

export default App;
