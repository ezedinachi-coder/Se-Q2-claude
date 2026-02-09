import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, 
  ActivityIndicator, Switch, Animated, ScrollView, Dimensions,
  Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Camera, CameraView } from 'expo-camera';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import Slider from '@react-native-community/slider';
import { getAuthToken, clearAuthData } from '../../utils/auth';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL;
const MIN_RECORDING_DURATION = 2;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function VideoReport() {
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
  const [savedDuration, setSavedDuration] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [showCaptionModal, setShowCaptionModal] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  
  const recordingPromiseRef = useRef<Promise<any> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationRef = useRef(0);

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

  useEffect(() => {
    let interval: any;
    if (isRecording && recordingStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        setRecordingDuration(elapsed);
        durationRef.current = elapsed;
      }, 100);
    } else if (!isRecording && recordingStartTime === null && durationRef.current > 0) {
      setSavedDuration(durationRef.current);
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
        const fileInfo = await FileSystem.getInfoAsync(video.uri);
        console.log('[VideoReport] File info:', fileInfo);
        
        if (fileInfo.exists && fileInfo.size && fileInfo.size > 0) {
          setRecordingUri(video.uri);
          const finalDuration = durationRef.current > 0 ? durationRef.current : 2;
          setSavedDuration(finalDuration);
          setShowCaptionModal(true);
        } else {
          throw new Error('Video file is empty or invalid');
        }
      } else {
        throw new Error('No video URI returned');
      }
    } catch (error: any) {
      console.error('[VideoReport] Recording error:', error);
      if (!error?.message?.toLowerCase().includes('stopped')) {
        Alert.alert('Recording Error', error?.message || 'Failed to record video.');
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

  const toggleFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const submitReport = async () => {
    if (!recordingUri) {
      Alert.alert('Error', 'Please record a video first');
      return;
    }

    const finalDuration = savedDuration > 0 ? savedDuration : durationRef.current;
    
    if (finalDuration === 0) {
      Alert.alert('Error', 'Video duration could not be determined. Please re-record.');
      return;
    }

    setShowCaptionModal(false);
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
      
      setUploadProgress(10);
      const fileInfo = await FileSystem.getInfoAsync(recordingUri);
      if (!fileInfo.exists || !fileInfo.size || fileInfo.size === 0) {
        throw new Error('Video file not found or is empty');
      }
      
      console.log('[VideoReport] Uploading file:', fileInfo.size, 'bytes, duration:', finalDuration);

      setUploadProgress(20);
      const base64Video = await FileSystem.readAsStringAsync(recordingUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!base64Video || base64Video.length === 0) {
        throw new Error('Failed to read video file');
      }

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
      
      Alert.alert(
        'Upload Failed',
        `${errorMessage}\n\nWould you like to save the report locally?`,
        [
          { text: 'Discard', style: 'destructive' },
          { text: 'Save Locally', onPress: () => saveReportLocally(finalDuration) }
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
      Alert.alert('Saved', 'Report saved locally. Retry from My Reports.', [
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

  // Full screen camera view
  return (
    <View style={styles.fullScreenContainer}>
      {/* Camera fills the entire screen */}
      <CameraView
        ref={(ref) => setCameraRef(ref)}
        style={styles.fullCamera}
        facing={facing}
        mode="video"
        zoom={zoom}
        onCameraReady={onCameraReady}
      />
      
      {/* Top controls overlay */}
      <SafeAreaView style={styles.topOverlay}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <Animated.View style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.recordingTime}>{formatDuration(recordingDuration)}</Text>
          </View>
        )}
        
        <TouchableOpacity style={styles.flipButton} onPress={toggleFacing} disabled={isRecording}>
          <Ionicons name="camera-reverse" size={28} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>
      
      {/* Zoom slider */}
      {!isRecording && (
        <View style={styles.zoomContainer}>
          <Text style={styles.zoomLabel}>Zoom: {Math.round(zoom * 100)}%</Text>
          <Slider
            style={styles.zoomSlider}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            value={zoom}
            onValueChange={setZoom}
            minimumTrackTintColor="#10B981"
            maximumTrackTintColor="#ffffff50"
            thumbTintColor="#10B981"
          />
        </View>
      )}
      
      {/* Recorded video badge */}
      {recordingUri && !isRecording && (
        <View style={styles.recordedBadge}>
          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
          <Text style={styles.recordedText}>Recorded: {formatDuration(savedDuration)}</Text>
        </View>
      )}
      
      {/* Bottom controls */}
      <View style={styles.bottomOverlay}>
        <View style={styles.controlsRow}>
          {/* Spacer */}
          <View style={styles.sideButton} />
          
          {/* Main record button */}
          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordButtonActive]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={loading || !cameraReady}
          >
            <View style={[styles.recordButtonInner, isRecording && styles.recordButtonInnerActive]}>
              {isRecording ? (
                <Ionicons name="stop" size={32} color="#fff" />
              ) : (
                <View style={styles.recordButtonCircle} />
              )}
            </View>
          </TouchableOpacity>
          
          {/* Upload button (visible when video is recorded) */}
          {recordingUri && !isRecording ? (
            <TouchableOpacity style={styles.uploadButton} onPress={() => setShowCaptionModal(true)}>
              <Ionicons name="cloud-upload" size={28} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={styles.sideButton} />
          )}
        </View>
        
        <Text style={styles.instructionText}>
          {!cameraReady ? 'Initializing camera...' : 
           isRecording ? 'Tap stop when done' : 
           recordingUri ? 'Tap upload to submit' : 'Tap record to start'}
        </Text>
      </View>
      
      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingTitle}>Uploading Report</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
            </View>
            <Text style={styles.progressText}>{uploadProgress}%</Text>
          </View>
        </View>
      )}
      
      {/* Caption Modal */}
      <Modal visible={showCaptionModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Details</Text>
              <TouchableOpacity onPress={() => setShowCaptionModal(false)}>
                <Ionicons name="close" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.inputLabel}>Caption (Optional)</Text>
            <TextInput
              style={styles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Describe the situation..."
              placeholderTextColor="#64748B"
              multiline
              numberOfLines={3}
            />
            
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
            
            <TouchableOpacity style={styles.submitButton} onPress={submitReport}>
              <Ionicons name="cloud-upload" size={24} color="#fff" />
              <Text style={styles.submitButtonText}>Upload Report</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  fullScreenContainer: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94A3B8', marginTop: 16 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: '#EF4444', fontSize: 18, marginTop: 16, textAlign: 'center' },
  retryButton: { marginTop: 20, backgroundColor: '#3B82F6', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  
  fullCamera: { flex: 1, width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  
  topOverlay: { 
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 50 : 16
  },
  backButton: { 
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center'
  },
  flipButton: { 
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center'
  },
  recordingIndicator: { 
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 
  },
  recordingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', marginRight: 8 },
  recordingTime: { color: '#fff', fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  
  zoomContainer: { 
    position: 'absolute', top: 120, left: 20, right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 12
  },
  zoomLabel: { color: '#fff', fontSize: 14, marginBottom: 8, textAlign: 'center' },
  zoomSlider: { width: '100%', height: 40 },
  
  recordedBadge: { 
    position: 'absolute', top: 180, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.9)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 8
  },
  recordedText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  
  bottomOverlay: { 
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20, paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.4)'
  },
  controlsRow: { 
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingHorizontal: 40
  },
  sideButton: { width: 60 },
  recordButton: { 
    width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent'
  },
  recordButtonActive: { borderColor: '#EF4444' },
  recordButtonInner: { 
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#EF4444',
    justifyContent: 'center', alignItems: 'center'
  },
  recordButtonInnerActive: { backgroundColor: '#EF4444', borderRadius: 8 },
  recordButtonCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  uploadButton: { 
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#10B981',
    justifyContent: 'center', alignItems: 'center'
  },
  instructionText: { color: '#fff', textAlign: 'center', marginTop: 16, fontSize: 14, opacity: 0.8 },
  
  loadingOverlay: { 
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center', alignItems: 'center'
  },
  loadingCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 32, alignItems: 'center', width: 280 },
  loadingTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 20 },
  progressBar: { width: '100%', height: 8, backgroundColor: '#334155', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#10B981' },
  progressText: { color: '#94A3B8', marginTop: 8 },
  
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#1E293B', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#fff' },
  inputLabel: { color: '#94A3B8', marginBottom: 8, fontSize: 14 },
  captionInput: { 
    backgroundColor: '#0F172A', borderRadius: 12, padding: 16, color: '#fff', 
    minHeight: 100, textAlignVertical: 'top', marginBottom: 20
  },
  toggleRow: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#0F172A', padding: 16, borderRadius: 12, marginBottom: 20
  },
  toggleLabel: { color: '#fff', fontWeight: '500' },
  toggleDescription: { color: '#64748B', fontSize: 12, marginTop: 2 },
  submitButton: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 12
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
