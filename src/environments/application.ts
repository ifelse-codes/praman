import { pathToFileURL } from 'node:url';
import type { EnvironmentSpec, EnvironmentState, SaveState } from './types.js';

/** Trusted application code; not a sandbox. Processes must use managed ownership helpers. */
export interface ApplicationIntegration {
  configure(config: unknown, declarationDirectory: string, environment: EnvironmentSpec): unknown;
  start(state: EnvironmentState, save: SaveState): Promise<void>;
  observe(state: EnvironmentState): Promise<unknown>;
  reset(state: EnvironmentState, save: SaveState, resetInfrastructure: () => Promise<void>): Promise<void>;
  secrets?(config: unknown): string[];
}

export async function loadApplication(modulePath: string): Promise<ApplicationIntegration> {
  // The declaration selects a user-supplied module at runtime; no static registry.
  const integration = (await import(pathToFileURL(modulePath).href)).default;
  for (const method of ['configure', 'start', 'observe', 'reset'] as const) {
    if (typeof integration?.[method] !== 'function') throw new Error(`Application integration ${modulePath} requires ${method}()`);
  }
  if (integration.secrets !== undefined && typeof integration.secrets !== 'function') throw new Error('Application integration secrets must be a function');
  return integration;
}
