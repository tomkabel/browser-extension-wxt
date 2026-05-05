## ADDED Requirements

### Requirement: GhostActuator RN Native Module

The app SHALL expose the existing `GhostActuatorService.kt` to React Native via a Native Module.

#### Scenario: holdSequence called from JS
- **WHEN** `GhostActuatorModule.holdSequence([{x: 100.0, y: 200.0}, {x: 300.0, y: 400.0}])` is called from JS
- **THEN** the module SHALL send `ACTION_HOLD` intent to `GhostActuatorService` with the coordinates as parcelable extras
- **AND** the service SHALL store the coordinate sequence and set `isHeld = true`

#### Scenario: executeSequence called from JS
- **WHEN** `GhostActuatorModule.executeSequence()` is called from JS
- **THEN** the module SHALL send `ACTION_EXECUTE` intent to `GhostActuatorService`
- **AND** the service SHALL call `dispatchGesture()` for each coordinate
- **AND** SHALL fire a completion callback back to JS when all taps are complete

#### Scenario: clearSequence called from JS
- **WHEN** `GhostActuatorModule.clearSequence()` is called from JS
- **THEN** the module SHALL send `ACTION_CLEAR` intent to `GhostActuatorService`
- **AND** the service SHALL clear the held sequence and remove pending callbacks

#### Scenario: holdSequence with no AccessibilityService enabled
- **WHEN** `GhostActuatorModule.holdSequence()` is called but the user has not enabled the AccessibilityService in Settings
- **THEN** the module SHALL return `{ error: 'accessibility_service_not_enabled' }`
- **AND** the CommandServer SHALL fall back to showing a notification: "Open Settings → Accessibility → SmartID Vault → Enable"
- **AND** the AuthenticateTransaction response SHALL be `{ status: 'error', error: 'accessibility_disabled' }`

#### Scenario: executeSequence with wrong app foregrounded
- **WHEN** `GhostActuatorModule.executeSequence()` is called but the foreground app is NOT `ee.sk.smartid`
- **THEN** `GhostActuatorService.onAccessibilityEvent()` SHALL detect the non-whitelisted package
- **AND** SHALL clear the sequence (`clearSequence()`) for security
- **AND** SHALL fire the failure callback to JS: `{ error: 'wrong_foreground_app', packageName }`
- **AND** the CommandServer SHALL resend a high-priority notification: "Please open Smart-ID app"

#### Scenario: dispatchGesture rejected by OS
- **WHEN** the device does not support `canPerformGestures()` (rare, but possible on accessibility-restricted profiles)
- **THEN** the module SHALL return `{ error: 'gesture_injection_not_supported' }`
- **AND** the CommandServer SHALL fall back to showing a notification describing how to enter the PIN manually
