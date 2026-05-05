import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MockHostHandle {
  hostName: string;
  manifestPath: string;
  process: ChildProcess;
  cleanup: () => Promise<void>;
}

export async function startMockHost(): Promise<MockHostHandle> {
  const serverPath = path.resolve(__dirname, 'mocks/native-host-server.ts');

  const child = spawn('bun', ['run', serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const { hostName, manifestPath } = await new Promise<{ hostName: string; manifestPath: string }>(
    (resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Mock host startup timeout (10s)')),
        10_000,
      );

      let stderrBuf = '';
      let settled = false;

      const onData = (data: Buffer): void => {
        stderrBuf += data.toString();
        const nameMatch = stderrBuf.match(/Mock host started: (.+)/);
        const pathMatch = stderrBuf.match(/Manifest: (.+)/);
        if (nameMatch && pathMatch && !settled) {
          settled = true;
          clearTimeout(timeout);
          cleanupListeners();
          resolve({
            hostName: nameMatch[1]!.trim(),
            manifestPath: pathMatch[1]!.trim(),
          });
        }
      };

      const onError = (err: Error): void => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          cleanupListeners();
          reject(err);
        }
      };

      const onExit = (code: number | null): void => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          cleanupListeners();
          reject(new Error(`Mock host exited with code ${code}: ${stderrBuf}`));
        }
      };

      const cleanupListeners = (): void => {
        child.stderr?.off('data', onData);
        child.off('error', onError);
        child.off('exit', onExit);
      };

      child.stderr?.on('data', onData);
      child.on('error', onError);
      child.on('exit', onExit);
    },
  );

  if (!fs.existsSync(manifestPath)) {
    child.kill('SIGTERM');
    throw new Error(`Mock host manifest not found at ${manifestPath}`);
  }

  const cleanup = async (): Promise<void> => {
    try {
      child.kill('SIGTERM');
      // Give the process time to run its cleanup handler
      await new Promise((r) => setTimeout(r, 100));
    } catch {
      // already dead
    }

    try {
      if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
      }
    } catch {
      // best effort
    }
  };

  return { hostName, manifestPath, process: child, cleanup };
}
