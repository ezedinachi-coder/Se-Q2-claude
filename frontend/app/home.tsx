import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Home() {
  const router = useRouter();
  const [isPremium, setIsPremium] = React.useState(false);

  React.useEffect(() => {
    checkPremiumStatus();
  }, []);

  const checkPremiumStatus = async () => {
    const premium = await AsyncStorage.getItem('is_premium');
    setIsPremium(premium === 'true');
  };

  const handleLogout = async () => {
    await AsyncStorage.clear();
    router.replace('/auth/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome to</Text>
            <Text style={styles.appName}>SafeGuard</Text>
          </View>
          <View style={styles.headerRight}>
            {isPremium && (
              <View style={styles.premiumBadge}>
                <Ionicons name="star" size={16} color="#FFD700" />
                <Text style={styles.premiumText}>Premium</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => router.push('/settings')}
            >
              <Ionicons name="settings-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          {/* Panic Button */}
          <TouchableOpacity
            style={styles.panicCard}
            onPress={() => router.push('/panic/active')}
          >
            <View style={styles.cardLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="alert-circle" size={32} color="#EF4444" />
              </View>
              <View>
                <Text style={styles.cardTitle}>Panic Button</Text>
                <Text style={styles.cardDescription}>Emergency alert & tracking</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#64748B" />
          </TouchableOpacity>

          {/* Security Escort */}
          <TouchableOpacity
            style={[
              styles.card,
              !isPremium && styles.disabledCard
            ]}
            onPress={() => {
              if (isPremium) {
                router.push('/escort');
              } else {
                router.push('/premium');
              }
            }}
          >
            <View style={styles.cardLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="navigate" size={28} color="#3B82F6" />
              </View>
              <View>
                <Text style={styles.cardTitle}>
                  Security Escort {!isPremium && '🔒'}
                </Text>
                <Text style={styles.cardDescription}>
                  {isPremium ? 'Track your journey' : 'Premium feature'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#64748B" />
          </TouchableOpacity>

          {/* Live Report */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/report')}
          >
            <View style={styles.cardLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="videocam" size={28} color="#10B981" />
              </View>
              <View>
                <Text style={styles.cardTitle}>Live Report</Text>
                <Text style={styles.cardDescription}>Record & report incidents</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#64748B" />
          </TouchableOpacity>

          {/* Audio Report */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/report/audio')}
          >
            <View style={styles.cardLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="mic" size={28} color="#8B5CF6" />
              </View>
              <View>
                <Text style={styles.cardTitle}>Audio Report</Text>
                <Text style={styles.cardDescription}>Voice message report</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* My Reports */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Reports</Text>
            <TouchableOpacity onPress={() => router.push('/report/list')}>
              <Text style={styles.viewAll}>View All</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.placeholderText}>
            Your submitted reports will appear here
          </Text>
        </View>

        {!isPremium && (
          <TouchableOpacity
            style={styles.upgradeCard}
            onPress={() => router.push('/premium')}
          >
            <View>
              <Text style={styles.upgradeTitle}>Upgrade to Premium</Text>
              <Text style={styles.upgradeDescription}>
                Unlock Security Escort and more features
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={24} color="#FFD700" />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  greeting: {
    fontSize: 16,
    color: '#94A3B8',
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  premiumText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '600',
  },
  settingsButton: {
    padding: 8,
  },
  quickActions: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  panicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  disabledCard: {
    opacity: 0.6,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#94A3B8',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewAll: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
  placeholderText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    paddingVertical: 32,
  },
  upgradeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 4,
  },
  upgradeDescription: {
    fontSize: 14,
    color: '#94A3B8',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  logoutText: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '600',
  },
});
