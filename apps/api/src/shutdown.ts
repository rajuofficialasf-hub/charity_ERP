/**
 * The shutdown of a process on SIGTERM or SIGINT, as one function a test can drive: stop taking
 * new work, let what runs finish, close the clients, and exit anyway after the grace period.
 */
export interface ShutdownSteps {
  /** Stops accepting connections and resolves once the in-flight requests have finished. */
  closeServer?: () => Promise<void>;
  /** Closes the job queue, the PDF browser and the database (container.ts closeContainer). */
  closeResources: () => Promise<void>;
  /** After this long the process exits with 1, whatever is still running. */
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
    steps.log.info({ signal }, 'shutting down');
    setTimeout(() => {
      steps.log.error({}, 'shutdown took too long, exiting');
      steps.exit(1);
    }, steps.graceMs).unref();
    void (async () => {
      let failed = false;
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
