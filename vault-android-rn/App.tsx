import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './src/screens/HomeScreen';
import PairingScreen from './src/screens/PairingScreen';
import QRScannerScreen from './src/screens/QRScannerScreen';
import EmojiSASScreen from './src/screens/EmojiSASScreen';
import VaultScreen from './src/screens/VaultScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export type RootStackParamList = {
  Home: undefined;
  Pairing: undefined;
  QRScanner: undefined;
  EmojiSAS: undefined;
  Vault: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar barStyle="dark-content" />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#007AFF',
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'SmartID Vault' }}
        />
        <Stack.Screen
          name="Pairing"
          component={PairingScreen}
          options={{ title: 'Pair Device' }}
        />
        <Stack.Screen
          name="QRScanner"
          component={QRScannerScreen}
          options={{ title: 'Scan QR', headerShown: false }}
        />
        <Stack.Screen
          name="EmojiSAS"
          component={EmojiSASScreen}
          options={{ title: 'Verify Emojis' }}
        />
        <Stack.Screen
          name="Vault"
          component={VaultScreen}
          options={{ title: 'Credential Vault' }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
