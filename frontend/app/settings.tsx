import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { BACKEND_URL } from '@/constants/api';

export default function SettingsScreen() {
  const [profile, setProfile] = useState<{ full_name?: string; email?: string; phone?: string; profile_photo?: string }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/user/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfile(res.data);
    } catch (err) {
      console.log('Profile load error', err);
    }
  };

  const pickImage = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Cannot access camera / gallery.');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
          base64: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
          base64: true,
        });

    if (!result.canceled && result.assets[0].base64) {
      const { base64, mimeType = 'image/jpeg' } = result.assets[0];

      // Send base64 directly (backend expects raw base64 without data: prefix)
      uploadProfilePhoto(`data:${mimeType};base64,${base64}`, mimeType);
    }
  };

  const uploadProfilePhoto = async (base64WithPrefix: string, mime: string) => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await axios.post(
        `${BACKEND_URL}/user/profile-photo`,
        {
          base64_data: base64WithPrefix,
          mime_type: mime,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setProfile((prev) => ({ ...prev, profile_photo: res.data.url }));
      Alert.alert('Success', 'Profile photo updated.');
    } catch (err: any) {
      console.error('Photo upload failed:', err);
      Alert.alert('Upload Failed', err.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb', padding: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 24 }}>Settings</Text>

      {/* Profile Photo Section */}
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        {profile.profile_photo ? (
          <Image
            source={{ uri: profile.profile_photo }}
            style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#3b82f6' }}
          />
        ) : (
          <View
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: '#e5e7eb',
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 3,
              borderColor: '#3b82f6',
            }}
          >
            <Ionicons name="person" size={60} color="#6b7280" />
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="small" color="#3b82f6" style={{ marginTop: 12 }} />
        ) : (
          <View style={{ flexDirection: 'row', marginTop: 16, gap: 16 }}>
            <TouchableOpacity
              onPress={() => pickImage(true)}
              style={{ backgroundColor: '#3b82f6', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 999 }}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => pickImage(false)}
              style={{ backgroundColor: '#6b7280', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 999 }}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>Choose Photo</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Other settings can go here */}
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Account</Text>
      <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontWeight: '500' }}>Name: {profile.full_name || '—'}</Text>
        <Text style={{ marginTop: 8, color: '#666' }}>Email: {profile.email || '—'}</Text>
        <Text style={{ marginTop: 8, color: '#666' }}>Phone: {profile.phone || '—'}</Text>
      </View>

      {/* Logout / other actions */}
      <TouchableOpacity
        onPress={() => {/* logout logic */}}
        style={{ backgroundColor: '#ef4444', padding: 16, borderRadius: 12, alignItems: 'center' }}
      >
        <Text style={{ color: 'white', fontWeight: 'bold' }}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}
