import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';

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

// Native map implementation
export function NativeMap({ region, markerCoords, radiusKm, onPress }: NativeMapProps) {
  return (
    <MapView
      style={styles.map}
      region={region}
      onPress={(e) => onPress(e.nativeEvent.coordinate)}
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
}

const styles = StyleSheet.create({
  map: { 
    flex: 1 
  },
});
