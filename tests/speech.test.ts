import { afterEach, beforeEach, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { prepareSpeech, type SpeechSettings } from '../src/report/speech.js';
import { composeWalkthrough, compositionManifest, enforceCompositionDuration, shortCompositionSchema } from '../src/case/composition.js';

const decoders = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
let root: string, helper: string, cache: string, calls: string, settings: SpeechSettings;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'praman-speech-')); cache = join(root, 'cache'); calls = join(root, 'calls.jsonl'); helper = join(root, 'speech-helper');
  if (!decoders) return;
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=1', join(root, 'source.wav')]);
  // Deterministic process fixture, not a provider claim. Both argument dialects emit actual decodable PCM.
  writeFileSync(helper, `#!${process.execPath}\nconst fs = require('node:fs');
const args = process.argv.slice(2), value = (...keys) => args[args.findIndex(arg => keys.includes(arg)) + 1];
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({text: fs.readFileSync(value('--file', '-f'), 'utf8'), voice: value('--voice'), rate: value('-r', '-s')}) + '\\n');
fs.copyFileSync(${JSON.stringify(join(root, 'source.wav'))}, value('--out', '-w', '-o'));
`, { mode: 0o700 });
  settings = { engine: 'vatra', executable: helper, voice: 'af_heart' };
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

it.skipIf(!decoders)('reuses only exact spoken input and returns independent private, remeasured audio', () => {
  const text = 'The result is ready. Only this declared case was checked.';
  const first = prepareSpeech(text, join(root, 'first'), settings, cache);
  const second = prepareSpeech(text, join(root, 'second'), settings, cache);
  expect([first.status, second.status]).toEqual(['generated', 'reused']);
  expect(readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line).text)).toEqual([text]);
  expect(readFileSync(second.audio)).toEqual(readFileSync(first.audio));
  expect(second.seconds).toBeCloseTo(1); expect(second.key).toBe(first.key);
  expect(statSync(first.cacheEntry).mode & 0o777).toBe(0o700);
  for (const file of [first.audio, second.audio, join(root, 'second.txt'), join(root, 'second.speech.json'), join(first.cacheEntry, 'asset.json')]) expect(statSync(file).mode & 0o777).toBe(0o600);
  writeFileSync(first.audio, 'damaged delivery copy');
  const third = prepareSpeech(text, join(root, 'third'), settings, cache);
  expect(third.status).toBe('reused'); expect(third.seconds).toBeCloseTo(1);
  expect(JSON.parse(readFileSync(join(root, 'third.speech.json'), 'utf8'))).toMatchObject({ kind: 'speech-asset', proof: false, status: 'reused' });
});

it.skipIf(!decoders)('invalidates text, voice, rate, helper bytes and inherited generation environment', () => {
  const base = prepareSpeech('Ready.', join(root, 'base'), settings, cache);
  const text = prepareSpeech('Ready. ', join(root, 'text'), settings, cache);
  const voice = prepareSpeech('Ready.', join(root, 'voice'), { ...settings, voice: 'af_bella' } as SpeechSettings, cache);
  const rateA = prepareSpeech('Ready.', join(root, 'rate-a'), { engine: 'espeak', executable: helper, rate: 175 }, cache);
  const rateB = prepareSpeech('Ready.', join(root, 'rate-b'), { engine: 'espeak', executable: helper, rate: 180 }, cache);
  writeFileSync(helper, readFileSync(helper, 'utf8') + '\n// Different provider settings/defaults.\n');
  const changedHelper = prepareSpeech('Ready.', join(root, 'helper'), settings, cache);
  const previous = process.env.PRAMAN_TEST_SPEECH_LANGUAGE;
  let environment;
  try {
    process.env.PRAMAN_TEST_SPEECH_LANGUAGE = 'different';
    environment = prepareSpeech('Ready.', join(root, 'environment'), settings, cache);
  } finally { if (previous === undefined) delete process.env.PRAMAN_TEST_SPEECH_LANGUAGE; else process.env.PRAMAN_TEST_SPEECH_LANGUAGE = previous; }
  const results = [base, text, voice, rateA, rateB, changedHelper, environment];
  expect(new Set(results.map(result => result.key)).size).toBe(7);
  expect(results.map(result => result.status)).toEqual(Array(7).fill('generated'));
  const observed = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  expect(observed.map(row => row.text)).toEqual(['Ready.', 'Ready. ', 'Ready.', 'Ready.', 'Ready.', 'Ready.', 'Ready.']);
  expect(observed[2].voice).toBe('af_bella'); expect([observed[3].rate, observed[4].rate]).toEqual(['175', '180']);
});

it.skipIf(!decoders).each(['missing', 'unreadable', 'damaged', 'truncated-with-matching-hash', 'invalid-manifest'] as const)('blocks a %s cache hit without silent regeneration or false success', problem => {
  const first = prepareSpeech('Ready.', join(root, 'first'), settings, cache);
  const cached = join(first.cacheEntry, 'audio.wav'), manifest = join(first.cacheEntry, 'asset.json');
  if (problem === 'missing') rmSync(cached);
  if (problem === 'unreadable') chmodSync(cached, 0);
  if (problem === 'damaged') writeFileSync(cached, 'not audio');
  if (problem === 'invalid-manifest') writeFileSync(manifest, '{}');
  if (problem === 'truncated-with-matching-hash') {
    const bytes = readFileSync(cached); writeFileSync(cached, bytes.subarray(0, Math.floor(bytes.length / 2)));
    const receipt = JSON.parse(readFileSync(manifest, 'utf8'));
    receipt.sha256 = createHash('sha256').update(readFileSync(cached)).digest('hex'); writeFileSync(manifest, JSON.stringify(receipt));
  }
  expect(() => prepareSpeech('Ready.', join(root, 'blocked'), settings, cache)).toThrow();
  expect(JSON.parse(readFileSync(join(root, 'blocked.speech.json'), 'utf8'))).toMatchObject({ status: 'blocked', proof: false });
  expect(readFileSync(calls, 'utf8').trim().split('\n')).toHaveLength(1);
  if (problem === 'unreadable') chmodSync(cached, 0o600);
});

it.skipIf(!decoders)('requires a usable provider and decoder on a hit, and rejects failed or invalid first generation', () => {
  prepareSpeech('Ready.', join(root, 'first'), settings, cache);
  chmodSync(helper, 0o600);
  expect(() => prepareSpeech('Ready.', join(root, 'missing-helper'), settings, cache)).toThrow('unavailable');
  chmodSync(helper, 0o700);
  const previous = process.env.PATH;
  try {
    // Same key is not claimed here: availability still must fail rather than return cached timing.
    process.env.PATH = '';
    expect(() => prepareSpeech('Ready.', join(root, 'decoder'), settings, cache)).toThrow();
  } finally { if (previous === undefined) delete process.env.PATH; else process.env.PATH = previous; }
  writeFileSync(join(root, 'source.wav'), 'not audio');
  expect(() => prepareSpeech('Invalid generated media.', join(root, 'invalid'), settings, cache)).toThrow();
  writeFileSync(helper, `#!${process.execPath}\nprocess.exit(1);\n`);
  expect(() => prepareSpeech('Failed generation.', join(root, 'failed'), settings, cache)).toThrow();
  expect(existsSync(join(root, 'failed.wav'))).toBe(false);
});

it.skipIf(!decoders)('keeps full/short variants, original indexes and framing separate from reusable speech and duration gates', () => {
  const ref = { stage: 'after' as const, beat: 1 };
  const story = { after: [{ text: 'An optional introduction.' }, { text: 'The current result, credit and declared limits.', shortText: 'Ready; author supplied; this case only.', framing: { padding: 8 } }],
    short: shortCompositionSchema.parse({ context: ref, outcome: ref, attribution: ref, limits: ref }) };
  const full = composeWalkthrough(story, 'acceptance', 'full'), short = composeWalkthrough(story, 'acceptance', 'short');
  const first = prepareSpeech(full.after[1].text, join(root, 'full'), settings, cache);
  const concise = prepareSpeech(short.after[0].text, join(root, 'short'), settings, cache);
  expect(concise.status).toBe('generated'); expect(concise.key).not.toBe(first.key);
  const changed = { ...story, after: story.after.map(beat => ({ ...beat, framing: { padding: 12 } })) };
  expect(compositionManifest(changed, 'acceptance', 'short').selectedBeats).toEqual([ref]);
  expect(compositionManifest(changed, 'acceptance', 'short').sourceStoryHash).not.toBe(compositionManifest(story, 'acceptance', 'short').sourceStoryHash);
  const framed = prepareSpeech(composeWalkthrough(changed, 'acceptance', 'short').after[0].text, join(root, 'framed'), settings, cache);
  expect(framed.status).toBe('reused'); expect(framed.key).toBe(concise.key);
  enforceCompositionDuration(story, 'acceptance', 'full', first.seconds);
  expect(() => enforceCompositionDuration(story, 'acceptance', 'short', framed.seconds + 60)).toThrow('duration budget');
});

it.skipIf(!decoders)('both real delivery paths reuse speech but stop measured overflow before capture, leaving fresh proof intact', () => {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=16', join(root, 'source.wav')]);
  const modules = Object.fromEntries(['report/speech', 'report/video', 'core/commandDemonstrate', 'case/change', 'eval/change']
    .map(name => [name, new URL(`../src/${name}.ts`, import.meta.url).href]));
  const driver = `
    import assert from 'node:assert/strict';
    import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
    import { join } from 'node:path';
    import { createServer } from 'node:http';
    import { once } from 'node:events';
    import { configuredSpeech, prepareSpeech } from ${JSON.stringify(modules['report/speech'])};
    import { recordChangeWalkthrough } from ${JSON.stringify(modules['report/video'])};
    import { demonstrateCommands } from ${JSON.stringify(modules['core/commandDemonstrate'])};
    import { changeSpecSchema } from ${JSON.stringify(modules['case/change'])};
    import { proveChange } from ${JSON.stringify(modules['eval/change'])};
    const text = 'Current result; authored fixture; this declared case only.';
    const first = prepareSpeech(text, join(process.cwd(), 'warm'), configuredSpeech());
    const ref = beat => ({stage:'after',beat});
    const short = {maxDurationSeconds:60,context:ref(1),outcome:ref(3),attribution:ref(4),limits:ref(5)};
    const after = Array.from({length:6}, () => ({text}));
    const commands = join(process.cwd(), 'commands.json'), plan = join(process.cwd(), 'plan.json');
    writeFileSync(commands, JSON.stringify({mode:'acceptance',title:'Result',requirement:'Ready',current:{executable:process.execPath,args:['-e','console.log("Ready")'],cwd:process.cwd(),deadlineMs:5000},checks:[{id:'ready',source:'stdout',operator:'equals',value:'Ready\\n'}]}));
    writeFileSync(plan, JSON.stringify({commandsPath:commands,walkthrough:{after:after.map(beat=>({...beat,stream:'stdout',from:1,to:1})),short}}));
    const commandDir = join(process.cwd(),'command');
    const delivery = await demonstrateCommands(plan,commandDir,'short');
    assert.equal(delivery.proofVerdict,'passed');assert.equal(delivery.verdict,'insufficient_evidence');
    assert.match(JSON.parse(readFileSync(join(commandDir,'recording-failure.json'),'utf8')).error,/duration budget/);
    const server = createServer((_req,res) => { res.setHeader('Content-Type','text/html'); res.end('<style>#ready{position:fixed;top:180px;left:90px;width:300px;height:70px}</style><button onclick="document.querySelector(\\'#ready\\').textContent=\\'Ready\\'">Run</button><div id="ready">Waiting</div>'); });
    server.listen(0,'127.0.0.1'); await once(server,'listening');
    try {
    const scenario = changeSpecSchema.parse({mode:'acceptance',title:'Result',change:'Show Ready',
      afterUrl:'http://127.0.0.1:'+server.address().port,
      steps:[{action:'click',selector:'button',note:'Run'}],checks:[{id:'ready',kind:'text',selector:'#ready',equals:'Ready'}],
      walkthrough:{startStep:0,after:after.map(beat=>({...beat,step:0,selector:'#ready'})),short}});
    const browserDir = join(process.cwd(),'browser'), proof = await proveChange(scenario,browserDir);
    await assert.rejects(recordChangeWalkthrough(scenario,proof.proof,browserDir,'short'),/duration budget/);
    assert.equal(JSON.parse(readFileSync(join(browserDir,'proof.json'),'utf8')).verdict,'passed');
    for(const directory of [commandDir,browserDir]) {
      const receipts = readdirSync(join(directory,'video')).filter(file=>file.endsWith('.speech.json')).map(file=>JSON.parse(readFileSync(join(directory,'video',file),'utf8')));
      assert.equal(receipts.length,4);assert(receipts.every(receipt=>receipt.status==='reused' && receipt.key===first.key && receipt.seconds===16));
      assert(!existsSync(join(directory,'demo.mp4')));
    }
    assert.equal(readFileSync(${JSON.stringify(calls)},'utf8').trim().split('\\n').length,1);
    function noMovies(dir) {for(const entry of readdirSync(dir,{withFileTypes:true})) {if(entry.isDirectory()) noMovies(join(dir,entry.name));else assert(!/\\.(mp4|webm|mov)$/.test(entry.name));}}
    noMovies(process.cwd());
    } finally {server.close();await once(server,'close');}
  `;
  const run = spawnSync(process.execPath, ['--import', createRequire(import.meta.url).resolve('tsx'), '--input-type=module', '-e', driver],
    { cwd: root, env: { ...process.env, PRAMAN_VATRA: helper }, encoding: 'utf8', timeout: 60000 });
  expect(run.stderr).toBe('');
  expect(run.status, run.stdout + run.stderr).toBe(0);
}, 90000);
