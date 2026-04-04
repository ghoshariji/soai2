import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/theme';

const AnalyticsScreen: React.FC = () => (
  <SafeAreaView style={styles.safe}>
    <View style={styles.container}>
      <Text style={styles.title}>AnalyticsScreen</Text>
      <Text style={styles.sub}>Coming soon</Text>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  sub: { fontSize: 14, color: Colors.textSecondary },
});

export default AnalyticsScreen;
