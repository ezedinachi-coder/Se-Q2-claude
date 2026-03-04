import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { BACKEND_URL } from '@/constants/api';

export default function SetTeamLocationScreen() {
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const mapRef = useRef<MapView>(null);

  const refreshLocation = async (showAlert = false) => {
    try {
      setLoading(true);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is required.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        maximumAge: 0,
        timeout: 10000,
      });

      const newLoc = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };

      setCurrentLocation(newLoc);
      setRegion({
        ...newLoc,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });

      if (showAlert) {
        Alert.alert('Location Updated', 'Team location refreshed successfully.');
      }
    } catch (error) {
      console.error('Location fetch error:', error);
      Alert.alert('Error', 'Could not get current location.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshLocation();
  }, []);

  const saveTeamLocation = async () => {
    if (!currentLocation) return;

    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.post(
        `${BACKEND_URL}/security/set-team-location`,
        currentLocation,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert('Success', 'Team location updated.');
    } catch (error) {
      console.error('Save location failed:', error);
      Alert.alert('Error', 'Failed to save team location.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {loading || !region ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={{ marginTop: 16, color: '#666' }}>Getting location...</Text>
        </View>
      ) : (
        <>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            region={region}
            showsUserLocation={true}
            followsUserLocation={false}
          >
            {currentLocation && (
              <Marker
                coordinate={currentLocation}
                title="Team Location"
                pinColor="#ef4444"
              />
            )}
          </MapView>

          <View style={{ position: 'absolute', top: 16, right: 16, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => refreshLocation(true)}
              style={{
                backgroundColor: 'white',
                borderRadius: 50,
                padding: 12,
                marginBottom: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 4,
                elevation: 5,
              }}
            >
              <Ionicons name="refresh" size={28} color="#3b82f6" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={saveTeamLocation}
              disabled={saving || !currentLocation}
              style={{
                backgroundColor: saving ? '#9ca3af' : '#3b82f6',
                paddingVertical: 14,
                paddingHorizontal: 24,
                borderRadius: 999,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 4,
                elevation: 5,
              }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold' }}>
                {saving ? 'Saving...' : 'Save Team Location'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}
