import * as Keychain from 'react-native-keychain';
import { NativeModules } from 'react-native';

const SERVICE_LHV = 'smartid.lhv';
const SERVICE_SMARTID_PIN = 'smartid.pin';

export interface StoredCredential {
  username: string;
  password: string;
}

export class KeyVault {
  async storeLhvCredentials(username: string, password: string): Promise<void> {
    await Keychain.setGenericPassword(username, password, {
      service: SERVICE_LHV,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async getLhvCredentials(): Promise<StoredCredential | null> {
    try {
      const result = await Keychain.getGenericPassword({
        service: SERVICE_LHV,
        authenticationPrompt: {
          title: 'Authenticate to retrieve credentials',
          subtitle: 'LHV credentials',
          cancel: 'Cancel',
        },
      });

      if (result) {
        return { username: result.username, password: result.password };
      }
      return null;
    } catch {
      return null;
    }
  }

  async deleteLhvCredentials(): Promise<void> {
    await Keychain.resetGenericPassword({ service: SERVICE_LHV });
  }

  async hasLhvCredentials(): Promise<boolean> {
    return Keychain.hasGenericPassword({ service: SERVICE_LHV });
  }

  async storeSmartIdPin(pin: string): Promise<void> {
    // Smart-ID PIN uses stricter auth: biometric required, zero grace window
    await Keychain.setGenericPassword('smartid', pin, {
      service: SERVICE_SMARTID_PIN,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async getSmartIdPin(): Promise<string | null> {
    try {
      const result = await Keychain.getGenericPassword({
        service: SERVICE_SMARTID_PIN,
        authenticationPrompt: {
          title: 'Authenticate to retrieve PIN',
          subtitle: 'Smart-ID PIN',
          cancel: 'Cancel',
        },
      });

      if (result) {
        return result.password;
      }
      return null;
    } catch {
      return null;
    }
  }

  async deleteSmartIdPin(): Promise<void> {
    await Keychain.resetGenericPassword({ service: SERVICE_SMARTID_PIN });
  }

  async hasSmartIdPin(): Promise<boolean> {
    return Keychain.hasGenericPassword({ service: SERVICE_SMARTID_PIN });
  }

  async deleteAll(): Promise<void> {
    await Promise.all([
      this.deleteLhvCredentials(),
      this.deleteSmartIdPin(),
    ]);
  }
}

export const keyVault = new KeyVault();
