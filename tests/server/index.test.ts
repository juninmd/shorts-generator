import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { serve } from '@hono/node-server';
import { logger } from '../../src/core/logger';
import { startServer } from '../../src/server/index';

vi.mock('@hono/node-server', () => ({
  serve: vi.fn(),
}));

vi.mock('../../src/core/logger', () => ({
  logger: {
    info: vi.fn(),
  },
}));

vi.mock('../../src/server/routes', () => ({
  app: { fetch: vi.fn() },
}));

describe('startServer and index.ts direct execution', () => {
  let originalArgv: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PORT;
    originalArgv = [...process.argv];
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('should start server with default port 3001 if PORT env is not set', () => {
    startServer();

    expect(logger.info).toHaveBeenCalledWith({ port: 3001 }, 'Starting Shorts Generator API server');
    expect(serve).toHaveBeenCalledWith(
      expect.objectContaining({ port: 3001, fetch: expect.any(Function) }),
      expect.any(Function)
    );
  });

  it('should start server with custom port from PORT env', () => {
    process.env.PORT = '4000';
    startServer();

    expect(logger.info).toHaveBeenCalledWith({ port: 4000 }, 'Starting Shorts Generator API server');
    expect(serve).toHaveBeenCalledWith(
      expect.objectContaining({ port: 4000, fetch: expect.any(Function) }),
      expect.any(Function)
    );
  });

  it('should call logger.info inside the serve callback', () => {
    startServer();

    const serveMock = vi.mocked(serve);
    const callback = serveMock.mock.calls[0][1] as (info: { port: number }) => void;

    callback({ port: 3001 });

    expect(logger.info).toHaveBeenCalledWith('Server running at http://localhost:3001');
    expect(logger.info).toHaveBeenCalledWith('API docs: http://localhost:3001/api/health');
  });

  it('should start server if file is run directly', async () => {
    // To cover the isMain block without dynamic imports (which vitest dislikes)
    // We can isolate modules using vi.resetModules()
    vi.resetModules();

    const originalArgv1 = process.argv[1];
    vi.doMock('node:url', async (importOriginal) => {
      const mod = await importOriginal<typeof import('node:url')>();
      return {
        ...mod,
        fileURLToPath: () => 'fake/path/src/server/index.js'
      }
    });

    process.argv[1] = 'src/server/index';

    // We import again after mocking
    await import('../../src/server/index');

    // Assuming startServer handles it, let's verify serve gets called
    expect(serve).toHaveBeenCalled();
    process.argv[1] = originalArgv1;
    vi.doUnmock('node:url');
  });
});
