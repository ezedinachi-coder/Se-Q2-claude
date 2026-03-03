import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, AppState, BackHandler, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import EmergencyCategoryModal from '../../components/EmergencyCategoryModal';
import { getAuthToken, clearAuthData } from '../../utils/auth';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'https://ongoing-dev-22.preview.emergentagent.com';
const LOCATION_TASK = 'background-location-panic';

// Background task
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) { console.error('[PanicActive] BG location error:', error); return; }
  if (data) {
    const { locations } = data as any;
    const location = locations[0];
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        await axios.post(`${BACKEND_URL}/api/panic/location`, {
          latitude: location.coords.latitude, longitude: location.coords.longitude,
          accuracy: location.coords.accuracy, timestamp: new Date().toISOString()
        }, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      }
    } catch {}
  }
});

const EMERGENCY_SERVICES: Record<string, { name: string; number: string }[]> = {
  ambulance: [{ name: 'National Emergency', number: '112' }, { name: 'Ambulance Service', number: '911' }],
  fire: [{ name: 'Fire Service', number: '101' }, { name: 'Emergency', number: '112' }],
};
const SECURITY_EMERGENCIES = ['violence', 'robbery', 'kidnapping', 'breakin', 'burglary', 'harassment', 'other'];

export default function PanicActive() {
  const router = useRouter();
  const [isTracking, setIsTracking] = useState(false);
  const [panicId, setPanicId] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSafeButton, setShowSafeButton] = useState(false);
  const [showEmergencyContacts, setShowEmergencyContacts] = useState<'ambulance' | 'fire' | null>(null);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    checkActivePanic();
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => { subscription.remove(); if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const checkActivePanic = async () => {
    try {
      const activePanic = await AsyncStorage.getItem('active_panic');
      if (activePanic) {
        const panicData = JSON.parse(activePanic);
        setPanicId(panicData.id);
        setSelectedCategory(panicData.category);
        setIsTracking(true);
        setShowSafeButton(true);
        setShowCategoryModal(false);
        const token = await getAuthToken();
        if (token) startLocationTracking(token);
      }
    } catch {}
  };

  const handleAppStateChange = (nextAppState: string) => {
    if (nextAppState === 'active' && isTracking) setShowSafeButton(true);
  };

  const handleCategorySelect = async (category: string) => {
    setSelectedCategory(category);
    setShowCategoryModal(false);
    if (category === 'medical') { setShowEmergencyContacts('ambulance'); }
    else if (category === 'fire') { setShowEmergencyContacts('fire'); }
    else if (SECURITY_EMERGENCIES.includes(category)) { await activatePanicMode(category); }
  };

  const activatePanicMode = async (category: string) => {
    try {
      // Request permissions
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission required for panic mode.');
        router.back();
        return;
      }
      await Location.requestBackgroundPermissionsAsync();

      // Get FRESH high-accuracy GPS location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      const token = await getAuthToken();
      if (!token) { Alert.alert('Session Expired', 'Please login again'); router.replace('/auth/login'); return; }

      const response = await axios.post(`${BACKEND_URL}/api/panic/activate`, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: new Date().toISOString(),
        emergency_category: category,
      }, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });

      const newPanicId = response.data.panic_id;
      setPanicId(newPanicId);
      setIsTracking(true);

      await AsyncStorage.setItem('active_panic', JSON.stringify({
        id: newPanicId, category, activated_at: new Date().toISOString()
      }));
      await AsyncStorage.setItem('auth_token', token);

      startLocationTracking(token);

      // Close the app (Android: exit; iOS: minimize — no programmatic close on iOS)
      if (Platform.OS === 'android') {
        BackHandler.exitApp();
      } else {
        // iOS — go to home screen via router, app minimizes naturally
        router.replace('/auth/login');
      }
    } catch (error: any) {
      if (error?.response?.status === 401) {
        await clearAuthData();
        router.replace('/auth/login');
      } else {
        Alert.alert('Error', 'Failed to activate panic mode. Please try again.');
        router.back();
      }
    }
  };

  const startLocationTracking = async (token: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      try {
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        await axios.post(`${BACKEND_URL}/api/panic/location`, {
          latitude: location.coords.latitude, longitude: location.coords.longitude,
          accuracy: location.coords.accuracy, timestamp: new Date().toISOString()
        }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
      } catch {}
    }, 30000);

    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.High, timeInterval: 30000, distanceInterval: 0,
        foregroundService: {
          notificationTitle: '🚨 SafeGuard Panic Active',
          notificationBody: 'Your location is being shared with security. Tap to open app.',
        },
      });
    } catch {}
  };

  const markSafe = async () => {
    Alert.alert("I'm Safe Now", 'This will stop tracking and notify security you are safe.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: "Yes, I'm Safe",
        onPress: async () => {
          try {
            const token = await getAuthToken();
            if (intervalRef.current) clearInterval(intervalRef.current);
            try { await Location.stopLocationUpdatesAsync(LOCATION_TASK); } catch {}

            if (token) {
              await axios.post(`${BACKEND_URL}/api/panic/deactivate`, {}, {
                headers: { Authorization: `Bearer ${token}` }, timeout: 15000
              });
            }
            await AsyncStorage.removeItem('active_panic');
            setIsTracking(false);
            setShowSafeButton(false);
            Alert.alert('✅ You are Safe', 'Panic mode deactivated. Security has been notified.', [
              { text: 'OK', onPress: () => router.replace('/civil/home') }
            ]);
          } catch {
            Alert.alert('Error', 'Failed to deactivate panic mode. Please try again.');
          }
        }
      }
    ]);
  };

  const callEmergency = (number: string) => Linking.openURL(`tel:${number}`);

  if (showEmergencyContacts) {
    const services = EMERGENCY_SERVICES[showEmergencyContacts];
    const title = showEmergencyContacts === 'ambulance' ? 'Ambulance Services' : 'Fire Services';
    const icon = showEmergencyContacts === 'ambulance' ? 'medkit' : 'flame';
    const color = showEmergencyContacts === 'ambulance' ? '#10B981' : '#F59E0B';
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setShowEmergencyContacts(null); setShowCategoryModal(true); }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emergencyContent}>
          <View style={[styles.emergencyIcon, { backgroundColor: `${color}20` }]}>
            <Ionicons name={icon as any} size={60} color={color} />
          </View>
          <Text style={styles.emergencyTitle}>{title}</Text>
          <Text style={styles.emergencyDescription}>Tap to call emergency services immediately</Text>
          {services.map((service, i) => (
            <TouchableOpacity key={i} style={[styles.callButton, { backgroundColor: color }]} onPress={() => callEmergency(service.number)}>
              <Ionicons name="call" size={24} color="#fff" />
              <View style={styles.callInfo}>
                <Text style={styles.callName}>{service.name}</Text>
                <Text style={styles.callNumber}>{service.number}</Text>
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.backHomeButton} onPress={() => router.replace('/civil/home')}>
            <Text style={styles.backHomeText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (showSafeButton && isTracking) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.trackingContent}>
          <View style={styles.trackingIcon}><Ionicons name="radio" size={80} color="#EF4444" /></View>
          <Text style={styles.trackingTitle}>🚨 Panic Mode Active</Text>
          <Text style={styles.trackingSubtitle}>Your location is being tracked and shared with nearby security.</Text>
          <Text style={styles.trackingCategory}>Emergency: {selectedCategory?.toUpperCase()}</Text>
          <TouchableOpacity style={styles.safeButton} onPress={markSafe}>
            <Ionicons name="shield-checkmark" size={28} color="#fff" />
            <Text style={styles.safeButtonText}>I'm Safe Now</Text>
          </TouchableOpacity>
          <Text style={styles.safeNote}>Tap above when you are safe to stop tracking and notify security.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <EmergencyCategoryModal visible={showCategoryModal} onSelect={handleCategorySelect} onCancel={() => { setShowCategoryModal(false); router.back(); }} />
      {!showCategoryModal && (
        <View style={styles.activatingContent}>
          <View style={styles.loadingIcon}><Ionicons name="sync" size={60} color="#EF4444" /></View>
          <Text style={styles.activatingText}>Activating Panic Mode...</Text>
          <Text style={styles.activatingSubtext}>Getting precise location & notifying security</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  trackingContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  trackingIcon: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#EF444420', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  trackingTitle: { fontSize: 28, fontWeight: 'bold', color: '#EF4444', marginBottom: 12 },
  trackingSubtitle: { fontSize: 16, color: '#94A3B8', textAlign: 'center', marginBottom: 8, lineHeight: 24 },
  trackingCategory: { fontSize: 14, color: '#F59E0B', fontWeight: '600', marginBottom: 40 },
  safeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#10B981', paddingVertical: 18, paddingHorizontal: 40, borderRadius: 16, marginTop: 20 },
  safeButtonText: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  safeNote: { fontSize: 14, color: '#64748B', marginTop: 16, textAlign: 'center', lineHeight: 20 },
  emergencyContent: { flex: 1, alignItems: 'center', padding: 20, paddingTop: 40 },
  emergencyIcon: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  emergencyTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  emergencyDescription: { fontSize: 16, color: '#94A3B8', textAlign: 'center', marginBottom: 32 },
  callButton: { flexDirection: 'row', alignItems: 'center', width: '100%', padding: 20, borderRadius: 16, marginBottom: 16 },
  callInfo: { marginLeft: 16 },
  callName: { fontSize: 18, fontWeight: '600', color: '#fff' },
  callNumber: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  backHomeButton: { marginTop: 32, paddingVertical: 16, paddingHorizontal: 32 },
  backHomeText: { fontSize: 16, color: '#64748B' },
  activatingContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingIcon: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#EF444420', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  activatingText: { fontSize: 24, fontWeight: 'bold', color: '#EF4444', marginBottom: 8 },
  activatingSubtext: { fontSize: 16, color: '#94A3B8' },
});
