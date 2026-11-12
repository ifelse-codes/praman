import type { Browser, Page } from 'playwright';

/** A top-level navigation the guard stopped before its request was sent. Private evidence: the URL is the app's. */
export interface StoppedNavigation { url: string; redirect: boolean; newTab: boolean }

export interface NavigationGuard {
  readonly stopped: StoppedNavigation[];
  /** Marks the scenario's page and applies the former per-page setting: a service worker does not answer this page's requests. */
  attach(page: Page): Promise<void>;
}

/**
 * Same-origin navigation guard for one browser: every top-level document request (the
 * page, a new tab or window, a redirect hop, an iframe that navigates the top) to another
 * origin is failed before it is sent, recorded as `net::ERR_FAILED`, and listed in
 * `stopped`. Iframe documents and all other requests continue unchanged.
 *
 * It uses Chromium's Fetch domain on the browser target for document requests only, not
 * Playwright request routing: while any Playwright route is registered, Playwright
 * disables the HTTP cache, and Chromium then aborts CSS cross-document view transitions
 * with an `InvalidStateError` in the page. Page routes also missed redirect hops and the
 * first request of a new tab.
 */
export async function guardNavigation(browser: Browser, origin: string): Promise<NavigationGuard> {
  const session = await browser.newBrowserCDPSession();
  const topLevel = new Set<string>();
  const remember = (targetId: string) => { topLevel.add(targetId); };
  let scenarioPage: string | undefined;
  session.on('Target.targetCreated', ({ targetInfo }) => { if (targetInfo.type === 'page') remember(targetInfo.targetId); });
  await session.send('Target.setDiscoverTargets', { discover: true });
  const stopped: StoppedNavigation[] = [];
  session.on('Fetch.requestPaused', event => {
    void (async () => {
      // A page's main frame id is its target id; a target created after the last event is looked up once.
      if (!topLevel.has(event.frameId)) {
        const { targetInfos } = await session.send('Target.getTargets');
        for (const target of targetInfos) if (target.type === 'page') remember(target.targetId);
      }
      if (topLevel.has(event.frameId) && new URL(event.request.url).origin !== origin) {
        stopped.push({ url: event.request.url, redirect: event.redirectedRequestId !== undefined, newTab: scenarioPage !== undefined && event.frameId !== scenarioPage });
        await session.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Failed' });
      } else await session.send('Fetch.continueRequest', { requestId: event.requestId });
    })().catch(() => undefined); // A browser that closes while a request is paused leaves nothing to continue.
  });
  await session.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
  return {
    stopped,
    async attach(page: Page) {
      const pageSession = await page.context().newCDPSession(page);
      scenarioPage = (await pageSession.send('Target.getTargetInfo')).targetInfo.targetId;
      remember(scenarioPage);
      await pageSession.send('Network.enable');
      await pageSession.send('Network.setBypassServiceWorker', { bypass: true });
    },
  };
}

/** The run error for stopped navigations; `classifyError` names it `navigation_failed`. */
export function leftOriginMessage(stopped: StoppedNavigation[]): string {
  const row = stopped[0]!;
  const how = row.newTab ? 'a new tab or window' : row.redirect ? 'a redirect' : 'the page';
  return `Navigation left the app origin: PRAMAN stopped ${how} going to ${row.url} before the request was sent`
    + `; ${stopped.length} top-level navigation${stopped.length === 1 ? '' : 's'} stopped.`;
}
