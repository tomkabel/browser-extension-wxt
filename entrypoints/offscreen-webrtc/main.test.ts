import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import type { TurnCredentials } from '~/entrypoints/offscreen-webrtc/main';

let buildIceServers: (creds: TurnCredentials | null) => RTCIceServer[];

beforeAll(async () => {
  fakeBrowser.runtime.connect = vi.fn().mockReturnValue({
    onDisconnect: { addListener: vi.fn() },
    postMessage: vi.fn(),
  });
  fakeBrowser.runtime.sendMessage = vi.fn().mockResolvedValue(undefined);
  fakeBrowser.runtime.id = 'test-extension-id';

  vi.stubGlobal('chrome', fakeBrowser);

  const mod = await import('~/entrypoints/offscreen-webrtc/main');
  buildIceServers = mod.buildIceServers;
});

describe('buildIceServers', () => {
  const defaultStun = {
    username: 'testuser',
    password: 'testpass',
    ttl: 300,
    urls: ['turn:smartid2-turn.fly.dev:3478'],
    stunUrls: ['stun:smartid2-turn.fly.dev:3478'],
  };

  it('returns STUN server when credentials are null', () => {
    const servers = buildIceServers(null);
    expect(servers).toHaveLength(1);
    expect(servers[0]!.urls).toContain('stun:stun.l.google.com:19302');
  });

  it('includes STUN and TURN servers with credentials', () => {
    const servers = buildIceServers(defaultStun);

    const stunServers = servers.filter((s) => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      return urls.some((u: unknown) => typeof u === 'string' && u.startsWith('stun:'));
    });
    expect(stunServers.length).toBeGreaterThanOrEqual(2);

    const turnServers = servers.filter(
      (s: RTCIceServer) => s.username && s.credential,
    );
    expect(turnServers).toHaveLength(1);
    expect(turnServers[0]!.username).toBe('testuser');
    expect(turnServers[0]!.credential).toBe('testpass');
  });

  it('sets the correct TURN URLs', () => {
    const servers = buildIceServers(defaultStun);

    const turnServer = servers.find(
      (s: RTCIceServer) => s.username && s.credential,
    )!;
    const urls = Array.isArray(turnServer.urls) ? turnServer.urls : [turnServer.urls];
    expect(urls).toContain('turn:smartid2-turn.fly.dev:3478');
  });

  it('handles multiple TURN URLs', () => {
    const multiUrlCreds = {
      ...defaultStun,
      urls: [
        'turn:smartid2-turn.fly.dev:3478',
        'turns:smartid2-turn.fly.dev:5349',
      ],
    };

    const servers = buildIceServers(multiUrlCreds);
    const turnServer = servers.find((s: RTCIceServer) => s.username && s.credential)!;
    const urls = Array.isArray(turnServer.urls) ? turnServer.urls : [turnServer.urls];
    expect(urls).toHaveLength(2);
    expect(urls).toContain('turn:smartid2-turn.fly.dev:3478');
    expect(urls).toContain('turns:smartid2-turn.fly.dev:5349');
  });

  it('includes STUN URL from credentials', () => {
    const servers = buildIceServers(defaultStun);

    const customStun = servers.filter((s) => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      return urls.includes('stun:smartid2-turn.fly.dev:3478');
    });
    expect(customStun).toHaveLength(1);
  });

  it('does not set username/credential on non-TURN servers', () => {
    const servers = buildIceServers(defaultStun);

    const nonTurnServers = servers.filter((s: RTCIceServer) => !s.username && !s.credential);
    expect(nonTurnServers.length).toBeGreaterThan(0);
    for (const server of nonTurnServers) {
      expect(server.username).toBeUndefined();
      expect(server.credential).toBeUndefined();
    }
  });

  it('handles empty TURN URLs gracefully', () => {
    const emptyCreds = {
      ...defaultStun,
      urls: [],
    };

    const servers = buildIceServers(emptyCreds);
    const authServers = servers.filter((s: RTCIceServer) => s.username || s.credential);
    expect(authServers).toHaveLength(0);
    expect(servers.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty stunUrls gracefully', () => {
    const servers = buildIceServers({ ...defaultStun, stunUrls: [] });
    const customStun = servers.filter((s) => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      return urls.some((u) => typeof u === 'string' && u !== 'stun:stun.l.google.com:19302' && u.startsWith('stun:'));
    });
    expect(customStun).toHaveLength(0);
  });

  it('filters out invalid stunUrl entries', () => {
    const servers = buildIceServers({
      ...defaultStun,
      stunUrls: ['stun:valid:3478', '', 'not-a-url'],
    });
    const validStun = servers.filter((s) => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      return urls.includes('stun:valid:3478');
    });
    expect(validStun).toHaveLength(1);
  });
});
