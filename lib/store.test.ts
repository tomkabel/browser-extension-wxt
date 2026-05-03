import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './store';

describe('AppStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentTab: null,
      apiHealthy: null,
      apiStatus: 'idle',
      apiError: null,
      lastSent: null,
    });
  });

  it('sets current tab', () => {
    useAppStore.getState().setCurrentTab({
      domain: 'example.com',
      registrableDomain: 'example.com',
      url: 'https://example.com',
      isPublic: true,
    });

    expect(useAppStore.getState().currentTab).toEqual({
      domain: 'example.com',
      registrableDomain: 'example.com',
      url: 'https://example.com',
      isPublic: true,
    });
  });

  it('sets API healthy status', () => {
    useAppStore.getState().setApiHealthy(true);
    expect(useAppStore.getState().apiHealthy).toBe(true);

    useAppStore.getState().setApiHealthy(false);
    expect(useAppStore.getState().apiHealthy).toBe(false);

    useAppStore.getState().setApiHealthy(null);
    expect(useAppStore.getState().apiHealthy).toBeNull();
  });

  it('sets API status', () => {
    useAppStore.getState().setApiStatus('sending');
    expect(useAppStore.getState().apiStatus).toBe('sending');
  });

  it('sets API error', () => {
    useAppStore.getState().setApiError('Connection failed');
    expect(useAppStore.getState().apiError).toBe('Connection failed');

    useAppStore.getState().setApiError(null);
    expect(useAppStore.getState().apiError).toBeNull();
  });

  it('sets last sent date', () => {
    const date = new Date();
    useAppStore.getState().setLastSent(date);
    expect(useAppStore.getState().lastSent).toEqual(date);
  });
});
