/**
 * Tests for dynamic status messages helper (FR47).
 *
 * @see Story 2.2 - Agent Loop Implementation
 * @see FR47 - Dynamic status messages via setStatus({ loading_messages: [...] })
 */

import { describe, it, expect } from 'vitest';

import { buildLoadingMessages } from './status-messages.js';

describe('buildLoadingMessages', () => {
  it('should return a default rotating list', () => {
    const msgs = buildLoadingMessages();
    expect(msgs.length).toBeGreaterThanOrEqual(3);
    expect(msgs[0]).toContain('…');
  });

  it('should prefer tool-specific message when toolName is provided', () => {
    const msgs = buildLoadingMessages({ toolName: 'web_search' });
    expect(msgs[0]).toBe('Searching the web…');
  });
});


