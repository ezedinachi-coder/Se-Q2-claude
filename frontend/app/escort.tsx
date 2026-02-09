import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken, clearAuthData } from '../utils/auth';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'https://guardlogin.preview.emergentagent.com';

export default function Escort() {
  const router = useRouter();
  const [isTracking, setIsTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startEscort = async () => {
    setLoading(true);
    try {
      // Request location permissions
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required');
        setLoading(false);
        return;
      }

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        Alert.alert('Warning', 'Background location permission recommended for continuous tracking');
      }

      // Start escort session
      const token = await getAuthToken();
      if (!token) {
        router.replace('/auth/login');
        return;
      }
      
      const response = await axios.post(
        `${BACKEND_URL}/api/escort/action`,
        { action: 'start' },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      );

      setSessionId(response.data.session_id);
      setIsTracking(true);

      // Start location tracking (every 30 seconds)
      startLocationTracking(token!);

      Alert.alert('Success', 'Escort tracking started');
    } catch (error: any) {
      if (error?.response?.status === 401) {
        await clearAuthData();
        router.replace('/auth/login');
        return;
      }
      Alert.alert(
        'Error',
        error.response?.data?.detail || 'Failed to start escort'
      );
    } finally {
      setLoading(false);
    }
  };

  const startLocationTracking = async (token: string) => {
    intervalRef.current = setInterval(async () => {
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        await axios.post(
          `${BACKEND_URL}/api/escort/location`,
          {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            timestamp: new Date().toISOString(),
          },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        );
      } catch (error) {
        console.error('[Escort] Location tracking error:', error);
      }
    }, 30000); // 30 seconds
  };

  const stopEscort = async () => {
    Alert.alert(
      'Arrived Safely?',
      'Stopping the escort will delete all tracking data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, I Arrived',
          onPress: async () => {
            setLoading(true);
            try {
              // Stop location tracking
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
              }

              // Stop escort session
              const token = await getAuthToken();
              if (token) {
                await axios.post(
                  `${BACKEND_URL}/api/escort/action`,
                  { action: 'stop' },
                  { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
                );
              }

              setIsTracking(false);
              setSessionId(null);

              Alert.alert('Success', 'Arrived safely! Tracking data deleted.', [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } catch (error: any) {
              Alert.alert('Error', 'Failed to stop escort');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security Escort</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons
            name="navigate"
            size={100}
            color={isTracking ? '#10B981' : '#3B82F6'}
          />
        </View>

        <Text style={styles.title}>
          {isTracking ? 'Escort Active' : 'Start Security Escort'}
        </Text>
        <Text style={styles.description}>
          {isTracking
            ? 'Your location is being tracked every 30 seconds. Click "ARRIVED" when you reach your destination safely.'
            : 'Track your journey and share your location with authorities. Your data will be automatically deleted when you arrive.'}
        </Text>

        {isTracking && (
          <View style={styles.statusBox}>
            <View style={styles.statusItem}>
              <Ionicons name="location" size={24} color="#10B981" />
              <Text style={styles.statusText}>GPS Tracking Active</Text>
            </View>
            <View style={styles.statusItem}>
              <Ionicons name="time" size={24} color="#10B981" />
              <Text style={styles.statusText}>Every 30 seconds</Text>
            </View>
            <View style={styles.statusItem}>
              <Ionicons name="shield-checkmark" size={24} color="#10B981" />
              <Text style={styles.statusText}>Data Protected</Text>
            </View>
          </View>
        )}

        <View style={styles.buttonContainer}>
          {!isTracking ? (
            <TouchableOpacity
              style={styles.startButton}
              onPress={startEscort}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="play" size={24} color="#fff" />
                  <Text style={styles.buttonText}>Start Escort</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.arrivedButton}
              onPress={stopEscort}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color="#fff" />
                  <Text style={styles.buttonText}>ARRIVED</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#64748B" />
          <Text style={styles.infoText}>
            Premium Feature: Security Escort provides continuous GPS tracking until you arrive safely.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginTop: 24,
  },
  description: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 16,
  },
  statusBox: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    gap: 20,
    marginTop: 32,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statusText: {
    fontSize: 16,
    color: '#fff',
  },
  buttonContainer: {
    marginTop: 32,
  },
  startButton: {
    flexDirection: 'row',
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  arrivedButton: {
    flexDirection: 'row',
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginTop: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
});
