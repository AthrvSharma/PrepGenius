export function sanitizeText(value: string) {
  if (!value) return ''
  return value.replace(/<[^>]*>/g, '').trim()
}

export function clampText(value: string, maxLength = 2000) {
  const sanitized = sanitizeText(value)
  if (sanitized.length <= maxLength) return sanitized
  return sanitized.slice(0, maxLength)
}

export function normalizeTags(tags: string) {
  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}
