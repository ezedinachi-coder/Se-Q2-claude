import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import { getAuthToken, clearAuthData } from '../../../utils/auth';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || 'https://guardlogin.preview.emergentagent.com';

export default function SecurityChat() {
  const router = useRouter();
  const [conversations, setConversations] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const goBack = () => {
    router.replace('/security/home');
  };

  useEffect(() => {
    loadConversations();
    loadUnreadCount();
  }, []);

  const loadConversations = async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        router.replace('/auth/login');
        return;
      }
      
      const response = await axios.get(`${BACKEND_URL}/api/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
      });
      setConversations(response.data.conversations || []);
    } catch (error: any) {
      console.error('[SecurityChat] Failed to load conversations:', error?.response?.status);
      if (error?.response?.status === 401) {
        await clearAuthData();
        router.replace('/auth/login');
      }
    }
  };

  const loadUnreadCount = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      
      const response = await axios.get(`${BACKEND_URL}/api/chat/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });
      setUnreadCount(response.data.unread_count || 0);
    } catch (error) {
      console.error('[SecurityChat] Failed to load unread count:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations();
    await loadUnreadCount();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    const colors: any = {
      available: '#10B981',
      busy: '#F59E0B',
      responding: '#EF4444',
      offline: '#64748B'
    };
    return colors[status] || '#64748B';
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);
    
    if (hours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (hours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  const renderConversation = ({ item }: any) => (
    <TouchableOpacity 
      style={styles.conversationCard}
      onPress={() => router.push(`/security/chat/${item.id}`)}
    >
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Ionicons name="shield" size={24} color="#F59E0B" />
        </View>
        <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(item.other_user?.status) }]} />
      </View>
      
      <View style={styles.conversationInfo}>
        <View style={styles.conversationHeader}>
          <Text style={styles.userName} numberOfLines={1}>
            {item.other_user?.full_name || 'Unknown User'}
          </Text>
          <Text style={styles.timeText}>{formatTime(item.last_message_at)}</Text>
        </View>
        <Text style={styles.subRole}>
          {item.other_user?.security_sub_role === 'supervisor' ? '⭐ Supervisor' : 'Team Member'}
        </Text>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {item.last_message || 'No messages yet'}
        </Text>
      </View>

      {item.unread_count > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>{item.unread_count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Messages</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => router.push('/security/nearby')}>
          <Ionicons name="people" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        renderItem={renderConversation}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F59E0B" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={64} color="#334155" />
            <Text style={styles.emptyTitle}>No Conversations Yet</Text>
            <Text style={styles.emptyText}>Find security users nearby and start chatting</Text>
            <TouchableOpacity 
              style={styles.findButton}
              onPress={() => router.push('/security/nearby')}
            >
              <Ionicons name="people" size={20} color="#fff" />
              <Text style={styles.findButtonText}>Find Nearby Users</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '600', color: '#fff' },
  headerBadge: { backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  headerBadgeText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  list: { padding: 16 },
  conversationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 12 },
  avatarContainer: { position: 'relative', marginRight: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#F59E0B20', justifyContent: 'center', alignItems: 'center' },
  statusIndicator: { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#1E293B' },
  conversationInfo: { flex: 1 },
  conversationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  userName: { fontSize: 16, fontWeight: '600', color: '#fff', flex: 1 },
  timeText: { fontSize: 12, color: '#64748B' },
  subRole: { fontSize: 12, color: '#94A3B8', marginBottom: 4 },
  lastMessage: { fontSize: 14, color: '#64748B' },
  unreadBadge: { backgroundColor: '#3B82F6', minWidth: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  unreadText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#fff', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#64748B', marginTop: 8, textAlign: 'center' },
  findButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, paddingVertical: 14, paddingHorizontal: 24, backgroundColor: '#F59E0B', borderRadius: 12 },
  findButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
