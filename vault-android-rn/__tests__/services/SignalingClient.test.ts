import { SignalingClient } from '../../src/services/SignalingClient';

// Mock socket.io-client
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  connected: false,
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// Mock zustand store
jest.mock('../../src/store', () => ({
  useAppStore: {
    getState: jest.fn(() => ({
      setReconnectAttempt: jest.fn(),
      setConnectionStatus: jest.fn(),
    })),
  },
}));

describe('SignalingClient', () => {
  let client: SignalingClient;
  let events: {
    onSdpOffer: jest.Mock;
    onSdpAnswer: jest.Mock;
    onIceCandidate: jest.Mock;
    onRoomJoined: jest.Mock;
    onError: jest.Mock;
    onDisconnect: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    events = {
      onSdpOffer: jest.fn(),
      onSdpAnswer: jest.fn(),
      onIceCandidate: jest.fn(),
      onRoomJoined: jest.fn(),
      onError: jest.fn(),
      onDisconnect: jest.fn(),
    };
    client = new SignalingClient(events);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('connects to signaling server and joins room', () => {
    client.connect('wss://test.server', '123456');

    const { io } = require('socket.io-client');
    expect(io).toHaveBeenCalledWith('wss://test.server', expect.objectContaining({
      transports: ['websocket'],
      reconnection: false,
      timeout: 10_000,
    }));
  });

  it('emits join-room on connect event', () => {
    client.connect('wss://test.server', '123456');

    // Simulate connect event
    const connectHandler = mockSocket.on.mock.calls.find((c: any[]) => c[0] === 'connect')?.[1];
    connectHandler?.();

    expect(mockSocket.emit).toHaveBeenCalledWith('join-room', '123456');
  });

  it('forwards room-joined event to callback', () => {
    client.connect('wss://test.server', '123456');

    const handler = mockSocket.on.mock.calls.find((c: any[]) => c[0] === 'room-joined')?.[1];
    const data = { peerCount: 2 };
    handler?.(data);

    expect(events.onRoomJoined).toHaveBeenCalledWith(data);
  });

  it('forwards SDP offer to callback', () => {
    client.connect('wss://test.server', '123456');

    const handler = mockSocket.on.mock.calls.find((c: any[]) => c[0] === 'sdp-offer')?.[1];
    const offer = { type: 'offer', sdp: 'test-sdp' };
    handler?.(offer);

    expect(events.onSdpOffer).toHaveBeenCalledWith(offer);
  });

  it('sends SDP answer via socket', () => {
    client.connect('wss://test.server', '123456');
    mockSocket.connected = true;

    const answer = { type: 'answer', sdp: 'test-sdp' };
    client.sendSdpAnswer(answer);

    expect(mockSocket.emit).toHaveBeenCalledWith('sdp-answer', '123456', answer);
  });

  it('sends ICE candidate via socket', () => {
    client.connect('wss://test.server', '123456');
    mockSocket.connected = true;

    const candidate = { candidate: 'test-candidate', sdpMid: '0', sdpMLineIndex: 0 };
    client.sendIceCandidate(candidate);

    expect(mockSocket.emit).toHaveBeenCalledWith('ice-candidate', '123456', candidate);
  });

  it('does not send when disconnected', () => {
    client.connect('wss://test.server', '123456');
    mockSocket.connected = false;

    client.sendSdpAnswer({ type: 'answer', sdp: 'test' });
    // Should not throw, just silently skip
  });

  it('disconnects cleanly', () => {
    client.connect('wss://test.server', '123456');
    client.disconnect();

    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(client.isConnected()).toBe(false);
  });

  it('attempts reconnection on unexpected disconnect', () => {
    client.connect('wss://test.server', '123456');

    // Simulate disconnect
    const disconnectHandler = mockSocket.on.mock.calls.find((c: any[]) => c[0] === 'disconnect')?.[1];
    disconnectHandler?.();

    expect(events.onDisconnect).toHaveBeenCalled();

    // Fast-forward timers to trigger reconnect
    jest.advanceTimersByTime(1000);

    const { io } = require('socket.io-client');
    // Should have been called again (reconnect attempt)
    expect(io).toHaveBeenCalledTimes(2);
  });
});
