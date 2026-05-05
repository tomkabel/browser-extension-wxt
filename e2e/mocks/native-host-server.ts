import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const MAX_MESSAGE_SIZE = 1024 * 1024;

const hostName = `org.smartid.mock_host_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;

let manifestPath = '';

function readFullMessage(): Promise<unknown | null> {
  return new Promise((resolve) => {
    let headerBuf = Buffer.alloc(0);
    let bodyBuf: Buffer | null = null;
    let expectedLength = 0;
    let bodyBytesRead = 0;

    const onData = (chunk: Buffer) => {
      if (bodyBuf === null) {
        // Accumulating header (4 bytes)
        headerBuf = Buffer.concat([headerBuf, chunk]);

        if (headerBuf.length < 4) return;

        expectedLength = headerBuf.readUInt32LE(0);
        if (expectedLength > MAX_MESSAGE_SIZE) {
          process.stderr.write(`Message too large: ${expectedLength} bytes\n`);
          process.stdin.removeListener('data', onData);
          resolve(null);
          return;
        }

        bodyBuf = Buffer.alloc(expectedLength);
        const headerLeftover = headerBuf.slice(4);
        if (headerLeftover.length > 0) {
          onData(headerLeftover);
          return;
        }
      } else {
        // Accumulating body
        const remaining = expectedLength - bodyBytesRead;
        const toCopy = Math.min(chunk.length, remaining);
        chunk.copy(bodyBuf, bodyBytesRead, 0, toCopy);
        bodyBytesRead += toCopy;

        if (bodyBytesRead >= expectedLength) {
          process.stdin.removeListener('data', onData);
          try {
            resolve(JSON.parse(bodyBuf.toString('utf-8')));
          } catch {
            resolve(null);
          }
        }
      }
    };

    process.stdin.on('data', onData);

    process.stdin.on('end', () => {
      process.stdin.removeListener('data', onData);
      resolve(null);
    });
  });
}

function writeMessage(msg: unknown): void {
  const body = Buffer.from(JSON.stringify(msg), 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function writeManifest(): void {
  const manifest = {
    name: hostName,
    description: 'SmartID Mock Native Host for E2E testing',
    path: process.execPath,
    type: 'stdio',
    allowed_origins: ['chrome-extension://*/'],
  };

  manifestPath = path.join(os.tmpdir(), `${hostName}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function cleanup(): void {
  try {
    if (manifestPath && fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
    }
  } catch {
    // best effort
  }
}

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('exit', cleanup);

async function main(): Promise<void> {
  writeManifest();

  process.stderr.write(`Mock host started: ${hostName}\n`);
  process.stderr.write(`Manifest: ${manifestPath}\n`);

  while (true) {
    const msg = await readFullMessage();
    if (msg === null) {
      break;
    }

    const typed = msg as { type?: string };
    if (typed.type === 'ping') {
      writeMessage({ type: 'pong' });
    } else {
      writeMessage({ echo: true, original: msg });
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Mock host error: ${err}\n`);
  cleanup();
  process.exit(1);
});
