import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, FlatList } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Vault'>;

interface CredentialEntry {
  domain: string;
  username: string;
}

export default function VaultScreen({ navigation }: Props) {
  const [credentials, setCredentials] = useState<CredentialEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleAddCredential = () => {
    if (!newDomain || !newUsername || !newPassword) {
      Alert.alert('Missing Fields', 'Please fill in all fields');
      return;
    }
    // TODO: Store in KeyVault with biometric auth
    setCredentials([...credentials, { domain: newDomain, username: newUsername }]);
    setNewDomain('');
    setNewUsername('');
    setNewPassword('');
    setShowAdd(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Credential Vault</Text>
      {credentials.length === 0 ? (
        <Text style={styles.empty}>No credentials stored</Text>
      ) : (
        <FlatList
          data={credentials}
          keyExtractor={(item, i) => `${item.domain}-${i}`}
          renderItem={({ item }) => (
            <View style={styles.credentialItem}>
              <Text style={styles.domain}>{item.domain}</Text>
              <Text style={styles.username}>{item.username}</Text>
            </View>
          )}
        />
      )}
      {showAdd ? (
        <View style={styles.addForm}>
          <TextInput style={styles.input} placeholder="Domain (e.g. lhv.ee)" value={newDomain} onChangeText={setNewDomain} />
          <TextInput style={styles.input} placeholder="Username" value={newUsername} onChangeText={setNewUsername} />
          <TextInput style={styles.input} placeholder="Password" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
          <TouchableOpacity style={styles.button} onPress={handleAddCredential}>
            <Text style={styles.buttonText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAdd(false)}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.button} onPress={() => setShowAdd(true)}>
          <Text style={styles.buttonText}>Add Credential</Text>
        </TouchableOpacity>
      )}
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
    marginBottom: 16,
    textAlign: 'center',
  },
  empty: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 48,
  },
  credentialItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  domain: {
    fontSize: 16,
    fontWeight: '600',
  },
  username: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  addForm: {
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: '#FF3B30',
    fontSize: 16,
  },
});
