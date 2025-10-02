export interface NormalizedText {
  text: string
  map: number[]
}

/**
 * Collapse whitespace sequences to a single space, tracking original indices.
 */
export function buildNormalizedText(input: string, mode: 'collapse' | 'remove' = 'collapse'): NormalizedText {
  const chars: string[] = []
  const map: number[] = []
  let lastWasSpace = true
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (/\s/.test(ch)) {
      if (mode === 'remove') {
        // skip whitespace entirely
        continue
      }
      if (lastWasSpace) continue
      chars.push(' ')
      map.push(i)
      lastWasSpace = true
    } else {
      chars.push(ch)
      map.push(i)
      lastWasSpace = false
    }
  }
  return { text: chars.join(''), map }
}

export function createSearchData(hay: string, needle: string, caseSensitive = false, removeWhitespace = true) {
  const mode = removeWhitespace ? 'remove' : 'collapse'
  const normalizedHay = buildNormalizedText(hay, mode)
  const normalizedNeedle = buildNormalizedText(needle, mode)
  const hayText = caseSensitive ? normalizedHay.text : normalizedHay.text.toLowerCase()
  const needleText = caseSensitive ? normalizedNeedle.text : normalizedNeedle.text.toLowerCase()
  return { normalizedHay, normalizedNeedle, hayText, needleText }
}

export function findAllOccurrences(hay: string, needle: string): number[] {
  const res: number[] = []
  if (!needle) return res
  let pos = 0
  while (pos <= hay.length) {
    const idx = hay.indexOf(needle, pos)
    if (idx === -1) break
    res.push(idx)
    pos = idx + Math.max(needle.length, 1)
  }
  return res
}
