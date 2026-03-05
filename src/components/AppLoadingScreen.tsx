import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export default function AppLoadingScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        {/* Article pills */}
        <View style={styles.pills}>
          <View style={[styles.pill, styles.pillDer]}>
            <Text style={styles.pillText}>der</Text>
          </View>
          <View style={[styles.pill, styles.pillDie]}>
            <Text style={styles.pillText}>die</Text>
          </View>
          <View style={[styles.pill, styles.pillDas]}>
            <Text style={styles.pillText}>das</Text>
          </View>
        </View>

        <Text style={styles.title}>Der Die Das</Text>
        <Text style={styles.subtitle}>German Article Search and Trainer</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  pills: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 50,
  },
  pillDer: { backgroundColor: '#1A56DB' },
  pillDie: { backgroundColor: '#E11D48' },
  pillDas: { backgroundColor: '#059669' },
  pillText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
