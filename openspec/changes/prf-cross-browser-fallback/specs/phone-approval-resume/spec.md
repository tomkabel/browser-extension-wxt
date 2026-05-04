## ADDED Requirements

### Requirement: resume-session-command
A new `CommandType.ResumeSession = 'resume-session'` SHALL be added to `types/commands.ts`. The command payload SHALL contain `{ deviceName: string, timestamp: number }`. The phone SHALL respond with `{ status: 'approved' | 'rejected' }`.

### Requirement: session-resume-timeout
The session resume command SHALL have a 30-second timeout in the CommandClient. If the phone does not respond, the extension SHALL show "Phone approval timed out" in the popup and allow the user to retry.

### Requirement: transport-reconnection-before-resume
- **WHEN** no active transport exists at session resume time
- **THEN** the extension SHALL attempt an IK Noise handshake with the last paired device's stored static key to re-establish the transport before sending `resume-session`

#### Scenario: phone-approval-resume
- **WHEN** PRF is unavailable and the transport is active
- **THEN** `resume-session` SHALL be sent to the phone
- **WHEN** the user taps "Approve" on the phone
- **THEN** the session SHALL be activated and the popup SHALL show "Session active"

#### Scenario: phone-rejection
- **WHEN** the user taps "Deny" on the phone
- **THEN** the session SHALL NOT be activated and the popup SHALL show "Phone rejected session resume"
