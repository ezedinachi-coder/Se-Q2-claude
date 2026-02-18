import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken, clearAuthData } from '../../utils/auth';
import { LocationMapModal } from '../../components/LocationMapModal';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'https://ongoing-dev-22.preview.emergentagent.com';

const EMERGENCY_CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  violence: { label: 'Violence/Assault', icon: 'alert-circle', color: '#EF4444' },
  robbery: { label: 'Armed Robbery', icon: 'warning', color: '#F97316' },
  kidnapping: { label: 'Kidnapping', icon: 'body', color: '#DC2626' },
  breakin: { label: 'Break-in/Burglary', icon: 'home', color: '#8B5CF6' },
  harassment: { label: 'Harassment/Stalking', icon: 'eye', color: '#EC4899' },
  medical: { label: 'Medical Emergency', icon: 'medkit', color: '#10B981' },
  fire: { label: 'Fire Outbreak', icon: 'flame', color: '#F59E0B' },
  other: { label: 'Other Emergency', icon: 'help-circle', color: '#64748B' },
};

export default function SecurityPanics() {
  const router = useRouter();
  const [panics, setPanics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationModal, setLocationModal] = useState<{visible: boolean; lat: number; lng: number; title: string} | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadPanics();
    }, [])
  );

  useEffect(() => {
    const interval = setInterval(loadPanics, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadPanics = async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        router.replace('/auth/login');
        return;
      }
      
      const response = await axios.get(`${BACKEND_URL}/api/security/nearby-panics?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
        timeout: 15000
      });
      console.log('[SecurityPanics] Loaded', response.data?.length, 'panics');
      setPanics(response.data || []);
    } catch (error: any) {
      console.error('[SecurityPanics] Failed to load panics:', error?.response?.status);
      if (error?.response?.status === 401) {
        await clearAuthData();
        router.replace('/auth/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const callUser = (phone: string) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    } else {
      Alert.alert('No Phone', 'Phone number not available');
    }
  };

  const sendMessage = (phone: string) => {
    if (phone) {
      Linking.openURL(`sms:${phone}`);
    } else {
      Alert.alert('No Phone', 'Phone number not available for messaging');
    }
  };

  const openInMaps = (latitude: number, longitude: number, label: string) => {
    const url = Platform.select({
      ios: `maps:?q=${encodeURIComponent(label)}&ll=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(label)})`
    });
    if (url) {
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'Could not open maps');
      });
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const getCategoryInfo = (category: string) => {
    return EMERGENCY_CATEGORIES[category] || EMERGENCY_CATEGORIES.other;
  };

  // FIX 2.4: Display actual sender name instead of "Unknown"
  const getSenderName = (item: any): string => {
    return item.user_name || item.full_name || item.user_email || 'User';
  };

  // FIX 4.1: Open location map modal with user details
  const handleRespond = (item: any) => {
    const senderName = getSenderName(item);
    const senderEmail = item.user_email || 'No email';
    const senderPhone = item.user_phone || item.phone;

    if (!item.latitude || !item.longitude) {
      Alert.alert('Location Error', 'User location not available');
      return;
    }

    // Show options
    const buttons: any[] = [
      { text: 'Cancel', style: 'cancel' }
    ];

    if (senderPhone) {
      buttons.unshift({
        text: 'Call User',
        onPress: () => callUser(senderPhone)
      });
      buttons.unshift({
        text: 'Send Message',
        onPress: () => sendMessage(senderPhone)
      });
    }

    buttons.unshift({
      text: 'View on Map',
      onPress: () => {
        setLocationModal({
          visible: true,
          lat: item.latitude,
          lng: item.longitude,
          title: `${senderName}'s Location`
        });
      }
    });

    Alert.alert(
      '🚨 Respond to Panic',
      `Name: ${senderName}\nEmail: ${senderEmail}\n${senderPhone ? `Phone: ${senderPhone}\n` : ''}Location: ${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`,
      buttons
    );
  };

  const renderPanic = ({ item }: any) => {
    const categoryInfo = getCategoryInfo(item.emergency_category);
    const dateTime = formatDateTime(item.activated_at);
    const senderName = getSenderName(item);
    const senderEmail = item.user_email || 'No email';
    const senderPhone = item.user_phone || item.phone;

    return (
      <View style={styles.panicCard}>
        <View style={[styles.categoryBadge, { backgroundColor: `${categoryInfo.color}20` }]}>
          <Ionicons name={categoryInfo.icon as any} size={18} color={categoryInfo.color} />
          <Text style={[styles.categoryText, { color: categoryInfo.color }]}>
            {categoryInfo.label}
          </Text>
        </View>

        <View style={styles.panicHeader}>
          <View style={styles.panicIcon}>
            <Ionicons name="alert-circle" size={36} color="#EF4444" />
          </View>
          <View style={styles.panicInfo}>
            <Text style={styles.panicTitle}>🚨 ACTIVE PANIC</Text>
            {/* FIX 2.4: Display actual sender name */}
            <Text style={styles.panicSender}>{senderName}</Text>
            <Text style={styles.panicEmail}>{senderEmail}</Text>
            {senderPhone && (
              <Text style={styles.panicPhone}>📞 {senderPhone}</Text>
            )}
          </View>
        </View>

        <View style={styles.panicDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={16} color="#94A3B8" />
            <Text style={styles.detailText}>{dateTime.date}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time" size={16} color="#94A3B8" />
            <Text style={styles.detailText}>{dateTime.time}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="location" size={16} color="#94A3B8" />
            <Text style={styles.detailText}>
              {item.latitude?.toFixed(4)}, {item.longitude?.toFixed(4)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="pulse" size={16} color="#10B981" />
            <Text style={styles.detailText}>
              {item.location_count || 0} location updates
            </Text>
          </View>
        </View>

        {/* FIX 2.3: Stretched yellow Respond button, removed Location button */}
        <View style={styles.panicActions}>
          <TouchableOpacity 
            style={styles.respondButton}
            onPress={() => handleRespond(item)}
          >
            <Ionicons name="navigate" size={22} color="#fff" />
            <Text style={styles.respondButtonText}>Respond</Text>
          </TouchableOpacity>
          
          {senderPhone && (
            <TouchableOpacity 
              style={styles.callButton}
              onPress={() => callUser(senderPhone)}
            >
              <Ionicons name="call" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Call</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/security/home')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Panics ({panics.length})</Text>
        <TouchableOpacity onPress={loadPanics}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#EF4444" />
        </View>
      ) : (
        <FlatList
          data={panics}
          renderItem={renderPanic}
          keyExtractor={(item) => item.id || item._id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="shield-checkmark" size={80} color="#64748B" />
              <Text style={styles.emptyText}>No active panics</Text>
              <Text style={styles.emptySubtext}>All clear in your area</Text>
            </View>
          }
        />
      )}

      {/* FIX 4.1: Location Map Modal */}
      {locationModal && (
        <LocationMapModal
          visible={locationModal.visible}
          onClose={() => setLocationModal(null)}
          latitude={locationModal.lat}
          longitude={locationModal.lng}
          title={locationModal.title}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16 },
  panicCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#EF4444' },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6, marginBottom: 12 },
  categoryText: { fontSize: 13, fontWeight: '600' },
  panicHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  panicIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EF444420', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  panicInfo: { flex: 1 },
  panicTitle: { fontSize: 16, fontWeight: 'bold', color: '#EF4444', marginBottom: 4 },
  panicSender: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 2 },
  panicEmail: { fontSize: 14, color: '#94A3B8', marginBottom: 2 },
  panicPhone: { fontSize: 14, color: '#10B981' },
  panicDetails: { marginTop: 16, backgroundColor: '#0F172A', borderRadius: 12, padding: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  detailText: { fontSize: 14, color: '#94A3B8' },
  panicActions: { flexDirection: 'row', marginTop: 16, gap: 12 },
  
  // FIX 2.3: Stretched yellow/amber Respond button
  respondButton: { 
    flex: 2,
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 10, 
    paddingVertical: 14, 
    borderRadius: 12,
    backgroundColor: '#F59E0B', // Yellow/Amber
  },
  respondButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  
  callButton: { 
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#10B981'
  },
  actionButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  
  emptyContainer: { alignItems: 'center', paddingVertical: 80 },
  emptyText: { fontSize: 20, color: '#64748B', marginTop: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 14, color: '#475569', marginTop: 4 },
});
