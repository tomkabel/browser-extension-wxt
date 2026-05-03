## Why

The content script only sends domain-change events on SPA navigations (`wxt:locationchange`), never on initial page load. The popup always shows "No domain recorded" because the background never receives the domain for the tab the user is on. Additionally, the example health endpoint must be updated to `https://youtube.tomabel.ee/health` and the content script match pattern must include the new target domain.

## What Changes

- Send an initial `tab-domain-changed` message on content script startup so the background knows the domain immediately
- Add `*://*.youtube.tomabel.ee/*` to the content script match patterns alongside the existing `*://*.lhv.ee/*`
- Change the health check path from `/api/health` to `/health`
- Update the default API endpoint fallback from `https://api.example.com` to `https://youtube.tomabel.ee`

## Capabilities

### New Capabilities

- `domain-initial-detection`: Content script MUST report the domain on initial page load, not just on SPA navigation changes
- `health-endpoint-config`: Health check endpoint SHALL use `/health` path and default to `https://youtube.tomabel.ee`

### Modified Capabilities

- `extension-messaging`: Content script match patterns updated to include `*://*.youtube.tomabel.ee/*`; API endpoint fallback changed

## Impact

- `entrypoints/content/index.ts`: Send initial domain message in `main()`, update `matches` array
- `entrypoints/background/apiRelay.ts`: Change health check path from `/api/health` to `/health`, update fallback URL
- `wxt.config.ts`: No changes needed (content script `matches` is self-contained)
