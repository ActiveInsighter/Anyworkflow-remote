import { defineTaskKind } from './lifecycle.mjs';

/**
 * The async task kinds AnyWorkflow runs today. Collections and raw statuses
 * are the PocketBase contract; the canonical states are what schedulers and
 * the web console share. A new kind (another converter, a bulk action) adds
 * one entry here plus its processor handlers.
 */

/** PDF → Markdown and future file conversions, executed by GitHub Actions. */
export const fileConversionKind = defineTaskKind({
  id: 'file-conversion',
  collection: 'aw_pdf_to_md_jobs',
  statuses: {
    queued: 'queued',
    dispatching: 'running',
    pending: 'running',
    running: 'running',
    uploading: 'running',
    succeeded: 'succeeded',
    partial: 'partial',
    failed: 'failed',
    canceled: 'canceled',
  },
  cancel: 'flag',
  stopping: (record) => Boolean(record?.cancelRequested),
});

/** Run conversation export: collect synced history, render Markdown, pack a ZIP. */
export const runExportKind = defineTaskKind({
  id: 'run-export',
  collection: 'aw_run_exports',
  statuses: {
    queued: 'queued',
    collecting: 'running',
    packaging: 'running',
    succeeded: 'succeeded',
    failed: 'failed',
    expired: 'expired',
  },
  progress: (record) => Number(record?.progress),
});

/** A workflow Run: orchestrated into Tasks and Events that browser executors lease. */
export const runKind = defineTaskKind({
  id: 'run',
  collection: 'aw_dispatch_runs',
  statuses: {
    draft: 'idle',
    queued: 'queued',
    running: 'running',
    succeeded: 'succeeded',
    failed: 'failed',
    canceled: 'canceled',
  },
  cancel: 'command',
  stopping: (record) => record?.requestedAction === 'cancel',
  progress: (record) => {
    const total = Number(record?.totalTasks);
    return total > 0 ? (Number(record?.completedTasks) / total) * 100 : null;
  },
});

/** Web page capture: the owner's browser extension opens the page and extracts its content. */
export const pageCaptureKind = defineTaskKind({
  id: 'page-capture',
  collection: 'aw_capture_jobs',
  statuses: {
    queued: 'queued',
    opening: 'running',
    rendering: 'running',
    extracting: 'running',
    uploading: 'running',
    succeeded: 'succeeded',
    partial: 'partial',
    failed: 'failed',
    canceled: 'canceled',
  },
  cancel: 'flag',
  stopping: (record) => Boolean(record?.cancelRequested),
});

/**
 * Web crawl: a batch of saved pages crawled anonymously by the webpage-parser-action workflow,
 * which reports each page to PocketBase. Progress counts reported pages.
 */
export const webCrawlKind = defineTaskKind({
  id: 'web-crawl',
  collection: 'aw_crawl_runs',
  statuses: {
    queued: 'queued',
    dispatching: 'running',
    pending: 'running',
    running: 'running',
    succeeded: 'succeeded',
    partial: 'partial',
    failed: 'failed',
    canceled: 'canceled',
  },
  cancel: 'flag',
  stopping: (record) => Boolean(record?.cancelRequested),
  // Pages reported so far; a one-page run has nothing to measure until it ends.
  progress: (record) => {
    const total = Number(record?.targetCount);
    return total > 1 ? (Number(record?.reportedCount) / total) * 100 : null;
  },
});

export const TASK_KINDS = Object.freeze([fileConversionKind, runExportKind, runKind, pageCaptureKind, webCrawlKind]);

export function taskKind(id) {
  const kind = TASK_KINDS.find((entry) => entry.id === id);
  if (!kind) throw new Error(`Unknown task kind: ${id}`);
  return kind;
}
