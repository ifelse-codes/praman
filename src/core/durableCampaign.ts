import { createHash, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type * as Sqlite from 'node:sqlite';
import { campaignSchema, runCampaign } from './campaign.js';
import { captureCampaignWorkflows, readWorkflowJson } from './workflowInputs.js';
import { workflowSchema } from '../case/workflow.js';

// Native optional-runtime loading also preserves node:-only builtins under older test/module loaders.
const requireBuiltin = createRequire(import.meta.url);

const verdictSchema = z.enum(['passed', 'failed', 'insufficient_evidence']);
type Verdict = z.infer<typeof verdictSchema>;
const fingerprintSchema = z.object({ path: z.string(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const planSchema = z.object({
  version: z.literal(1), kind: z.literal('praman-local-campaign'), root: z.string(),
  manifest: campaignSchema, inputs: z.array(fingerprintSchema).min(1).max(20),
  snapshots: z.array(fingerprintSchema).max(20),
}).strict();
type Plan = z.infer<typeof planSchema>;
const metaSchema = z.object({ plan: z.string(), phase: z.enum(['ready', 'running', 'paused', 'complete', 'recovery_required']),
  ownerPid: z.number().int().positive().nullable(), ownerToken: z.string().nullable(), attempt: z.number().int().nonnegative() }).strict();
const jobSchema = z.object({ jobIndex: z.number().int().nonnegative(), caseIndex: z.number().int().nonnegative(), round: z.number().int().positive(),
  state: z.enum(['pending', 'running', 'complete']), verdict: verdictSchema.nullable(), receiptPath: z.string().nullable(), receiptHash: z.string().nullable() }).strict();
const scope = 'Local durable count campaigns with fresh isolated workflow jobs. Orderly interruption drains active jobs; resume dispatches pending jobs only and preserves completed evidence. Ungraceful in-flight execution requires recovery and is never retried automatically. Not a distributed scheduler, exactly-once side-effect guarantee, persistent-world restore or historical repair proof.';

function digest(file: string) {
  const info = statSync(file);
  if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error('Durable evidence must be a bounded regular file');
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function save(file: string, value: unknown) {
  writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
}
function jobs(db: DatabaseSync) {
  return db.prepare('SELECT jobIndex, caseIndex, round, state, verdict, receiptPath, receiptHash FROM jobs ORDER BY jobIndex LIMIT 101').all().map(row => jobSchema.parse(row));
}
function validatePlan(value: unknown, root: string): Plan {
  const plan = planSchema.parse(value);
  if (plan.root !== root || !('rounds' in plan.manifest) || plan.manifest.state) throw new Error('Durable mode requires an unmoved, round-based isolated campaign');
  if (plan.inputs.length !== plan.manifest.cases.length) throw new Error('Captured workflow count changed');
  for (const [index, input] of plan.inputs.entries()) if (input.path !== path.join(root, `case-${index}.json`)) throw new Error('Captured workflow location changed');
  for (const snapshot of plan.snapshots) if (path.dirname(snapshot.path) !== root || !/^snapshot-\d+\.json$/.test(path.basename(snapshot.path))) throw new Error('Captured snapshot location changed');
  return plan;
}
function refusal(root: string, reason: string, errorPath?: string) {
  return { verdict: 'insufficient_evidence' as const, proof: false, scope, sessionDir: root, databasePath: path.join(root, 'queue.sqlite'), reason, errorPath,
    nextAction: 'Inspect the private session and restore valid input/storage or resolve the active coordinator. No uncertain job was retried.' };
}

async function coordinate(db: DatabaseSync, root: string, signal?: AbortSignal) {
  const token = randomUUID();
  let acquired = false;
  let attemptDir: string | undefined;
  try {
    db.exec('BEGIN IMMEDIATE');
    let meta: z.infer<typeof metaSchema>;
    let plan: Plan;
    try {
      meta = metaSchema.parse(db.prepare('SELECT plan, phase, ownerPid, ownerToken, attempt FROM session WHERE id=1').get());
      plan = validatePlan(JSON.parse(meta.plan), root);
      if (meta.ownerPid !== null) {
        let alive = true;
        try { process.kill(meta.ownerPid, 0); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false; else throw error; }
        // A reused live PID is conservatively refused; never kill or adopt it.
        if (alive) { db.exec('ROLLBACK'); return refusal(root, 'coordinator_active'); }
      }
      const uncertain = jobs(db).some(job => job.state === 'running') || meta.phase === 'recovery_required';
      const phase = uncertain ? 'recovery_required' : 'running';
      db.prepare('UPDATE session SET ownerPid=?, ownerToken=?, attempt=attempt+1, phase=? WHERE id=1').run(process.pid, token, phase);
      db.exec('COMMIT'); acquired = true;
      meta = { ...meta, attempt: meta.attempt + 1, phase };
    } catch (error) { try { db.exec('ROLLBACK'); } catch { /* transaction already ended */ } throw error; }
    attemptDir = path.join(root, `attempt-${meta.attempt}`);
    mkdirSync(attemptDir, { mode: 0o700 });
    const initialJobs = jobs(db);
    if (!('rounds' in plan.manifest)) throw new Error('Only round campaigns are durable');
    if (initialJobs.length !== plan.inputs.length * plan.manifest.rounds || initialJobs.some((job, index) => job.jobIndex !== index || job.caseIndex !== index % plan.inputs.length || job.round !== Math.floor(index / plan.inputs.length) + 1)) throw new Error('Durable job plan changed');
    for (const input of [...plan.inputs, ...plan.snapshots]) if (digest(input.path) !== input.hash) throw new Error('Captured input changed; do not resume');
    for (const job of initialJobs) if (job.state === 'complete') {
      if (!job.receiptPath || !job.receiptHash || !path.resolve(job.receiptPath).startsWith(root + path.sep) || digest(job.receiptPath) !== job.receiptHash) throw new Error('Completed evidence changed; do not resume');
      if (JSON.parse(readFileSync(job.receiptPath, 'utf8')).verdict !== job.verdict) throw new Error('Completed verdict no longer agrees with evidence');
    }
    if (meta.phase !== 'recovery_required') {
      const pending = initialJobs.filter(job => job.state === 'pending');
      let cursor = 0;
      async function worker() {
        while (cursor < pending.length && !signal?.aborted) {
          const job = pending[cursor++];
          // Commit admission before any trusted command can execute.
          db.prepare("UPDATE jobs SET state='running' WHERE jobIndex=? AND state='pending'").run(job.jobIndex);
          let verdict: Verdict, receiptPath: string;
          try {
            const input = path.join(root, `job-${job.jobIndex}.input.json`);
            save(input, { version: 1, cases: [plan.inputs[job.caseIndex].path], rounds: 1, concurrency: 1, resources: plan.manifest.resources });
            const result = await runCampaign(input, path.join(root, `job-${job.jobIndex}`));
            verdict = result.verdict; receiptPath = result.reportPath;
          } catch (error) {
            verdict = 'insufficient_evidence'; receiptPath = path.join(attemptDir!, `job-${job.jobIndex}-error.json`);
            save(receiptPath, { verdict, error: String(error) });
          }
          db.prepare("UPDATE jobs SET state='complete', verdict=?, receiptPath=?, receiptHash=? WHERE jobIndex=? AND state='running'").run(verdict, receiptPath, digest(receiptPath), job.jobIndex);
        }
      }
      const workers = await Promise.allSettled(Array.from({ length: Math.min(plan.manifest.concurrency, pending.length) }, () => worker()));
      for (const worker of workers) if (worker.status === 'rejected') throw worker.reason;
      const phase = jobs(db).every(job => job.state === 'complete') ? 'complete' : 'paused';
      db.prepare('UPDATE session SET phase=? WHERE id=1 AND ownerToken=?').run(phase, token);
      meta.phase = phase;
    }
    const rows = jobs(db);
    const verdict: Verdict = meta.phase !== 'complete' || rows.some(job => job.verdict === 'insufficient_evidence') ? 'insufficient_evidence'
      : rows.some(job => job.verdict === 'failed') ? 'failed' : 'passed';
    const reportPath = path.join(attemptDir, 'durable.json'), report = path.join(attemptDir, 'REPORT.md');
    const result = { verdict, proof: false, scope, sessionDir: root, databasePath: path.join(root, 'queue.sqlite'), reportPath, report,
      attempt: meta.attempt, phase: meta.phase,
      jobs: rows.map(({ receiptHash, ...job }) => job),
      counts: { pending: rows.filter(job => job.state === 'pending').length, running: rows.filter(job => job.state === 'running').length, complete: rows.filter(job => job.state === 'complete').length },
      nextAction: meta.phase === 'recovery_required' ? 'Ungraceful in-flight execution may still exist. No pending job was dispatched. Inspect owned execution and recover externally; automatic retry or forced adoption is not supported.'
        : meta.phase === 'paused' ? 'Active jobs drained and pending jobs are saved. Resume this session to dispatch only pending jobs; completed results remain immutable.'
        : 'All planned jobs have terminal receipts. Inspect each verdict; local hashes are integrity checks, not authenticated history or whole-app proof.' };
    save(reportPath, { version: 1, ...result });
    save(path.join(attemptDir, 'feedback.json'), result);
    writeFileSync(report, `# Local durable campaign\n\nVerdict: ${verdict}\n\nPhase: ${meta.phase}; attempt: ${meta.attempt}.\n\n${scope}\n\n| Job | Case | Round | State | Verdict | Private evidence |\n| --- | --- | --- | --- | --- | --- |\n${rows.map(job => `| ${job.jobIndex} | ${job.caseIndex} | ${job.round} | ${job.state} | ${job.verdict ?? 'unavailable'} | ${job.receiptPath ? `[receipt](${path.relative(attemptDir!, job.receiptPath)})` : 'none'} |`).join('\n')}\n\n${result.nextAction}\n`, { mode: 0o600, flag: 'wx' });
    return result;
  } catch (error) {
    let errorPath: string | undefined;
    if (acquired) {
      db.prepare("UPDATE session SET phase='recovery_required' WHERE id=1 AND ownerToken=?").run(token);
      if (attemptDir) { errorPath = path.join(attemptDir, 'storage-error.json'); save(errorPath, { error: String(error) }); }
    }
    return refusal(root, 'input_or_storage_unavailable', errorPath);
  } finally {
    if (acquired) db.prepare('UPDATE session SET ownerPid=NULL, ownerToken=NULL WHERE id=1 AND ownerToken=?').run(token);
  }
}

/** Count-only isolated durable stage; normal campaigns do not require node:sqlite. */
export async function startDurableCampaign(specPath: string, outputDirectory: string, signal?: AbortSignal) {
  const root = path.resolve(outputDirectory);
  mkdirSync(path.dirname(root), { recursive: true, mode: 0o700 }); mkdirSync(root, { mode: 0o700 });
  let db: DatabaseSync | undefined;
  try {
    const manifest = campaignSchema.parse(readWorkflowJson(path.resolve(specPath)));
    if (!('rounds' in manifest) || manifest.state) throw new Error('Durable mode currently requires round-based isolated state');
    save(path.join(root, 'declaration.json'), manifest);
    const files = captureCampaignWorkflows(manifest.cases, specPath, root);
    const snapshots = files.flatMap(file => {
      const workflow = workflowSchema.parse(readWorkflowJson(file));
      return workflow.dependency.start.kind === 'snapshot' ? [{ path: workflow.dependency.start.path, hash: digest(workflow.dependency.start.path) }] : [];
    });
    const plan: Plan = { version: 1, kind: 'praman-local-campaign', root, manifest, inputs: files.map(file => ({ path: file, hash: digest(file) })), snapshots };
    // Optional runtime boundary: static loading would break unrelated commands on Node versions without node:sqlite.
    const { DatabaseSync }: typeof Sqlite = requireBuiltin('node:sqlite');
    const file = path.join(root, 'queue.sqlite'); closeSync(openSync(file, 'wx', 0o600));
    db = new DatabaseSync(file); db.exec('PRAGMA busy_timeout=1000; PRAGMA synchronous=FULL;');
    db.exec(`CREATE TABLE session(id INTEGER PRIMARY KEY CHECK(id=1), plan TEXT NOT NULL, phase TEXT NOT NULL, ownerPid INTEGER, ownerToken TEXT, attempt INTEGER NOT NULL);
      CREATE TABLE jobs(jobIndex INTEGER PRIMARY KEY, caseIndex INTEGER NOT NULL, round INTEGER NOT NULL, state TEXT NOT NULL, verdict TEXT, receiptPath TEXT, receiptHash TEXT);`);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("INSERT INTO session VALUES (1, ?, 'ready', NULL, NULL, 0)").run(JSON.stringify(plan));
      const insert = db.prepare("INSERT INTO jobs(jobIndex,caseIndex,round,state) VALUES (?,?,?,'pending')");
      for (let index = 0; index < manifest.cases.length * manifest.rounds; index++) insert.run(index, index % manifest.cases.length, Math.floor(index / manifest.cases.length) + 1);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return await coordinate(db, root, signal);
  } catch (error) {
    const errorPath = path.join(root, 'input-error.json'); save(errorPath, { error: String(error) });
    return refusal(root, 'input_or_runtime_unavailable', errorPath);
  }
  finally { db?.close(); }
}

export async function resumeDurableCampaign(outputDirectory: string, signal?: AbortSignal) {
  const root = path.resolve(outputDirectory);
  let db: DatabaseSync | undefined;
  try {
    const file = path.join(root, 'queue.sqlite');
    const info = statSync(file);
    if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error('Invalid durable queue');
    // Optional runtime boundary: normal campaigns must load even when node:sqlite is unavailable.
    const { DatabaseSync }: typeof Sqlite = requireBuiltin('node:sqlite');
    db = new DatabaseSync(file); db.exec('PRAGMA busy_timeout=1000; PRAGMA synchronous=FULL;');
    return await coordinate(db, root, signal);
  } catch { return refusal(root, 'input_or_runtime_unavailable'); }
  finally { db?.close(); }
}
