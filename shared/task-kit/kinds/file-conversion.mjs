import { fileConversionKind } from '../catalog.mjs';
import { createTaskEngine } from '../engine.mjs';
import { DEFAULT_GITHUB_MESSAGES, githubActionsErrorMessage, githubActionsHandlers } from '../executors/github-actions.mjs';
import { countFailures } from '../retry.mjs';

/**
 * File conversion = the file-conversion kind executed by the
 * file-converter-ai `pdf-to-md.yml` workflow. Hosted by the Cloudflare
 * coordinator in production and by the Node pdf service for rollback; both
 * build the same engine here, so their behaviour cannot drift.
 *
 * A new conversion type adds its workflow inputs here (and its workflow in
 * file-converter-ai); the lifecycle, queueing and error handling are shared.
 */

export const PDF_TO_MD = 'pdf_to_md';

const PDF_OPTION_INPUTS = ['adjacent_pages', 'concurrency', 'provider', 'model', 'reasoning_effort', 'max_output_tokens', 'thinking_level', 'dpi', 'image_format', 'jpeg_quality', 'verification_passes', 'media_resolution', 'rpm_per_key', 'rpd_per_key', 'start_page', 'end_page'];

/** Whitelisted workflow inputs, built from the saved job only (never from a browser payload). */
export function buildPdfWorkflowInputs(row) {
  const conversionType = String(row.conversionType || PDF_TO_MD).trim();
  if (conversionType !== PDF_TO_MD) throw new Error(`Unsupported PDF conversion type: ${conversionType}`);

  const inputs = {
    conversion_type: conversionType,
    source_url: String(row.sourceUrl || ''),
    output_name: String(row.outputName || ''),
    request_id: String(row.id || ''),
    // The system prompt is snapshotted onto the job by PocketBase when the job
    // is created, so changing the saved profile cannot change a queued job.
    system_prompt: String(row.systemPrompt || ''),
    prompt: String(row.prompt || ''),
  };
  const options = row.options && typeof row.options === 'object' && !Array.isArray(row.options) ? row.options : {};
  for (const key of PDF_OPTION_INPUTS) {
    if (options[key] !== undefined && options[key] !== '') inputs[key] = String(options[key]);
  }
  return inputs;
}

/**
 * Conversions are serialized by default. Every Actions run draws on the same
 * free-tier model quota and fans its pages out in parallel, so overlapping
 * runs multiply the request rate: three simultaneous jobs turned a mild
 * upstream hiccup into a 503 storm (`recent_503_ratio=0.85`, every page
 * retried) instead of tripling throughput.
 */
export function createFileConversionEngine({ store, github, concurrency = 1, now, log }) {
  return createTaskEngine({
    kind: fileConversionKind,
    store,
    handlers: githubActionsHandlers({
      github,
      inputs: buildPdfWorkflowInputs,
      filename: (task) => `${task.outputName}.zip`,
    }),
    concurrency,
    onError: countFailures({
      max: 30,
      // A failed dispatching step may have reached GitHub: reconcile, never fail it blindly.
      holdStatuses: ['dispatching'],
      message: (task) => githubActionsErrorMessage(task),
      exhaustedMessage: (_task, failures) => DEFAULT_GITHUB_MESSAGES.syncExhausted(failures),
    }),
    ...(now ? { now } : {}),
    ...(log ? { log } : {}),
  });
}
