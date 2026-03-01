import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  BackHandler, Platform, Modal, TextInput, Vibration, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken, clearAuthData } from '../../utils/auth';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'https://ongoing-dev-22.preview.emergentagent.com';
const LOCATION_TASK_NAME = 'background-location-task';

// Background task for location (must be at module level)
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) return;
  if (data) {
    const { locations } = data as any;
    const location = locations[0];
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        await axios.post(`${BACKEND_URL}/api/panic/location`, {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          timestamp: new Date().toISOString(),
        }, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      }
    } catch (err) {}
  }
});

type Screen = 'activating' | 'active' | 'pin_entry' | 'disguise';

export default function PanicActive() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('activating');
  const [isTracking, setIsTracking] = useState(false);
  const [pin, setPin] = useState('');
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [pinError, setPinError] = useState('');
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<any>(null);
  const elapsedRef = useRef<any>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    checkPanicState();

    const sub = AppState.addEventListener('change', (nextState) => {
      // When app comes to foreground while panic is active, show PIN screen
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        AsyncStorage.getItem('panic_active').then(val => {
          if (val === 'true') setScreen('pin_entry');
        });
      }
      appStateRef.current = nextState;
    });

    // Prevent hardware back button from navigating away
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      AsyncStorage.getItem('panic_active').then(val => {
        if (val === 'true') {
          minimizeApp();
        }
      });
      return true;
    });

    return () => {
      sub.remove();
      backHandler.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, []);

  const checkPanicState = async () => {
    const panicActive = await AsyncStorage.getItem('panic_active');
    if (panicActive === 'true') {
      // Returning to app while panic is active — show PIN
      setIsTracking(true);
      setScreen('pin_entry');
      const startStr = await AsyncStorage.getItem('panic_started_at');
      if (startStr) {
        const elapsed = Math.floor((Date.now() - parseInt(startStr)) / 1000);
        setElapsedSeconds(elapsed);
      }
      startElapsedTimer();
    } else {
      activatePanicMode();
    }
  };

  const startElapsedTimer = () => {
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);
  };

  const minimizeApp = () => {
    if (Platform.OS === 'android') {
      // Move task to back (minimize) on Android
      BackHandler.exitApp();
    }
  };

  const activatePanicMode = async () => {
    setScreen('activating');
    try {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for panic mode');
        router.back();
        return;
      }
      await Location.requestBackgroundPermissionsAsync();

      const token = await getAuthToken();
      if (!token) { router.replace('/auth/login'); return; }

      const response = await axios.post(
        `${BACKEND_URL}/api/panic/activate`,
        { activated: true },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      );

      await AsyncStorage.setItem('panic_active', 'true');
      await AsyncStorage.setItem('panic_started_at', Date.now().toString());
      await AsyncStorage.setItem('panic_id', response.data.panic_id || '');

      setIsTracking(true);
      setScreen('active');
      startElapsedTimer();
      startLocationTracking(token);

      Vibration.vibrate([0, 200, 100, 200]);

    } catch (error: any) {
      if (error?.response?.status === 401) {
        await clearAuthData();
        router.replace('/auth/login');
        return;
      }
      Alert.alert('Error', 'Failed to activate panic mode');
      router.back();
    }
  };

  const startLocationTracking = async (token: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      try {
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        await axios.post(`${BACKEND_URL}/api/panic/location`, {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          timestamp: new Date().toISOString(),
        }, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      } catch (e) {}
    }, 30000);

    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: 30000,
        distanceInterval: 0,
        foregroundService: {
          notificationTitle: 'SafeGuard Active',
          notificationBody: 'Emergency tracking in progress',
          notificationColor: '#EF4444',
        },
      });
    } catch (bgError) {}
  };

  const deactivatePanicMode = async () => {
    try {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      try { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch (e) {}

      const token = await getAuthToken();
      if (token) {
        await axios.post(`${BACKEND_URL}/api/panic/deactivate`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      }

      await AsyncStorage.removeItem('panic_active');
      await AsyncStorage.removeItem('panic_started_at');
      await AsyncStorage.removeItem('panic_id');

      setIsTracking(false);
      Alert.alert('Safe', 'Panic mode deactivated. You are safe.', [
        { text: 'OK', onPress: () => router.replace('/civil/home') }
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to deactivate panic mode');
    }
  };

  const handlePanicButton = () => {
    // Pressing panic button closes (minimizes) the app
    Alert.alert(
      'App will minimize',
      'Panic mode stays active in the background. To return, re-open the app and enter your PIN.',
      [{ text: 'OK', onPress: minimizeApp }]
    );
  };

  const formatElapsed = () => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePinInput = async (digit: string) => {
    const newDigits = [...pinDigits];
    const emptyIdx = newDigits.findIndex(d => d === '');
    if (emptyIdx === -1) return;
    newDigits[emptyIdx] = digit;
    setPinDigits(newDigits);

    const enteredPin = newDigits.join('');
    if (enteredPin.length === 4) {
      // Load stored PIN
      const storedPin = await AsyncStorage.getItem('security_pin');
      if (!storedPin) {
        // No PIN set – default is 1234
        if (enteredPin === '1234') {
          setPinDigits(['', '', '', '']);
          setPinError('');
          setScreen('active');
        } else {
          handleWrongPin();
        }
      } else if (enteredPin === storedPin) {
        setPinDigits(['', '', '', '']);
        setPinError('');
        setScreen('active');
      } else {
        handleWrongPin();
      }
    }
  };

  const handleWrongPin = () => {
    const attempts = wrongAttempts + 1;
    setWrongAttempts(attempts);
    setPinDigits(['', '', '', '']);
    Vibration.vibrate([0, 100, 50, 100]);
    if (attempts >= 2) {
      // After 2 wrong attempts, show disguise
      setPinError('');
      triggerDisguise();
    } else {
      setPinError('Incorrect PIN. Try again.');
    }
  };

  const handlePinBackspace = () => {
    const newDigits = [...pinDigits];
    for (let i = 3; i >= 0; i--) {
      if (newDigits[i] !== '') {
        newDigits[i] = '';
        break;
      }
    }
    setPinDigits(newDigits);
    if (pinError) setPinError('');
  };

  const triggerDisguise = async () => {
    // Auto-customize app as Gaming App
    try {
      const token = await getAuthToken();
      if (token) {
        await axios.put(`${BACKEND_URL}/api/user/customize-app`, {
          app_name: 'GameZone Pro',
          app_logo: 'game-controller'
        }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
        await AsyncStorage.setItem('app_customization', JSON.stringify({ app_name: 'GameZone Pro', app_logo: 'game-controller' }));
      }
    } catch (e) {}
    setScreen('disguise');
  };

  // ---- SCREENS ----

  if (screen === 'activating') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <View style={styles.activatingIcon}>
            <Ionicons name="alert-circle" size={80} color="#EF4444" />
          </View>
          <Text style={styles.activatingTitle}>Activating Panic Mode...</Text>
          <Text style={styles.activatingSubtitle}>Requesting location and notifying authorities</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'pin_entry') {
    return (
      <SafeAreaView style={[styles.container, styles.pinContainer]}>
        <View style={styles.pinContent}>
          <Ionicons name="lock-closed" size={56} color="#3B82F6" />
          <Text style={styles.pinTitle}>Enter PIN to Continue</Text>
          <Text style={styles.pinSubtitle}>Panic mode is active in background</Text>

          {/* PIN Dots */}
          <View style={styles.pinDots}>
            {pinDigits.map((d, i) => (
              <View key={i} style={[styles.pinDot, d !== '' && styles.pinDotFilled]} />
            ))}
          </View>

          {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}

          {/* Keypad */}
          <View style={styles.keypad}>
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.keypadBtn, key === '' && styles.keypadBtnEmpty]}
                onPress={() => {
                  if (key === '⌫') handlePinBackspace();
                  else if (key !== '') handlePinInput(key);
                }}
                disabled={key === ''}
              >
                <Text style={styles.keypadBtnText}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.pinHint}>Default PIN: 1234  |  Set PIN in Settings</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'disguise') {
    return (
      <SafeAreaView style={[styles.container, styles.disguiseContainer]}>
        <View style={styles.disguiseContent}>
          <Ionicons name="game-controller" size={80} color="#8B5CF6" />
          <Text style={styles.disguiseTitle}>GameZone Pro</Text>
          <Text style={styles.disguiseSubtitle}>Loading your games...</Text>
          <View style={styles.disguiseCards}>
            {['🎮 Racing Masters', '⚔️ Battle Arena', '🏆 Sports Challenge', '🧩 Puzzle World'].map((game, i) => (
              <View key={i} style={styles.disguiseCard}>
                <Text style={styles.disguiseCardText}>{game}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.disguiseNote}>App disguise activated for security</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Active screen
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.activeHeader}>
          <View style={styles.pulseRing}>
            <Ionicons name="alert-circle" size={72} color="#EF4444" />
          </View>
          <Text style={styles.activeTitle}>PANIC MODE ACTIVE</Text>
          <Text style={styles.elapsedText}>Duration: {formatElapsed()}</Text>
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Ionicons name="location" size={22} color="#10B981" />
            <Text style={styles.infoText}>GPS Tracking: Live</Text>
            <View style={styles.activeDot} />
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time" size={22} color="#10B981" />
            <Text style={styles.infoText}>Updates every 30 seconds</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark" size={22} color="#10B981" />
            <Text style={styles.infoText}>Security team notified</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="people" size={22} color="#10B981" />
            <Text style={styles.infoText}>Emergency contacts alerted</Text>
          </View>
        </View>

        {/* Warning */}
        <View style={styles.warningBox}>
          <Ionicons name="warning" size={20} color="#F59E0B" />
          <Text style={styles.warningText}>
            Tap "Hide App" to minimize. Re-opening requires your PIN. 2 wrong PIN attempts activate app disguise.
          </Text>
        </View>

        {/* Actions */}
        <TouchableOpacity style={styles.hideButton} onPress={handlePanicButton}>
          <Ionicons name="eye-off" size={22} color="#fff" />
          <Text style={styles.hideButtonText}>Hide App (Keep Tracking)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deactivateButton}
          onPress={() => {
            Alert.alert(
              'Deactivate Panic Mode?',
              'Only do this if you are completely safe.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: "I'm Safe — Stop", style: 'destructive', onPress: deactivatePanicMode }
              ]
            );
          }}
        >
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <Text style={styles.deactivateText}>I'm Safe — Stop Tracking</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  activatingIcon: { marginBottom: 24 },
  activatingTitle: { fontSize: 24, fontWeight: 'bold', color: '#EF4444', textAlign: 'center' },
  activatingSubtitle: { fontSize: 15, color: '#94A3B8', marginTop: 12, textAlign: 'center' },
  // Active screen
  content: { flex: 1, padding: 24, justifyContent: 'space-between' },
  activeHeader: { alignItems: 'center', paddingTop: 20 },
  pulseRing: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#EF444415', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#EF444440' },
  activeTitle: { fontSize: 26, fontWeight: 'bold', color: '#EF4444', marginTop: 16 },
  elapsedText: { fontSize: 16, color: '#94A3B8', marginTop: 6 },
  infoBox: { backgroundColor: '#1E293B', borderRadius: 16, padding: 20, gap: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoText: { flex: 1, fontSize: 15, color: '#fff' },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  warningBox: { flexDirection: 'row', backgroundColor: '#1E293B', borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: '#F59E0B40' },
  warningText: { flex: 1, fontSize: 13, color: '#F59E0B', lineHeight: 19 },
  hideButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#334155', paddingVertical: 16, borderRadius: 12 },
  hideButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  deactivateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 12, marginBottom: 4 },
  deactivateText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  // PIN screen
  pinContainer: { backgroundColor: '#0A0F1E' },
  pinContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  pinTitle: { fontSize: 22, fontWeight: '700', color: '#fff', marginTop: 16 },
  pinSubtitle: { fontSize: 14, color: '#64748B', marginTop: 6, marginBottom: 32 },
  pinDots: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  pinDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#475569', backgroundColor: 'transparent' },
  pinDotFilled: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  pinError: { color: '#EF4444', fontSize: 14, marginBottom: 12 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 260, gap: 12, marginBottom: 24 },
  keypadBtn: { width: 74, height: 74, borderRadius: 37, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' },
  keypadBtnEmpty: { backgroundColor: 'transparent' },
  keypadBtnText: { fontSize: 24, fontWeight: '600', color: '#fff' },
  pinHint: { fontSize: 12, color: '#334155', textAlign: 'center' },
  // Disguise
  disguiseContainer: { backgroundColor: '#0D0121' },
  disguiseContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  disguiseTitle: { fontSize: 28, fontWeight: 'bold', color: '#8B5CF6', marginTop: 12 },
  disguiseSubtitle: { fontSize: 16, color: '#7C3AED', marginTop: 6, marginBottom: 24 },
  disguiseCards: { width: '100%', gap: 12 },
  disguiseCard: { backgroundColor: '#1E0A3C', borderRadius: 12, padding: 16 },
  disguiseCardText: { color: '#C4B5FD', fontSize: 16, fontWeight: '500' },
  disguiseNote: { fontSize: 11, color: '#4C1D95', marginTop: 24 },
});
