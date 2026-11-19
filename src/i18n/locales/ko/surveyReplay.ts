import type { Translation } from '../../types'

/** 한국어 — must match ../en/surveyReplay.ts key for key. */
export const surveyReplay: Translation['surveyReplay'] = {
  list: {
    loading: '측량 기록을 불러오는 중…',
    open: '측량 열기: {{name}}',
    takes_other: '테이크 {{count}}개',
    durationTitle: '측량을 녹화한 시간',
    walked: '{{m}} m',
    walkedTitle: '실시간 테이크에서 로봇 다리가 걸은 거리',
    takesTitle: '이 측량으로 만든 궤적입니다: 실시간 궤적, 재실행, 가져온 궤적.',
    recordingDeleted: '녹화 삭제됨',
    recordingDeletedTitle: '로봇 컴퓨터에서 이 측량의 녹화를 삭제해 다시 실행할 수 없습니다. 기존 테이크는 계속 재생됩니다.',
    emptyTitle: '아직 측량 기록이 없습니다',
    emptyBody: '미션 › 지도 › 측량에서 저장하면 여기에 나타납니다. 각 측량은 지도 궤적을 로봇 자체의 다리 오도메트리와 비교해 보관합니다.',
    errorTitle: '측량 보관소에 연결할 수 없습니다',
    errorBody: '백엔드가 측량 목록에 응답하지 않았습니다 ({{error}}).',
  },
  verdict: {
    noDrift: '드리프트 없음',
    noDriftTitle: '실시간 궤적의 모든 구간이 다리 오도메트리와 일치합니다.',
    driftFrom: '{{at}}부터 드리프트',
    driftFromTitle: '측량 시작 후 {{at}}에 실시간 궤적이 처음으로 다리 오도메트리와 어긋납니다.',
    noLegs: '다리 오도메트리 없음',
    noLegsTitle: '이 녹화에는 다리 오도메트리가 없어 드리프트를 판단할 수 없습니다.',
  },
  page: {
    back: '측량',
    stub: '{{id}}의 재생 화면은 아직 없습니다.',
  },
}
