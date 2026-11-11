#!/usr/bin/env node
import { Command, Option } from 'commander';
import { demonstrateChange } from './core/demonstrate.js';
import { loadChangeSpec } from './case/loadChange.js';
import path from 'node:path';
import { reconstructWorkflow } from './case/reconstruct.js';
import { replayWorkflow } from './core/workflow.js';
import { readFileSync } from 'node:fs';
import { startService } from './gateway/service.js';
import { replayService } from './gateway/replay.js';
import { manageEnvironment } from './environments/manager.js';
import { safeFeedbackValue } from './review/feedback.js';
import { proveCommands } from './eval/command.js';
import { demonstrateCommands } from './core/commandDemonstrate.js';
import { proveChange } from './eval/change.js';
import { formatSummary } from './review/diagnostics.js';
import { reviewCoverage } from './review/coverage.js';
import { runCampaign } from './core/campaign.js';
import { startDurableCampaign, resumeDurableCampaign } from './core/durableCampaign.js';
import { runAgentCampaign } from './core/agentCampaign.js';
import { previewChange, previewCommands } from './core/preview.js';

/** SIGINT/SIGTERM become an abort that the operation handles; the first received signal is reported. */
async function withStop<T>(operation: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  let received: NodeJS.Signals | undefined;
  const stop = (name: NodeJS.Signals) => { received ??= name; controller.abort(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try { const result = await operation(controller.signal); return { result, received }; }
  finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
/** Shell convention for a run ended by a signal, applied after cleanup and evidence writing. */
const signalExit = { SIGINT: 130, SIGTERM: 143 } as Record<string, number>;
function exitAfter(received: NodeJS.Signals | undefined, verdict: string) {
  if (received) process.exitCode = signalExit[received];
  else if (verdict !== 'passed') process.exitCode = verdict === 'failed' ? 1 : 2;
}

const program = new Command();
program.name('praman').description('Evidence-driven verification for AI-generated software').version('0.1.0');

const environment = program.command('environment').description('Provision and exercise owned, isolated kind or Docker environments');
environment.command('create').argument('<declaration>').option('--base <dir>', 'managed environment storage', './.praman/environments')
  .option('--world <id>', 'start from a saved world (see: environment world-save)')
  .option('--recording <id>', 'replay a saved recording of outside calls (see: environment recording-save)')
  .action(async (specPath, opts) => {
    const result = await manageEnvironment('create', { specPath, baseDir: opts.base, world: opts.world, recording: opts.recording });
    console.log(JSON.stringify(result, null, 2));
    if (result.verdict !== 'passed') process.exitCode = 2;
  });
for (const action of ['observe', 'workload', 'fault', 'recover', 'reset', 'world-save', 'recording-save', 'verify', 'demonstrate', 'destroy'] as const) {
  environment.command(action).argument('<id>').argument('[name]', action === 'fault' ? 'declared fault name (none: stop faultService)' : 'declared workload name')
    .option('--base <dir>', 'managed environment storage', './.praman/environments')
    .action(async (id, name, opts) => {
      const result = await manageEnvironment(action, { id, baseDir: opts.base, ...(action === 'fault' ? { fault: name } : { workload: name }) });
      console.log(JSON.stringify(result, null, 2));
      if (result.verdict !== 'passed') process.exitCode = result.verdict === 'failed' ? 1 : 2;
    });
}

program.command('command-verify').description('Verify declared acceptance, historical repair or baseline comparison using trusted local commands')
  .argument('<declaration>').option('-o, --out <dir>', 'private proof directory (must be fresh)', './.praman/command-proof')
  .option('--summary', 'print only outcome, indexed failures, private evidence and next action')
  .action(async (declaration, opts) => {
    const { result, received } = await withStop(signal => proveCommands(declaration, opts.out, signal));
    console.log(opts.summary ? formatSummary(result) : JSON.stringify(result, null, 2));
    exitAfter(received, result.verdict);
  });

program.command('command-demonstrate').description('Verify declared command mode, then record a matching narrated walkthrough with live replays')
  .argument('<plan>', 'JSON recording plan referencing a command declaration')
  .option('-o, --out <dir>', 'private proof and video directory (must not exist)', './.praman/command-video')
  .option('--summary', 'print only outcome, indexed failures, private evidence and next action')
  .addOption(new Option('--cut <cut>', 'authored presentation composition').choices(['full', 'short']).default('full'))
  .action(async (plan, opts) => {
    const { result, received } = await withStop(signal => demonstrateCommands(plan, opts.out, opts.cut, signal));
    console.log(opts.summary ? formatSummary(result) : JSON.stringify(result, null, 2));
    if (received) exitAfter(received, result.verdict);
    else if (result.verdict !== 'passed' || !result.demoVideo) process.exitCode = result.verdict === 'failed' ? 1 : 2;
  });

program.command('preview').description('Execute and inspect a browser story without speech, movies or proof')
  .argument('<scenario>').requiredOption('-o, --out <dir>', 'fresh private preview directory')
  .addOption(new Option('--cut <cut>', 'authored presentation composition').choices(['full', 'short']).default('full'))
  .action(async (scenario, opts) => {
    const result = await previewChange(scenario, opts.out, opts.cut);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'passed') process.exitCode = 2;
  });

program.command('command-preview').description('Execute and inspect terminal/source scenes without speech, movies or proof')
  .argument('<plan>').requiredOption('-o, --out <dir>', 'fresh private preview directory')
  .addOption(new Option('--cut <cut>', 'authored presentation composition').choices(['full', 'short']).default('full'))
  .action(async (plan, opts) => {
    const { result, received } = await withStop(signal => previewCommands(plan, opts.out, opts.cut, signal));
    console.log(JSON.stringify(result, null, 2));
    exitAfter(received, result.status === 'passed' ? 'passed' : 'insufficient_evidence');
  });

program.command('scenario-verify').description('Verify browser acceptance, historical repair or comparison without recording')
  .argument('<scenario>', 'JSON scenario with explicit mode and running application URL(s)')
  .option('-o, --out <dir>', 'private proof directory (must be fresh)', './.praman/scenario-proof')
  .option('--summary', 'print only outcome, indexed failures, private evidence and next action')
  .action(async (scenario, opts) => {
    const spec = loadChangeSpec(scenario);
    const result = safeFeedbackValue(await proveChange(spec, path.resolve(opts.out)), spec);
    console.log(opts.summary ? formatSummary(result) : JSON.stringify(result, null, 2));
    if (result.verdict !== 'passed') process.exitCode = result.verdict === 'failed' ? 1 : 2;
  });

program.command('demonstrate')
  .description('Verify the declared mode, then record a matching authored live walkthrough')
  .argument('<scenario>', 'JSON scenario with running application URL(s) and a mode-appropriate story')
  .option('-o, --out <dir>', 'private proof and demo output directory', './.praman/change-report')
  .option('--summary', 'print only outcome, indexed failures, private evidence and next action')
  .addOption(new Option('--cut <cut>', 'authored presentation composition').choices(['full', 'short']).default('full'))
  .action(async (scenario, opts) => {
    const spec = loadChangeSpec(scenario);
    if (!opts.summary) console.log(`PRAMAN: verifying ${spec.mode} before any demo recording...`);
    const res = safeFeedbackValue(await demonstrateChange(spec, path.resolve(opts.out), undefined, opts.cut), spec);
    if (opts.summary) console.log(formatSummary(res));
    else {
    console.log('Proof:', res.proof.verdict, '—', res.proof.reason);
    console.log('Outcome:', res.verdict);
    console.log('Report:', res.report);
    console.log('Feedback:', JSON.stringify(res.feedback, null, 2));
    console.log('Diagnostics:', JSON.stringify(res.diagnostics));
    console.log('Feedback artifact:', res.feedbackPath);
    console.log('Live walkthrough:', res.demoVideo ?? '(blocked or unavailable)');
    if (res.recordingError) console.error('Recording error:', res.recordingError);
    }
    if (res.verdict !== 'passed' || !res.demoVideo) process.exitCode = res.verdict === 'insufficient_evidence' ? 2 : 1;
  });

program.command('mcp')
  .description('Start PRAMAN MCP server')
  .action(async () => {
    const { startMcp } = await import('./mcp/server.js');
    await startMcp();
  });

program.command('service-replay').description('Replay declared HTTP simulator checks (not application or historical repair proof)')
  .argument('<declaration>', 'JSON authored replay declaration')
  .requiredOption('-o, --out <dir>', 'fresh private evidence directory')
  .action(async (file, opts) => {
    const result = await replayService(file, opts.out);
    console.log(JSON.stringify(result, null, 2));
    if (result.verdict !== 'passed') process.exitCode = result.verdict === 'failed' ? 1 : 2;
  });

program.command('workflow-replay').description('Execute a trusted application command with explicit state reset against an isolated declared dependency')
  .argument('<declaration>').requiredOption('-o, --out <dir>', 'fresh private evidence directory')
  .action(async (file, opts) => {
    const { result, received } = await withStop(signal => replayWorkflow(file, opts.out, { signal }));
    console.log(JSON.stringify(result, null, 2));
    exitAfter(received, result.verdict);
  });

program.command('coverage-review').description('Review declared command/HTTP workflow coverage and model-only candidate stimuli; not whole-app proof')
  .argument('<declaration>').requiredOption('-o, --out <dir>', 'fresh private coverage directory')
  .action(async (file, opts) => {
    const { result, received } = await withStop(signal => reviewCoverage(file, opts.out, signal));
    console.log(JSON.stringify(result, null, 2));
    exitAfter(received, result.verdict);
  });

program.command('workflow-campaign').description('Run count- or duration-bounded isolated command/HTTP campaigns, drain active workflows and combine evidence; not a sandbox')
  .argument('<declaration>').requiredOption('-o, --out <dir>', 'fresh private campaign directory')
  .option('--durable', 'persist a count-based isolated queue; orderly interruption can be resumed locally')
  .action(async (file, opts) => {
    // Durable campaigns drain admitted work on stop so they can resume; plain campaigns
    // stop their active commands and record the run as interrupted.
    const { result, received } = opts.durable
      ? { ...(await withStop(signal => startDurableCampaign(file, opts.out, signal))), received: undefined }
      : await withStop(signal => runCampaign(file, opts.out, signal));
    console.log(JSON.stringify(result, null, 2));
    exitAfter(received, result.verdict);
  });

program.command('campaign-resume').description('Resume pending local durable jobs without rerunning completed or uncertain work')
  .argument('<directory>', 'existing durable session directory')
  .action(async directory => {
    const { result } = await withStop(signal => resumeDurableCampaign(directory, signal));
    console.log(JSON.stringify(result, null, 2));
    if (result.verdict !== 'passed') process.exitCode = result.verdict === 'failed' ? 1 : 2;
  });

program.command('agent-campaign').description('Run bounded parallel agents selecting only trusted command/HTTP workflows with independent authored expectations')
  .argument('<declaration>').requiredOption('-o, --out <dir>', 'fresh private agent campaign directory')
  .action(async (file, opts) => {
    const { result } = await withStop(signal => runAgentCampaign(file, opts.out, signal));
    console.log(JSON.stringify(result, null, 2));
    if (result.verdict !== 'passed') process.exitCode = result.verdict === 'failed' ? 1 : 2;
  });

program.command('service').description('Run a declared stateful HTTP test service (not application proof)')
  .argument('<declaration>', 'JSON service declaration')
  .option('--port <port>', 'loopback port', '9000')
  .option('--restore <file>', 'restore a matching service snapshot before listening')
  .option('--save <file>', 'save service state on SIGINT/SIGTERM before closing')
  .action((file, opts) => {
    const port = Number(opts.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid service port');
    const service = startService({
      port,
      declaration: JSON.parse(readFileSync(file, 'utf8')),
      restore: opts.restore ? JSON.parse(readFileSync(opts.restore, 'utf8')) : undefined,
    });
    service.server.on('listening', () => console.log(JSON.stringify({ simulated: true, address: service.server.address() })));
    service.server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    const stop = () => {
      try { if (opts.save) service.save(opts.save); }
      catch (error) { console.error(error); process.exitCode = 1; }
      service.server.close();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });

program.command('case-from-trace').description('Reconstruct an executable workflow from complete PRAMAN workflow capture; legacy spans are insufficient')
  .argument('<tracePath>').argument('<name>').requiredOption('-o, --out <dir>', 'fresh private case directory')
  .action((tracePath, name, opts) => {
    const result = reconstructWorkflow(tracePath, opts.out, name);
    console.log(JSON.stringify(result, null, 2));
    if (result.verdict !== 'passed') process.exitCode = 2;
  });

program.parse();
