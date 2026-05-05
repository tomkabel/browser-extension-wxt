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

      child.stderr?.on('data', (data: Buffer) => {
        stderrBuf += data.toString();
        const nameMatch = stderrBuf.match(/Mock host started: (.+)/);
        const pathMatch = stderrBuf.match(/Manifest: (.+)/);
        if (nameMatch && pathMatch) {
          clearTimeout(timeout);
          resolve({
            hostName: nameMatch[1]!.trim(),
            manifestPath: pathMatch[1]!.trim(),
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Mock host exited with code ${code}: ${stderrBuf}`));
      });
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
