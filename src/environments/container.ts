import { z } from 'zod';
import { command } from './runtime.js';
import type { EnvironmentState } from './types.js';

/** Every container and network PRAMAN starts carries this label with the environment's ownership token. */
export const ownerLabel = 'io.praman.owner';
const containerSchema = z.object({
  Id: z.string(), Image: z.string(), Config: z.object({ Labels: z.record(z.string(), z.string()).nullable() }),
  State: z.object({ Running: z.boolean(), Paused: z.boolean() }),
});
export async function inspectContainer(state: EnvironmentState, name: string) {
  const ids = (await command(state, 'docker', ['ps', '-aq', '--filter', `name=^/${name}$`])).trim();
  if (!ids) return null;
  return containerSchema.parse(JSON.parse(await command(state, 'docker', ['inspect', name]))[0]);
}
/** The labels of a Docker network, or null when no network has exactly this name. */
export async function inspectNetwork(state: EnvironmentState, name: string) {
  const names = (await command(state, 'docker', ['network', 'ls', '--format', '{{.Name}}'])).split('\n').map(line => line.trim());
  if (!names.includes(name)) return null;
  const [network] = z.array(z.object({ Labels: z.record(z.string(), z.string()).nullable() })).parse(JSON.parse(await command(state, 'docker', ['network', 'inspect', name])));
  return network;
}
