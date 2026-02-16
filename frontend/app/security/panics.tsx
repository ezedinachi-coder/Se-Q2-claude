import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert, Linking, Modal, ScrollView } from 'react-native';
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

interface PanicResponseModalData {
  panicId: string;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  latitude: number;
  longitude: number;
  category: string;
  activatedAt: string;
}

export default function SecurityPanics() {
  const router = useRouter();
  const [panics, setPanics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [responseModal, setResponseModal] = useState<PanicResponseModalData | null>(null);
  const [locationUpdateInterval, setLocationUpdateInterval] = useState<any>(null);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      loadPanics();
      return () => {
        // Cleanup location polling when leaving page
        if (locationUpdateInterval) {
          clearInterval(locationUpdateInterval);
        }
      };
    }, [locationUpdateInterval])
  );

  useEffect(() => {
    const interval = setInterval(loadPanics, 15000);
    return () => {
      clearInterval(interval);
      if (locationUpdateInterval) {
        clearInterval(locationUpdateInterval);
      }
    };
  }, [locationUpdateInterval]);

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
    // Fallback chain: user_name → full_name → user_email → "User"
    return item.user_name || item.full_name || item.user_email || 'User';
  };

  // FIX 4.1: Open response modal with in-app map and auto-updating location
  const handleRespond = async (item: any) => {
    const categoryInfo = getCategoryInfo(item.emergency_category);
    const senderName = getSenderName(item);
    const senderEmail = item.user_email || 'No email';
    const senderPhone = item.user_phone || item.phone || null;

    if (!item.latitude || !item.longitude) {
      Alert.alert('Location Error', 'User location not available');
      return;
    }

    // Set up response modal data
    const modalData: PanicResponseModalData = {
      panicId: item.id || item._id,
      userName: senderName,
      userEmail: senderEmail,
      userPhone: senderPhone,
      latitude: item.latitude,
      longitude: item.longitude,
      category: categoryInfo.label,
      activatedAt: item.activated_at
    };

    setResponseModal(modalData);

    // Start polling for location updates every 2 minutes (120000ms)
    const interval = setInterval(async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;

        const response = await axios.get(
          `${BACKEND_URL}/api/security/panic/${modalData.panicId}/location`,
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
          }
        );

        if (response.data?.latitude && response.data?.longitude) {
          setResponseModal(prev => prev ? {
            ...prev,
            latitude: response.data.latitude,
            longitude: response.data.longitude
          } : null);
          console.log('[SecurityPanics] Location updated:', response.data.latitude, response.data.longitude);
        }
      } catch (error) {
        console.error('[SecurityPanics] Failed to update location:', error);
      }
    }, 120000); // 2 minutes

    setLocationUpdateInterval(interval);
  };

  const closeResponseModal = () => {
    if (locationUpdateInterval) {
      clearInterval(locationUpdateInterval);
      setLocationUpdateInterval(null);
    }
    setResponseModal(null);
  };

  const renderPanic = ({ item }: any) => {
    const categoryInfo = getCategoryInfo(item.emergency_category);
    const dateTime = formatDateTime(item.activated_at);
    
    // FIX 2.4: Use actual sender name
    const senderName = getSenderName(item);
    const senderEmail = item.user_email || 'No email';
    const senderPhone = item.user_phone || item.phone;

    return (
      <View style={styles.panicCard}>
        {/* Emergency Type Badge */}
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

        {/* FIX 2.3 & 1.5: Removed Location button, stretched Respond button (yellow) */}
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

      {/* FIX 4.1 & 5.2: Response Modal with In-App Map, User Details, and Communication Buttons */}
      {responseModal && (
        <Modal
          visible={true}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={closeResponseModal}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeResponseModal}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Panic Response</Text>
              <TouchableOpacity onPress={loadPanics}>
                <Ionicons name="refresh" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              {/* User Details Card */}
              <View style={styles.userDetailsCard}>
                <View style={styles.userHeader}>
                  <View style={styles.userIconContainer}>
                    <Ionicons name="person" size={32} color="#EF4444" />
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{responseModal.userName}</Text>
                    <Text style={styles.userCategory}>🚨 {responseModal.category}</Text>
                  </View>
                </View>

                <View style={styles.userDetailsRow}>
                  <Ionicons name="mail" size={18} color="#94A3B8" />
                  <Text style={styles.userDetail}>{responseModal.userEmail}</Text>
                </View>

                {responseModal.userPhone && (
                  <View style={styles.userDetailsRow}>
                    <Ionicons name="call" size={18} color="#94A3B8" />
                    <Text style={styles.userDetail}>{responseModal.userPhone}</Text>
                  </View>
                )}

                <View style={styles.userDetailsRow}>
                  <Ionicons name="location" size={18} color="#94A3B8" />
                  <Text style={styles.userDetail}>
                    {responseModal.latitude.toFixed(6)}, {responseModal.longitude.toFixed(6)}
                  </Text>
                </View>

                <View style={styles.userDetailsRow}>
                  <Ionicons name="time" size={18} color="#94A3B8" />
                  <Text style={styles.userDetail}>
                    Activated: {new Date(responseModal.activatedAt).toLocaleString()}
                  </Text>
                </View>

                <View style={styles.autoUpdateBadge}>
                  <Ionicons name="sync" size={14} color="#10B981" />
                  <Text style={styles.autoUpdateText}>Auto-updating every 2 minutes</Text>
                </View>
              </View>

              {/* In-App Map */}
              <View style={styles.mapContainer}>
                <Text style={styles.mapTitle}>Live Location</Text>
                <LocationMapModal
                  visible={true}
                  onClose={() => {}}
                  latitude={responseModal.latitude}
                  longitude={responseModal.longitude}
                  title={`${responseModal.userName}'s Location`}
                  hideCloseButton={true}
                />
              </View>

              {/* FIX 5.2: Communication Action Buttons */}
              <View style={styles.communicationButtons}>
                {responseModal.userPhone && (
                  <>
                    <TouchableOpacity
                      style={styles.commButton}
                      onPress={() => sendMessage(responseModal.userPhone!)}
                    >
                      <Ionicons name="chatbubble" size={22} color="#fff" />
                      <Text style={styles.commButtonText}>Message</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.commButton, styles.callCommButton]}
                      onPress={() => callUser(responseModal.userPhone!)}
                    >
                      <Ionicons name="call" size={22} color="#fff" />
                      <Text style={styles.commButtonText}>Call</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
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
    backgroundColor: '#F59E0B', // Yellow/Amber color
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

  // Response Modal Styles
  modalContainer: { flex: 1, backgroundColor: '#0F172A' },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  modalContent: { flex: 1 },
  
  userDetailsCard: { 
    backgroundColor: '#1E293B', 
    margin: 16, 
    padding: 20, 
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444'
  },
  userHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  userIconContainer: { 
    width: 60, 
    height: 60, 
    borderRadius: 30, 
    backgroundColor: '#EF444420', 
    justifyContent: 'center', 
    alignItems: 'center',
    marginRight: 16
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  userCategory: { fontSize: 14, color: '#EF4444', fontWeight: '600' },
  userDetailsRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12, 
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8
  },
  userDetail: { fontSize: 14, color: '#fff', flex: 1 },
  autoUpdateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#10B98120',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8
  },
  autoUpdateText: { fontSize: 12, color: '#10B981', fontWeight: '600' },
  
  mapContainer: { 
    margin: 16,
    marginTop: 0,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    overflow: 'hidden',
    height: 400
  },
  mapTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    padding: 16,
    paddingBottom: 12,
    backgroundColor: '#1E293B'
  },
  
  communicationButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 32
  },
  commButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#3B82F6'
  },
  callCommButton: {
    backgroundColor: '#10B981'
  },
  commButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff'
  }
});
