/**
 * Server-only Bun demo server.
 *
 * This module must not be imported by browser bundles.
 * `startGrabrDemoServer` dynamically imports this file when invoked.
 */

export async function startGrabrDemoServerImpl(port: number = 3000): Promise<void> {
  if (typeof Bun === "undefined") {
    throw new Error("startGrabrDemoServer can only be used in a Bun runtime.");
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>AI Grab Demo</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }
      .app-root {
        padding: 2rem;
      }
      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 1rem;
      }
      .card {
        background: #020617;
        border-radius: 0.75rem;
        padding: 1rem;
        border: 1px solid rgba(148, 163, 184, 0.4);
      }
      .card h2 {
        margin: 0 0 0.25rem;
      }
      .card p {
        margin: 0 0 0.75rem;
        font-size: 0.875rem;
        color: #cbd5f5;
      }
      .card button {
        border-radius: 9999px;
        border: none;
        background: #38bdf8;
        color: #0f172a;
        font-weight: 600;
        padding: 0.25rem 0.75rem;
        cursor: pointer;
      }
      .hint {
        margin-bottom: 1rem;
        font-size: 0.875rem;
        color: #94a3b8;
      }
      a {
        color: #38bdf8;
      }
    </style>
    <script type="module">
      import { initGrabr } from "/grabr.js";
      initGrabr();
    </script>
  </head>
  <body>
    <div class="app-root">
      <div class="hint">
        Demo app rendered by Bun. Use <strong>Alt+Shift+G</strong> to enter selection mode,
        then click elements to send context via the clipboard provider.
      </div>
      <div class="card-grid">
        <div class="card" data-testid="profile-card">
          <h2>Profile</h2>
          <p>Change how this text looks using your AI agent.</p>
          <button type="button">Edit profile</button>
        </div>
        <div class="card" data-testid="billing-card">
          <h2>Billing</h2>
          <p>Adjust your subscription plan and payment details.</p>
          <button type="button">Manage billing</button>
        </div>
        <div class="card" data-testid="notifications-card">
          <h2>Notifications</h2>
          <p>Fine-tune how and when we notify you about activity.</p>
          <button type="button">Edit notifications</button>
        </div>
      </div>
      <p style="margin-top:2rem;font-size:0.75rem;color:#64748b;">
	        In a real app, mount your React tree here and ensure the grabr client is imported
	        before React so grabr can attach to React fibers.
	      </p>
    </div>
  </body>
</html>`;

  const entryUrl = new URL("../grabr.ts", import.meta.url);
  const entryPath = decodeURIComponent(entryUrl.pathname);

  const buildResult = await Bun.build({
    entrypoints: [entryPath],
    target: "browser",
    outdir: "",
    splitting: false,
  });

  if (!buildResult.success || buildResult.outputs.length === 0) {
    throw new Error("Failed to build grabr client bundle for demo.");
  }

  const clientBundle =
    buildResult.outputs[0] !== undefined
      ? await buildResult.outputs[0].text()
      : "";

  const server = Bun.serve({
    port,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      if (url.pathname === "/grabr.js") {
        return new Response(clientBundle, {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
          },
        });
      }
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    },
  });

  console.log(`[grabr] Demo server listening on ${server.url}`);
}
