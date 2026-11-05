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
    ready: string[] | { http: string };
  }>;
  faultService?: string;
  application?: { module: string; config?: unknown };
  scenario?: string;
}

export interface OwnedProcess { pid: number; startedAt: string; command: string; args: string[]; log: string; }
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
  services?: Record<string, { name: string; port: number; owned: boolean }>;
  ownershipToken?: string;
  privateInputs?: string[];
}
export interface OperationResult {
  verdict: 'passed' | 'failed' | 'not_executed' | 'insufficient_evidence';
  evidence: unknown;
}
export type SaveState = () => void;
