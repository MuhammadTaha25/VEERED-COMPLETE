/**
 * Next.js instrumentation entrypoint. Node-only work is isolated in
 * ./instrumentation-node.js so the edge bundle never sees `fs`/`path`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node.js');
  }
}
