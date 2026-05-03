# Android Phone E2E Testing Guide

## Prerequisites

- Android device with USB debugging enabled
- `adb` installed on development machine
- Android companion app built and installed (`apps/smartid-companion/`)
- Chrome extension built (`.output/chrome-mv3/`)

## Setup

```bash
adb devices                     # Verify device is connected
adb install apps/smartid-companion/app/build/outputs/apk/debug/app-debug.apk
```

## Testing Flow

### 1. Start Extension

```bash
cd browser-extension-wxt
bun run build                  # Build extension
bun run dev                    # Start dev server with HMR
```

Load the unpacked extension in Chrome:
1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `.output/chrome-mv3/`

### 2. Start Android App

```bash
adb shell am start -n com.smartid.companion/.MainActivity
```

### 3. Simulate Pairing Flow

```bash
# Grab logs from extension background
adb logcat -s Background:* MainActivity:* FCMService:* | tee e2e-logs.txt
```

### 4. Verify Transaction Display

```bash
# Navigate to test bank page (LHV)
adb shell input text "https://lhv.ee/en"
# Or inject transaction data via Chrome DevTools Protocol:
# Use Playwright or Puppeteer to automate browser-side transaction detection
```

### 5. Simulate FCM Push

```bash
# Using Firebase Console: send test notification with data payload:
# { "action": "connect" }

# Verify on phone:
adb logcat | grep FCMService
# Expected: "FCM message received: ... Action: connect"
```

### 6. Verify Accessibility Service

```bash
# Enable accessibility service
adb shell settings put secure enabled_accessibility_services com.smartid.companion/com.smartid.companion.a11y.DirectAccessibilityService

# Verify service is running
adb shell dumpsys accessibility | grep smartid
```

## Automated Testing

For CI/CD integration:

```bash
# Install app on emulator
adb -s emulator-5554 install app-debug.apk

# Launch app
adb -s emulator-5554 shell am start -n com.smartid.companion/.MainActivity

# Wait for app to stabilize
sleep 3

# Verify app is running
adb -s emulator-5554 shell pidof com.smartid.companion

# Take screenshot for visual verification
adb -s emulator-5554 exec-out screencap -p > e2e-screenshot.png
```
