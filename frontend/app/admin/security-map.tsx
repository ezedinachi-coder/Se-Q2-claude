import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken, clearAuthData } from '../../utils/auth';
import { NativeMap } from '../../components/NativeMap';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'https://ongoing-dev-22.preview.emergentagent.com';

const STATUS_COLORS: Record<string, string> = {
  responding: '#EF4444', available: '#10B981', busy: '#F59E0B', offline: '#64748B',
};

export default function AdminSecurityMap() {
  const router = useRouter();
  const [securityUsers, setSecurityUsers] = useState<any[]>([]);
  const [panics, setPanics] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [mapRegion, setMapRegion] = useState({
    latitude: 9.082, longitude: 8.6753, latitudeDelta: 0.5, longitudeDelta: 0.5,
  });

  useFocusEffect(
    useCallback(() => {
      loadData();
      const interval = setInterval(loadData, 20000);
      return () => clearInterval(interval);
    }, [])
  );

  const loadData = async () => {
    try {
      const token = await getAuthToken();
      if (!token) { router.replace('/admin/login'); return; }
      const [mapRes, panicRes] = await Promise.allSettled([
        axios.get(`${BACKEND_URL}/api/admin/security-map`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }),
        axios.get(`${BACKEND_URL}/api/admin/all-panics?status=active&limit=50`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }),
      ]);
      if (mapRes.status === 'fulfilled') {
        const users = mapRes.value.data.security_users || [];
        setSecurityUsers(users);
        const withLoc = users.find((u: any) => u.location?.coordinates);
        if (withLoc) {
          setMapRegion({ latitude: withLoc.location.coordinates[1], longitude: withLoc.location.coordinates[0], latitudeDelta: 0.3, longitudeDelta: 0.3 });
        }
      }
      if (panicRes.status === 'fulfilled') setPanics(panicRes.value.data?.panics || []);
    } catch (e: any) {
      if (e?.response?.status === 401) { await clearAuthData(); router.replace('/admin/login'); }
    }
  };

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const mapMarkers = [
    ...securityUsers.filter(u => u.location?.coordinates).map(u => ({
      id: `sec_${u.id}`, latitude: u.location.coordinates[1], longitude: u.location.coordinates[0],
      title: u.full_name || u.email || 'Security', description: u.status || '', pinColor: STATUS_COLORS[u.status] || '#64748B',
    })),
    ...panics.filter(p => p.latitude && p.longitude).map(p => ({
      id: `panic_${p.id}`, latitude: p.latitude, longitude: p.longitude,
      title: `🚨 ${p.user_name || 'Panic'}`, description: p.emergency_category || '', pinColor: '#EF4444',
    })),
  ];

  const grouped = {
    responding: securityUsers.filter(u => u.status === 'responding'),
    available: securityUsers.filter(u => u.status === 'available'),
    busy: securityUsers.filter(u => u.status === 'busy'),
    offline: securityUsers.filter(u => !u.status || u.status === 'offline'),
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/admin/dashboard')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Security Map</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <NativeMap region={mapRegion} markers={mapMarkers} style={styles.map} />

      <View style={styles.legend}>
        {[{ c: '#EF4444', l: `Responding (${grouped.responding.length})` }, { c: '#10B981', l: `Available (${grouped.available.length})` }, { c: '#F59E0B', l: `Busy (${grouped.busy.length})` }, { c: '#64748B', l: `Offline (${grouped.offline.length})` }].map(i => (
          <View key={i.l} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: i.c }]} />
            <Text style={styles.legendText}>{i.l}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />}>
        {panics.length > 0 && (
          <>
            <Text style={[styles.section, { color: '#EF4444' }]}>🚨 Active Panics ({panics.length})</Text>
            {panics.map(p => (
              <View key={p.id} style={[styles.card, { borderLeftColor: '#EF4444' }]}>
                <Text style={styles.cardName}>{p.user_name || p.user_email || 'Unknown'}</Text>
                <Text style={styles.cardSub}>{(p.emergency_category || 'other').toUpperCase()} · {p.latitude?.toFixed(4)}, {p.longitude?.toFixed(4)}</Text>
              </View>
            ))}
          </>
        )}
        {(['responding', 'available', 'busy', 'offline'] as const).map(status => {
          const group = grouped[status];
          if (!group.length) return null;
          const labels = { responding: '🚨 Responding', available: '✅ Available', busy: '⏳ Busy', offline: '⚫ Offline' };
          return (
            <React.Fragment key={status}>
              <Text style={[styles.section, { color: STATUS_COLORS[status] }]}>{labels[status]}</Text>
              {group.map(u => (
                <TouchableOpacity key={u.id} style={[styles.card, { borderLeftColor: STATUS_COLORS[u.status] || '#64748B' }]}
                  onPress={() => { if (u.location?.coordinates) setMapRegion({ latitude: u.location.coordinates[1], longitude: u.location.coordinates[0], latitudeDelta: 0.05, longitudeDelta: 0.05 }); }}>
                  <Text style={styles.cardName}>{u.full_name || u.email || 'Unknown'}</Text>
                  <Text style={styles.cardSub}>{u.security_sub_role === 'supervisor' ? '⭐ Supervisor' : 'Team Member'}{u.team_name ? ` · ${u.team_name}` : ''}</Text>
                  {u.location?.coordinates && <Text style={styles.cardCoords}>📍 {u.location.coordinates[1]?.toFixed(4)}, {u.location.coordinates[0]?.toFixed(4)}</Text>}
                </TouchableOpacity>
              ))}
            </React.Fragment>
          );
        })}
        {securityUsers.length === 0 && panics.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color="#64748B" />
            <Text style={styles.emptyText}>No security users with location data</Text>
          </View>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '600', color: '#fff' },
  map: { height: 260 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1E293B' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#94A3B8' },
  list: { flex: 1, paddingHorizontal: 16 },
  section: { fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4 },
  cardName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  cardSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  cardCoords: { fontSize: 11, color: '#3B82F6', marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 15, color: '#64748B', marginTop: 8 },
});
