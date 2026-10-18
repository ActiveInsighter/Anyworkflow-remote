// Explicit opt-in diagnostic: uses the current signed-in browser account and creates one labelled live Run.
// Run manually with: node scripts/verify-live-deployment.mjs <loopback-CDP-URL>
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const evidenceDir = new URL("../.deployment-evidence/", import.meta.url);
await mkdir(evidenceDir, { recursive: true });
const endpoint = process.argv[2];
assert.match(endpoint ?? "", /^http:\/\/127\.0\.0\.1:\d+$/u);
const extensionId = "ifjccelpacnlhfafibajeapkeiflnhcd";
const browser = await chromium.connectOverCDP(endpoint);
const installed = browser.contexts()[0];
const worker = installed
  .serviceWorkers()
  .find((item) => item.url().includes(extensionId));
assert.ok(worker, "AnyWorkflow background worker is not running");
const auth = await worker.evaluate(async () => {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open("anyworkflow-pocketbase-auth");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const saved = await new Promise((resolve, reject) => {
    const request = database
      .transaction("entries", "readonly")
      .objectStore("entries")
      .get("anyworkflow.pocketbase.auth.v1");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return saved;
});
assert.ok(
  auth?.token && auth?.record?.id,
  "Sign in to the extension before running the diagnostic",
);
const baseUrl = "https://pb.any1.tech";
async function api(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(response.ok, `GET ${path}: ${response.status}`);
  return response.json();
}
const previous =
  process.argv[3] === "--verify-existing"
    ? JSON.parse(await readFile(new URL("live-run.json", evidenceDir), "utf8"))
    : null;
const stamp = new Date().toISOString().replace(/[-:.]/gu, "").slice(0, 15);
const marker = previous?.marker ?? `ANYWORKFLOW_DEPLOY_OK_${stamp}`;
const plan = `@run=部署验证 ${stamp}\n@task Browser smoke {\n@event Verification {\n<https://chatgpt.com/>\n{ Reply with exactly this text and nothing else: ${marker} }\n}\n}`;
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(
  (session) =>
    localStorage.setItem(
      "anyworkflow.auth.session.v1",
      JSON.stringify(session),
    ),
  {
    token: auth.token,
    record: auth.record,
    baseUrl,
  },
);
const page = await context.newPage();
let runId = previous?.runId;
let submittedAt = previous?.submittedAt;
let completed = false;
try {
  if (!runId) {
    await page.goto("https://awremote.any1.tech/runs/new");
    await page.locator(".cm-content").waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Codex", exact: true }).count(),
      0,
    );
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(plan);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          "/api/collections/aw_dispatch_runs/records",
    );
    submittedAt = Date.now();
    await page.getByRole("button", { name: "运行", exact: true }).click();
    const response = await responsePromise;
    assert.ok(
      response.ok(),
      `Remote Run creation failed: ${response.status()}`,
    );
    const created = await response.json();
    runId = created.id;
    await page.waitForURL(new RegExp(`/runs/${runId}$`, "u"));
    console.log(
      JSON.stringify({
        phase: "submitted",
        runId,
        marker,
        runtimeModelSelection: created.runtimeConfig?.modelSelection ?? null,
      }),
    );
    await writeFile(
      new URL("live-run.json", evidenceDir),
      JSON.stringify(
        { runId, marker, submittedAt, ownerId: auth.record.id },
        null,
        2,
      ),
    );
  } else {
    await page.goto(`https://awremote.any1.tech/runs/${runId}`);
  }
  let seenReadyAt = null;
  let seenRunningAt = null;
  let lastPrinted = "";
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const run = await api(`/api/collections/aw_dispatch_runs/records/${runId}`);
    const tasks = (
      await api(
        `/api/collections/aw_dispatch_tasks/records?filter=${encodeURIComponent(`run="${runId}"`)}`,
      )
    ).items;
    const task = tasks[0];
    const events = task
      ? (
          await api(
            `/api/collections/aw_dispatch_events/records?filter=${encodeURIComponent(`task="${task.id}"`)}`,
          )
        ).items
      : [];
    const event = events[0];
    if (event?.status === "ready" && !seenReadyAt) seenReadyAt = Date.now();
    if (
      event &&
      ["leased", "running", "succeeded"].includes(event.status) &&
      !seenRunningAt
    )
      seenRunningAt = Date.now();
    const status = JSON.stringify({
      run: run.status,
      task: task?.status,
      event: event?.status,
      lastError: event?.lastError || task?.lastError || run.lastError || "",
    });
    if (status !== lastPrinted) {
      console.log(status);
      lastPrinted = status;
    }
    if (["failed", "canceled"].includes(run.status))
      throw new Error(`Live workflow ended ${status}`);
    if (run.status === "succeeded") {
      assert.equal(task.status, "succeeded");
      assert.equal(event.status, "terminal");
      assert.equal(event.terminalResult, "succeeded");
      assert.ok(event.localRunId, "Event has no browser execution identity");
      const history = await api(
        `/api/collections/aw_tasks/records?filter=${encodeURIComponent(`taskId="${event.localRunId}"`)}`,
      );
      const messages = await api(
        `/api/collections/aw_messages/records?filter=${encodeURIComponent(`act.event.task.taskId="${event.localRunId}"`)}`,
      );
      assert.ok(
        messages.items.some(
          (item) => item.assistantMarkdown?.trim() === marker,
        ),
        "Expected ChatGPT reply was not persisted",
      );
      const result = {
        replyVerified: true,
        runId,
        taskId: task.id,
        eventId: event.id,
        localRunId: event.localRunId,
        marker,
        readyMs: seenReadyAt ? seenReadyAt - submittedAt : null,
        runningMs: seenRunningAt ? seenRunningAt - submittedAt : null,
        completedMs: Date.parse(run.endedAt) - submittedAt,
        historyTaskIds: history.items.map((item) => item.id),
      };
      await writeFile(
        new URL("live-result.json", evidenceDir),
        JSON.stringify(result, null, 2),
      );
      console.log(JSON.stringify({ phase: "succeeded", ...result }));
      completed = true;
      break;
    }
    await delay(1000);
  }
  assert.ok(completed, "Live workflow did not finish within four minutes");
} finally {
  await context.close();
  // Disconnect from the attached desktop browser without closing its profile or tabs.
  await browser.close();
}
