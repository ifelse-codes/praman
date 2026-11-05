import type { Page } from 'playwright';
import { sceneFramingSchema, type SceneFraming } from '../case/framing.js';

type Box = { x: number; y: number; width: number; height: number };
export interface FocusEvidence {
  selector: string; target: Box; aperture: Box; blurPx: number; dimOpacity: number;
  framing: { requested: SceneFraming; caption: 'top' | 'bottom'; padding: number; captionBox: Box };
}

/** Keep preview captions identical to the chunks that will be spoken. */
export function splitNarration(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text.replace(/\s+/g, ' ').trim();
  while (remaining) {
    let end = Math.min(240, remaining.length);
    if (remaining.length > end) {
      const sentence = [...remaining.slice(0, end).matchAll(/[.!?](?=\s)/g)].at(-1)?.index;
      const space = remaining.lastIndexOf(' ', end);
      end = sentence !== undefined && sentence > 80 ? sentence + 1 : space > 0 ? space : end;
    }
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  return chunks;
}

/** Blur the live page around a clear aperture; never copy or replace the focused UI. */
export async function showWalkthroughOverlay(page: Page, options: {
  stage: string; text: string; voice: boolean; selector?: string; framing?: SceneFraming;
}): Promise<FocusEvidence | undefined> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Walkthrough focus requires an explicit viewport.');
  const framing = sceneFramingSchema.parse(options.framing ?? {});
  const padding = framing.padding ?? 8;
  let focus: FocusEvidence | undefined;
  if (options.selector) {
    const locator = page.locator(options.selector);
    if (!await locator.count()) throw new Error(`Walkthrough focus is missing: ${options.selector}`);
    if (!await locator.first().isVisible()) throw new Error(`Walkthrough focus is hidden: ${options.selector}`);
    await locator.first().scrollIntoViewIfNeeded();
    const boxes: Box[] = [];
    for (const element of await locator.all()) {
      if (!await element.isVisible()) throw new Error(`Walkthrough focus is hidden: ${options.selector}`);
      const box = await element.boundingBox();
      if (!box || box.width <= 0 || box.height <= 0) throw new Error(`Walkthrough focus has no visible area: ${options.selector}`);
      boxes.push(box);
    }
    const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.width)), bottom = Math.max(...boxes.map(box => box.y + box.height));
    if (x < -1 || y < -1 || right > viewport.width + 1 || bottom > viewport.height + 1) throw new Error(`Walkthrough focus does not fit the viewport: ${options.selector}`);
    if ((right - x) * (bottom - y) >= viewport.width * viewport.height * 0.8) {
      throw new Error('Walkthrough focus covers at least 80% of the viewport. Choose an explicit smaller target; the recorder will not substitute one.');
    }
    const left = Math.max(0, x - padding), top = Math.max(0, y - padding);
    const aperture = { x: left, y: top, width: Math.min(viewport.width, right + padding) - left, height: Math.min(viewport.height, bottom + padding) - top };
    if (aperture.width * aperture.height >= viewport.width * viewport.height * 0.8) {
      throw new Error('Walkthrough aperture covers at least 80% of the viewport. Reduce padding or choose an explicit smaller target.');
    }
    focus = { selector: options.selector, target: { x, y, width: right - x, height: bottom - y }, aperture,
      blurPx: 4, dimOpacity: 0.48,
      framing: { requested: framing, caption: 'bottom', padding, captionBox: { x: 0, y: 0, width: 0, height: 0 } } };
  }
  await page.evaluate(`(() => {
    const d = ${JSON.stringify({ ...options, framing, focus, viewport })};
    const key = Symbol.for('praman.walkthrough.overlay');
    let host = window[key];
    if (!host?.isConnected) {
      host = document.createElement('div'); window[key] = host;
      host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
      const root = host.attachShadow({mode:'closed'});
      const style = document.createElement('style');
      style.textContent = ':host{font-family:Arial,sans-serif}.shade{position:fixed;pointer-events:none;transition:left .22s ease,top .22s ease,width .22s ease,height .22s ease}.badge{position:fixed;right:18px;top:14px;padding:7px 11px;background:#17202bd9;color:#e5e7eb;border:1px solid #ffffff35;border-radius:20px;font-size:13px;letter-spacing:.03em}.caption{position:fixed;left:80px;right:80px;bottom:22px;padding:12px 18px;background:#101827ed;color:white;border-radius:9px;font-size:21px;line-height:1.4;text-align:center;overflow-wrap:anywhere}.spot{position:fixed;border:2px solid #38bdf8;border-radius:7px;box-shadow:0 0 0 2px #ffffff80;box-sizing:border-box;transition:left .22s ease,top .22s ease,width .22s ease,height .22s ease}';
      root.append(style);
      const shades = Array.from({length:4}, () => {const el=document.createElement('div');el.className='shade';root.append(el);return el;});
      const spot=document.createElement('div');spot.className='spot';root.append(spot);
      const badge=document.createElement('div');badge.className='badge';root.append(badge);
      const caption=document.createElement('div');caption.className='caption';root.append(caption);
      host.story = {shades,spot,badge,caption};document.documentElement.append(host);
    }
    const {shades,spot,badge,caption}=host.story;
    const rect=(el,b)=>Object.assign(el.style,{left:b.x+'px',top:b.y+'px',width:b.width+'px',height:b.height+'px'});
    if(d.focus) {
      const a=d.focus.aperture, right=a.x+a.width, bottom=a.y+a.height;
      const panels=[{x:0,y:0,width:d.viewport.width,height:a.y},{x:0,y:bottom,width:d.viewport.width,height:d.viewport.height-bottom},{x:0,y:a.y,width:a.x,height:a.height},{x:right,y:a.y,width:d.viewport.width-right,height:a.height}];
      shades.forEach((el,i)=>{el.hidden=false;el.style.background='rgba(8,12,20,'+d.focus.dimOpacity+')';el.style.backdropFilter='blur('+d.focus.blurPx+'px)';rect(el,panels[i]);});
      spot.hidden=false;rect(spot,a);
    } else {shades.forEach(el=>el.hidden=true);spot.hidden=true;}
    badge.textContent=d.stage+(d.voice?'':' · Captions only');caption.textContent=d.text;
    caption.style.top='auto';caption.style.bottom='22px';
    const placement = d.framing.caption ?? 'auto';
    if(placement === 'top' || (placement === 'auto' && d.focus && d.focus.aperture.y+d.focus.aperture.height>d.viewport.height-caption.getBoundingClientRect().height-38)){caption.style.bottom='auto';caption.style.top='72px';}
  })()`);
  if (focus) await page.waitForTimeout(240); // Let the visual focus arrive before its narration begins.
  const caption = await page.evaluate(`(() => {
    const el = window[Symbol.for('praman.walkthrough.overlay')].story.caption;
    const box = el.getBoundingClientRect();
    const focus = ${JSON.stringify(focus?.aperture ?? null)};
    return { box: { x: box.x, y: box.y, width: box.width, height: box.height },
      placement: el.style.top === '72px' ? 'top' : 'bottom',
      fits: box.left >= 0 && box.top >= 0 && box.right <= ${viewport.width} && box.bottom <= ${viewport.height}
        && (!focus || box.right <= focus.x || box.left >= focus.x + focus.width || box.bottom <= focus.y || box.top >= focus.y + focus.height) };
  })()`) as { box: Box; placement: 'top' | 'bottom'; fits: boolean };
  if (!caption.fits) throw new Error('Walkthrough caption does not fit clear of the focus. Shorten the beat or choose an explicit smaller target or caption position.');
  if (focus) focus.framing = { requested: framing, caption: caption.placement, padding, captionBox: caption.box };
  return focus;
}
