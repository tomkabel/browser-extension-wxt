import '@testing-library/jest-dom';
import { fakeBrowser } from 'wxt/testing';
import { vi, beforeEach } from 'vitest';

// Reset fake browser state between tests
beforeEach(() => {
  fakeBrowser.reset();
});

// Mock global fetch
global.fetch = vi.fn();
