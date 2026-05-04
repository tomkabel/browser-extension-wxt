## ADDED Requirements

### Requirement: chrome-storage-sync-backing
The approved domains list SHALL be stored in `chrome.storage.sync` with the key `approvedDomains`. The format SHALL be:
```typescript
{ domain: string, registeredAt: number, scriptId: string }[]
```

### Requirement: cross-browser-sync
Domains approved on one browser instance SHALL be available on other signed-in browser instances via Chrome sync.

#### Scenario: sync-across-instances
- **WHEN** the user approves a domain on one Chrome profile
- **THEN** the domain SHALL appear in the approved list on another Chrome instance signed into the same account (within Chrome sync propagation time)
