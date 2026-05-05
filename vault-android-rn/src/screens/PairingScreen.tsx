import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Pairing'>;

export default function PairingScreen({ navigation }: Props) {
  const [sasCode, setSasCode] = useState('');

  const handleScanQR = () => {
    navigation.navigate('QRScanner' as never);
  };

  const handleManualEntry = () => {
    if (sasCode.length !== 6 || !/^\d{6}$/.test(sasCode)) {
      Alert.alert('Invalid Code', 'Please enter a 6-digit numeric code');
      return;
    }
    // TODO: Connect to signaling server with SAS code
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pair with Browser</Text>
      <TouchableOpacity style={styles.scanButton} onPress={handleScanQR}>
        <Text style={styles.scanButtonText}>Scan QR Code</Text>
      </TouchableOpacity>
      <Text style={styles.or}>— or enter code manually —</Text>
      <TextInput
        style={styles.input}
        placeholder="6-digit code"
        keyboardType="numeric"
        maxLength={6}
        value={sasCode}
        onChangeText={setSasCode}
      />
      <TouchableOpacity style={styles.button} onPress={handleManualEntry}>
        <Text style={styles.buttonText}>Connect</Text>
      </TouchableOpacity>
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
    marginBottom: 24,
  },
  scanButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 24,
    minWidth: 240,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  or: {
    fontSize: 14,
    color: '#999',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 20,
    textAlign: 'center',
    letterSpacing: 8,
    width: 200,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
