/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
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
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import Video from 'react-native-video';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoPath, setRecordedVideoPath] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string>('Ready to record');
  const [showPreview, setShowPreview] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
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

  const requestPermissions = async () => {
    if (!hasCameraPermission) {
      await requestCameraPermission();
    }
    if (!hasMicrophonePermission) {
      await requestMicrophonePermission();
    }

    // Request storage permissions for Android
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

  // Callback: Recording Started
  const onRecordingStarted = () => {
    console.log('Recording started callback triggered');
    setRecordingStatus('Recording in progress...');
    setIsRecording(true);
    setRecordingTime(0);

    // Start timer
    timerInterval.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  // Callback: Recording Stopped
  const onRecordingStopped = (videoPath: string) => {
    console.log('Recording stopped callback triggered');
    console.log('Video saved at:', videoPath);
    setRecordingStatus('Recording saved successfully!');
    setRecordedVideoPath(videoPath);
    setIsRecording(false);

    // Stop timer
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
  };

  // Callback: Recording Error
  const onRecordingError = (error: any) => {
    console.error('Recording error callback triggered:', error);
    setRecordingStatus(`Error: ${error.message}`);
    setIsRecording(false);

    // Stop timer
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }

    Alert.alert('Recording Error', error.message);
  };

  const handleStartRecording = async () => {
    if (!camera.current) {
      Alert.alert('Error', 'Camera not ready');
      return;
    }

    try {
      // Trigger onRecordingStarted callback
      onRecordingStarted();

      camera.current.startRecording({
        onRecordingFinished: (video) => {
          // Trigger onRecordingStopped callback
          onRecordingStopped(video.path);
          Alert.alert('Success', `Video saved to: ${video.path}`);
        },
        onRecordingError: (error) => {
          // Trigger onRecordingError callback
          onRecordingError(error);
        },
      });
    } catch (error: any) {
      console.error('Start recording error:', error);
      onRecordingError(error);
    }
  };

  const handleStopRecording = async () => {
    if (!camera.current) {
      return;
    }

    try {
      await camera.current.stopRecording();
      setRecordingStatus('Stopping recording...');
    } catch (error: any) {
      console.error('Stop recording error:', error);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const handlePreviewRecording = () => {
    if (recordedVideoPath) {
      setShowPreview(true);
    } else {
      Alert.alert('No Video', 'Please record a video first');
    }
  };

  const closePreview = () => {
    setShowPreview(false);
  };

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Show loading if permissions are not granted yet
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

  // Show error if no camera device found
  if (!device) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={backgroundStyle}>
          <View style={styles.container}>
            <View style={styles.permissionCard}>
              <Text style={styles.permissionTitle}>No Camera Found</Text>
              <Text style={styles.permissionText}>
                Configure virtual camera in AVD Manager or use a physical device
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={backgroundStyle}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={backgroundStyle.backgroundColor}
        />
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.headerContainer}>
            <Text style={styles.header}>Video Recorder</Text>
            <Text style={styles.subtitle}>Professional Recording Studio</Text>
          </View>

          {/* Status Display */}
          <View style={styles.statusCard}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>{recordingStatus}</Text>
          </View>

          {/* Camera Preview Area */}
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
              {isRecording && (
                <View style={styles.recordingBadge}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>REC {formatTime(recordingTime)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Control Buttons */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity
              style={[
                styles.controlButton,
                styles.startButton,
                isRecording && styles.disabledButton,
              ]}
              onPress={handleStartRecording}
              disabled={isRecording}>
              <View style={styles.buttonContent}>
                <Text style={styles.buttonIcon}>▶</Text>
                <Text style={styles.buttonText}>Start</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.controlButton,
                styles.stopButton,
                !isRecording && styles.disabledButton,
              ]}
              onPress={handleStopRecording}
              disabled={!isRecording}>
              <View style={styles.buttonContent}>
                <Text style={styles.buttonIcon}></Text>
                <Text style={styles.buttonText}>Stop</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Preview Button */}
          {recordedVideoPath && (
            <TouchableOpacity
              style={styles.previewButton}
              onPress={handlePreviewRecording}>
              <Text style={styles.previewButtonIcon}></Text>
              <Text style={styles.previewButtonText}>Preview Last Recording</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Video Preview Modal */}
        <Modal
          visible={showPreview}
          animationType="slide"
          onRequestClose={closePreview}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Video Preview</Text>
              <TouchableOpacity onPress={closePreview} style={styles.closeButton}>
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
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#0f0f1e',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 16,
    paddingTop: 8,
  },
  header: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#8b8b9a',
    marginTop: 4,
    fontWeight: '500',
  },
  statusCard: {
    backgroundColor: '#1a1a2e',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
    marginRight: 12,
  },
  statusText: {
    fontSize: 15,
    color: '#e0e0e8',
    fontWeight: '600',
    flex: 1,
  },
  previewCard: {
    flex: 1,
    marginBottom: 16,
    borderRadius: 20,
    backgroundColor: '#1a1a2e',
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  previewContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  permissionCard: {
    backgroundColor: '#1a1a2e',
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 16,
    color: '#8b8b9a',
    textAlign: 'center',
    lineHeight: 24,
  },
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
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
    marginRight: 8,
  },
  recordingText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
  controlsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  controlButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonIcon: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  startButton: {
    backgroundColor: '#10b981',
  },
  stopButton: {
    backgroundColor: '#ef4444',
  },
  disabledButton: {
    backgroundColor: '#2a2a3e',
    opacity: 0.5,
  },
  previewButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  previewButtonIcon: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  previewButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0f0f1e',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  videoPlayer: {
    flex: 1,
    backgroundColor: '#000000',
  },
});

export default App;
