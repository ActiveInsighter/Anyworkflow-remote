import { normalizeRuntimeConfig, type RuntimeConfig } from '@/lib/domain/runtime-config'

/** First problem with a runtime config, worded for the form; empty when the config is valid. */
export function runtimeConfigError(config: RuntimeConfig): string {
  try {
    normalizeRuntimeConfig(config)
    return ''
  } catch {
    const browser = config.browser
    if (!Number.isSafeInteger(browser.replyTimeoutMinutes) || browser.replyTimeoutMinutes < 1 || browser.replyTimeoutMinutes > 1440) {
      return '回复超时需为 1–1440 的整数分钟。'
    }
    const wait = browser.randomWait
    if (![wait.minSeconds, wait.maxSeconds].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 86400)) {
      return '随机等待需为 0–86400 的整数秒。'
    }
    if (wait.maxSeconds < wait.minSeconds) return '最长等待不能小于最短等待。'
    const deferred = browser.deferredReply
    if (!Number.isSafeInteger(deferred.delayMinutes) || deferred.delayMinutes < 0 || deferred.delayMinutes > 1440) {
      return '回收延迟需为 0–1440 的整数分钟。'
    }
    return '模型名称或思考程度无效。'
  }
}
