/**
 * Types Tests
 *
 * @see Story 6.1 - Agent Skills Loader
 * @see AC#5 - Tool names validated as snake_case
 */

import { describe, it, expect } from 'vitest';
import { TOOL_NAME_PATTERN } from './types.js';

describe('TOOL_NAME_PATTERN', () => {
  it('matches valid snake_case names', () => {
    expect(TOOL_NAME_PATTERN.test('search')).toBe(true);
    expect(TOOL_NAME_PATTERN.test('search_api')).toBe(true);
    expect(TOOL_NAME_PATTERN.test('get_user_profile')).toBe(true);
    expect(TOOL_NAME_PATTERN.test('oauth2_token')).toBe(true);
    expect(TOOL_NAME_PATTERN.test('a1')).toBe(true);
  });

  it('rejects invalid names', () => {
    // PascalCase
    expect(TOOL_NAME_PATTERN.test('SearchApi')).toBe(false);
    // camelCase
    expect(TOOL_NAME_PATTERN.test('searchApi')).toBe(false);
    // kebab-case
    expect(TOOL_NAME_PATTERN.test('search-api')).toBe(false);
    // starts with number
    expect(TOOL_NAME_PATTERN.test('2fa_token')).toBe(false);
    // starts with underscore
    expect(TOOL_NAME_PATTERN.test('_private')).toBe(false);
    // uppercase
    expect(TOOL_NAME_PATTERN.test('SEARCH')).toBe(false);
    // empty
    expect(TOOL_NAME_PATTERN.test('')).toBe(false);
    // spaces
    expect(TOOL_NAME_PATTERN.test('search api')).toBe(false);
  });
});

