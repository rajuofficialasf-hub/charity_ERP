/**
 * The shutdown of a process on SIGTERM or SIGINT, as one function a test can drive: readiness fails
 * at once, the server keeps serving for the delay (for a proxy that polls readiness), then stops
 * accepting connections and lets the in-flight requests finish, the clients close, and the process
 * exits anyway after the grace period.
 */
export interface ShutdownSteps {
  /** Makes the readiness probe fail, so a proxy stops sending new requests here. */
  markUnready?: () => void;
  /** How long the server keeps serving after readiness fails; 0 when no proxy polls it. */
  delayMs?: number;
  /** Stops accepting connections and resolves once the in-flight requests have finished. */
  closeServer?: () => Promise<void>;
  /** Closes the job queue, the PDF browser and the database (container.ts closeContainer). */
  closeResources: () => Promise<void>;
  /** This long after the delay the process exits with 1, whatever is still running. */
  graceMs: number;
  exit: (code: number) => void;
  log: {
    info: (fields: Record<string, unknown>, message: string) => void;
    error: (fields: Record<string, unknown>, message: string) => void;
  };
}

export function createShutdown(steps: ShutdownSteps): (signal: NodeJS.Signals) => void {
  let stopping = false;
  return (signal) => {
    if (stopping) return;
    stopping = true;
    steps.markUnready?.();
    steps.log.info({ signal }, 'shutting down');
    void (async () => {
      let failed = false;
      if (steps.delayMs) await new Promise((resolve) => setTimeout(resolve, steps.delayMs));
      // counted from here, so the delay never shortens the time the requests get to finish
      setTimeout(() => {
        steps.log.error({}, 'shutdown took too long, exiting');
        steps.exit(1);
      }, steps.graceMs).unref();
      try {
        await steps.closeServer?.();
      } catch (error) {
        failed = true;
        steps.log.error({ err: error }, 'error while closing the server');
      }
      try {
        await steps.closeResources();
      } catch (error) {
        steps.log.error({ err: error }, 'error while closing resources');
        steps.exit(1);
        return;
      }
      steps.exit(failed ? 1 : 0);
    })();
  };
}
