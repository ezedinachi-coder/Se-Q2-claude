import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Animated, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthToken, getUserMetadata } from '../utils/auth';

type ScreenMode = 'loading' | 'pin_lock' | 'panic_prompt' | 'disguise_game';

export default function Index() {
  const router = useRouter();
  const [mode, setMode] = useState<ScreenMode>('loading');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const [gameScore, setGameScore] = useState(0);
  const [gameTarget, setGameTarget] = useState<{x: number; y: number} | null>(null);
  const gameInterval = useRef<any>(null);

  useEffect(() => {
    const timer = setTimeout(() => { checkAuth(); }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (mode === 'disguise_game') {
      triggerDisguiseCustomization();
      spawnGameTarget();
      gameInterval.current = setInterval(spawnGameTarget, 2200);
      return () => { if (gameInterval.current) clearInterval(gameInterval.current); };
    }
  }, [mode]);

  const triggerDisguiseCustomization = async () => {
    try {
      const names = ['GameZone', 'Puzzle Master', 'Color Match', 'Speed Tap', 'Memory King'];
      const name = names[Math.floor(Math.random() * names.length)];
      await AsyncStorage.setItem('app_customization', JSON.stringify({ app_name: name, app_logo: 'game-controller' }));
    } catch (e) {}
  };

  const spawnGameTarget = () => {
    setGameTarget({ x: Math.random() * 260 + 30, y: Math.random() * 380 + 100 });
  };

  const checkAuth = async () => {
    try {
      const token = await getAuthToken();
      const metadata = await getUserMetadata();
      if (!token) { setTimeout(() => router.replace('/auth/login'), 100); return; }
      setUserRole(metadata.role);
      // If panic was active, show PIN lock screen
      const activePanic = await AsyncStorage.getItem('active_panic');
      if (activePanic && metadata.role === 'civil') {
        setMode('pin_lock');
        return;
      }
      if (metadata.role === 'security') {
        setTimeout(() => router.replace('/security/home'), 100);
      } else if (metadata.role === 'admin') {
        setTimeout(() => router.replace('/admin/dashboard'), 100);
      } else {
        setMode('panic_prompt');
      }
    } catch (err) {
      console.error('[Index] Auth check error:', err);
      setError('Failed to check authentication');
      setTimeout(() => router.replace('/auth/login'), 1000);
    }
  };

  const shakePinBox = () => {
    Vibration.vibrate(300);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const handlePinSubmit = async (pin: string) => {
    try {
      const savedPin = await AsyncStorage.getItem('security_pin');
      if (!savedPin) {
        await AsyncStorage.removeItem('active_panic');
        router.replace('/civil/home');
        return;
      }
      if (pin === savedPin) {
        // ✅ Correct PIN
        await AsyncStorage.removeItem('active_panic');
        setPinInput(''); setPinError('');
        router.replace('/civil/home');
      } else {
        // ❌ Wrong PIN → disguise game
        setPinAttempts(a => a + 1);
        setPinInput('');
        setPinError('Incorrect PIN');
        shakePinBox();
        setTimeout(() => setMode('disguise_game'), 900);
      }
    } catch (err) { console.error('[Index] PIN error:', err); }
  };

  const handlePinKey = (key: string) => {
    setPinError('');
    if (key === 'del') {
      setPinInput(prev => prev.slice(0, -1));
    } else if (pinInput.length < 4) {
      const newPin = pinInput + key;
      setPinInput(newPin);
      if (newPin.length === 4) setTimeout(() => handlePinSubmit(newPin), 150);
    }
  };

  const handlePanicButton = () => {
    Alert.alert('🚨 PANIC MODE',
      'Activating panic mode will:\n\n• Enable GPS tracking\n• Alert nearby security agencies\n• Run discreetly in background\n\nAre you in danger?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'ACTIVATE', style: 'destructive', onPress: () => router.push('/civil/panic-active') }
      ]
    );
  };

  // LOADING
  if (mode === 'loading') {
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

  // 🔐 PIN LOCK
  if (mode === 'pin_lock') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pinLockContainer}>
          <View style={styles.pinLockHeader}>
            <Ionicons name="lock-closed" size={52} color="#EF4444" />
            <Text style={styles.pinLockTitle}>App Locked</Text>
            <Text style={styles.pinLockSubtitle}>Enter your security PIN to continue</Text>
          </View>
          <Animated.View style={[styles.pinDots, { transform: [{ translateX: shakeAnim }] }]}>
            {[0,1,2,3].map(i => (
              <View key={i} style={[styles.pinDot, pinInput.length > i && styles.pinDotFilled]} />
            ))}
          </Animated.View>
          <Text style={styles.pinError}>{pinError || ' '}</Text>
          <View style={styles.keypad}>
            {['1','2','3','4','5','6','7','8','9','','0','del'].map((key, idx) => (
              <TouchableOpacity key={idx}
                style={[styles.keypadBtn, key === '' && styles.keypadBtnEmpty]}
                onPress={() => key !== '' && handlePinKey(key)}
                disabled={key === ''}
                activeOpacity={0.65}
              >
                {key === 'del'
                  ? <Ionicons name="backspace" size={22} color="#fff" />
                  : <Text style={styles.keypadBtnText}>{key}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // 🎮 DISGUISE GAME
  if (mode === 'disguise_game') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#1a1a2e' }]}>
        <View style={styles.gameHeader}>
          <Ionicons name="game-controller" size={30} color="#a855f7" />
          <Text style={styles.gameTitle}>Speed Tap!</Text>
          <Text style={styles.gameScore}>⭐ {gameScore}</Text>
        </View>
        <Text style={styles.gameInstructions}>Tap the stars before they disappear!</Text>
        <View style={styles.gameArea}>
          {gameTarget && (
            <TouchableOpacity
              style={[styles.gameTarget, { left: gameTarget.x - 30, top: gameTarget.y - 30 }]}
              onPress={() => { setGameScore(s => s + 10); Vibration.vibrate(40); spawnGameTarget(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.gameTargetStar}>⭐</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.gameFooter}><Text style={styles.gameFooterText}>GameZone™ v2.1</Text></View>
      </SafeAreaView>
    );
  }

  // PANIC PROMPT (normal entry)
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
        <TouchableOpacity style={styles.declineButton} onPress={() => router.replace('/civil/home')}>
          <Text style={styles.declineText}>I'm Safe - Enter App</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>In panic mode, your location will be tracked and sent to nearby security agencies</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { fontSize: 16, color: '#94A3B8', marginTop: 16 },
  errorText: { fontSize: 14, color: '#EF4444', marginTop: 12, textAlign: 'center' },
  // PIN lock
  pinLockContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  pinLockHeader: { alignItems: 'center', marginBottom: 40 },
  pinLockTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginTop: 16 },
  pinLockSubtitle: { fontSize: 15, color: '#94A3B8', marginTop: 8, textAlign: 'center' },
  pinDots: { flexDirection: 'row', gap: 20, marginBottom: 8 },
  pinDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#475569' },
  pinDotFilled: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  pinError: { color: '#EF4444', fontSize: 14, marginBottom: 16, textAlign: 'center', minHeight: 20 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 280, marginTop: 8 },
  keypadBtn: { width: 78, height: 78, justifyContent: 'center', alignItems: 'center', margin: 8, borderRadius: 39, backgroundColor: '#1E293B' },
  keypadBtnEmpty: { backgroundColor: 'transparent' },
  keypadBtnText: { fontSize: 26, fontWeight: '500', color: '#fff' },
  // Disguise game
  gameHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 },
  gameTitle: { fontSize: 24, fontWeight: 'bold', color: '#a855f7', flex: 1 },
  gameScore: { fontSize: 18, fontWeight: '600', color: '#fbbf24' },
  gameInstructions: { textAlign: 'center', color: '#94A3B8', fontSize: 14, marginBottom: 8 },
  gameArea: { flex: 1, position: 'relative', overflow: 'hidden' },
  gameTarget: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: '#7e22ce', justifyContent: 'center', alignItems: 'center' },
  gameTargetStar: { fontSize: 28 },
  gameFooter: { padding: 20, alignItems: 'center' },
  gameFooterText: { color: '#475569', fontSize: 12 },
  // Panic prompt
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
