// A tiny sequential test runner: no dependencies, supports async tests.

const queue: { name: string; fn: () => void | Promise<void> }[] = [];

export function test(name: string, fn: () => void | Promise<void>): void {
  queue.push({ name, fn });
}

/** Runs the registered tests in order; resolves to a process exit code. */
export async function run(): Promise<number> {
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of queue) {
    try {
      await fn();
      passed++;
      console.log("ok   - " + name);
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : String(e);
      console.log("FAIL - " + name + "\n       " + message.split("\n").join("\n       "));
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0 ? 0 : 1;
}
