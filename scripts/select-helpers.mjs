// Exercise the actual Animate UI popup, including its keyboard/focus behavior.
export async function selectOption(trigger, value) {
  await trigger.click()
  await trigger.page().locator(`[role="option"][data-value=${JSON.stringify(String(value))}]`).click()
  await trigger.page().getByRole('listbox').waitFor({ state: 'detached' })
}
export async function selectOptions(trigger) {
  await trigger.click()
  const values = await trigger.page().getByRole('option').evaluateAll(items => items.map(item => item.dataset.value))
  await trigger.press('Escape')
  await trigger.page().getByRole('listbox').waitFor({ state: 'detached' })
  return values
}
