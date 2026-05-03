# a11y-bridge API Spike Results

**Date:** 2026-05-01
**Phone Model:** Connected via ADB over USB
**API Base:** `http://localhost:7333` (ADB port forward)

## Test Environment

- a11y-bridge APK installed on test phone (package: `com.smart_id`)
- Service name: `openclaw-a11y`
- Accessibility Service enabled in Settings → Accessibility
- ADB port forwarded: `adb forward tcp:7333 tcp:7333`
- All tests run via `curl` from Linux host machine

## Test 1: /ping health check

**Command:**
```bash
curl http://localhost:7333/ping
```

**Expected:** HTTP 200, `{"status": "ok"}`

**Actual:** `{"status":"ok","service":"openclaw-a11y"}` — returns service name, response in <50ms.

**Result:** PASS

## Test 2: /screen full UI tree

**Command:**
```bash
curl -s http://localhost:7333/screen | python3 -m json.tool | head -30
```

**Expected:** Valid JSON with `nodes` array, each node has `text`/`desc`, `bounds`, `click` fields

**Actual response format:**
```json
{
  "package": "com.smart_id",
  "timestamp": 1777613024746,
  "nodes": [
    {
      "cls": "android.widget.FrameLayout",
      "bounds": "0,0,1080,2280",
      "depth": 0
    },
    {
      "desc": "Confirm",
      "cls": "android.widget.Button",
      "bounds": "90,1580,990,1730",
      "click": true,
      "depth": 10
    }
  ],
  "count": 21
}
```

**Key observations:**
- `package` field identifies the foreground app
- Nodes have `cls` (Android class), `bounds` (x1,y1,x2,y2), `depth` (tree depth)
- Clickable elements have `click: true`
- Text content is in `desc` field (content description), NOT `text`
- No `text` field present in the node schema
- Element IDs (e.g. `android:id/content`) are in the `id` field
- Null/vsNA values for non-applicable fields (like `desc` on container views)

**Result:** PASS — response format confirmed, but uses `desc` not `text` for element labels

## Test 3: /screen?compact performance

**Command:**
```bash
time curl -s 'http://localhost:7333/screen?compact' > /dev/null
```

**Expected:** Only nodes with meaningful content, response time < 100ms

**Actual:**
- Latency: **712ms** (real time), well above the 100ms target
- First run: filtered 21 → 9 nodes (56% reduction)
- Second run (home screen): filtered 155 → 9 nodes (94% reduction, only meaningful nodes)
- Compact mode correctly filters to only nodes with `desc`, `click`, or `id` fields

**Result:** PASS (functionality) / FAIL (performance — 7x over the 100ms target)

## Test 4: /click by text

**Command:**
```bash
curl -X POST http://localhost:7333/click \
  -H 'Content-Type: application/json' \
  -d '{"text":"Confirm"}'
```

**Expected:** `{"clicked": true}`, element with text "Confirm" receives click

**Actual:** `{"error":"element not found","text":"Confirm","id":"","desc":""}`

The API does **not** support `text` as a search key, despite the spec saying it should. It only matches on `desc`.

**Result:** FAIL

## Test 5: /click by desc (substring matching issue)

**Command:**
```bash
curl -X POST http://localhost:7333/click \
  -H 'Content-Type: application/json' \
  -d '{"desc":"Confirm"}'
```

**Actual:** `{"clicked":true,"x":540,"y":420,"matchedDesc":"Confirm"}`

The API uses **substring matching** on `desc`. It matched `"Confirm"` (button) to `"Confirm device for authentication"` (a View label at bounds `90,360,990,480`), NOT the actual `"Confirm"` button at bounds `90,1580,990,1730`. The coordinates `x:540,y:420` correspond to the label, not the button.

**Root cause:** Two elements exist in the tree:
1. `desc: "Confirm device for authentication"` — a View label (bounds 90,360,990,480)  
2. `desc: "Confirm"` — a Button (bounds 90,1580,990,1730)

The substring matcher hits the label first (appears earlier in tree traversal) and clicks the wrong element.

Additional tests confirmed this pattern:
- `{"desc":"Ignore"}` → `{"error":"element not found"}` (fails for the exact-match button text)
- `{"text":"Cancel authentication"}` → `{"error":"element not found"}` (fails because API doesn't match on `text`)
- `{"x":540,"y":1655}` → `{"error":"provide 'text', 'id', or 'desc'"}` (raw coordinates not accepted)

**Result:** FAIL (ambiguous matching makes /click unreliable for overlapping substrings)

## Test 6: /click by resource ID

Not tested (no suitable resource ID in the available UI). The API schema supports `id` as a key, same as `text` and `desc`.

## Edge Cases

| Case | Tested | Result |
|------|--------|--------|
| Target app on screen | ✓ | Works, nodes returned with correct package |
| Empty/lock screen | ✗ | Not tested (phone remained unlocked) |
| No root window | ✗ | Not tested |
| Service not enabled | ✗ | Not tested (service remained enabled throughout) |
| Click non-existent element | ✓ | Returns `{"error":"element not found"}` — clean error |
| Compact latency | ✓ | 712ms (slow) |
| Foreground app detection | ✓ | `"package":"com.smart_id"` correctly reported |

## Key Findings

1. **API field naming mismatch with spec**: The spec references `"text"` as the primary search key, but the API implementation stores element labels in `"desc"` (content-description). The `"text"` key always returns `"element not found"`.

2. **Substring matching is ambiguous**: `/click` uses substring matching on `desc`, making it impossible to reliably target a specific element when its label is a substring of another element's label. This is a critical limitation for automation. The API needs exact-match or priority sorting (longest match first, or match only `click:true` elements first).

3. **No raw coordinate click**: The API rejects `{"x":..., "y":...}` payloads, requiring `text`/`id`/`desc` instead. This prevents fallback to coordinate-based targeting.

4. **Latency is high**: `/screen?compact` takes ~712ms, far above the 100ms target. This is likely due to ADB forwarding overhead + accessibility tree serialization on the device. Direct ADB latency should be measured for comparison.

5. **Compact mode works well**: The `?compact` query reduces node count by 56-94% depending on screen complexity, correctly filtering to only actionable/meaningful nodes.

6. **Package detection is reliable**: The `package` field reliably identifies the foreground app. Combined with compact mode, this enables per-app UI monitoring.

## Recommendations for SmartID2

1. **Patch or wrap a11y-bridge** to support:
   - `text` as an alias for `desc` (or normalize to match spec)
   - Exact-match support (match `desc` exactly, not substrings)
   - Priority matching: prefer `click:true` elements over labels when substring matches conflict
   - Optionally, raw coordinate clicks as fallback

2. **Latency mitigation**: Cache the screen tree client-side and use `/screen` (full) less frequently. The compact mode's 9-node response is small but the round-trip latency dominates.

3. **Robust click strategy**: For production, don't rely on direct substring matches. Instead:
   - Fetch `/screen?compact`
   - Filter nodes client-side by `cls` (e.g., only `android.widget.Button`)  
   - Then match `desc` exactly against the filtered set
   - Send the matched node's center coordinates (compute from `bounds`)
