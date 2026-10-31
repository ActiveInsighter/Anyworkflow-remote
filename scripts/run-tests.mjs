const testFiles = [
  'recurrence.test.mjs',
  'runtime-config.test.mjs',
  'pdf-api.test.mjs',
  'run-exports.test.mjs',
  'pdf-upload-api.test.mjs',
  'event-structure.test.mjs',
  'browser-executor.test.mjs',
  'workflow-dsl.test.mjs',
  'queue-repeat.test.mjs',
  'history-selection.test.mjs',
  'editor-helpers.test.mjs',
  'editor-commands.test.mjs',
  'editor-structure.test.mjs',
  'editor-dsl.test.mjs',
  'start-links.test.mjs',
  'library-tree.test.mjs',
  'session-storage.test.mjs',
  'run-family-api.test.mjs',
  'history-messages.test.mjs',
  'execution-record.test.mjs',
  'run-edit.test.mjs',
  'dashboard-api.test.mjs',
  'run-name.test.mjs',
  'conversation-url.test.mjs',
  'chunk-reload.test.mjs',
  'task-kit.test.mjs',
  'dsl-kit.test.mjs',
]

for (const file of testFiles) {
  await import(new URL(file, import.meta.url))
}
