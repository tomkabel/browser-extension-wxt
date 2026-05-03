## 1. PairingPanel

- [x] 1.1 Create PairingPanel.tsx with "Pair Phone" button → opens QR display
- [x] 1.2 Implement state machine: unpaired → displaying_qr → waiting_for_handshake → paired → error
- [x] 1.3 Display QR via canvas and SAS code as large centered text
- [x] 1.4 Handle error states (QR TTL expired, handshake failed)

## 2. AuthPanel

- [x] 2.1 Create AuthPanel.tsx with "Authenticate" button
- [x] 2.2 Implement springboard: chrome.tabs.create(auth.html) + window.close()
- [x] 2.3 Check session state on popup open; route to CommandPanel if active

## 3. TransactionPanel

- [x] 3.1 Create TransactionPanel.tsx showing amount, recipient from transaction detection
- [x] 3.2 Add "Verify on Phone" button → sends authenticate_transaction
- [x] 3.3 Show confirmation ("Confirmed ✓") or rejection ("Rejected ✗") status

## 4. SessionStatus Component

- [x] 4.1 Create SessionStatus.tsx with countdown timer
- [x] 4.2 Show idle timeout warning at 30 seconds remaining
- [x] 4.3 Show "Re-authenticate" prompt when session expires

## 5. Popup App Integration

- [x] 5.1 Update App.tsx to route between panels based on pairing/auth state
- [x] 5.2 Extend Zustand store with pairing/auth/transaction state slices
