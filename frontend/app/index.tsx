import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAuthToken, getUserMetadata } from '../utils/auth';

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [showPanicPrompt, setShowPanicPrompt] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Add a small delay to ensure component is mounted
    const timer = setTimeout(() => {
      checkAuth();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const checkAuth = async () => {
    try {
      console.log('[Index] Checking authentication...');
      const token = await getAuthToken();
      const metadata = await getUserMetadata();
      
      console.log('[Index] Token exists:', !!token, 'Role:', metadata.role);
      
      if (!token) {
        // No token, go to login
        console.log('[Index] No token, redirecting to login');
        setTimeout(() => {
          router.replace('/auth/login');
        }, 100);
      } else {
        setUserRole(metadata.role);
        if (metadata.role === 'security') {
          // Security users go directly to their dashboard
          console.log('[Index] Security user, redirecting to security home');
          setTimeout(() => {
            router.replace('/security/home');
          }, 100);
        } else if (metadata.role === 'admin') {
          // Admin users go to admin dashboard
          console.log('[Index] Admin user, redirecting to admin dashboard');
          setTimeout(() => {
            router.replace('/admin/dashboard');
          }, 100);
        } else {
          // Civil users see panic prompt
          console.log('[Index] Civil user, showing panic prompt');
          setShowPanicPrompt(true);
          setLoading(false);
        }
      }
    } catch (error) {
      console.error('[Index] Auth check error:', error);
      setError('Failed to check authentication');
      // Fallback to login
      setTimeout(() => {
        router.replace('/auth/login');
      }, 1000);
    }
  };

  const handlePanicButton = () => {
    Alert.alert(
      '🚨 PANIC MODE',
      'Activating panic mode will:\n\n• Enable GPS tracking\n• Alert nearby security agencies\n• Run discreetly in background\n\nAre you in danger?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'ACTIVATE',
          style: 'destructive',
          onPress: () => router.push('/civil/panic-active')
        }
      ]
    );
  };

  const handleDecline = () => {
    setShowPanicPrompt(false);
    router.replace('/civil/home');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#EF4444" />
          <Text style={styles.loadingText}>Loading SafeGuard...</Text>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  if (showPanicPrompt && userRole === 'civil') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={60} color="#EF4444" />
          <Text style={styles.appName}>SafeGuard</Text>
          <Text style={styles.tagline}>Your Safety, Our Priority</Text>
        </View>

        <View style={styles.panicSection}>
          <Text style={styles.emergencyText}>Emergency Situation?</Text>
          
          <TouchableOpacity style={styles.panicButton} onPress={handlePanicButton} activeOpacity={0.8}>
            <Ionicons name="alert-circle" size={80} color="#fff" />
            <Text style={styles.panicButtonText}>PANIC</Text>
            <Text style={styles.panicSubtext}>Tap for Emergency</Text>
          </TouchableOpacity>

          <Text style={styles.orText}>or</Text>

          <TouchableOpacity style={styles.declineButton} onPress={handleDecline}>
            <Text style={styles.declineText}>I'm Safe - Enter App</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            In panic mode, your location will be tracked and sent to nearby security agencies
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { fontSize: 16, color: '#94A3B8', marginTop: 16 },
  errorText: { fontSize: 14, color: '#EF4444', marginTop: 12, textAlign: 'center' },
  header: { alignItems: 'center', paddingVertical: 40 },
  appName: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginTop: 16 },
  tagline: { fontSize: 16, color: '#94A3B8', marginTop: 8 },
  panicSection: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  emergencyText: { fontSize: 24, fontWeight: '600', color: '#fff', marginBottom: 40 },
  panicButton: { width: 220, height: 220, borderRadius: 110, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', shadowColor: '#EF4444', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  panicButtonText: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  panicSubtext: { fontSize: 14, color: '#FEE2E2', marginTop: 4 },
  orText: { fontSize: 18, color: '#64748B', marginVertical: 32 },
  declineButton: { paddingHorizontal: 40, paddingVertical: 16, borderRadius: 12, borderWidth: 2, borderColor: '#3B82F6' },
  declineText: { fontSize: 18, fontWeight: '600', color: '#3B82F6' },
  footer: { paddingHorizontal: 32, paddingBottom: 24, alignItems: 'center' },
  footerText: { fontSize: 12, color: '#64748B', textAlign: 'center', lineHeight: 18 },
});
