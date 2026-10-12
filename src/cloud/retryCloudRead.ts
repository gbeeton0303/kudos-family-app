// Retry read-only snapshots, never mutations: writes retain their existing
// idempotent queue and rejected-change review behavior.
export async function retryCloudRead<T>(
  read: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> {
  const delays = [400, 1200];
  for (let attempt = 0; ; attempt += 1) {
    try { return await read(); }
    catch (error) {
      if (attempt >= delays.length) throw error;
      await wait(delays[attempt]);
    }
  }
}
