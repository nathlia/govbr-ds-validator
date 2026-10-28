/**
 * Egress policy of the oracle's own browser. In a measured run the agent picks the URL; these
 * tests pin that a tool cannot open an origin outside the policy, and that requests the page
 * itself makes — fetch, frames, workers, to loopback included — go through the proxy and never
 * reach a server the policy does not name.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { assertUrlAllowed, closeBrowser, egressPolicyFromEnv, withPage } from "../../src/evidence/browser.js";

const listen = (server: Server): Promise<string> =>
  new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`127.0.0.1:${(server.address() as AddressInfo).port}`)));

describe("egress policy (unit)", () => {
  it("is inert when unset", () => {
    const policy = egressPolicyFromEnv({});
    expect(policy).toEqual({ allowedOrigins: null, proxyServer: null });
    expect(() => assertUrlAllowed("http://localhost:4000/@fs/anything", policy)).not.toThrow();
  });

  it("normalizes origins and rejects anything else, including look-alike hosts", () => {
    const policy = egressPolicyFromEnv({
      GOVBR_VALIDATOR_ALLOWED_ORIGINS: "http://127.0.0.1:3100/, http://127.0.0.1:4100",
      GOVBR_VALIDATOR_PROXY_SERVER: "http://127.0.0.1:4102",
    });
    expect(policy.allowedOrigins).toEqual(["http://127.0.0.1:3100", "http://127.0.0.1:4100"]);
    expect(() => assertUrlAllowed("http://127.0.0.1:3100/fluxo.html", policy)).not.toThrow();
    for (const url of [
      "http://localhost:3100/fluxo.html",
      "http://127.0.0.1:4000/@fs/ground-truth-fluxo.json",
      "http://127.0.0.1.nip.io:3100/fluxo.html",
      "https://www.gov.br/ds",
      "file:///C:/ground-truth.json",
      "data:text/html,<p>x</p>",
    ]) {
      // 3.3.0 (S-08): file:/data: caem antes, no esquema; as outras, na política de origens.
      expect(() => assertUrlAllowed(url, policy), url).toThrow(/fora da política|não suportado/);
    }
    expect(() => assertUrlAllowed("not a url", policy)).toThrow(/URL inválida/);
  });
});

describe("egress policy (live browser through a proxy)", () => {
  let decoyHits = 0;
  const proxied: { target: string; allowed: boolean }[] = [];
  let siteHost = "";
  let decoyHost = "";
  let proxyHost = "";
  const servers: Server[] = [];

  beforeAll(async () => {
    const decoy = createServer((_req, res) => {
      decoyHits++;
      res.writeHead(200, { "content-type": "text/plain", "access-control-allow-origin": "*" });
      res.end("ANSWER-KEY");
    });
    decoyHost = await listen(decoy);
    const site = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html><body><main id="root">ok</main>
        <iframe src="http://${decoyHost}/frame"></iframe>
        <script>new Worker(URL.createObjectURL(new Blob(["fetch('http://${decoyHost}/worker').catch(()=>{})"])));</script>
        </body></html>`);
    });
    siteHost = await listen(site);
    // Minimal deny-by-default forward proxy: the site is the only upstream it will contact.
    const proxy = createServer((req, res) => {
      const url = new URL(req.url ?? "");
      const allowed = url.host === siteHost;
      proxied.push({ target: `${url.host}${url.pathname}`, allowed });
      if (!allowed) {
        res.writeHead(403);
        res.end();
        return;
      }
      const upstream = httpRequest({ host: url.hostname, port: url.port, path: url.pathname, method: req.method, headers: req.headers }, (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      });
      req.pipe(upstream);
    });
    proxy.on("connect", (_req, socket: Socket) => socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"));
    proxyHost = await listen(proxy);
    servers.push(decoy, site, proxy);
  });

  afterEach(async () => {
    delete process.env.GOVBR_VALIDATOR_ALLOWED_ORIGINS;
    delete process.env.GOVBR_VALIDATOR_PROXY_SERVER;
    await closeBrowser();
  });

  afterAll(async () => {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("refuses to open an origin outside the policy before loading anything", async () => {
    process.env.GOVBR_VALIDATOR_ALLOWED_ORIGINS = `http://${siteHost}`;
    process.env.GOVBR_VALIDATOR_PROXY_SERVER = `http://${proxyHost}`;
    const before = decoyHits;
    await expect(withPage(`http://${decoyHost}/@fs/ground-truth-fluxo.json`, async () => "loaded")).rejects.toThrow(/fora da política/);
    expect(decoyHits).toBe(before);
  });

  it("routes the page's own loopback requests through the proxy, where they are denied", async () => {
    process.env.GOVBR_VALIDATOR_ALLOWED_ORIGINS = `http://${siteHost}`;
    process.env.GOVBR_VALIDATOR_PROXY_SERVER = `http://${proxyHost}`;
    const before = decoyHits;
    const fetched = await withPage(`http://${siteHost}/`, async (page) => {
      await page.waitForTimeout(500);
      return page.evaluate(async (target) => {
        try {
          const response = await fetch(target);
          return `${response.status} ${await response.text()}`;
        } catch (error) {
          return `error ${(error as Error).message}`;
        }
      }, `http://${decoyHost}/fetch`);
    });
    expect(fetched).not.toContain("ANSWER-KEY");
    expect(decoyHits).toBe(before);
    const denied = proxied.filter((p) => !p.allowed).map((p) => p.target);
    expect(denied).toEqual(expect.arrayContaining([`${decoyHost}/fetch`, `${decoyHost}/frame`, `${decoyHost}/worker`]));
  }, 60_000);

  it("reaches the decoy without a policy — the control that makes the two tests above mean something", async () => {
    const before = decoyHits;
    const body = await withPage(`http://${decoyHost}/direct`, (page) => page.evaluate(() => document.body.innerText));
    expect(body).toContain("ANSWER-KEY");
    expect(decoyHits).toBeGreaterThan(before);
  }, 60_000);
});
