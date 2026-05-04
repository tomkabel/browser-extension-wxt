## Context

The current pairing protocol uses a 6-digit numeric SAS (Short Authentication String) displayed alongside a QR code. While functional, digits are slower for human visual comparison and more error-prone than emoji. ARCHITECTURE.md Phase 1 explicitly mandates a 3-emoji SAS because emoji are:
- Faster to recognize and compare visually
- More memorable for short-term recall
- Universally supported across platforms (Unicode emoji are part of Web and Android standards)
- Impossible to confuse typographically (unlike '1'/'l'/'I' or '0'/'O')

The SAS is not a security input — it is a *verification shortcut*. The user simply confirms "these 3 symbols match on both screens."

## Goals / Non-Goals

**Goals:**
- Derive a 3-emoji SAS from the Noise XX handshake session key (both sides compute independently)
- Display emoji alongside QR code on extension popup and Android app
- Add "Match"/"No Match" confirmation buttons
- Provide accessible numeric fallback for screen reader users

**Non-Goals:**
- Changing the Noise handshake protocol itself (stays XX → IK)
- Modifying the signaling server
- Emoji with skin-tone modifiers or zero-width joiners (use only base emoji from a fixed set)
- Keyboard input of emoji (confirmation is tap-based)

## Decisions

### Decision 1: Emoji set selection — fixed 64-emoji palette

We use a curated 64-emoji set drawn from Unicode's most visually distinct and universally supported emoji. The SAS derivation takes 18 bits of the session key hash (3 × 6 bits) and indexes into this set. Each emoji is a single Unicode codepoint (no modifiers, no ZWJ sequences).

**Why**: A fixed set avoids rendering inconsistencies across platforms. 64 emoji (6 bits each) × 3 positions = 262,144 possible combinations, equivalent to 18 bits of security which is sufficient for SAS (SAS only needs to resist chance collisions, not brute force — the Noise key provides the actual security).

### Decision 2: SAS derivation — SHA-256(session_key) → 18 bits → emoji indices

Both sides compute `sas_bytes = SHA-256(transport_state.encryption_key)` after the Noise handshake completes. The first 18 bits are split into 3 × 6-bit indices. This ensures both sides independently derive the same SAS without exchanging it.

**Why**: Using the already-established Noise transport key means the SAS is cryptographically bound to the session. An attacker who doesn't share the session key cannot predict the SAS.

### Decision 3: Accessibility fallback — detect `prefers-reduced-motion` and screen reader

The extension checks `window.matchMedia('(prefers-reduced-motion: reduce)')` and `navigator.userAgent` for screen reader indicators. If detected, falls back to the current 6-digit numeric SAS.

**Why**: Emoji are announced differently by screen readers (e.g., "grinning face with smiling eyes") making comparison cumbersome. A numeric SAS is faster to read and compare for visually impaired users.

## Risks / Trade-offs

- [Risk] Emoji rendering varies across Chrome versions and OS → Use only emoji from Unicode 11.0 (supported since Chrome 69+ and Android 9+)
- [Risk] Fixed 64-emoji set may not be sufficient distinctiveness → Mitigation: if user confusion is reported, expand to 128 emoji (21 bits)
- [Risk] Accessibility fallback logic may miss some screen reader users → Mitigation: add a manual "Use digits" button in the pairing panel
