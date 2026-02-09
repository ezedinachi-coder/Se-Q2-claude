import React from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface NativeMapProps {
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  markerCoords: {
    latitude: number;
    longitude: number;
  };
  radiusKm: number;
  onPress: (coords: { latitude: number; longitude: number }) => void;
  onMarkerChange: (coords: { latitude: number; longitude: number }) => void;
}

// Native map implementation with platform check
export function NativeMap({ region, markerCoords, radiusKm, onPress }: NativeMapProps) {
  // On web, show a placeholder
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webPlaceholder}>
        <Ionicons name="map" size={60} color="#3B82F6" />
        <Text style={styles.placeholderText}>Map View</Text>
        <Text style={styles.coordsText}>
          {markerCoords.latitude.toFixed(4)}, {markerCoords.longitude.toFixed(4)}
        </Text>
        <Text style={styles.radiusText}>Radius: {radiusKm} km</Text>
      </View>
    );
  }

  // On native platforms, dynamically require maps
  try {
    const MapView = require('react-native-maps').default;
    const { Marker, Circle } = require('react-native-maps');

    return (
      <MapView
        style={styles.map}
        region={region}
        onPress={(e: any) => onPress(e.nativeEvent.coordinate)}
      >
        <Marker coordinate={markerCoords} title="Team Location" />
        <Circle
          center={markerCoords}
          radius={radiusKm * 1000}
          strokeColor="rgba(59, 130, 246, 0.5)"
          fillColor="rgba(59, 130, 246, 0.1)"
        />
      </MapView>
    );
  } catch (e) {
    return (
      <View style={styles.webPlaceholder}>
        <Ionicons name="map" size={60} color="#3B82F6" />
        <Text style={styles.placeholderText}>Map unavailable</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  map: { 
    flex: 1 
  },
  webPlaceholder: {
    flex: 1,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#94A3B8',
    fontSize: 18,
    marginTop: 16,
  },
  coordsText: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  radiusText: {
    color: '#3B82F6',
    fontSize: 14,
    marginTop: 8,
  },
});
