const REQUIRED_VARS = ['VITE_API_ENDPOINT', 'VITE_SIGNALING_URL'] as const;
const OPTIONAL_VARS = ['VITE_TURN_URL', 'VITE_TURN_SECRET'] as const;

function main(): void {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(
      `ERROR: ${missing.join(', ')} must be set. See .env.example`,
    );
    process.exit(1);
  }

  for (const key of OPTIONAL_VARS) {
    if (!process.env[key]) {
      console.warn(`WARNING: ${key} not set. TURN relay will be disabled.`);
    }
  }
}

main();
