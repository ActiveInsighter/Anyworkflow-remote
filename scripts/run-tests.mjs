const testFiles = [
  'recurrence.test.mjs',
  'runtime-config.test.mjs',
  'pdf-api.test.mjs',
  'event-structure.test.mjs',
  'codex-dsl.test.mjs',
  'workflow-dsl.test.mjs',
  'queue-repeat.test.mjs',
  'history-selection.test.mjs',
  'editor-helpers.test.mjs',
  'editor-commands.test.mjs',
  'library-tree.test.mjs',
  'session-storage.test.mjs',
  'run-family-api.test.mjs',
  'history-messages.test.mjs',
  'run-edit.test.mjs',
  'dashboard-api.test.mjs',
  'run-name.test.mjs',
]

for (const file of testFiles) {
  await import(new URL(file, import.meta.url))
}
