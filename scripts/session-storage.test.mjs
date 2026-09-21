import assert from 'node:assert/strict'

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem() {
      throw new Error('storage unavailable')
    },
    setItem() {
      throw new Error('storage unavailable')
    },
    removeItem() {
      throw new Error('storage unavailable')
    },
  },
})

const { readStorage, removeStorage, writeStorage } = await import('../src/lib/storage.ts')

assert.equal(readStorage('session'), undefined)
assert.doesNotThrow(() => writeStorage('session', 'value'))
assert.doesNotThrow(() => removeStorage('session'))

const values = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
    removeItem(key) {
      values.delete(key)
    },
  },
})

writeStorage('session', 'value')
assert.equal(readStorage('session'), 'value')
removeStorage('session')
assert.equal(readStorage('session'), null)

console.log('session storage assertions passed')
