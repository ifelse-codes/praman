import type { ChangeSpec } from '../case/change.js';

export interface KubernetesResource {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace?: string; uid?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface EnvironmentSpec {
  name: string;
  provider?: 'kind' | 'docker';
  dockerHost: string;
  colimaProfile?: string;
  inotifyMaxUserInstances?: number;
  nodeImage?: string;
  namespace: string;
  resources: KubernetesResource[];
  workloads: Record<string, { args: string[]; service?: string; input?: string }>;
  readinessWorkloads?: string[];
  services?: Record<string, {
    image: string;
    args?: string[];
    env?: Record<string, string>;
    port: number;
    dataPath?: string;
    ready: string[] | { http: string };
    proxy?: { probe?: string[] };
  }>;
  faultService?: string;
  faults?: Record<string, NetworkFault>;
  application?: { module: string; config?: unknown };
  scenario?: string;
}

export interface OwnedProcess { pid: number; startedAt: string; command: string; args: string[]; log: string; }
/** A named fault on the proxied connection to one declared service. */
export type NetworkFault = { service: string } & ({ kind: 'delay'; delayMs: number } | { kind: 'timeout'; timeoutMs: number } | { kind: 'drop' } | { kind: 'down' });
export interface EnvironmentState {
  version: 3;
  id: string;
  directory: string;
  spec: EnvironmentSpec;
  clusterName: string;
  clusterOwned: boolean;
  kubeconfig: string;
  phase: 'creating' | 'ready' | 'failed' | 'destroyed';
  fault: boolean;
  generation: number;
  processes: OwnedProcess[];
  urls: Record<string, string>;
  scenario?: ChangeSpec;
  sourceHashes?: Record<string, string>;
  /** `port` is the port the application uses; for a proxied service `directPort` is the service's own. */
  services?: Record<string, { name: string; port: number; owned: boolean; directPort?: number }>;
  ownershipToken?: string;
  network?: { name: string; owned: true };
  proxy?: { name: string; apiPort: number; token: string; listen: Record<string, number> };
  /** The named fault that is applied now, with the healthy probe time measured just before it. */
  activeFault?: { name: string; healthyMs: number; startedAt: string };
  world?: { id: string; directory: string };
  privateInputs?: string[];
}
export interface OperationResult {
  verdict: 'passed' | 'failed' | 'not_executed' | 'insufficient_evidence';
  evidence: unknown;
}
export type SaveState = () => void;
