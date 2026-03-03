import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  RefreshControl, Alert, ActivityIndicator, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken, clearAuthData, getUserMetadata } from '../../utils/auth';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'https://ongoing-dev-22.preview.emergentagent.com';

const CATEGORY_COLORS: Record<string, string> = {
  violence: '#EF4444', robbery: '#F97316', kidnapping: '#DC2626',
  breakin: '#8B5CF6', harassment: '#EC4899', medical: '#10B981',
  fire: '#F59E0B', other: '#64748B',
};

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    initializeDashboard();
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const initializeDashboard = async () => {
    setLoading(true);
    const token = await getAuthToken();
    if (!token) { router.replace('/admin/login'); return; }
    const metadata = await getUserMetadata();
    if (metadata.role !== 'admin') {
      Alert.alert('Access Denied', 'Admin access required');
      router.replace('/admin/login'); return;
    }
    setAdminEmail(metadata.email || 'Admin');
    await loadData();
    setLoading(false);
  };

  const loadData = async () => {
    try {
      const token = await getAuthToken();
      if (!token) { router.replace('/admin/login'); return; }
      const res = await axios.get(`${BACKEND_URL}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000
      });
      setStats(res.data);
    } catch (error: any) {
      if (error.response?.status === 403 || error.response?.status === 401) {
        await clearAuthData(); router.replace('/admin/login');
      }
    }
  };

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => { await clearAuthData(); router.replace('/admin/login'); } }
    ]);
  };

  const handleClearUploads = async () => {
    Alert.alert('Clear All Uploads', 'This will permanently delete all audio and video report files and records. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await getAuthToken();
            const res = await axios.delete(`${BACKEND_URL}/api/admin/clear-uploads`, {
              headers: { Authorization: `Bearer ${token}` }, timeout: 30000
            });
            Alert.alert('✅ Cleared', res.data?.message || 'All uploads cleared.');
            loadData();
          } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.detail || 'Failed to clear uploads.');
          }
        }
      }
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading Command Center...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const activePanics = stats?.active_panics || 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Command Center</Text>
          <Text style={styles.adminName} numberOfLines={1}>{adminEmail}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/admin/audit-log')}>
            <Ionicons name="document-text-outline" size={22} color="#94A3B8" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />}>

        {activePanics > 0 && (
          <Animated.View style={[styles.alertBanner, { transform: [{ scale: pulseAnim }] }]}>
            <TouchableOpacity style={styles.alertBannerInner} onPress={() => router.push('/admin/panics')}>
              <Ionicons name="alert-circle" size={22} color="#fff" />
              <Text style={styles.alertBannerText}>{activePanics} ACTIVE PANIC{activePanics > 1 ? 'S' : ''} — TAP TO RESPOND</Text>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
        )}

        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.statsGrid}>
          {[
            { title: 'Total Users', value: stats?.total_users || 0, icon: 'people', color: '#3B82F6', route: '/admin/users' },
            { title: 'Civil Users', value: stats?.civil_users || 0, icon: 'person', color: '#10B981', route: '/admin/users?role=civil' },
            { title: 'Security', value: stats?.security_users || 0, icon: 'shield', color: '#F59E0B', route: '/admin/teams' },
            { title: 'Active Panics', value: activePanics, icon: 'alert-circle', color: '#EF4444', route: '/admin/panics', highlight: activePanics > 0 },
          ].map((s) => (
            <TouchableOpacity key={s.title} style={[styles.statCard, { borderLeftColor: s.color }]} onPress={() => router.push(s.route as any)}>
              <View style={[styles.statIcon, { backgroundColor: `${s.color}20` }]}>
                <Ionicons name={s.icon as any} size={22} color={s.color} />
              </View>
              <Text style={[styles.statValue, s.highlight && { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statTitle}>{s.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.secondaryStats}>
          {[
            { label: 'Escorts', value: stats?.active_escorts || 0, icon: 'navigate', color: '#10B981' },
            { label: 'Premium', value: stats?.premium_users || 0, icon: 'star', color: '#F59E0B' },
            { label: 'Flagged', value: stats?.flagged_users || 0, icon: 'flag', color: '#EF4444' },
            { label: 'Avg Min', value: stats?.avg_response_mins || '--', icon: 'time', color: '#8B5CF6' },
          ].map((s, i, arr) => (
            <React.Fragment key={s.label}>
              <View style={styles.secStat}>
                <Ionicons name={s.icon as any} size={16} color={s.color} />
                <Text style={styles.secStatValue}>{s.value}</Text>
                <Text style={styles.secStatLabel}>{s.label}</Text>
              </View>
              {i < arr.length - 1 && <View style={styles.secDivider} />}
            </React.Fragment>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Last 24 Hours</Text>
        <View style={styles.recentStats}>
          {[
            { label: 'Panics', value: stats?.recent_24h?.panics || 0, icon: 'alert', color: '#EF4444', route: '/admin/panics' },
            { label: 'Reports', value: stats?.recent_24h?.reports || 0, icon: 'document-text', color: '#3B82F6', route: '/admin/reports' },
            { label: 'New Users', value: stats?.recent_24h?.new_users || 0, icon: 'person-add', color: '#10B981', route: '/admin/users' },
          ].map((s, i, arr) => (
            <React.Fragment key={s.label}>
              <TouchableOpacity style={styles.recentItem} onPress={() => router.push(s.route as any)}>
                <Ionicons name={s.icon as any} size={18} color={s.color} />
                <Text style={styles.recentValue}>{s.value}</Text>
                <Text style={styles.recentLabel}>{s.label}</Text>
              </TouchableOpacity>
              {i < arr.length - 1 && <View style={styles.recentDivider} />}
            </React.Fragment>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Reports Queue</Text>
        <TouchableOpacity style={styles.queueCard} onPress={() => router.push('/admin/reports')}>
          {[
            { label: 'New / Pending', count: stats?.pending_reports || 0, color: '#EF4444' },
            { label: 'Under Review', count: stats?.under_review_reports || 0, color: '#F59E0B' },
            { label: 'Resolved', count: stats?.resolved_reports || 0, color: '#10B981' },
          ].map((q) => (
            <View key={q.label} style={styles.queueItem}>
              <View style={[styles.queueDot, { backgroundColor: q.color }]} />
              <Text style={styles.queueLabel}>{q.label}</Text>
              <Text style={styles.queueCount}>{q.count}</Text>
            </View>
          ))}
        </TouchableOpacity>

        {stats?.category_breakdown?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Incident Types — 30 Days</Text>
            <View style={styles.categoryCard}>
              {stats.category_breakdown.slice(0, 6).map((item: any) => {
                const color = CATEGORY_COLORS[item.category] || '#64748B';
                const pct = (item.count / stats.category_breakdown[0].count) * 100;
                return (
                  <View key={item.category} style={styles.categoryRow}>
                    <Text style={styles.categoryLabel}>{item.category.charAt(0).toUpperCase() + item.category.slice(1)}</Text>
                    <View style={styles.categoryBarBg}>
                      <View style={[styles.categoryBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>
                    <Text style={[styles.categoryCount, { color }]}>{item.count}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {[
            { label: 'Manage Users', icon: 'people', color: '#3B82F6', route: '/admin/users' },
            { label: 'Security Teams', icon: 'shield-checkmark', color: '#F59E0B', route: '/admin/teams' },
            { label: 'All Panics', icon: 'alert-circle', color: '#EF4444', route: '/admin/panics' },
            { label: 'Evidence Library', icon: 'videocam', color: '#10B981', route: '/admin/reports' },
            { label: 'Analytics', icon: 'bar-chart', color: '#8B5CF6', route: '/admin/analytics' },
            { label: 'Broadcast', icon: 'megaphone', color: '#EC4899', route: '/admin/broadcast' },
            { label: 'Security Map', icon: 'map', color: '#14B8A6', route: '/admin/security-map' },
            { label: 'Messaging', icon: 'chatbubbles', color: '#6366F1', route: '/admin/messaging' },
            { label: 'Track Users', icon: 'locate', color: '#F97316', route: '/admin/track-user' },
            { label: 'Invite Codes', icon: 'key', color: '#64748B', route: '/admin/invite-codes' },
            { label: 'Search & Export', icon: 'search', color: '#0EA5E9', route: '/admin/search' },
            { label: 'Audit Log', icon: 'document-text', color: '#475569', route: '/admin/audit-log' },
          ].map((a) => (
            <TouchableOpacity key={a.label} style={styles.actionCard} onPress={() => router.push(a.route as any)}>
              <View style={[styles.actionIcon, { backgroundColor: `${a.color}20` }]}>
                <Ionicons name={a.icon as any} size={26} color={a.color} />
              </View>
              <Text style={styles.actionText}>{a.label}</Text>
            </TouchableOpacity>
          ))}

          {/* Clear Uploads — Danger Zone */}
          <TouchableOpacity style={styles.dangerCard} onPress={handleClearUploads}>
            <View style={[styles.actionIcon, { backgroundColor: '#EF444420' }]}>
              <Ionicons name="trash" size={26} color="#EF4444" />
            </View>
            <Text style={[styles.actionText, { color: '#EF4444' }]}>Clear All Uploads</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94A3B8', marginTop: 16, fontSize: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  greeting: { fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 },
  adminName: { fontSize: 17, fontWeight: 'bold', color: '#fff', maxWidth: 220 },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerBtn: { padding: 8 },
  content: { flex: 1, paddingHorizontal: 16 },
  alertBanner: { marginTop: 14, borderRadius: 14, overflow: 'hidden' },
  alertBannerInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF4444', paddingVertical: 13, paddingHorizontal: 16, gap: 10 },
  alertBannerText: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12, marginTop: 20 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  statCard: { width: '48.5%', backgroundColor: '#1E293B', borderRadius: 16, padding: 14, borderLeftWidth: 4 },
  statIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  statValue: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  statTitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  secondaryStats: { flexDirection: 'row', backgroundColor: '#1E293B', borderRadius: 16, padding: 14, alignItems: 'center' },
  secStat: { flex: 1, alignItems: 'center', gap: 3 },
  secStatValue: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  secStatLabel: { fontSize: 10, color: '#64748B' },
  secDivider: { width: 1, height: 34, backgroundColor: '#334155' },
  recentStats: { flexDirection: 'row', backgroundColor: '#1E293B', borderRadius: 16, padding: 16, alignItems: 'center' },
  recentItem: { flex: 1, alignItems: 'center', gap: 4 },
  recentValue: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  recentLabel: { fontSize: 11, color: '#64748B' },
  recentDivider: { width: 1, height: 38, backgroundColor: '#334155' },
  queueCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16 },
  queueItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  queueDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  queueLabel: { flex: 1, fontSize: 14, color: '#94A3B8' },
  queueCount: { fontSize: 18, fontWeight: '700', color: '#fff' },
  categoryCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  categoryLabel: { width: 86, fontSize: 12, color: '#94A3B8' },
  categoryBarBg: { flex: 1, height: 7, backgroundColor: '#0F172A', borderRadius: 4, marginHorizontal: 8, overflow: 'hidden' },
  categoryBarFill: { height: '100%', borderRadius: 4 },
  categoryCount: { width: 26, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: { width: '31%', backgroundColor: '#1E293B', borderRadius: 14, padding: 12, alignItems: 'center', gap: 8 },
  actionIcon: { width: 46, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actionText: { fontSize: 11, color: '#94A3B8', textAlign: 'center', fontWeight: '500' },
});
