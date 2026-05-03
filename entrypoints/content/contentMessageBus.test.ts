import { describe, it, expect, vi, beforeEach } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';

vi.mock('./domScraper', () => ({
  scrapePage: vi.fn(),
}));

import { scrapePage } from './domScraper';
import { registerContentHandlers } from './contentMessageBus';

describe('contentMessageBus', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.clearAllMocks();
  });

  it('routes read-dom message type correctly', async () => {
    const mockResult = {
      success: true,
      text: 'scraped content',
      headings: ['h1', 'h2'],
      linkCount: 5,
      imageCount: 3,
      filtered: false,
    };
    vi.mocked(scrapePage).mockResolvedValue(mockResult);

    const addListenerSpy = vi.spyOn(browser.runtime.onMessage, 'addListener');

    registerContentHandlers();

    expect(addListenerSpy).toHaveBeenCalledTimes(1);

    const listener = addListenerSpy.mock.calls[0]![0] as (
      message: unknown,
      sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => boolean | void;

    let capturedResponse: unknown;
    listener({ type: 'read-dom', payload: { maxLength: 50000 } }, {}, (response: unknown) => {
      capturedResponse = response;
    });

    await vi.waitFor(() => expect(scrapePage).toHaveBeenCalled());

    expect(capturedResponse).toEqual(mockResult);
  });

  it('ignores unknown message types (returns false, no sendResponse)', () => {
    const addListenerSpy = vi.spyOn(browser.runtime.onMessage, 'addListener');

    registerContentHandlers();

    const listener = addListenerSpy.mock.calls[0]![0] as (
      message: unknown,
      sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => boolean | void;

    let capturedResponse: unknown;
    const result = listener({ type: 'unknown-cmd', payload: {} }, {}, (response: unknown) => {
      capturedResponse = response;
    });

    expect(result).toBe(false);
    expect(capturedResponse).toBeUndefined();
  });

  it('returns structured success response format', async () => {
    const mockResult = {
      success: true,
      text: 'content',
      headings: ['Heading 1'],
      linkCount: 0,
      imageCount: 0,
      filtered: false,
    };
    vi.mocked(scrapePage).mockResolvedValue(mockResult);

    const addListenerSpy = vi.spyOn(browser.runtime.onMessage, 'addListener');

    registerContentHandlers();

    const listener = addListenerSpy.mock.calls[0]![0] as (
      message: unknown,
      sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => boolean | void;

    let capturedResponse: unknown;
    listener({ type: 'read-dom', payload: { maxLength: 50000 } }, {}, (response: unknown) => {
      capturedResponse = response;
    });

    await vi.waitFor(() => expect(scrapePage).toHaveBeenCalled());

    expect(capturedResponse).toHaveProperty('success', true);
    expect(capturedResponse).toHaveProperty('text');
    expect(capturedResponse).toHaveProperty('headings');
    expect(capturedResponse).toHaveProperty('linkCount');
    expect(capturedResponse).toHaveProperty('imageCount');
  });

  it('returns structured error response format on scrapePage failure', async () => {
    vi.mocked(scrapePage).mockRejectedValue(new Error('DOM not available'));

    const addListenerSpy = vi.spyOn(browser.runtime.onMessage, 'addListener');

    registerContentHandlers();

    const listener = addListenerSpy.mock.calls[0]![0] as (
      message: unknown,
      sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => boolean | void;

    let capturedResponse: unknown;
    listener({ type: 'read-dom', payload: { maxLength: 50000 } }, {}, (response: unknown) => {
      capturedResponse = response;
    });

    await vi.waitFor(() => expect(scrapePage).toHaveBeenCalled());

    expect(capturedResponse).toEqual({
      success: false,
      error: 'DOM not available',
    });
  });
});
