import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promisify } from 'util';

// Keep test output clean
vi.mock('@/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

type MockConfig = {
  googleToken?: string | null;
  googleHangs?: boolean;
  gcloudToken?: string | null;
  gcloudTokenImpersonation?: string | null;
  gcloudAuthListOk?: boolean;
  impersonateSa?: string | undefined;
};

function makeJwtWithExpiry(expSecondsFromNow: number): string {
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64');
  return `header.${payload}.sig`;
}

async function importWithMocks(cfg: MockConfig) {
  vi.resetModules();

  if (cfg.impersonateSa !== undefined) {
    process.env.GCP_IMPERSONATE_SA = cfg.impersonateSa;
  } else {
    delete process.env.GCP_IMPERSONATE_SA;
  }

  const execCalls: Array<{ cmd: string; timeout?: number }> = [];

  vi.doMock('child_process', () => {
    const respond = (file: string, args: string[], opts: any) => {
      const cmd = [file, ...args].join(' ');
      execCalls.push({ cmd, timeout: opts?.timeout });

      // gcloud auth list
      if (cmd.includes('gcloud auth list')) {
        if (cfg.gcloudAuthListOk === false) return { err: new Error('no gcloud'), stdout: '', stderr: '' };
        return { err: null, stdout: 'user@example.com\n', stderr: '' };
      }

      // gcloud print-identity-token (impersonation)
      if (
        cmd.includes('gcloud auth print-identity-token') &&
        cmd.includes('--impersonate-service-account=')
      ) {
        const token = cfg.gcloudTokenImpersonation ?? cfg.gcloudToken ?? '';
        return { err: null, stdout: `${token}\n`, stderr: '' };
      }

      // gcloud print-identity-token (no impersonation)
      if (cmd.includes('gcloud auth print-identity-token')) {
        const token = cfg.gcloudToken ?? '';
        return { err: null, stdout: `${token}\n`, stderr: '' };
      }

      return { err: null, stdout: '', stderr: '' };
    };

    const execFile = vi.fn((file: string, args: any, opts: any, cb: any) => {
      // Support execFile(file, args, cb) and execFile(file, args, opts, cb)
      if (typeof opts === 'function') {
        cb = opts;
        opts = undefined;
      }
      const argList = Array.isArray(args) ? (args as string[]) : [];
      const { err, stdout, stderr } = respond(file, argList, opts);
      return cb(err, stdout, stderr);
    });

    // Match Node's execFile promisified shape: Promise<{ stdout, stderr }>
    (execFile as any)[(promisify as any).custom] = (file: string, args?: string[], opts?: any) => {
      const argList = Array.isArray(args) ? args : [];
      const { err, stdout, stderr } = respond(file, argList, opts);
      if (err) return Promise.reject(err);
      return Promise.resolve({ stdout, stderr });
    };

    return { execFile };
  });

  vi.doMock('google-auth-library', () => {
    class GoogleAuth {
      async getIdTokenClient(_audience: string) {
        if (cfg.googleHangs) {
          return new Promise(() => undefined) as never;
        }
        return {
          async getRequestHeaders() {
            const token = cfg.googleToken;
            const authHeader = token ? `Bearer ${token}` : undefined;
            return {
              get: (k: string) => {
                if (k === 'Authorization' || k === 'authorization') return authHeader ?? null;
                return null;
              },
            };
          },
        };
      }
    }

    return { GoogleAuth };
  });

  const mod = await import('@/tools/mcp/gcp-auth.js');
  return { mod, execCalls };
}

describe('gcp-auth', () => {
  const originalEnv = process.env.GCP_IMPERSONATE_SA;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.GCP_IMPERSONATE_SA;
    else process.env.GCP_IMPERSONATE_SA = originalEnv;
    vi.useRealTimers();
  });

  it('returns token from google-auth-library and caches it', async () => {
    const token = makeJwtWithExpiry(3600);
    const { mod } = await importWithMocks({
      googleToken: token,
      gcloudToken: null,
    });

    mod.clearTokenCache();

    const t1 = await mod.getGcpIdentityToken('https://example.run.app');
    const t2 = await mod.getGcpIdentityToken('https://example.run.app');

    expect(t1).toBe(token);
    expect(t2).toBe(token);
  });

  it('falls back to gcloud CLI when google-auth-library returns no token', async () => {
    const gcloudToken = makeJwtWithExpiry(3600);
    const { mod, execCalls } = await importWithMocks({
      googleToken: null,
      gcloudToken,
    });

    mod.clearTokenCache();

    const token = await mod.getGcpIdentityToken('https://example.run.app');
    expect(token).toBe(gcloudToken);
    expect(execCalls.some((c) => c.cmd.includes('gcloud auth print-identity-token'))).toBe(true);
  });

  it('uses impersonation command when GCP_IMPERSONATE_SA is set', async () => {
    const gcloudToken = makeJwtWithExpiry(3600);
    const { mod, execCalls } = await importWithMocks({
      googleToken: null,
      gcloudTokenImpersonation: gcloudToken,
      impersonateSa: 'sa@example.com',
    });

    mod.clearTokenCache();

    const token = await mod.getGcpIdentityToken('https://example.run.app');
    expect(token).toBe(gcloudToken);

    const firstPrintCall = execCalls.find((c) => c.cmd.includes('gcloud auth print-identity-token'));
    expect(firstPrintCall?.cmd).toContain('--impersonate-service-account=sa@example.com');
  });

  it('times out google-auth-library and then throws if gcloud also fails', async () => {
    vi.useFakeTimers();
    const { mod } = await importWithMocks({
      googleHangs: true,
      gcloudToken: null,
    });

    mod.clearTokenCache();

    const p = mod.getGcpIdentityToken('https://example.run.app');
    const assertion = expect(p).rejects.toThrow(/Failed to get GCP identity token/i);
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
  });

  it('isGcpAuthAvailable returns true when gcloud auth list succeeds', async () => {
    const { mod } = await importWithMocks({ gcloudAuthListOk: true, googleToken: null });
    await expect(mod.isGcpAuthAvailable()).resolves.toBe(true);
  });

  it('isGcpAuthAvailable returns false when gcloud auth list fails', async () => {
    const { mod } = await importWithMocks({ gcloudAuthListOk: false, googleToken: null });
    await expect(mod.isGcpAuthAvailable()).resolves.toBe(false);
  });
});


