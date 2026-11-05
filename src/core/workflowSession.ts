import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { startService, type ServiceInstance, type ServiceInteraction, type ServiceState } from '../gateway/service.js';

/** One serial campaign worker owns this local state; it is not a whole-world snapshot. */
export class WorkflowSession {
  readonly service: ServiceInstance;
  readonly startingRequests: number;
  onRequest?: (interaction: ServiceInteraction) => void;
  resetComplete = false;
  resetFailed = false;
  constructor(readonly workspacePath: string, declaration: unknown, restore?: unknown, readonly sharedState?: ServiceState) {
    for (const directory of [workspacePath, path.join(workspacePath, 'home'), path.join(workspacePath, 'tmp')]) mkdirSync(directory, { mode: 0o700 });
    this.service = startService({ port: 0, declaration, restore: sharedState ? undefined : restore, state: sharedState, onRequest: interaction => this.onRequest?.(interaction) });
    this.startingRequests = sharedState ? (restore as { requests?: number } | undefined)?.requests ?? 0 : this.service.snapshot().requests;
  }
  async close() {
    this.onRequest = undefined;
    this.service.server.closeAllConnections();
    await new Promise<void>(resolve => this.service.server.close(() => resolve()));
  }
}
