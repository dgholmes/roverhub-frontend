import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { MapVersion } from '@/types/mapPipeline'
import { MapVersionsSection } from './MapVersionsSection'

const v = (version: number, source: string, restored_from: number | null = null): MapVersion => ({
  version, current: version === 9, source, created_at: '2026-11-16T05:00:00Z', restored_from, detail: {}, name: 'Venue',
  updated_at: '2026-11-16T05:00:00Z', zones: 0, floors: [], quality: null,
})
const versions = [v(9, 'planning'), v(8, 'cloud_edit'), v(7, 'cloud_edits'), v(6, 'moved'), v(5, 'restore', 2),
  v(4, 'survey'), v(3, 'upload'), v(2, 'something_new')]
const html = () => renderToStaticMarkup(<MapVersionsSection versions={versions} error={null} canRestore={false} onRestore={async () => {}} />)

afterEach(() => { void i18n.changeLanguage('en') })

describe('where each version came from', () => {
  it('names every source the backend writes, in English and Korean', async () => {
    await i18n.changeLanguage('en')
    const en = html()
    for (const s of ['Brush edit', 'Map cleanup', 'Moved-spot list edited', 'Restored from version 2', 'Survey upload', 'Uploaded bundle']) {
      expect(en).toContain(s)
    }
    expect(en.match(/Map cleanup/g)).toHaveLength(2)
    expect(en).not.toMatch(/>planning<|>cloud_edit<|>moved</)
    await i18n.changeLanguage('ko')
    const ko = html()
    for (const s of ['브러시 편집', '지도 정리', '움직인 지점 목록 편집', '버전 2에서 복원', '측량 업로드', '번들 업로드']) expect(ko).toContain(s)
  })

  it('shows a source it does not know as it comes', async () => {
    await i18n.changeLanguage('en')
    expect(html()).toContain('something_new')
  })
})
