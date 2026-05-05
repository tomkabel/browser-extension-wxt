# eIDAS QES Hardware Gate — Manual QA Checklist

## Prerequisites

- Android 13+ device with USB-C data cable connected to PC
- Smart-ID app installed and paired via V6 provisioning
- Ghost Actuator accessibility service enabled
- PC running browser extension with active session
- Transaction initiated from whitelisted RP (e.g., LHV)

## 7.4 SOS Pattern Distinguishability

| Test | Steps | Expected | Result |
|------|-------|----------|--------|
| 7.4.1 Face-down detectability | 1. Place phone face-down on desk<br>2. Initiate PIN2 QES transaction from PC | SOS pattern is clearly audible/vibratory through desk surface. Distinguishable from normal notification vibration pattern. | ☐ Pass / ☐ Fail |
| 7.4.2 Pocket detectability | 1. Place phone in pocket<br>2. Initiate PIN2 QES transaction from PC | SOS pattern is distinguishable from normal notification buzz. User can identify "action required" vs "info only" pattern. | ☐ Pass / ☐ Fail |
| 7.4.3 Pattern uniqueness | 1. Trigger normal Smart-ID push notification<br>2. Then initiate PIN2 QES transaction | The SOS three-long-three-short-three-long pattern is distinctly different from the standard Smart-ID push notification vibration. | ☐ Pass / ☐ Fail |

## 7.5 Overlay Non-Obscuring Verification

| Test | Steps | Expected | Result |
|------|-------|----------|--------|
| 7.5.1 Overlay position | 1. Initiate PIN2 QES transaction<br>2. Observe phone screen | Overlay appears at bottom third of screen. Smart-ID app transaction display area (upper two-thirds) remains fully visible. | ☐ Pass / ☐ Fail |
| 7.5.2 Transaction details visible | 1. Initiate PIN2 QES transaction<br>2. Read Smart-ID app display through overlay | Transaction amount, beneficiary, and account details are clearly readable through the semi-transparent overlay background. | ☐ Pass / ☐ Fail |
| 7.5.3 Touch passthrough | 1. Initiate PIN2 QES transaction<br>2. Attempt to tap Smart-ID app buttons through overlay | Touch events pass through the overlay to the Smart-ID app beneath. Overlay does not block any interaction. | ☐ Pass / ☐ Fail |
| 7.5.4 Overlay dismissal | 1. Press Volume Down during QES<br>2. Observe screen | Overlay disappears immediately after Volume Down press. Smart-ID app full screen is restored. | ☐ Pass / ☐ Fail |
