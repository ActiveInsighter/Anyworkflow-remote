const testFiles = [
  'event-structure.test.mjs',
  'codex-dsl.test.mjs',
  'workflow-dsl.test.mjs',
  'history-selection.test.mjs',
  'editor-helpers.test.mjs',
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
