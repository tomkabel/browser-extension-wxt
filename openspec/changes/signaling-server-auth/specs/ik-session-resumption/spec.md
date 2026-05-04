## ADDED Requirements

### Requirement: IK handshake for session resumption

The extension SHALL use the IK (one-round) Noise pattern for session resumption when both sides already know each other's static keys from the initial XX handshake. The IK pattern reduces the handshake from 3 messages (XX) to 2 messages (IK), enabling faster reconnection.

#### Scenario: IK handshake after PRF re-auth

- **WHEN** the extension reconnects after browser restart
- **AND** PRF silent re-authentication succeeds (PRF-derived key available)
- **THEN** the extension SHALL use `createIKHandshake(localStaticKey, remoteStaticPublicKey)` instead of performing a new XX handshake
- **AND** the IK handshake SHALL complete in 2 messages (initiator sends 1, receives 1)
- **AND** the resulting transport state SHALL be used for encrypted communication

#### Scenario: IK handshake after device switch

- **WHEN** the user switches to a different paired device from the popup device list
- **THEN** the extension SHALL use the stored `phoneStaticKey` from the device registry
- **AND** initiate an IK handshake with the selected device
- **AND** the handshake SHALL complete in 2 messages — no full XX re-handshake needed

#### Scenario: IK handshake failure (fallback to XX)

- **WHEN** the IK handshake fails (responder does not recognize the initiator's static key)
- **THEN** the extension SHALL fall back to a full XX handshake (3 messages)
- **AND** if XX also fails, SHALL display "Connection failed — please re-pair your device"

### Requirement: IK capability flag

The extension SHALL advertise IK pattern support during the initial XX handshake via capability flags.

#### Scenario: IK capability negotiated during pairing

- **WHEN** the extension and phone complete the initial XX handshake
- **THEN** both sides SHALL store the peer's static key for future IK use
- **AND** if both sides support IK (negotiated via capabilities payload), SHALL prefer IK for reconnection
- **AND** if one side does not support IK, SHALL use XX for all future handshakes
