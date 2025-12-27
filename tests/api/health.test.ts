// tests/api/health.test.ts
// Unit tests for Vercel serverless health check endpoint
// Story 1-8: Vercel Project Setup

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock VercelRequest and VercelResponse
interface MockVercelRequest {
  method: string;
  url: string;
}

interface MockVercelResponse {
  status: (code: number) => MockVercelResponse;
  json: (data: unknown) => void;
}

describe('api/health', () => {
  let mockReq: MockVercelRequest;
  let mockRes: MockVercelResponse;
  let statusCode: number;
  let jsonResponse: unknown;

  beforeEach(() => {
    vi.resetModules();

    mockReq = {
      method: 'GET',
      url: '/health',
    };

    statusCode = 0;
    jsonResponse = null;

    mockRes = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: unknown) => {
        jsonResponse = data;
      },
    };

    // Mock console.log to prevent noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should return 200 status code', async () => {
    const { default: handler } = await import('../../api/health.js');

    handler(mockReq as never, mockRes as never);

    expect(statusCode).toBe(200);
  });

  it('should return healthy status', async () => {
    const { default: handler } = await import('../../api/health.js');

    handler(mockReq as never, mockRes as never);

    expect(jsonResponse).toMatchObject({
      status: 'healthy',
    });
  });

  it('should include timestamp in ISO format', async () => {
    const { default: handler } = await import('../../api/health.js');

    handler(mockReq as never, mockRes as never);

    const response = jsonResponse as { timestamp: string };
    expect(response.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    );
  });

  it('should include version field', async () => {
    const { default: handler } = await import('../../api/health.js');

    handler(mockReq as never, mockRes as never);

    const response = jsonResponse as { version: string };
    expect(response.version).toBeDefined();
    expect(typeof response.version).toBe('string');
  });

  it('should include environment field', async () => {
    const { default: handler } = await import('../../api/health.js');

    handler(mockReq as never, mockRes as never);

    const response = jsonResponse as { environment: string };
    expect(response.environment).toBeDefined();
    expect(typeof response.environment).toBe('string');
  });
});


