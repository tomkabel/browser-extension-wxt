import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useAppStore } from '../store';

type Props = NativeStackScreenProps<RootStackParamList, 'EmojiSAS'>;

export default function EmojiSASScreen({ navigation }: Props) {
  const emojiSas = useAppStore((s) => s.emojiSas);
  const pairingStatus = useAppStore((s) => s.pairingStatus);
  const pairingError = useAppStore((s) => s.pairingError);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (pairingStatus === 'awaiting_sas_confirmation') {
        setTimedOut(true);
      }
    }, 60_000);
    return () => clearTimeout(timer);
  }, [pairingStatus]);

  if (timedOut) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Pairing Timed Out</Text>
        <Text style={styles.errorText}>
          Please scan a new QR code from the browser extension
        </Text>
      </View>
    );
  }

  if (pairingError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Pairing Failed</Text>
        <Text style={styles.errorText}>{pairingError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify Emojis</Text>
      <Text style={styles.subtitle}>
        Confirm these emojis match the browser extension
      </Text>
      <View style={styles.emojiRow}>
        {emojiSas ? (
          emojiSas.map((emoji, i) => (
            <Text key={i} style={styles.emoji}>
              {emoji}
            </Text>
          ))
        ) : (
          <ActivityIndicator size="large" color="#007AFF" />
        )}
      </View>
      {pairingStatus === 'awaiting_sas_confirmation' && (
        <Text style={styles.waiting}>Waiting for browser confirmation...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emoji: {
    fontSize: 64,
    marginHorizontal: 12,
  },
  waiting: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FF3B30',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
