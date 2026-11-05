import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { changeSpecSchema, type ChangeSpec, type ChangeProof, type ScenarioRun, type CodeStory } from '../case/change.js';
import { assessProof, captureScenarioIdentity, hashSpec, executeScenario } from '../eval/change.js';
import { selectCodeExcerpts, type CodeExcerpt } from './codeExcerpts.js';
import { showWalkthroughOverlay, splitNarration, type FocusEvidence } from './spotlight.js';
import { sameIdentity } from '../eval/identity.js';
import type { SceneFraming } from '../case/framing.js';
import { composeWalkthrough, compositionManifest, enforceCompositionDuration, type VideoCut } from '../case/composition.js';
import { configuredSpeech, prepareSpeech } from './speech.js';

interface Note { text: string; audio: string; duration: number; speech: { key: string; status: 'generated' | 'reused'; receipt: string }; at?: number; focus?: FocusEvidence }
interface Recording { stage: string; video: string; startedAt: number; presentedAt: number; endedAt: number; notes: Note[] }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function timestamp(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

async function renderCodeScene(page: Page, spec: ChangeSpec, excerpts: CodeExcerpt[], beat: NonNullable<CodeStory['beats']>[number]) {
  const codeStory = spec.walkthrough!.code!;
  const focus = beat.focus;
  const excerpt = focus ? excerpts.find(item => item.file === focus.file && item.side === focus.side
    && item.lines.some(line => line.number === focus.from) && item.lines.some(line => line.number === focus.to)) : undefined;
  if (focus && !excerpt) throw new Error('The narrated code focus is not present in the displayed source.');
  const lines = excerpt?.lines.filter(line => line.number !== null && line.number >= focus!.from && line.number <= focus!.to) ?? [];
  await page.setContent(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>
    *{box-sizing:border-box}body{margin:0;padding:36px 42px;background:#101827;color:#f9fafb;font:20px Arial}h1{font-size:30px;font-weight:500;margin:0 0 20px}.excerpt{border:1px solid #ffffff35;border-radius:10px;overflow:hidden}h2{font:22px Arial;margin:0;padding:16px 20px}p{margin:0;padding:0 20px 16px;font:16px monospace;color:#94a3b8}table{width:100%;border-collapse:collapse;table-layout:fixed;font:22px/1.45 monospace;tab-size:2}td{vertical-align:top;padding:3px 12px;white-space:pre-wrap;overflow-wrap:anywhere}td:first-child{width:64px;white-space:nowrap;color:#94a3b8;text-align:right}.before .changed{background:#4c1d2480;color:#fda4af}.after .changed{background:#103d2980;color:#86efac}footer{margin-top:18px;color:#94a3b8;font-size:14px}
    </style></head><body><h1>${escapeHtml(codeStory.title ?? (spec.mode === 'repair' ? 'Why this change fixes the problem' : 'The supplied change'))}</h1>${excerpt ? `<section id="code-focus" class="excerpt ${excerpt.side}"><h2>${escapeHtml(excerpt.label)}</h2><p>${escapeHtml(excerpt.file)} · ${excerpt.side === 'before' ? 'Before the change' : 'After the change'}</p><table>${lines.map(line => `<tr class="${line.changed ? 'changed' : ''}"><td>${line.number}</td><td>${escapeHtml(line.code)}</td></tr>`).join('')}</table></section>` : `<section id="code-focus"><p>${escapeHtml(codeStory.text)}</p></section>`}<footer>${spec.diffPath ? 'Actual source excerpt · complete patch retained with the evidence' : 'Author-supplied explanation · no source diff supplied'}</footer></body></html>`);
  if (await page.locator('footer').evaluate(element => element.getBoundingClientRect().bottom > 530)) throw new Error('Code focus does not fit the walkthrough frame. Split the explanation into smaller focused beats.');
}

/** Executes real authored actions, but never records video, generates speech or authorizes delivery. */
export async function preflightChangeWalkthrough(input: ChangeSpec, outputDirectory: string, cut: VideoCut = 'full') {
  const spec = changeSpecSchema.parse(input);
  const composition = spec.walkthrough ? compositionManifest(spec.walkthrough, spec.mode, cut) : undefined;
  const dir = resolve(outputDirectory);
  mkdirSync(dir, { mode: 0o700 });
  const scenes: Array<{ stage: string; step?: number; at?: string; beat: number; chunk: number; screenshot: string; focus?: FocusEvidence }> = [];
  let position: { stage: string; step?: number; at?: string; beat?: number; chunk?: number } = { stage: 'story' };
  const receipt = (status: 'passed' | 'blocked', error?: string) => {
    const result = { kind: 'story-preflight', proof: false, specHash: hashSpec(spec), composition, status, position, scenes,
      scope: 'No speech or video; real authored actions execute. Layout checks are not final replay proof or human presentation review.', ...(error ? { error } : {}) };
    writeFileSync(join(dir, 'preflight.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    return result;
  };
  try {
    const story = spec.walkthrough ? composeWalkthrough(spec.walkthrough, spec.mode, cut) : undefined;
    if (!story) throw new Error('Recording requires an authored walkthrough.');
    if (spec.diffPath && (!story.code?.excerpts?.length || !story.code.beats?.length || story.code.beats.some(beat => !beat.focus))) {
      throw new Error('A source-change video requires explicit excerpts and focused code beats.');
    }
    const excerpts = spec.diffPath ? selectCodeExcerpts(readFileSync(resolve(spec.diffPath), 'utf8'), story.code?.excerpts) : [];
    async function inspect(page: Page, text: string, selector?: string, framing?: SceneFraming) {
      for (const [chunk, part] of splitNarration(text).entries()) {
        position = { ...position, chunk };
        const focus = await showWalkthroughOverlay(page, { stage: position.stage, text: part, voice: true, selector, framing });
        const screenshot = join(dir, `scene-${String(scenes.length + 1).padStart(3, '0')}.png`);
        await page.screenshot({ path: screenshot });
        scenes.push({ ...position, beat: position.beat!, chunk, screenshot, focus });
      }
    }
    async function workflow(version: 'before' | 'current') {
      const stage = version === 'before' ? 'before' : 'after';
      const beats = story![stage]!;
      position = { stage };
      async function inspectBeats(page: Page, step: number, at: 'before' | 'after') {
        for (const [beat, row] of beats.entries()) if (row.step === step && row.at === at) {
          position = { stage, step, at, beat: composition!.selectedBeats.filter(ref => ref.stage === stage)[beat].beat };
          await inspect(page, row.text, row.selector, row.framing);
        }
      }
      const run = await executeScenario(spec, version === 'before' ? spec.beforeUrl! : spec.afterUrl, join(dir, version), {
        version,
        beforeStep: async (page, _row, step) => {
          position = { stage, step, at: 'before' };
          await page.evaluate(`window[Symbol.for('praman.walkthrough.overlay')]?.remove()`);
          await inspectBeats(page, step, 'before');
          position = { stage, step };
        },
        afterStep: async (page, _row, step) => {
          position = { stage, step, at: 'after' };
          await inspectBeats(page, step, 'after');
          position = { stage, step };
        },
      });
      if (run.error || run.completedSteps !== spec.steps.length || run.checks.some(check => check.verdict === 'insufficient_evidence')) {
        throw new Error(run.error ?? 'Story preflight execution/check evidence unavailable.');
      }
    }
    if (spec.mode !== 'acceptance') await workflow('before');
    if (story.code) {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        for (const [beat, row] of (story.code.beats ?? [{ text: story.code.text }]).entries()) {
          position = { stage: 'code', beat: composition!.selectedBeats.filter(ref => ref.stage === 'code')[beat].beat };
          await renderCodeScene(page, spec, excerpts, row);
          await inspect(page, row.text, '#code-focus', row.framing);
        }
      } finally { await browser.close(); }
    }
    await workflow('current');
    return receipt('passed');
  } catch (error) {
    receipt('blocked', error instanceof Error ? error.message : String(error));
    throw new Error(`Story preflight blocked; inspect private ${join(dir, 'preflight.json')}.`);
  }
}

export async function recordChangeWalkthrough(spec: ChangeSpec, proof: ChangeProof, outDir: string, cut: VideoCut = 'full'): Promise<string> {
  const vdir = resolve(outDir, 'video');
  const outPath = resolve(outDir, 'demo.mp4');
  if (existsSync(outPath) || existsSync(vdir)) throw new Error('Recording output already exists; choose a fresh recording directory.');
  if (proof.mode !== spec.mode || proof.baselineKind !== spec.baselineKind || proof.specHash !== hashSpec(spec) || proof.verdict !== 'passed' || assessProof(spec, proof.before, proof.after).verdict !== 'passed') {
    throw new Error('Recording blocked: matching mode-specific proof and repeated current success are required.');
  }
  if (!sameIdentity(captureScenarioIdentity(spec), proof.after[0]?.identityBefore)) throw new Error('Recording blocked: declared browser execution identity changed since verification.');
  mkdirSync(vdir, { mode: 0o700 });
  const story = spec.walkthrough ? composeWalkthrough(spec.walkthrough, spec.mode, cut) : undefined;
  if (!story || (spec.diffPath && (!story.code?.excerpts?.length || !story.code?.beats?.length || story.code.beats.some(beat => !beat.focus)))) {
    const message = !story
      ? 'Recording requires an authored mode-appropriate walkthrough of the requirements, stakes, observed outcome and limits. See docs/video-guidelines.md.'
      : 'A source-change video requires explicit excerpts and a focused code beat for each explanation. See docs/video-guidelines.md.';
    writeFileSync(join(vdir, 'recording-failure.json'), JSON.stringify({ error: message, specHash: proof.specHash }, null, 2), { mode: 0o600 });
    throw new Error(message);
  }
  const composition = compositionManifest(spec.walkthrough!, spec.mode, cut);
  try { await preflightChangeWalkthrough(spec, join(vdir, 'preflight'), cut); }
  catch (error) {
    writeFileSync(join(vdir, 'recording-failure.json'), JSON.stringify({ error: error instanceof Error ? error.message : String(error), specHash: proof.specHash }, null, 2), { mode: 0o600 });
    throw error;
  }
  for (const bin of ['ffmpeg', 'ffprobe']) {
    const check = spawnSync(bin, ['-version'], { stdio: 'ignore' });
    if (check.error || check.status !== 0) throw new Error(`Live walkthrough requires ${bin} on PATH.`);
  }
  const speech = configuredSpeech();
  const notes: Note[] = [];
  let position: { stage?: 'before' | 'current' | 'code'; step?: number; beat?: number } = {};
  function prepare(value: string): Note[] {
    const group: Note[] = [];
    for (const text of splitNarration(value)) {
      const stem = join(vdir, `note-${String(notes.length + 1).padStart(3, '0')}`);
      const asset = prepareSpeech(text, stem, speech);
      const note: Note = { text, audio: asset.audio, duration: Math.max(3, asset.seconds + 0.5),
        speech: { key: asset.key, status: asset.status, receipt: stem + '.speech.json' } };
      notes.push(note); group.push(note);
    }
    enforceCompositionDuration(spec.walkthrough!, spec.mode, cut, notes.reduce((total, note) => total + note.duration, 0));
    return group;
  }
  async function overlay(page: Page, stage: string, note: Note, selector?: string, framing?: SceneFraming) {
    note.focus = await showWalkthroughOverlay(page, { stage, text: note.text, voice: true, selector, framing });
  }
  async function hold(page: Page, note: Note) {
    await page.waitForTimeout(Math.max(0, (note.at ?? Date.now()) + note.duration * 1000 - Date.now()));
  }
  async function replay(version: 'before' | 'current', url: string, reference: ScenarioRun, story: NonNullable<ChangeSpec['walkthrough']>): Promise<Recording> {
    position = { stage: version };
    const stage = version === 'before' ? (spec.mode === 'repair' ? 'Original' : `${spec.baselineKind} baseline`) : (spec.mode === 'repair' ? 'Updated' : 'Current requirements');
    const startStep = story.startStep;
    const beats = story[version === 'before' ? 'before' : 'after']!;
    const prepared = beats.map(beat => ({ ...beat, notes: prepare(beat.text) }));
    const phaseNotes: Note[] = [];
    let presentedAt: number | undefined;
    async function narrate(page: Page, step: number, at: 'before' | 'after') {
      for (const [beatIndex, beat] of prepared.entries()) if (beat.step === step && beat.at === at) {
        position = { stage: version, step, beat: composition.selectedBeats.filter(ref => ref.stage === (version === 'before' ? 'before' : 'after'))[beatIndex].beat };
        for (const note of beat.notes) {
          await overlay(page, stage, note, beat.selector, beat.framing);
          note.at = Date.now(); phaseNotes.push(note);
          await hold(page, note);
        }
      }
    }
    const run = await executeScenario(spec, url, join(vdir, version), {
      record: true, version, expectedIdentity: reference.identityBefore,
      beforeStep: async (page, _step, i) => {
        position = { stage: version, step: i };
        if (i < startStep) return;
        // Setup is still executed and checked. Only its footage is trimmed from the finished story.
        if (i === startStep) presentedAt = Date.now();
        await page.evaluate(`window[Symbol.for('praman.walkthrough.overlay')]?.remove()`);
        await narrate(page, i, 'before');
        position = { stage: version, step: i };
      },
      afterStep: async (page, _step, i) => {
        position = { stage: version, step: i };
        if (i < startStep) return;
        await narrate(page, i, 'after');
        position = { stage: version, step: i };
      },
      afterChecks: async (page, checks) => {
        position = { stage: version };
        const matches = !checks.some(check => {
          const old = reference.checks.find(row => row.id === check.id);
          return !old || old.verdict !== check.verdict || JSON.stringify(old.observed) !== JSON.stringify(check.observed);
        }) && checks.length === reference.checks.length;
        if (!matches) throw new Error('Recording replay diverged from verified acceptance evidence.');
        await page.waitForTimeout(800);
      },
    });
    if (!sameIdentity(run.identityBefore, reference.identityBefore) || !sameIdentity(run.identityAfter, reference.identityBefore) || run.error || run.verdict !== reference.verdict || !run.video || !run.recordingStartedAt || !run.recordingEndedAt || !presentedAt) {
      throw new Error(`Recording replay invalid for ${stage}: ${run.error ?? run.verdict}. No success demo published.`);
    }
    return { stage, video: run.video, startedAt: run.recordingStartedAt, presentedAt, endedAt: run.recordingEndedAt, notes: phaseNotes };
  }
  let diff: { path: string; sha256: string } | undefined;
  try {
    const source = spec.diffPath ? readFileSync(resolve(spec.diffPath), 'utf8') : '';
    if (spec.diffPath) {
      if (!/^@@ .*@@/m.test(source) || !/^--- /m.test(source) || !/^\+\+\+ /m.test(source)) throw new Error('Code walkthrough requires a real unified diff with file and hunk headers.');
      diff = { path: resolve(spec.diffPath), sha256: createHash('sha256').update(source).digest('hex') };
      writeFileSync(join(vdir, 'change.diff'), source);
    }
    const codeStory = story.code;
    const excerpts = spec.diffPath ? selectCodeExcerpts(source, codeStory?.excerpts) : [];
    const codeBeats = (codeStory?.beats ?? (codeStory ? [{ text: codeStory.text }] : [])).map(beat => ({ ...beat, notes: prepare(beat.text) }));
    // ALL these live captures happen after proof and presentation preflight.
    const recordings: Recording[] = [];
    if (spec.mode !== 'acceptance') recordings.push(await replay('before', spec.beforeUrl!, proof.before!, story));
    const current = await replay('current', spec.afterUrl, proof.after[0], story);
    position = {};
    if (codeStory) {
      const browser = await chromium.launch({ headless: true });
      try {
        const ctx = await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:join(vdir,'code'),size:{width:1280,height:720}}});
        const startedAt = Date.now();
        const page = await ctx.newPage();
        const phaseNotes: Note[] = [];
        const presentedAt = Date.now();
        for (const [i, beat] of codeBeats.entries()) {
          position = { stage: 'code', beat: composition.selectedBeats.filter(ref => ref.stage === 'code')[i].beat };
          await renderCodeScene(page, spec, excerpts, beat);
          for (const note of beat.notes) {
            await overlay(page, 'The change', note, '#code-focus', beat.framing); note.at = Date.now(); phaseNotes.push(note); await hold(page, note);
          }
          await page.screenshot({path:join(vdir,`code-${i + 1}.png`)});
        }
        const handle = page.video()!;
        const endedAt = Date.now();
        await ctx.close();
        recordings.push({stage:'The change',video:await handle.path(),startedAt,presentedAt,endedAt,notes:phaseNotes});
      } finally { await browser.close(); }
    }
    position = {};
    recordings.push(current);
    const timeline: Array<{ stage: string; text: string; start: number; end: number; audio: string; speech: Note['speech']; focus?: FocusEvidence }> = [];
    let elapsed = 0;
    for (const [i, recording] of recordings.entries()) {
      const rawDuration = Number(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',recording.video],{encoding:'utf8'}).trim());
      if (!Number.isFinite(rawDuration) || rawDuration <= 0) throw new Error('Browser recording contains no measurable video.');
      // Recorder padding must not move narration later than the observed page actions.
      const rawOrigin = Math.max(recording.startedAt, recording.endedAt - rawDuration * 1000);
      const trimStart = Math.max(0, (recording.presentedAt - rawOrigin) / 1000);
      const origin = rawOrigin + trimStart * 1000;
      const capturedDuration = Math.min(rawDuration - trimStart, (recording.endedAt - origin) / 1000);
      if (capturedDuration <= 0) throw new Error('The presented workflow has no captured footage.');
      const inputs: string[] = [];
      const filters: string[] = [];
      let duration = capturedDuration;
      for (const [n, note] of recording.notes.entries()) {
        const start = Math.max(0, (note.at! - origin) / 1000);
        const next = recording.notes[n+1];
        const end = Math.max(start + note.duration, next ? (next.at! - origin)/1000 : capturedDuration);
        duration = Math.max(duration, end);
        timeline.push({stage:recording.stage,text:note.text,start:elapsed+start,end:elapsed+end,audio:note.audio,speech:note.speech,focus:note.focus});
        inputs.push('-i',note.audio);
        const delay = Math.round(start*1000);
        filters.push(`[${n+1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${delay}|${delay}[n${n}]`);
      }
      const audio = [...filters,recording.notes.map((_,n)=>`[n${n}]`).join('')+`amix=inputs=${recording.notes.length}:normalize=0,apad[a]`].join(';');
      execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(trimStart),'-i',recording.video,...inputs,
        '-filter_complex',audio,'-map','0:v:0','-map','[a]',
        '-vf',`tpad=stop_mode=clone:stop_duration=${Math.max(0,duration-capturedDuration)},fps=30,format=yuv420p`,'-t',String(duration),
        '-c:v','libx264','-preset','veryfast','-c:a','aac','-ar','48000','-ac','2','-video_track_timescale','90000',join(vdir,`part-${i}.mp4`)],{stdio:'pipe'});
      elapsed += Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',join(vdir,`part-${i}.mp4`)],{encoding:'utf8'}).trim());
    }
    writeFileSync(join(vdir,'concat.txt'),recordings.map((_,i)=>`file 'part-${i}.mp4'`).join('\n'));
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','1','-i','concat.txt','-c','copy','-movflags','+faststart',outPath],{cwd:vdir,stdio:'pipe'});
    enforceCompositionDuration(spec.walkthrough!, spec.mode, cut, Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', outPath], { encoding: 'utf8' }).trim()));
    execFileSync('ffmpeg', ['-v', 'error', '-i', outPath, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], { stdio: 'pipe' });
    writeFileSync(join(vdir,'captions.vtt'),'WEBVTT\n\n'+timeline.map((note,i)=>`${i+1}\n${timestamp(note.start)} --> ${timestamp(note.end)}\n${escapeHtml(note.text)}\n`).join('\n'));
    writeFileSync(join(vdir,'narration.txt'),timeline.map(note=>note.text).join('\n\n'));
    writeFileSync(join(vdir,'tour.json'),JSON.stringify({kind:'proof-gated-live-replay',mode:spec.mode,baselineKind:spec.baselineKind,proof:resolve(outDir,'proof.json'),specHash:proof.specHash,verifiedAt:proof.verifiedAt,
      scope:proof.scope,composition:compositionManifest(spec.walkthrough!, spec.mode, cut),audioMode:'voice',speech,diff:diff??null,duration:elapsed,recordings,timeline},null,2));
    return outPath;
  } catch (error) {
    rmSync(outPath,{force:true});
    writeFileSync(join(vdir,'recording-failure.json'),JSON.stringify({error:error instanceof Error?error.message:String(error),specHash:proof.specHash,position},null,2), { mode: 0o600 });
    throw error;
  }
}
