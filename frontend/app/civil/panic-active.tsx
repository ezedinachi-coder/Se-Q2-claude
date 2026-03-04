import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Platform, BackHandler } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { BACKEND_URL } from '@/constants/api'; // Adjust path if needed

export default function PanicActiveScreen() {
  const router = useRouter();
  const [panicId, setPanicId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(10); // optional visual countdown
  const hasActivated = useRef(false);
  const hasGotFreshGPS = useRef(false);

  useEffect(() => {
    const activatePanic = async () => {
      if (hasActivated.current) return;
      hasActivated.current = true;

      try {
        // Request foreground location permission
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Location permission is required for panic mode.');
          router.replace('/civil/home');
          return;
        }

        // Get high-accuracy location (fresh, no cache)
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          maximumAge: 0,           // force fresh location
          timeout: 15000,
        });

        hasGotFreshGPS.current = true;

        const token = await AsyncStorage.getItem('token');
        if (!token) {
          Alert.alert('Error', 'No authentication token found.');
          return;
        }

        const userId = await AsyncStorage.getItem('userId'); // assuming stored on login
        if (!userId) throw new Error('User ID not found');

        const response = await axios.post(
          `${BACKEND_URL}/panic/activate`,
          {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            user_id: userId,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        setPanicId(response.data.panic_id);
        Alert.alert('Panic Activated', 'Security has been notified.');
      } catch (error) {
        console.error('Panic activation failed:', error);
        Alert.alert('Error', 'Failed to activate panic. Please try again.');
        router.replace('/civil/home');
      }
    };

    activatePanic();

    // Prevent hardware back button from exiting panic mode (Android)
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      return true; // block back navigation
    });

    return () => {
      backHandler.remove();
    };
  }, []);

  const handleImSafeNow = async () => {
    if (!panicId) return;

    try {
      const token = await AsyncStorage.getItem('token');
      await axios.post(
        `${BACKEND_URL}/panic/deactivate`,
        { panic_id: panicId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert('Safe Mode', "You're now marked as safe. Thank you.");

      // Force app exit on Android
      if (Platform.OS === 'android') {
        BackHandler.exitApp();
      }

      // iOS / fallback: clear navigation stack → go to PIN/login
      router.replace('/auth/pin');
    } catch (error) {
      console.error('Deactivation failed:', error);
      Alert.alert('Error', 'Failed to deactivate panic. Please try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Ionicons name="alert-circle" size={120} color="#ef4444" style={{ marginBottom: 32 }} />

      <Text style={{ color: 'white', fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 }}>
        PANIC MODE ACTIVE
      </Text>

      <Text style={{ color: '#ddd', fontSize: 18, textAlign: 'center', marginBottom: 48, lineHeight: 26 }}>
        Security team has been alerted with your current location. Help is on the way.
      </Text>

      <TouchableOpacity
        onPress={handleImSafeNow}
        style={{
          backgroundColor: '#10b981',
          paddingVertical: 20,
          paddingHorizontal: 48,
          borderRadius: 999,
          marginBottom: 32,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>I'M SAFE NOW</Text>
      </TouchableOpacity>

      <Text style={{ color: '#aaa', fontSize: 14, textAlign: 'center' }}>
        Do NOT press "I'm Safe Now" unless you are truly out of danger.
      </Text>
    </View>
  );
}
