import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { demonstrateChange } from '../core/demonstrate.js';
import { changeSpecSchema } from '../case/change.js';
import { manageEnvironment } from '../environments/manager.js';
import { safeFeedbackValue } from '../review/feedback.js';
import { proveCommands } from '../eval/command.js';
import { demonstrateCommands } from '../core/commandDemonstrate.js';
import { proveChange } from '../eval/change.js';
import { replayService } from '../gateway/replay.js';
import { replayWorkflow } from '../core/workflow.js';
import { reconstructWorkflow } from '../case/reconstruct.js';
import { reviewCoverage } from '../review/coverage.js';
import { runCampaign } from '../core/campaign.js';
import { startDurableCampaign, resumeDurableCampaign } from '../core/durableCampaign.js';
import { runAgentCampaign } from '../core/agentCampaign.js';
import { previewChange, previewCommands } from '../core/preview.js';
import { videoCutSchema } from '../case/composition.js';
import { missingPathArguments, relativePathArguments, relativePathPolicy, relativePathRefusal } from './paths.js';

export async function startMcp() {
  const server = new McpServer({ name: 'praman', version: '0.1.0' });
  // Read once at startup: an invalid value fails `praman mcp` visibly.
  const policy = relativePathPolicy();
  // Every tool is registered through this wrapper so the path policy is checked before
  // any handler runs. With the default policy it is a pass-through.
  const register = server.tool.bind(server) as (...args: unknown[]) => unknown;
  const tool = ((...args: unknown[]) => {
    const name = String(args[0]);
    const handler = args[args.length - 1] as (input: Record<string, unknown>, extra: unknown) => unknown;
    return register(...args.slice(0, -1), async (input: Record<string, unknown>, extra: unknown) => {
      if (policy !== 'reject') return handler(input, extra);
      const relative = relativePathArguments(input);
      const missing = missingPathArguments(name, input);
      return relative.length || missing.length ? relativePathRefusal(relative, missing) : handler(input, extra);
    });
  }) as typeof server.tool;
  tool('praman_workflow_campaign', 'Run count- or duration-bounded command/HTTP campaigns with isolated, persistent per-worker or shared-service model state and private evidence/reports. Duration closes admission then drains active commands. Optional root-process resource observations; not a sandbox, distributed scheduler, autonomous tester or historical repair proof.', {
    specPath: z.string(), outDir: z.string(), durable: z.boolean().optional(),
  }, async ({ specPath, outDir, durable }, extra) => {
    const result = durable ? await startDurableCampaign(specPath, outDir, extra.signal) : await runCampaign(specPath, outDir);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.verdict !== 'passed' };
  });
  tool('praman_campaign_resume', 'Resume pending jobs in a local durable count campaign, preserving completed receipts. Ungraceful in-flight execution fails closed for recovery; not distributed execution.', {
    outDir: z.string(),
  }, async ({ outDir }, extra) => {
    const result = await resumeDurableCampaign(outDir, extra.signal);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.verdict !== 'passed' };
  });
  tool('praman_agent_campaign', 'Run bounded local parallel testers through a declaration-selected trusted agent command. Agents select existing allowlisted command/HTTP workflows from goals and structural feedback; PRAMAN executes unchanged independent expectations. No generated commands, oracle edits, autonomous fixes or distributed/resumable agents. Private model prompts/output; runtime permissions remain caller-owned.', {
    specPath: z.string(), outDir: z.string(),
  }, async ({ specPath, outDir }, extra) => {
    const result = await runAgentCampaign(specPath, outDir, extra.signal);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.verdict !== 'passed' };
  });
  tool('praman_coverage_review', 'Execute declared initial-state command/HTTP workflows, review reachable model transitions and caller-mapped assertions, and propose model-only simulator cases. Not autonomous requirements discovery or whole-app proof. Trusted commands; private inputs/evidence.', {
    specPath: z.string(), outDir: z.string(),
  }, async ({ specPath, outDir }) => {
    const result = await reviewCoverage(specPath, outDir);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.verdict !== 'passed' };
  });
  tool('praman_workflow_replay', 'Run trusted command/dependency workflows with explicit application state preconditions and fresh isolated repeats. Capture private reconstructable traces; not a sandbox or historical repair proof.', {
    specPath: z.string(), outDir: z.string(),
  }, async ({ specPath, outDir }) => {
    const result = await replayWorkflow(specPath, outDir);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.verdict !== 'passed' };
  });
  tool('praman_case_from_trace', 'Reconstruct an executable workflow from complete PRAMAN workflow traces, preserving declared expectations. Missing state/actions/expectations and legacy spans are insufficient.', {
    tracePath: z.string(), name: z.string(), outDir: z.string(),
  }, async ({ tracePath, name, outDir }) => {
    const result = reconstructWorkflow(tracePath, outDir, name);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.verdict !== 'passed' };
  });
  tool('praman_service_replay', 'Replay authored HTTP checks against an owned loopback simulator from explicit initial or saved state. Not application acceptance or historical repair proof; raw evidence stays private.', {
    specPath: z.string(), outDir: z.string(),
  }, async ({ specPath, outDir }) => {
    const result = await replayService(specPath, outDir);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.verdict !== 'passed' };
  });
  tool('praman_command_verify', 'Execute trusted commands in acceptance, repair or comparison mode. Record resolved executable/runner and declared script/input/interpreter/browser/tool identities; unavailable or changing identities cannot pass. Local hashes are not transitive, signed or hermetic provenance. Private evidence; not a sandbox.', {
    specPath: z.string(), outDir: z.string(),
  }, async ({ specPath, outDir }) => {
    const result = await proveCommands(specPath, outDir);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.verdict !== 'passed' };
  });
  tool('praman_command_demonstrate', 'Verify the declared command mode, then deliver a mode-appropriate narrated browser-hosted terminal/source video only when live replays match proof. Private output; not native TTY capture or a sandbox.', {
    planPath: z.string(), outDir: z.string(), cut: videoCutSchema.optional(),
  }, async ({ planPath, outDir, cut }) => {
    const result = await demonstrateCommands(planPath, outDir, cut);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.verdict !== 'passed' || !result.demoVideo };
  });
  tool('praman_preview', 'Execute real authored browser actions and inspect story framing without speech or movies. Layout preview is explicitly non-proof, may mutate application state and never authorizes recording. Final fresh proof and matching live replays remain required. Private evidence.', {
    scenario: changeSpecSchema, outDir: z.string(), cut: videoCutSchema.optional(),
  }, async ({ scenario, outDir, cut }) => {
    const result = await previewChange(scenario, outDir, cut);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.status !== 'passed' };
  });
  tool('praman_command_preview', 'Execute trusted commands and inspect terminal/source story framing without speech or movies. Non-proof, not native TTY capture or a sandbox; real commands may mutate external state. Final fresh proof and matching live replays remain required. Private evidence.', {
    planPath: z.string(), outDir: z.string(), cut: videoCutSchema.optional(),
  }, async ({ planPath, outDir, cut }) => {
    const result = await previewCommands(planPath, outDir, cut);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.status !== 'passed' };
  });
  tool('praman_environment', 'Manage owned real kind or Docker environments. create provisions dependencies and application; workload exercises live state; fault/recover pause the actual dependency; reset restores seed; verify collects proof; demonstrate records only after its proof gate; destroy removes owned resources.', {
    action: z.enum(['create', 'observe', 'workload', 'fault', 'recover', 'reset', 'verify', 'demonstrate', 'destroy']),
    specPath: z.string().optional(), id: z.string().optional(), workload: z.string().optional(), baseDir: z.string().optional(),
  }, async ({ action, ...request }) => {
    const result = await manageEnvironment(action, request);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.verdict !== 'passed' };
  });
  tool('praman_scenario_verify', 'Verify declared browser requirements without video. Record the actual selected Chromium binary, runner, upload/diff inputs and declared scripts/interpreters/tools. Missing or changing identities cannot pass. Local hashes exclude undeclared/transitive dependencies and remote app state; URLs are not build provenance.', {
    scenario: changeSpecSchema, outDir: z.string(),
  }, async ({ scenario, outDir }) => {
    const result = await proveChange(scenario, outDir);
    return { content: [{ type: 'text', text: JSON.stringify(safeFeedbackValue(result, scenario), null, 2) }], isError: result.verdict !== 'passed' };
  });
  tool('praman_demonstrate', 'Verify explicit mode requirements, then record a live mode-appropriate walkthrough only after matching proof.', {
    scenario: changeSpecSchema, outDir: z.string(), cut: videoCutSchema.optional(),
  }, async ({ scenario, outDir, cut }) => {
    const res = await demonstrateChange(scenario, outDir, undefined, cut);
    return { content: [{ type: 'text', text: JSON.stringify(safeFeedbackValue(res, scenario), null, 2) }], isError: res.verdict !== 'passed' };
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
