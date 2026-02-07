export function logInfo(message: string, context?: Record<string, unknown>) {
  console.info(`[PrepGenius] ${message}`, context || '')
}

export function logWarning(message: string, context?: Record<string, unknown>) {
  console.warn(`[PrepGenius] ${message}`, context || '')
}

export function logError(message: string, context?: Record<string, unknown>) {
  console.error(`[PrepGenius] ${message}`, context || '')
}
