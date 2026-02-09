import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator, Switch, Platform, Animated, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Camera, CameraView } from 'expo-camera';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken, clearAuthData } from '../../utils/auth';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'https://guardlogin.preview.emergentagent.com';
const MIN_RECORDING_DURATION = 2;

export default function Report() {
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [caption, setCaption] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cameraRef, setCameraRef] = useState<any>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [location, setLocation] = useState<any>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [savedDuration, setSavedDuration] = useState(0); // Store the final duration
  const [cameraReady, setCameraReady] = useState(false);
  const recordingPromiseRef = useRef<Promise<any> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationRef = useRef(0); // Use ref to track duration in real-time

  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isRecording]);

  // Duration tracking with ref for accurate final value
  useEffect(() => {
    let interval: any;
    if (isRecording && recordingStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        setRecordingDuration(elapsed);
        durationRef.current = elapsed; // Keep ref in sync
      }, 100);
    } else if (!isRecording && recordingStartTime === null) {
      // Recording stopped, save the final duration
      if (durationRef.current > 0) {
        setSavedDuration(durationRef.current);
      }
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isRecording, recordingStartTime]);

  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    try {
      const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
      const { status: micStatus } = await Camera.requestMicrophonePermissionsAsync();
      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      
      setHasPermission(cameraStatus === 'granted' && micStatus === 'granted');
      
      if (locationStatus === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setLocation(loc);
      }
    } catch (error) {
      console.error('[VideoReport] Permission error:', error);
      setHasPermission(false);
    }
  };

  const startRecording = async () => {
    if (!cameraRef || !cameraReady) {
      Alert.alert('Please Wait', 'Camera is still initializing...');
      return;
    }

    // Reset duration tracking
    durationRef.current = 0;
    setRecordingDuration(0);
    setSavedDuration(0);
    setRecordingUri(null);
    
    setIsRecording(true);
    setRecordingStartTime(Date.now());
    
    try {
      console.log('[VideoReport] Starting recording...');
      recordingPromiseRef.current = cameraRef.recordAsync({ 
        maxDuration: 300, 
        quality: '720p',
        mute: false
      });
      
      const video = await recordingPromiseRef.current;
      
      console.log('[VideoReport] Recording finished:', video);
      
      if (video && video.uri) {
        // Verify the file exists and has size
        const fileInfo = await FileSystem.getInfoAsync(video.uri);
        console.log('[VideoReport] File info:', fileInfo);
        
        if (fileInfo.exists && fileInfo.size && fileInfo.size > 0) {
          setRecordingUri(video.uri);
          // Use the ref value for accurate duration
          const finalDuration = durationRef.current;
          setSavedDuration(finalDuration);
          Alert.alert('Video Recorded', `Recording saved (${formatDuration(finalDuration)})\nFile size: ${Math.round((fileInfo.size || 0) / 1024)}KB`);
        } else {
          throw new Error('Video file is empty or invalid');
        }
      } else {
        throw new Error('No video URI returned');
      }
    } catch (error: any) {
      console.error('[VideoReport] Recording error:', error);
      if (!error?.message?.toLowerCase().includes('stopped')) {
        Alert.alert('Recording Error', error?.message || 'Failed to record video. Please try again.');
      }
    } finally {
      setIsRecording(false);
      setRecordingStartTime(null);
      recordingPromiseRef.current = null;
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    
    const currentDuration = durationRef.current;
    if (currentDuration < MIN_RECORDING_DURATION) {
      Alert.alert('Recording Too Short', `Please record for at least ${MIN_RECORDING_DURATION} seconds.`);
      return;
    }
    
    console.log('[VideoReport] Stopping recording at duration:', currentDuration);
    
    if (cameraRef && recordingPromiseRef.current) {
      cameraRef.stopRecording();
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const onCameraReady = () => {
    console.log('[VideoReport] Camera ready');
    setCameraReady(true);
  };

  const submitReport = async () => {
    if (!recordingUri) {
      Alert.alert('Error', 'Please record a video first');
      return;
    }

    // Use savedDuration which is the final captured duration
    const finalDuration = savedDuration > 0 ? savedDuration : durationRef.current;
    
    if (finalDuration === 0) {
      Alert.alert('Error', 'Video duration could not be determined. Please re-record.');
      return;
    }

    setLoading(true);
    setUploadProgress(0);
    
    try {
      let currentLocation = location;
      if (!currentLocation) {
        try {
          currentLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        } catch (err) {
          currentLocation = { coords: { latitude: 9.0820, longitude: 8.6753 } };
        }
      }

      const token = await getAuthToken();
      if (!token) {
        router.replace('/auth/login');
        return;
      }
      
      // Step 1: Verify video file
      setUploadProgress(10);
      const fileInfo = await FileSystem.getInfoAsync(recordingUri);
      if (!fileInfo.exists || !fileInfo.size || fileInfo.size === 0) {
        throw new Error('Video file not found or is empty');
      }
      
      console.log('[VideoReport] Uploading file:', fileInfo.size, 'bytes, duration:', finalDuration);

      // Step 2: Convert to base64 for upload
      setUploadProgress(20);
      const base64Video = await FileSystem.readAsStringAsync(recordingUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!base64Video || base64Video.length === 0) {
        throw new Error('Failed to read video file');
      }

      // Step 3: Upload to backend with file data
      setUploadProgress(40);
      
      const response = await axios.post(
        `${BACKEND_URL}/api/report/upload-video`,
        {
          video_data: base64Video,
          caption: caption || 'Live security report',
          is_anonymous: isAnonymous,
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          duration_seconds: finalDuration
        },
        { 
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000,
          onUploadProgress: (progressEvent) => {
            const progress = progressEvent.loaded / (progressEvent.total || 1);
            setUploadProgress(40 + Math.round(progress * 50));
          }
        }
      );

      setUploadProgress(100);

      Alert.alert('Success!', 'Your video report has been uploaded successfully.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      console.error('[VideoReport] Submit error:', error);
      
      let errorMessage = 'Failed to upload report.';
      if (error.response) {
        errorMessage = error.response.data?.detail || errorMessage;
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Upload timed out. Try with a shorter video.';
      } else if (error.request) {
        errorMessage = 'Network error. Please check your connection.';
      } else {
        errorMessage = error.message || errorMessage;
      }
      
      // Offer to save locally
      Alert.alert(
        'Upload Failed',
        `${errorMessage}\n\nWould you like to save the report locally and retry later?`,
        [
          { text: 'Discard', style: 'destructive' },
          { 
            text: 'Save Locally', 
            onPress: () => saveReportLocally(finalDuration)
          }
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const saveReportLocally = async (duration: number) => {
    try {
      const pendingReports = JSON.parse(await AsyncStorage.getItem('pending_video_reports') || '[]');
      pendingReports.push({
        id: Date.now().toString(),
        uri: recordingUri,
        caption: caption || 'Live security report',
        is_anonymous: isAnonymous,
        latitude: location?.coords?.latitude || 9.0820,
        longitude: location?.coords?.longitude || 8.6753,
        duration_seconds: duration,
        created_at: new Date().toISOString()
      });
      await AsyncStorage.setItem('pending_video_reports', JSON.stringify(pendingReports));
      Alert.alert('Saved', 'Report saved locally. You can retry uploading from My Reports.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save locally');
    }
  };

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Requesting permissions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={80} color="#EF4444" />
          <Text style={styles.errorText}>Camera & Microphone access required</Text>
          <TouchableOpacity style={styles.retryButton} onPress={requestPermissions}>
            <Text style={styles.retryButtonText}>Grant Permissions</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Video Report</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          ref={(ref) => setCameraRef(ref)}
          style={styles.camera}
          facing="back"
          mode="video"
          onCameraReady={onCameraReady}
        />
        
        {/* Recording indicator */}
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <Animated.View style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.recordingTime}>{formatDuration(recordingDuration)}</Text>
          </View>
        )}

        {/* Recorded video info */}
        {recordingUri && !isRecording && (
          <View style={styles.recordedBadge}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.recordedText}>Recorded: {formatDuration(savedDuration)}</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.controls}>
        {/* Record/Stop Button */}
        <View style={styles.recordButtonContainer}>
          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordButtonActive]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={loading || !cameraReady}
          >
            <Ionicons 
              name={isRecording ? 'stop' : 'videocam'} 
              size={36} 
              color="#fff" 
            />
          </TouchableOpacity>
          <Text style={styles.recordButtonLabel}>
            {!cameraReady ? 'Initializing...' : isRecording ? 'Tap to Stop' : 'Tap to Record'}
          </Text>
        </View>

        {/* Caption */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Caption (Optional)</Text>
          <TextInput
            style={styles.input}
            value={caption}
            onChangeText={setCaption}
            placeholder="Describe the situation..."
            placeholderTextColor="#64748B"
            multiline
          />
        </View>

        {/* Anonymous Toggle */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Submit Anonymously</Text>
            <Text style={styles.toggleDescription}>Your identity will be hidden</Text>
          </View>
          <Switch
            value={isAnonymous}
            onValueChange={setIsAnonymous}
            trackColor={{ false: '#334155', true: '#10B98150' }}
            thumbColor={isAnonymous ? '#10B981' : '#94A3B8'}
          />
        </View>

        {/* Upload Progress */}
        {loading && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
            </View>
            <Text style={styles.progressText}>{uploadProgress}% Uploading...</Text>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, (!recordingUri || loading) && styles.submitButtonDisabled]}
          onPress={submitReport}
          disabled={!recordingUri || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload" size={24} color="#fff" />
              <Text style={styles.submitButtonText}>Upload Report</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94A3B8', marginTop: 16 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: '#EF4444', fontSize: 18, marginTop: 16, textAlign: 'center' },
  retryButton: { marginTop: 20, backgroundColor: '#3B82F6', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  cameraContainer: { height: 300, backgroundColor: '#000', position: 'relative' },
  camera: { flex: 1 },
  recordingIndicator: { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  recordingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', marginRight: 8 },
  recordingTime: { color: '#fff', fontSize: 16, fontWeight: '600' },
  recordedBadge: { position: 'absolute', bottom: 16, left: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.9)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
  recordedText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  controls: { flex: 1, padding: 16 },
  recordButtonContainer: { alignItems: 'center', marginBottom: 20 },
  recordButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' },
  recordButtonActive: { backgroundColor: '#EF4444' },
  recordButtonLabel: { color: '#94A3B8', marginTop: 8 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { color: '#94A3B8', marginBottom: 8 },
  input: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, color: '#fff', minHeight: 80, textAlignVertical: 'top' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E293B', padding: 16, borderRadius: 12, marginBottom: 16 },
  toggleLabel: { color: '#fff', fontWeight: '500' },
  toggleDescription: { color: '#64748B', fontSize: 12, marginTop: 2 },
  progressContainer: { marginBottom: 16 },
  progressBar: { height: 8, backgroundColor: '#1E293B', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#10B981' },
  progressText: { color: '#94A3B8', marginTop: 8, textAlign: 'center' },
  submitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3B82F6', paddingVertical: 16, borderRadius: 12 },
  submitButtonDisabled: { backgroundColor: '#334155' },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
