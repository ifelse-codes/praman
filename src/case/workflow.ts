import { z } from 'zod';
import { commandProofSchema } from '../eval/command.js';
import { serviceReplaySchema } from '../gateway/replay.js';

const acceptance = commandProofSchema.refine(spec => spec.mode === 'acceptance', 'Workflow commands must use current-only acceptance');
export const workflowSchema = z.object({
  version: z.literal(1),
  dependency: serviceReplaySchema,
  applicationState: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('stateless') }).strict(),
    z.object({ kind: z.literal('reset'), command: acceptance }).strict(),
  ]),
  command: acceptance,
}).strict();
export const interactionSchema = z.object({
  method: z.string(), path: z.string(), status: z.number().int(), body: z.string(),
  before: z.string(), after: z.string(), matched: z.boolean(),
}).strict();
export const workflowTraceSchema = z.object({
  version: z.literal(1), kind: z.literal('praman-workflow'),
  declaration: workflowSchema,
  initial: z.object({ version: z.literal(1), declarationHash: z.string(), state: z.string(), requests: z.number().int().nonnegative() }).strict(),
  interactions: z.array(interactionSchema).max(100),
  complete: z.literal(true),
  command: z.object({ status: z.literal('exited'), code: z.number().int(), signal: z.null(), executableHash: z.string().optional(), executableHashAfter: z.string().optional() }),
}).strict();
