# offscreen-document-lifecycle Specification

## Purpose

Define the lifecycle and keep-alive behavior of the Chrome Extension Offscreen Document that maintains the WebRTC data channel connection. Per ARCHITECTURE.md Phase 3, the Offscreen Document keeps the WebRTC connection alive when the Manifest V3 Service Worker is terminated, and coordinates with the background script to ensure connection continuity across SW sleep/wake cycles.

## Requirements

### Requirement: Offscreen document created on first pairing

The background service worker SHALL create an Offscreen Document using `chrome.offscreen.createDocument()` when the first WebRTC connection is established.

#### Scenario: Offscreen document creation

- **WHEN** the background service worker initiates the first WebRTC connection
- **THEN** it SHALL call `chrome.offscreen.createDocument()` with `reasons: ['WEB_RTC']` and `justification: 'Maintain WebRTC data channel connection for SmartID2'`
- **AND** the Offscreen Document SHALL load `entrypoints/offscreen-webrtc/index.html`
- **AND** the Offscreen Document SHALL create the `RTCPeerConnection` and manage the data channel

#### Scenario: Offscreen document not created when not needed

- **WHEN** no WebRTC connection is active (unpaired state)
- **THEN** the background SHALL NOT create an Offscreen Document
- **AND** `chrome.offscreen.hasDocument()` SHALL return `false`

### Requirement: Background-to-offscren messaging protocol

The background service worker and Offscreen Document SHALL communicate via `chrome.runtime.sendMessage` using the established message protocol.

#### Scenario: Background sends WebRTC command

- **WHEN** the background needs to send a command over the data channel
- **THEN** it SHALL send `{ type: 'webrtc-command', payload: { command, data } }` to the Offscreen Document
- **AND** the Offscreen Document SHALL call `dataChannel.send(encodedMessage)`

#### Scenario: Offscreen relays incoming message to background

- **WHEN** the Offscreen Document receives a message on the data channel
- **THEN** it SHALL relay the raw message to the background via `chrome.runtime.sendMessage({ type: 'webrtc-message', payload: raw })`
- **AND** the background SHALL process it via `commandClient.handleIncomingResponse()`

### Requirement: Offscreen document survives SW termination

The Offscreen Document SHALL keep the WebRTC connection alive when the Manifest V3 Service Worker is terminated.

#### Scenario: SW terminates, connection persists

- **WHEN** the background service worker is terminated (30-second idle timeout)
- **THEN** the Offscreen Document SHALL continue running
- **AND** SHALL keep the `RTCPeerConnection` and data channel open
- **AND** SHALL buffer any incoming messages until the SW restarts

#### Scenario: SW restarts, reconnects to offline

- **WHEN** the background service worker restarts (triggered by popup, alarm, or tab event)
- **THEN** the background SHALL detect the existing Offscreen Document
- **AND** SHALL re-establish the message relay to the Offscreen Document
- **AND** SHALL process any buffered messages

### Requirement: Offscreen document cleanup on disconnect

The Offscreen Document SHALL close itself when the WebRTC connection is intentionally closed or when a close timeout fires.

#### Scenario: Clean close on disconnect

- **WHEN** the user unpairs the device or the pairing session is explicitly terminated
- **THEN** the Offscreen Document SHALL close the `RTCPeerConnection`
- **AND** SHALL call `window.close()` to terminate itself

#### Scenario: Forced close on timeout

- **WHEN** the WebRTC connection has been in `disconnected` or `failed` state for more than 30 seconds
- **THEN** the Offscreen Document SHALL call `window.close()` to terminate
- **AND** the background SHALL create a new Offscreen Document when reconnection is needed
