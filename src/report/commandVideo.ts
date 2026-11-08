import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, statSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright';
import { z } from 'zod';
import { codeStorySchema } from '../case/change.js';
import { executeCommand, type CommandRun, type CommandSpec } from '../eval/command.js';
import { selectCodeExcerpts } from './codeExcerpts.js';
import { showWalkthroughOverlay, type FocusEvidence } from './spotlight.js';
import { sceneFramingSchema, type SceneFraming } from '../case/framing.js';
import { shortCompositionSchema, composeWalkthrough, compositionManifest, enforceCompositionDuration, type VideoCut } from '../case/composition.js';
import { configuredSpeech, prepareSpeech } from './speech.js';

const terminalBeat = z.object({ text: z.string().min(1).max(600).refine(value => value.trim().length > 0, 'Narration must contain non-whitespace text'), shortText: z.string().min(1).max(600).refine(value => value.trim().length > 0, 'Narration must contain non-whitespace text').optional(), stream: z.enum(['stdout', 'stderr']), from: z.number().int().positive(), to: z.number().int().positive(), framing: sceneFramingSchema.optional() }).strict()
  .refine(beat => beat.to >= beat.from && beat.to <= 14, 'Focus must fit the fourteen-line terminal viewport');
export const commandVideoPlanSchema = z.object({
  commandsPath: z.string().min(1), diffPath: z.string().min(1).optional(),
  walkthrough: z.object({ before: z.array(terminalBeat).min(1).optional(), code: codeStorySchema.optional(), after: z.array(terminalBeat).min(1), short: shortCompositionSchema.optional() }).strict(),
}).strict().superRefine((plan, ctx) => {
  const code = plan.walkthrough.code;
  if (plan.diffPath && (!code?.excerpts?.length || !code?.beats?.length || code.beats.some(beat => !beat.focus))) ctx.addIssue({ code: 'custom', message: 'Source-change video requires exact excerpts and focused code beats.' });
  if (!plan.diffPath && code?.excerpts) ctx.addIssue({ code: 'custom', message: 'Code excerpts require a real diff.' });
  for (const beat of code?.beats ?? []) if (beat.focus && !code?.excerpts?.some(excerpt => excerpt.file === beat.focus!.file && excerpt.side === beat.focus!.side && excerpt.from <= beat.focus!.from && excerpt.to >= beat.focus!.to)) ctx.addIssue({ code: 'custom', message: 'Every source focus must be contained in a declared excerpt.' });
});
export type CommandVideoPlan = z.infer<typeof commandVideoPlanSchema>;
export interface CommandReplay { stage: 'before' | 'current'; run: CommandRun; reference: CommandRun; command: CommandSpec['current'] }
interface Note { text: string; audio: string; duration: number; stage: string; speech?: { key: string; status: 'generated' | 'reused'; receipt: string }; start?: number; end?: number; focus?: FocusEvidence; screenshot?: string }
const require = createRequire(import.meta.url);
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function measure(file: string) { return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }).trim()); }
function stamp(seconds: number) { const ms = Math.round(seconds * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; }
function privateJson(file: string, value: unknown) { writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 }); }
const style = `*{box-sizing:border-box}body{margin:0;padding:40px 48px;background:#101827;color:#f8fafc;font:24px Arial}h1{font-size:34px;font-weight:500;margin:0 0 16px}p{margin:12px 0;color:#a8b5c8;font-size:20px}#surface{border:1px solid #ffffff40;border-radius:12px;padding:22px;background:#0b1220}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:22px/1.5 monospace;margin:12px 0}table{border-collapse:collapse;width:100%;font:27px/1.5 monospace;table-layout:fixed}td{white-space:pre-wrap;overflow-wrap:anywhere;padding:3px 12px;vertical-align:top}td:first-child{width:110px;white-space:nowrap;text-align:right;color:#94a3b8}.changed{background:#164e3860}footer{margin-top:18px;color:#94a3b8;font-size:18px}`;

/** Real command execution and layout inspection only; never final replay evidence. */
export async function preflightCommandWalkthrough(plan: CommandVideoPlan, spec: CommandSpec, outputDirectory: string, cut: VideoCut = 'full', signal?: AbortSignal) {
  mkdirSync(path.dirname(outputDirectory), { recursive: true, mode: 0o700 });
  mkdirSync(outputDirectory, { mode: 0o700 });
  try {
    return await renderCommandWalkthrough(plan, spec, outputDirectory, async stage => {
      const command = spec[stage];
      if (!command) throw new Error('Story preflight requested an undeclared command stage.');
      const run = await executeCommand(spec, command, path.join(outputDirectory, `execution-${stage}`), undefined, signal);
      if (run.status !== 'exited' || run.verdict === 'insufficient_evidence') throw new Error('Story preflight command execution/evidence unavailable.');
      return { stage, command, run, reference: run };
    }, true, cut);
  } catch (error) {
    const receipt = path.join(outputDirectory, 'preflight.json');
    if (!existsSync(receipt)) privateJson(receipt, { kind: 'story-preflight', proof: false, status: 'blocked', error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/** Live commands rendered from captured pipe streams in xterm; not a native TTY recording. */
export async function recordCommandWalkthrough(plan: CommandVideoPlan, spec: CommandSpec, outDir: string, replay: (stage: 'before' | 'current') => Promise<CommandReplay>, cut: VideoCut = 'full', signal?: AbortSignal): Promise<string> {
  if (existsSync(path.join(outDir, 'demo.mp4')) || existsSync(path.join(outDir, 'video'))) throw new Error('Recording output already exists; choose a fresh directory.');
  await preflightCommandWalkthrough(plan, spec, path.join(outDir, 'video', 'preflight'), cut, signal);
  if (signal?.aborted) throw new Error('Recording interrupted before capture.');
  return renderCommandWalkthrough(plan, spec, outDir, replay, false, cut);
}

async function renderCommandWalkthrough(originalPlan: CommandVideoPlan, spec: CommandSpec, outDir: string, replay: (stage: 'before' | 'current') => Promise<CommandReplay>, preflight: boolean, cut: VideoCut): Promise<string> {
  const composition = compositionManifest(originalPlan.walkthrough, spec.mode, cut);
  const plan = { ...originalPlan, walkthrough: composeWalkthrough(originalPlan.walkthrough, spec.mode, cut) };
  const dir = preflight ? outDir : path.join(outDir, 'video'), movie = path.join(outDir, 'demo.mp4');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const speech = preflight ? undefined : configuredSpeech();
  if (!preflight) for (const binary of ['ffmpeg', 'ffprobe']) if (spawnSync(binary, ['-version'], { stdio: 'ignore' }).status !== 0) throw new Error(`Command video requires ${binary}.`);
  const diff = plan.diffPath ? readFileSync(plan.diffPath, 'utf8') : '';
  const excerpts = plan.diffPath ? selectCodeExcerpts(diff, plan.walkthrough.code?.excerpts) : [];
  if (plan.diffPath) writeFileSync(path.join(dir, 'change.diff'), diff, { mode: 0o600 });
  const codeStory = plan.walkthrough.code;
  const codeBeats = codeStory?.beats ?? (codeStory ? [{ text: codeStory.text }] : []);
  const notes: Note[] = [];
  function prepare(text: string, stage: string): Note {
    if (preflight) {
      const note = { text, stage, audio: '', duration: 0 };
      notes.push(note);
      return note;
    }
    const stem = path.join(dir, `note-${String(notes.length + 1).padStart(3, '0')}`);
    const asset = prepareSpeech(text, stem, speech);
    const note = { text, audio: asset.audio, stage, duration: asset.seconds + 0.65,
      speech: { key: asset.key, status: asset.status, receipt: stem + '.speech.json' } };
    notes.push(note); return note;
  }
  const beforeNotes = (plan.walkthrough.before ?? []).map(beat => prepare(beat.text, spec.mode === 'repair' ? 'Original' : `${spec.baselineKind} baseline`));
  const codeNotes = codeBeats.map(beat => prepare(beat.text, 'The change'));
  const afterNotes = plan.walkthrough.after.map(beat => prepare(beat.text, spec.mode === 'repair' ? 'Updated' : 'Current requirements'));
  if (!preflight) enforceCompositionDuration(originalPlan.walkthrough, spec.mode, cut, notes.reduce((sum, note) => sum + note.duration, 0));
  const xtermJs = require.resolve('@xterm/xterm');
  const xtermCss = path.resolve(path.dirname(xtermJs), '../css/xterm.css');
  let position: { stage?: string; beat?: number } = {};
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 },
      ...(preflight ? {} : { recordVideo: { dir: path.join(dir, 'raw'), size: { width: 1600, height: 900 } } }) });
    const page = await ctx.newPage(), handle = page.video();
    const recordingStartedAt = Date.now();
    let origin = 0;
    const replays: CommandReplay[] = [];
    async function narrate(note: Note, selector: string, framing?: SceneFraming) {
      note.focus = await showWalkthroughOverlay(page, { stage: note.stage, text: note.text, voice: true, selector, framing });
      if (!origin) origin = Date.now();
      note.start = (Date.now() - origin) / 1000;
      note.screenshot = path.join(dir, `scene-${String(notes.indexOf(note) + 1).padStart(2, '0')}.png`);
      await page.screenshot({ path: note.screenshot });
      if (!preflight) await page.waitForTimeout(note.duration * 1000);
      note.end = (Date.now() - origin) / 1000;
    }
    async function terminal(stage: 'before' | 'current', beats: CommandVideoPlan['walkthrough']['after'], phaseNotes: Note[]) {
      position = { stage };
      const label = spec.mode === 'repair' ? stage === 'before' ? 'Before the repair' : 'Same action, repaired' : stage === 'before' ? `${spec.baselineKind} baseline · comparison, not historical repair` : 'Current requirements · no repair claim';
      await page.setContent(`<!doctype html><html><head><style>${style}</style></head><body><h1>${escape(label)}</h1><p>Browser-hosted terminal · real command output from pipes · not native terminal capture</p><section id="surface"><pre id="invocation"></pre><pre id="input"></pre><div id="terminal"></div></section><footer id="status">Running the declared command now…</footer></body></html>`);
      const result = await replay(stage); replays.push(result);
      const display = path.basename(result.command.executable) + result.command.args.map(arg => ' ' + JSON.stringify(arg)).join('');
      if (display.length > 220 || (result.command.stdin?.length ?? 0) > 260) throw new Error('Command/input is too long for a readable terminal scene. Use a short declared input file or expression.');
      await page.locator('#invocation').evaluate((el, text) => { el.textContent = '$ ' + text; }, display);
      await page.locator('#input').evaluate((el, text) => { el.textContent = text ? 'stdin: ' + text.trimEnd() : ''; }, result.command.stdin ?? '');
      await page.addStyleTag({ path: xtermCss }); await page.addScriptTag({ path: xtermJs });
      for (const [i, beat] of beats.entries()) {
        position = { stage, beat: composition.selectedBeats.filter(ref => ref.stage === (stage === 'before' ? 'before' : 'after'))[i].beat };
        const file = result.run[beat.stream];
        if (statSync(file).size > 1024 * 1024) throw new Error('Terminal presentation is limited to 1 MiB; full output remains private evidence.');
        const output = readFileSync(file, 'utf8');
        // Keep browser-only globals in the page runtime, as in the shared spotlight renderer.
        const rendered = z.object({ lines: z.array(z.string()) }).parse(await page.evaluate(`(async () => {
          const terminalKey = Symbol.for('praman.command.terminal');
          window[terminalKey]?.dispose(); document.querySelector('#terminal').replaceChildren();
          const term = new window.Terminal({ cols: 96, rows: 14, fontFamily: 'Menlo, monospace', fontSize: 24, lineHeight: 1.25, convertEol: true, scrollback: 10000, theme: { background: '#0b1220', foreground: '#f1f5f9' }, disableStdin: true });
          window[terminalKey] = term; term.open(document.querySelector('#terminal'));
          const written = Promise.withResolvers();
          term.write(${JSON.stringify(output)}, written.resolve); await written.promise;
          term.scrollToTop();
          const buffer = term.buffer.active;
          const lines = Array.from({ length: buffer.length }, (_, index) => buffer.getLine(index)?.translateToString(true) ?? '');
          const last = lines.reduce((end, line, index) => line ? index + 1 : end, 0);
          term.resize(96, Math.min(14, Math.max(5, last + 1)));
          term.scrollToTop();
          const painted = Promise.withResolvers();
          requestAnimationFrame(() => requestAnimationFrame(painted.resolve)); await painted.promise;
          const rows = [...document.querySelectorAll('.xterm-rows > div')];
          rows.forEach((row, index) => row.setAttribute('data-terminal-line', String(index + 1)));
          return { lines };
        })()`));
        // Long output and wrapping must be authored differently, never hidden below the fold.
        const meaningfulLines = rendered.lines.reduce((last, line, index) => line ? index + 1 : last, 0);
        if (meaningfulLines > 14 || beat.to > meaningfulLines) throw new Error('Terminal output/focus does not fit fourteen visible lines; choose a bounded command.');
        writeFileSync(path.join(dir, `terminal-${stage}-${beat.stream}.txt`), rendered.lines.join('\n'), { mode: 0o600 });
        await page.locator('#status').evaluate((el, text) => { el.textContent = text; }, `${beat.stream} · exit ${result.run.code} · ${preflight ? 'story preflight only; not final proof replay' : 'exact proof replay matched'}`);
        const selector = Array.from({ length: beat.to - beat.from + 1 }, (_, n) => `[data-terminal-line="${beat.from + n}"]`).join(',');
        if (await page.locator('#surface').evaluate(el => el.getBoundingClientRect().bottom > 740)) throw new Error('Terminal surface overlaps captions.');
        await narrate(phaseNotes[i], selector, beat.framing);
      }
    }
    if (spec.mode !== 'acceptance') await terminal('before', plan.walkthrough.before!, beforeNotes);
    for (const [i, beat] of codeBeats.entries()) {
      position = { stage: 'code', beat: composition.selectedBeats.filter(ref => ref.stage === 'code')[i].beat };
      const f = beat.focus;
      const excerpt = f ? excerpts.find(e => e.file === f.file && e.side === f.side && e.lines.some(l => l.number === f.from) && e.lines.some(l => l.number === f.to)) : undefined;
      if (f && !excerpt) throw new Error('Source focus is not present in the supplied diff.');
      const lines = excerpt?.lines.filter(l => l.number! >= f!.from && l.number! <= f!.to) ?? [];
      await page.setContent(`<!doctype html><html><head><style>${style}</style></head><body><h1>${escape(codeStory!.title ?? (spec.mode === 'repair' ? 'Why the repair works' : 'The supplied change'))}</h1><section id="surface">${excerpt ? `<p>${escape(excerpt.file)} · ${excerpt.side === 'before' ? 'Before' : 'After'} the change · ${escape(excerpt.label)}</p><table>${lines.map(l => `<tr class="${l.changed ? 'changed' : ''}"><td>${l.number}</td><td>${escape(l.code)}</td></tr>`).join('')}</table>` : `<pre>${escape(codeStory!.text)}</pre>`}</section><footer>${excerpt ? 'Actual supplied source · full patch retained · not signed build provenance' : 'Author-supplied explanation · no independently verified source diff'}</footer></body></html>`);
      if (await page.locator('footer').evaluate(el => el.getBoundingClientRect().bottom > 720)) throw new Error('Source focus does not fit; split into smaller beats.');
      await narrate(codeNotes[i], '#surface', beat.framing);
    }
    await terminal('current', plan.walkthrough.after, afterNotes);
    position = {};
    const recordingEndedAt = Date.now();
    await ctx.close();
    if (preflight) {
      const receipt = path.join(dir, 'preflight.json');
      privateJson(receipt, { kind: 'story-preflight', proof: false, status: 'passed', mode: spec.mode, composition, position,
        scenes: [{ stage: 'before', notes: beforeNotes }, { stage: 'code', notes: codeNotes }, { stage: 'current', notes: afterNotes }]
          .flatMap(({ stage, notes }) => notes.map(({ audio, duration, ...scene }, beat) => ({ ...scene, stage, beat: composition.selectedBeats.filter(ref => ref.stage === (stage === 'current' ? 'after' : stage))[beat].beat }))),
        scope: 'No speech or video; commands execute. Layout checks are not final replay proof or human presentation review.' });
      return receipt;
    }
    const rawVideo = await handle!.path(), rawDuration = measure(rawVideo);
    const rawOrigin = Math.max(recordingStartedAt, recordingEndedAt - rawDuration * 1000);
    const trim = Math.max(0, (origin - rawOrigin) / 1000);
    const duration = Math.max(...notes.map(n => n.end!));
    const filters = notes.map((note, i) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(note.start! * 1000)}|${Math.round(note.start! * 1000)}[n${i}]`);
    filters.push(notes.map((_, i) => `[n${i}]`).join('') + `amix=inputs=${notes.length}:normalize=0,apad[a]`);
    const staging = path.join(dir, 'encoded.mp4');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(trim), '-i', rawVideo, ...notes.flatMap(note => ['-i', note.audio]), '-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[a]', '-vf', 'tpad=stop_mode=clone:stop_duration=2,fps=30,format=yuv420p', '-t', String(duration), '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', staging], { stdio: 'pipe' });
    // Publish only a completely decodable audio/video artifact.
    execFileSync('ffmpeg', ['-v', 'error', '-i', staging, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], { stdio: 'pipe' });
    enforceCompositionDuration(originalPlan.walkthrough, spec.mode, cut, measure(staging));
    renameSync(staging, movie);
    writeFileSync(path.join(dir, 'captions.vtt'), 'WEBVTT\n\n' + notes.map((note, i) => `${i + 1}\n${stamp(note.start!)} --> ${stamp(note.end!)}\n${escape(note.text)}\n`).join('\n'), { mode: 0o600 });
    writeFileSync(path.join(dir, 'narration.txt'), notes.map(note => note.text).join('\n\n'), { mode: 0o600 });
    privateJson(path.join(dir, 'tour.json'), { kind: 'proof-gated-command-replay', mode: spec.mode, baselineKind: spec.baselineKind, composition, specHash: createHash('sha256').update(JSON.stringify(spec)).digest('hex'), surface: 'xterm.js browser-hosted terminal rendering of pipe output; not native TTY capture', speech, renderer: { package: '@xterm/xterm', scriptSha256: createHash('sha256').update(readFileSync(xtermJs)).digest('hex') }, diff: plan.diffPath ? { path: plan.diffPath, sha256: createHash('sha256').update(diff).digest('hex') } : null, rawVideo, recordingStartedAt, recordingEndedAt, trimStart: trim, duration: measure(movie), timeline: notes, replays });
    return movie;
  } catch (error) {
    rmSync(movie, { force: true });
    privateJson(path.join(dir, preflight ? 'preflight.json' : 'recording-failure.json'), { position, ...(preflight ? { kind: 'story-preflight', proof: false, status: 'blocked' } : {}), error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally { await browser.close(); }
}
