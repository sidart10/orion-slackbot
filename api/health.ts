// api/health.ts
// Vercel serverless health check endpoint
// Follows AR12: Structured JSON logging format

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
}

export default function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Structured logging per AR12
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    event: 'health_check',
    method: req.method,
    path: req.url,
  }));

  const response: HealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
    environment: process.env.VERCEL_ENV || 'development',
  };

  res.status(200).json(response);
}
