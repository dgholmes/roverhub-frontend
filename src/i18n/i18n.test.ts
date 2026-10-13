import { describe, expect, it } from 'vitest'
import { initialLanguage, LANGUAGES, RESOURCES } from './index'

/** Every leaf key path, with plural suffixes folded so en's `_one`/`_other`
 * pair and ko's lone `_other` count as the same key. */
function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string'
      ? [`${prefix}${k.replace(/_(one|other|zero|two|few|many)$/, '')}`]
      : keys(v as object, `${prefix}${k}.`),
  )
}

describe('locales', () => {
  const english = new Set(keys(RESOURCES.en.translation))
  for (const { code } of LANGUAGES) {
    it(`${code} has exactly the English keys`, () => {
      const these = new Set(keys(RESOURCES[code].translation))
      expect([...english].filter((k) => !these.has(k))).toEqual([])
      expect([...these].filter((k) => !english.has(k))).toEqual([])
    })
    it(`${code} keeps every {{placeholder}}`, () => {
      const flat = (o: object, p = ''): [string, string][] => Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'string' ? [[`${p}${k}`, v] as [string, string]] : flat(v as object, `${p}${k}.`))
      const enMap = new Map(flat(RESOURCES.en.translation).map(([k, v]) => [k.replace(/_(one|other)$/, ''), v]))
      for (const [k, v] of flat(RESOURCES[code].translation)) {
        const source = enMap.get(k.replace(/_(one|other)$/, ''))!
        const need = (source.match(/{{\s*\w+\s*}}/g) ?? []).sort()
        const have = (v.match(/{{\s*\w+\s*}}/g) ?? []).sort()
        expect({ key: k, have }).toEqual({ key: k, have: need })
      }
    })
  }
  it('lists every bundled language in the menu', () => {
    expect(LANGUAGES.map((l) => l.code).sort()).toEqual(Object.keys(RESOURCES).sort())
  })
})

describe('initialLanguage', () => {
  it('prefers the saved choice', () => expect(initialLanguage('ko', ['en-US'])).toBe('ko'))
  it('falls back to the browser language', () => expect(initialLanguage(null, ['ko-KR', 'en'])).toBe('ko'))
  it('ignores a saved language we do not have', () => expect(initialLanguage('xx', ['en-US'])).toBe('en'))
  it('defaults to English', () => expect(initialLanguage(null, ['fr-FR'])).toBe('en'))
})
