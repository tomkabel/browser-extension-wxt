import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Must import after mocks so they have access to mocked modules
const {
  updateConnectionState,
  getConnectionState,
  getConnectionError,
  setConnectionError,
} = await import('./offscreenWebrtc');

describe('connection state machine', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    updateConnectionState('disconnected');
    setConnectionError(null);
  });

  it('starts in disconnected state', () => {
    expect(getConnectionState()).toBe('disconnected');
    expect(getConnectionError()).toBeNull();
  });

  it('transitions to connecting', () => {
    updateConnectionState('connecting');
    expect(getConnectionState()).toBe('connecting');
  });

  it('transitions to connected', () => {
    updateConnectionState('connecting');
    updateConnectionState('connected');
    expect(getConnectionState()).toBe('connected');
  });

  it('transitions to reconnecting on disconnect', () => {
    updateConnectionState('connected');
    updateConnectionState('reconnecting');
    expect(getConnectionState()).toBe('reconnecting');
  });

  it('transitions back to disconnected on close', () => {
    updateConnectionState('connected');
    updateConnectionState('disconnected');
    expect(getConnectionState()).toBe('disconnected');
  });

  it('can go through full lifecycle', () => {
    expect(getConnectionState()).toBe('disconnected');

    updateConnectionState('connecting');
    expect(getConnectionState()).toBe('connecting');

    updateConnectionState('connected');
    expect(getConnectionState()).toBe('connected');

    updateConnectionState('reconnecting');
    expect(getConnectionState()).toBe('reconnecting');

    updateConnectionState('connected');
    expect(getConnectionState()).toBe('connected');

    updateConnectionState('disconnected');
    expect(getConnectionState()).toBe('disconnected');
  });

  it('stores connection error', () => {
    updateConnectionState('disconnected', 'Connection timed out');
    expect(getConnectionState()).toBe('disconnected');
    expect(getConnectionError()).toBe('Connection timed out');
  });

  it('clears connection error', () => {
    setConnectionError('Something went wrong');
    expect(getConnectionError()).toBe('Something went wrong');
    setConnectionError(null);
    expect(getConnectionError()).toBeNull();
  });
});
