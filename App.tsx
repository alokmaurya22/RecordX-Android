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
  NativeModules,
  TextInput,
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
import TelemetryLogger from './utils/TelemetryLogger';
import { TelemetryDisplay } from './components/TelemetryDisplay';

const { VideoMerger } = NativeModules;

// Feature flag for telemetry (enable in development)
const ENABLE_TELEMETRY = __DEV__;

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

  // Custom duration mode tracking
  const [isPreBufferCustom, setIsPreBufferCustom] = useState(false);
  const [isPostBufferCustom, setIsPostBufferCustom] = useState(false);
  const [preBufferInput, setPreBufferInput] = useState('');
  const [postBufferInput, setPostBufferInput] = useState('');

  // Telemetry state
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [telemetryActive, setTelemetryActive] = useState(false);

  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const bufferingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentRecordingRef = useRef(false);
  const isBufferingRef = useRef(false);
  const isCapturingRef = useRef(false); // Track capture state for callbacks
  const preBufferDurationRef = useRef(preBufferDuration); // Track current preBufferDuration
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

  // Update ref when preBufferDuration changes
  useEffect(() => {
    preBufferDurationRef.current = preBufferDuration;
  }, [preBufferDuration]);

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

  // Continuous buffering - records 3s segments in background
  const startContinuousBuffering = () => {
    console.log('Starting continuous buffering...');
    setIsBuffering(true);
    isBufferingRef.current = true;
    setRecordingStatus(`Buffering ${preBufferDuration}s (background)...`);

    const recordSegment = async () => {
      // Check ref for immediate stop
      if (!camera.current || !isBufferingRef.current || isCapturing) return;

      // CRITICAL: Check if already recording
      if (segmentRecordingRef.current) {
        console.log('⚠️ Segment already recording, skipping...');
        return;
      }

      // Extra safety: Try to stop any stuck recording
      try {
        if (camera.current) {
          // This will fail silently if not recording
          await camera.current.stopRecording();
          await new Promise<void>(resolve => setTimeout(resolve, 100));
        }
      } catch (e) {
        // Expected if not recording, ignore
      }

      segmentRecordingRef.current = true;

      try {
        await camera.current.startRecording({
          onRecordingFinished: (video) => {
            console.log('Segment finished:', video.path);
            segmentRecordingRef.current = false;

            // Only update queue if we're still in buffering mode (not capturing)
            if (!isCapturingRef.current) {
              setSegmentQueue(prev => {
                const newQueue = [...prev, video.path];
                // Keep only last N seconds worth of segments (each segment = 3s)
                // Use ref to get current preBufferDuration value (avoid stale closure)
                const currentPreBuffer = preBufferDurationRef.current;
                const maxSegments = Math.ceil(currentPreBuffer / 3);

                // Remove old segments if queue exceeds limit
                while (newQueue.length > maxSegments) {
                  const removed = newQueue.shift();
                  if (removed) {
                    RNFS.unlink(removed).catch(() => { });
                  }
                }
                console.log(`Buffer: ${newQueue.length} segments (${newQueue.length * 3}s / ${currentPreBuffer}s) [Max: ${maxSegments}]`);
                return newQueue;
              });

              // Recursively record next segment if still buffering
              if (isBufferingRef.current) {
                recordSegment();
              }
            } else {
              // During capture, just delete the segment that finished
              console.log('⚠️ Segment finished during capture, deleting:', video.path);
              RNFS.unlink(video.path).catch(() => { });
            }
          },
          onRecordingError: (error) => {
            // During capture, errors are expected (we force-stopped the segment)
            if (isCapturingRef.current) {
              console.log('⚠️ Segment error during capture (expected), ignoring');
              segmentRecordingRef.current = false;
              return;
            }

            console.error('Segment error:', error);
            segmentRecordingRef.current = false;
            // Retry after delay if error (only during buffering)
            if (isBufferingRef.current && !isCapturingRef.current) {
              setTimeout(recordSegment, 1000);
            }
          },
        });

        // Stop after 3 seconds
        setTimeout(async () => {
          if (camera.current && segmentRecordingRef.current) {
            try {
              await camera.current.stopRecording();
            } catch (e) {
              console.warn('Stop error:', e);
            }
          }
        }, 3000);
      } catch (error) {
        console.error('Error starting segment:', error);
        segmentRecordingRef.current = false;
      }
    };

    // Start loop
    recordSegment();
  };

  const stopContinuousBuffering = async () => {
    console.log('Stopping buffering...');
    setIsBuffering(false);
    isBufferingRef.current = false;

    // Stop any active recording
    if (segmentRecordingRef.current && camera.current) {
      try {
        await camera.current.stopRecording();
        await new Promise<void>(resolve => setTimeout(resolve, 200));
      } catch (e) {
        // Ignore if not recording
      }
    }
    segmentRecordingRef.current = false;

    // Clean up segments
    segmentQueue.forEach(path => {
      RNFS.unlink(path).catch(() => { });
    });
    setSegmentQueue([]);

    if (!isCapturing) {
      setRecordingStatus('Ready to record');
    }
  };

  // Reset entire app state
  const resetApp = () => {
    console.log(' ===== RESETTING APP =====');

    // Stop any ongoing recording
    if (isRecording && camera.current) {
      try {
        camera.current.stopRecording();
      } catch (e) {
        console.warn('Error stopping recording during reset:', e);
      }
    }

    // Stop buffering
    if (isBuffering) {
      stopContinuousBuffering();
    }

    // Clear timers
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }

    // Reset all state variables
    setIsRecording(false);
    setRecordedVideoPath(null);
    setRecordingStatus('Ready to record');
    setShowPreview(false);
    setRecordingTime(0);
    setBufferMode(false);
    setIsBuffering(false);
    setSegmentQueue([]);
    setPreBufferDuration(5);
    setPostBufferDuration(5);
    setIsCapturing(false);
    setIsMerging(false);
    setIsPreBufferCustom(false);
    setIsPostBufferCustom(false);
    setPreBufferInput('');
    setPostBufferInput('');

    // Reset refs
    isBufferingRef.current = false;
    isCapturingRef.current = false;
    segmentRecordingRef.current = false;
    preBufferDurationRef.current = 5;

    console.log(' App reset complete!');
    Alert.alert('App Reset', 'All settings and recordings have been cleared.');
  };


  // Capture: Save pre-buffer + record post-buffer
  const handleCircularCapture = async () => {
    if (!camera.current || isCapturing) return;

    console.log('🎬 ===== CAPTURE STARTED =====');

    // Start telemetry if enabled and not already active
    if (ENABLE_TELEMETRY && !telemetryActive) {
      const sessionId = `session_${new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0]}`;
      await TelemetryLogger.start(sessionId);
      setTelemetryActive(true);
    }

    // Record latency start
    if (ENABLE_TELEMETRY) {
      TelemetryLogger.recordLatencyStart();
    }

    // Set both state and ref immediately
    setIsCapturing(true);
    isCapturingRef.current = true;

    // Stop buffering loop
    isBufferingRef.current = false;
    setIsBuffering(false);

    // If currently recording a pre-buffer segment, stop it gracefully
    if (segmentRecordingRef.current && camera.current) {
      console.log('⏸️ Stopping current pre-buffer segment...');
      try {
        await camera.current.stopRecording();
        // Wait for the callback to fire and segment to be saved
        await new Promise<void>(resolve => setTimeout(resolve, 600));
      } catch (e) {
        console.warn('⚠️ Error stopping pre-buffer segment:', e);
      }
      segmentRecordingRef.current = false;
    }

    // SNAPSHOT: Take a copy of current queue (prevents interference)
    const preBufferSegments = [...segmentQueue];
    console.log(`📹 Pre-buffer snapshot: ${preBufferSegments.length} segments (${preBufferSegments.length * 3}s)`);

    if (preBufferSegments.length === 0) {
      console.warn('⚠️ No pre-buffer segments available!');
    }

    // Start post-buffer recording
    setRecordingStatus(`Recording ${postBufferDuration}s post-buffer...`);
    setRecordingTime(0);

    // Start timer
    timerInterval.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);

    // Record post-buffer as SINGLE video (exact duration)
    console.log(`📹 Recording ${postBufferDuration}s post-buffer (single video)...`);

    const postBufferPath = await new Promise<string | null>((resolve) => {
      if (!camera.current) {
        console.error('❌ Camera not available');
        resolve(null);
        return;
      }

      let recordingCompleted = false;

      try {
        camera.current.startRecording({
          onRecordingFinished: (video) => {
            console.log(`✅ Post-buffer finished: ${video.path}`);
            recordingCompleted = true;
            resolve(video.path);
          },
          onRecordingError: (error) => {
            console.error(`❌ Post-buffer error:`, error);
            recordingCompleted = true;
            resolve(null);
          },
        });

        // Stop after exact duration (in milliseconds)
        setTimeout(async () => {
          if (!recordingCompleted && camera.current) {
            try {
              console.log(`⏹️ Stopping post-buffer after ${postBufferDuration}s...`);
              await camera.current.stopRecording();
            } catch (e) {
              console.warn(`⚠️ Stop error:`, e);
              if (!recordingCompleted) {
                resolve(null);
              }
            }
          }
        }, postBufferDuration * 1000);
      } catch (error) {
        console.error(`❌ Failed to start post-buffer:`, error);
        resolve(null);
      }
    });

    const postBufferSegments: string[] = [];
    if (postBufferPath) {
      postBufferSegments.push(postBufferPath);
      console.log(`✅ Post-buffer complete: ${postBufferDuration}s`);
    } else {
      console.warn('⚠️ Post-buffer recording failed');
    }


    // Stop timer
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }

    // Merge all segments
    console.log('\n🔄 Starting merge process...');
    setRecordingStatus('Merging videos...');
    setIsMerging(true);

    const allSegments = [...preBufferSegments, ...postBufferSegments];
    console.log(`📦 Total segments to merge: ${allSegments.length}`);

    await mergeAndSaveSegments(allSegments);

    // Cleanup segments
    console.log('🗑️ Cleaning up temporary segments...');
    allSegments.forEach(path => {
      RNFS.unlink(path).catch(() => { });
    });

    // Clear queue and reset state
    setSegmentQueue([]);
    setIsCapturing(false);
    isCapturingRef.current = false;
    setIsMerging(false);

    console.log('🎬 ===== CAPTURE COMPLETE =====\n');

    // Restart buffering if buffer mode is still on
    if (bufferMode) {
      console.log('🔄 Restarting continuous buffering...');
      startContinuousBuffering();
    } else {
      setRecordingStatus('Ready to record');
    }
  };

  // Merge segments using native MediaMuxer
  const mergeAndSaveSegments = async (segments: string[]) => {
    if (segments.length === 0) {
      Alert.alert('Error', 'No segments to merge');
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
      const filename = `VID_${timestamp}.mp4`;
      const outputPath = `${RNFS.ExternalStorageDirectoryPath}/Movies/${filename}`;

      console.log('=== MERGING VIDEOS ===');
      console.log(`Total segments: ${segments.length}`);
      console.log(`Expected duration: ~${segments.length * 3}s`);
      console.log('Segment paths:');
      segments.forEach((path, index) => {
        console.log(`  ${index + 1}. ${path}`);
      });
      console.log(`Output: ${outputPath}`);
      console.log('=====================');

      // Call native merger
      await VideoMerger.mergeVideos(segments, outputPath);

      console.log('✅ Merge completed successfully!');

      // Add to gallery
      try {
        await CameraRoll.save(`file://${outputPath}`, { type: 'video' });
        console.log('✅ Video added to gallery');
      } catch (err) {
        console.warn('Failed to add to gallery:', err);
      }

      setRecordedVideoPath(outputPath);
      setRecordingStatus('Video saved!');
      Alert.alert(
        'Success! 🎉',
        `Video merged and saved to gallery!\n\nSegments: ${segments.length}\nDuration: ~${segments.length * 3}s\n\nFile: ${filename}`
      );
    } catch (error: any) {
      console.error('❌ Merge error:', error);
      setRecordingStatus('Error merging video');
      Alert.alert('Error', `Failed to merge video:\n${error.message || error}`);
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
      // Start telemetry if enabled
      if (ENABLE_TELEMETRY && !telemetryActive) {
        const sessionId = `session_${new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0]}`;
        await TelemetryLogger.start(sessionId);
        setTelemetryActive(true);
      }

      // Record latency start
      if (ENABLE_TELEMETRY) {
        TelemetryLogger.recordLatencyStart();
      }

      onRecordingStarted();
      camera.current.startRecording({
        onRecordingFinished: (video) => {
          // Record latency callback
          if (ENABLE_TELEMETRY) {
            TelemetryLogger.recordLatencyCallback();
          }
          onRecordingStopped(video.path);
        },
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
          <TouchableOpacity
            style={styles.headerContainer}
            onPress={resetApp}
            activeOpacity={0.7}
          >
            <Text style={styles.header}>Video Recorder</Text>
            <Text style={styles.subtitle}>Circular Buffer Recording • Tap to Reset</Text>
          </TouchableOpacity>

          {/* Telemetry Toggle Button */}
          {ENABLE_TELEMETRY && (
            <TouchableOpacity
              style={styles.telemetryToggleButton}
              onPress={() => setShowTelemetry(!showTelemetry)}
              activeOpacity={0.7}
            >
              <Text style={styles.telemetryToggleText}>
                {showTelemetry ? 'Hide' : 'Show'} Telemetry
              </Text>
            </TouchableOpacity>
          )}

          {/* Buffer Mode Toggle */}
          <View style={styles.bufferModeCard}>
            <Text style={styles.bufferModeLabel}>Circular Buffer Mode</Text>
            <Switch
              value={bufferMode}
              onValueChange={setBufferMode}
              disabled={isRecording || isCapturing || isPreBufferCustom || isPostBufferCustom}
              trackColor={{ false: '#2a2a3e', true: '#10b981' }}
              thumbColor={bufferMode ? '#ffffff' : '#8b8b9a'}
            />
          </View>

          {/* Duration Selectors */}
          {bufferMode && (
            <View style={styles.durationCard}>
              {/* Pre-Buffer Duration */}
              <View style={styles.durationRow}>
                <Text style={styles.durationLabel}>Pre-Buffer:</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={isPreBufferCustom ? 'custom' : (preBufferDuration === 3 || preBufferDuration === 5 || preBufferDuration === 10 ? preBufferDuration : 'custom')}
                    onValueChange={(value) => {
                      if (value === 'custom') {
                        setIsPreBufferCustom(true);
                        setPreBufferInput('');
                      } else {
                        setIsPreBufferCustom(false);
                        setPreBufferDuration(value as number);
                      }
                    }}
                    style={styles.picker}
                    mode="dropdown"
                    dropdownIconColor="#ffffff">
                    <Picker.Item label="3 seconds" value={3} />
                    <Picker.Item label="5 seconds" value={5} />
                    <Picker.Item label="10 seconds" value={10} />
                    <Picker.Item
                      label={preBufferDuration !== 3 && preBufferDuration !== 5 && preBufferDuration !== 10 && !isPreBufferCustom
                        ? `Custom (${preBufferDuration}s)`
                        : "Custom"}
                      value="custom"
                    />
                  </Picker>
                </View>
              </View>

              {/* Custom Pre-Buffer Input */}
              {isPreBufferCustom && (
                <View style={styles.customInputRow}>
                  <Text style={styles.customInputLabel}>Enter Duration (1-60s):</Text>
                  <TextInput
                    style={styles.customInput}
                    value={preBufferInput}
                    onChangeText={setPreBufferInput}
                    onSubmitEditing={() => {
                      const num = parseInt(preBufferInput);
                      if (num && num >= 1 && num <= 60) {
                        setPreBufferDuration(num);
                        setIsPreBufferCustom(false);
                        // Duration updated - buffering continues with new target
                      } else {
                        Alert.alert('Invalid Input', 'Please enter a number between 1 and 60');
                      }
                    }}
                    keyboardType="numeric"
                    placeholder="Type and press Enter"
                    placeholderTextColor="#8b8b9a"
                    autoFocus={true}
                    returnKeyType="done"
                  />
                </View>
              )}

              {/* Post-Buffer Duration */}
              <View style={styles.durationRow}>
                <Text style={styles.durationLabel}>Post-Buffer:</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={isPostBufferCustom ? 'custom' : (postBufferDuration === 3 || postBufferDuration === 5 || postBufferDuration === 10 ? postBufferDuration : 'custom')}
                    onValueChange={(value) => {
                      if (value === 'custom') {
                        setIsPostBufferCustom(true);
                        setPostBufferInput('');
                      } else {
                        setIsPostBufferCustom(false);
                        setPostBufferDuration(value as number);
                      }
                    }}
                    style={styles.picker}
                    mode="dropdown"
                    dropdownIconColor="#ffffff">
                    <Picker.Item label="3 seconds" value={3} />
                    <Picker.Item label="5 seconds" value={5} />
                    <Picker.Item label="10 seconds" value={10} />
                    <Picker.Item
                      label={postBufferDuration !== 3 && postBufferDuration !== 5 && postBufferDuration !== 10 && !isPostBufferCustom
                        ? `Custom (${postBufferDuration}s)`
                        : "Custom"}
                      value="custom"
                    />
                  </Picker>
                </View>
              </View>

              {/* Custom Post-Buffer Input */}
              {isPostBufferCustom && (
                <View style={styles.customInputRow}>
                  <Text style={styles.customInputLabel}>Enter Duration (1-60s):</Text>
                  <TextInput
                    style={styles.customInput}
                    value={postBufferInput}
                    onChangeText={setPostBufferInput}
                    onSubmitEditing={() => {
                      const num = parseInt(postBufferInput);
                      if (num && num >= 1 && num <= 60) {
                        setPostBufferDuration(num);
                        setIsPostBufferCustom(false);
                        // Duration updated - no need to restart buffering
                      } else {
                        Alert.alert('Invalid Input', 'Please enter a number between 1 and 60');
                      }
                    }}
                    keyboardType="numeric"
                    placeholder="Type and press Enter"
                    placeholderTextColor="#8b8b9a"
                    autoFocus={true}
                    returnKeyType="done"
                  />
                </View>
              )}

              <Text style={styles.durationInfo}>
                Total: {preBufferDuration + postBufferDuration}s | Buffer: {segmentQueue.length * 3}s/{preBufferDuration}s
              </Text>

              {/* Warning when custom input is active */}
              {(isPreBufferCustom || isPostBufferCustom) && (
                <Text style={styles.customInputWarning}>
                  ⚠️ Enter duration and press Enter to continue
                </Text>
              )}
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
                style={[styles.controlButton, styles.startButton, (isRecording || isPreBufferCustom || isPostBufferCustom) && styles.disabledButton]}
                onPress={handleStartRecording}
                disabled={isRecording || isPreBufferCustom || isPostBufferCustom}>
                <Text style={styles.buttonText}>▶ Start</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.controlButton, styles.stopButton, (!isRecording || isPreBufferCustom || isPostBufferCustom) && styles.disabledButton]}
                onPress={handleStopRecording}
                disabled={!isRecording || isPreBufferCustom || isPostBufferCustom}>
                <Text style={styles.buttonText}>■ Stop</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.captureButton, (isCapturing || segmentQueue.length * 3 < preBufferDuration || isPreBufferCustom || isPostBufferCustom) && styles.disabledButton]}
              onPress={handleCircularCapture}
              disabled={isCapturing || segmentQueue.length * 3 < preBufferDuration || isPreBufferCustom || isPostBufferCustom}>
              <Text style={styles.captureButtonText}>
                {isPreBufferCustom || isPostBufferCustom
                  ? 'Enter Duration First'
                  : segmentQueue.length * 3 < preBufferDuration
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

        {/* Telemetry Display Overlay */}
        {ENABLE_TELEMETRY && (
          <TelemetryDisplay
            visible={showTelemetry}
            onToggle={() => setShowTelemetry(!showTelemetry)}
          />
        )}
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
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  customInputLabel: {
    fontSize: 13,
    color: '#e0e0e8',
    fontWeight: '600',
    flex: 1,
  },
  customInput: {
    backgroundColor: '#2a2a3e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    width: 80,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  customInputWarning: {
    fontSize: 12,
    color: '#f59e0b',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  telemetryToggleButton: {
    backgroundColor: '#1a1a2e',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#10b981',
    alignItems: 'center',
  },
  telemetryToggleText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '700',
  },
  videoPlayer: { flex: 1, backgroundColor: '#000000' },
});

export default App;
