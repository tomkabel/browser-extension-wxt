import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const handleResetPairing = () => {
    Alert.alert('Reset Pairing', 'This will disconnect from the paired browser. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => {
        // TODO: Clear pairing state
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Signaling Server</Text>
        <Text style={styles.value}>smartid2-signaling.fly.dev</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Accessibility Service</Text>
        <Text style={styles.valueStatus}>Not Enabled</Text>
      </View>
      <TouchableOpacity style={styles.dangerButton} onPress={handleResetPairing}>
        <Text style={styles.dangerButtonText}>Reset Pairing</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    color: '#666',
  },
  valueStatus: {
    fontSize: 14,
    color: '#FF9500',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 32,
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
