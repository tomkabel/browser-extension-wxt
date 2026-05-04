## ADDED Requirements

### Requirement: Shamir secret sharing split

During initial pairing, the extension SHALL generate a 256-bit CSPRNG vault seed and split it using Shamir's Secret Sharing (2-of-3 threshold) over GF(256).

#### Scenario: Seed split into 3 shares

- **WHEN** the user completes initial pairing (Phase 0)
- **THEN** the extension SHALL generate 256 bits of CSPRNG entropy as the vault seed
- **AND** split it into 3 shares using Shamir SSS with threshold 2
- **AND** Share 1 SHALL be encrypted and stored in `chrome.storage.sync` (key: `recovery:share1`)
- **AND** Share 2 SHALL be base64url-encoded and rendered as a recovery QR code
- **AND** Share 3 SHALL be transmitted over the Noise-encrypted transport channel to the Android vault

#### Scenario: Threshold requirement

- **WHEN** any 2 of the 3 shares are available
- **THEN** the vault seed SHALL be reconstructable via Lagrange interpolation over GF(256)
- **WHEN** only 1 share is available
- **THEN** reconstruction SHALL fail (zero information about the seed)

### Requirement: Recovery QR code

The extension SHALL display Share 2 as a printable QR code during setup.

#### Scenario: Recovery QR displayed

- **WHEN** the Shamir split completes
- **THEN** the extension SHALL open a new tab with a printable page
- **AND** the page SHALL contain a QR code encoding: `smartid2-recovery://v1/<base64url(share2)>`
- **AND** the page SHALL include user instructions: "Keep this QR code safe. You need this + your Chrome profile OR your phone to recover your vault."
- **AND** the user SHALL confirm they have saved the QR before proceeding

### Requirement: Recovery flow from any 2 shares

The extension SHALL support recovering the vault seed from any combination of 2 shares.

#### Scenario: Recovery from Chrome sync + QR code

- **WHEN** the user has access to their Chrome profile (Share 1) AND the recovery QR (Share 2)
- **THEN** the extension SHALL decrypt Share 1 from `chrome.storage.sync`
- **AND** decode Share 2 from the scanned QR code
- **AND** reconstruct the vault seed via Shamir reconstruction
- **AND** derive a new Noise static keypair from the seed
- **AND** initiate pairing with a new phone using the derived keypair

#### Scenario: Recovery from Chrome sync + old phone

- **WHEN** the user has their old phone (Share 3) AND access to Chrome sync (Share 1)
- **THEN** Share 3 SHALL be transmitted from the old phone over the transport channel
- **AND** Share 1 SHALL be decrypted from Chrome sync
- **AND** reconstruction SHALL proceed as above

#### Scenario: Recovery from QR + old phone

- **WHEN** the user has the recovery QR (Share 2) AND their old phone (Share 3) but NOT Chrome sync access
- **THEN** reconstruction SHALL proceed from QR and phone shares
- **AND** no Chrome profile authentication is required

### Requirement: Revocation Merkle tree

The extension SHALL maintain a signed Merkle tree of revoked device IDs. Every command SHALL include a Merkle proof that the sender has not been revoked.

#### Scenario: Device revoked, Merkle tree updated

- **WHEN** a device is revoked from the device registry
- **THEN** its `deviceId` SHALL be added as a leaf to the Merkle tree
- **AND** a new Merkle root SHALL be computed
- **AND** the root SHALL be signed with the current Noise static key

#### Scenario: Merkle proof included in every command

- **WHEN** the extension sends a command to a paired device
- **THEN** the command payload SHALL include: `{ ..., merkleProof: [siblingHashes], merkleRoot: currentRoot }`
- **AND** the receiving device SHALL verify the Merkle proof against its stored root
- **WHEN** verification fails (sender has been revoked)
- **THEN** the receiver SHALL reject the command
- **AND** SHALL enter unpaired state

#### Scenario: Revocation list persistence

- **WHEN** the browser is restarted
- **THEN** the Merkle tree SHALL be reconstructed from the device revocation list in `chrome.storage.local`
- **AND** the root SHALL match the last signed root before restart
