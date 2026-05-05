## ADDED Requirements

### Requirement: Foreground service lifecycle

The app SHALL run a foreground service to keep the WebRTC connection alive when the app is backgrounded.

#### Scenario: Start foreground service
- **WHEN** the app establishes a WebRTC connection (pairing or reconnection)
- **THEN** it SHALL start an Android foreground service with a persistent notification
- **AND** the notification SHALL show "SmartID Vault — Connected"
- **AND** the service SHALL stop when the app explicitly disconnects or quits

#### Scenario: Prevent process death
- **WHEN** the user navigates away from the app (home button, recent apps)
- **THEN** the foreground service SHALL keep the Node.js/JS runtime alive
- **AND** the WebRTC data channel SHALL remain open
- **AND** incoming commands (CredentialRequest, AuthenticateTransaction) SHALL still be processed

#### Scenario: Android 13+ foreground service throttle
- **WHEN** the device runs Android 13+ and the user does not interact with the app for > 30 minutes
- **THEN** the OS may throttle or stop the foreground service
- **AND** the app SHALL detect the service stop via lifecycle callback
- **AND** SHALL re-acquire the WebRTC connection using exponential backoff (5s, 10s, 30s max)
- **AND** SHALL re-create the foreground service notification after reconnection

#### Scenario: Doze mode kills network
- **WHEN** the device enters Doze mode (screen off, stationary for > 30 min)
- **THEN** the OS SHALL suspend network access
- **AND** the WebRTC data channel SHALL drop
- **AND** the foreground service SHALL detect the drop via heartbeat timeout
- **AND** SHALL NOT attempt aggressive reconnect (respecting Doze window constraints) — wait for next maintenance window
- **AND** SHALL resume reconnection when the device exits Doze (motion detected or charging)

#### Scenario: Notification channel creation fails
- **WHEN** the foreground service notification channel cannot be created (rare StorageException on corrupt SharedPreferences)
- **THEN** the app SHALL still start the foreground service
- **AND** SHALL use the default notification channel with fallback title "SmartID Vault"
