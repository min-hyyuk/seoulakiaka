# 기록물 정리사업 공정관리 대시보드 — Claude 컨텍스트

## 프로젝트 개요
서울 기록물 정리사업의 공정 진행 현황을 관리하는 대시보드.
Python/Streamlit 없이 **순수 HTML/JS/CSS**로 구현된 SPA. 브라우저에서 바로 실행.

- **경로**: `d:/noah/dashboard/web/`
- **진입점**: `index.html`
- **저장소**: `https://github.com/min-hyyuk/seoulakiaka.git` (branch: main)

---

## 파일 구조
```
web/
├── index.html   — SPA 쉘 (sidebar, main-content, modal, toast)
├── app.js       — 전체 로직 (라우터, 렌더러, 데이터 관리)
├── style.css    — 전체 스타일
└── CLAUDE.md    — 이 파일
```

---

## 기술 스택
- **Chart.js 4.4.4** (CDN) — 게이지(반원 도넛), 바/라인 차트
- **SheetJS xlsx 0.18.5** (CDN) — 레이블 등록 엑셀 업로드
- **localStorage** — 데이터 저장 (`kiro_dash_v2` 키)
- JSON 내보내기/가져오기로 백업

---

## 데이터 모델 (localStorage: `kiro_dash_v2`)
```js
{
  project: { name, start_date, end_date, total_kwon, total_myun },
  targets: { target_kwon: 12000, target_myun: 1250000 },
  workers: [],
  label_registry: {
    [labelNum]: { box, batch, ... }
  },
  labels: {
    [labelNum]: {
      분류:    { date, worker, kwon, gun, note },
      면표시:  { date, worker, myun, note },
      문서스캔: { date, worker, myun, domyun_type, note },
      도면스캔: { date, worker, myun, domyun_type, note },
      보정:    { date, worker, myun, note },
      색인:    { date, worker, gun, note },
      재편철:  { date, worker, kwon, gun, note },
      공개구분: { date, worker, kwon, gun, note }
    }
  },
  sampling_logs: [],
  error_labels: [],
  daily_logs: []
}
```

---

## 공정 상수
```js
const PROCESSES = ['분류','면표시','문서스캔','도면스캔','보정','색인','재편철','공개구분'];
const AUTO_PROCS = ['재편철','공개구분'];  // 분류 데이터에서 자동 채움
```

---

## 권호수(kwon) 개념
- **레이블 1개 ≠ 1권** — 분류 작업 시 1레이블이 2~4권으로 나뉠 수 있음
- `분류.kwon` = 권호수 (실제 볼륨 수), `분류.gun` = 건수
- `target_kwon: 12000` = 권호수 기준 목표
- 분류 외 공정의 권호수·건은 해당 레이블의 분류 데이터에서 자동 계산

---

## 스캔 계층 구조
- **스캔합계** = 문서스캔 + 도면스캔 (상위 개념)
- 도면스캔에서는 **면**이 주요 지표. 권호수·건은 레이블이 '전체도면'일 때만 중요
- 대시보드 게이지: 분류 / 면표시 / **스캔합계** / 보정 / 색인 / 재편철 / 공개구분 (7개)
- 대시보드 상세 테이블: 스캔합계(부모) → ┣ 문서스캔(자식) → ┗ 도면스캔(자식)
- 일별 총괄표 누적합계: 스캔합계·문서스캔·도면스캔 **한 줄 가로 배치** (`.scan-cum-block`)
- 전체 현황 완료 카드: 동일한 가로 배치 구조

---

## 공정별 목표 기준
| 공정 | 실적 단위 | 목표 |
|------|----------|------|
| 분류 | 권호수 (cp) | 12,000권 (tkwon) |
| 면표시 | 면 (cs) | 125만면 (tmyun) |
| 스캔합계 | 면 (문서+도면 cs 합산) | 125만면 |
| 문서스캔 | 면 (cs) | 125만면 |
| 도면스캔 | 면 (cs) | 125만면 |
| 보정 | 면 (cs) | 125만면 |
| 색인 | 건 (cs=gun, 임시 125만면 기준) | 추후 건 기준으로 변경 예정 |
| 재편철 | 권호수 (cp) | 12,000권 |
| 공개구분 | 권호수 (cp) | 12,000권 |

---

## 잔여량 단위 규칙 (대시보드 상세 테이블)
- **권**: 분류, 색인, 재편철, 공개구분
- **면**: 면표시, 스캔합계, 보정

---

## 주요 함수

| 함수 | 역할 |
|------|------|
| `loadData()` / `saveData()` | localStorage 읽기/쓰기 |
| `calcCumulative(data)` | 공정별 누적 실적·공정율 계산. 반환: `{cp, cs, tkwon, tmyun, rp, rs, remP, remS}` |
| `getDailyAgg(data)` | 일별 집계 |
| `getTimeInfo(data)` | 기간진행률 계산 |
| `navigate(page, sub)` | 페이지 라우팅 |
| `renderDashboard()` | 대시보드 (게이지 7개 + 상세 테이블 + 추이 차트) |
| `renderProgressOverview()` | 전체 현황 (목표 기준 완료 카드 + 스크롤 테이블) |
| `renderDailySummary()` | 일별 총괄표 (누적합계 + 일별 실적 테이블) |
| `renderProcessSheet()` | 공정별 시트 (입력/이력) |
| `addInputRow(proc, focusFirst)` | 입력행 추가 (Enter 자동 다음행) |
| `renderHistTable(proc)` | 작업이력 테이블 (더블클릭 인라인편집, 레이블번호 검색바) |
| `startRowEdit(row)` / `saveRowEdit(row)` / `cancelRowEdit(row)` | 인라인 편집 |
| `renderWorkerStats()` / `updateWorkerStats()` | 작업자별 현황 (공정 필터 포함) |
| `renderQuality()` | 품질검사 |
| `renderSettings()` | 설정 |
| `exportData()` / `importData()` | JSON 백업/복원 |

---

## 페이지 구조

| 메뉴 | sub |
|------|-----|
| 📈 대시보드 | — |
| 📋 공정진행표 | 전체 현황 / 일별 총괄표 / 분류 / 면표시 / 문서스캔 / 도면스캔 / 보정 / 색인 / 재편철 / 공개구분 |
| 👥 작업자별 현황 | — |
| 🔍 품질검사 | — |
| ⚙️ 설정 | — |

---

## 일별 총괄표 상세

### 컬럼 구조
- **분류**: 권(레이블수) / 권호수 / 건 / 인원
- **기타 공정**: 권호수(분류에서 자동) / 건(분류에서 자동) / 면(공정 입력) / 인원
- 날짜 정렬: 오름차순 (최신 날짜 **하단**)
- 셀 내 값: **수평 나열** (`.ds-hrow` / `.ds-hcol`)

### 누적합계 스캔 블록 (`.scan-cum-block`)
- 스캔합계·문서스캔·도면스캔이 **한 줄 가로 배치**
- 구조: `[스캔합계] | [문서스캔] | [도면스캔]` (`.scan-inline-item` + `.scan-inline-divider`)

---

## 작업자별 현황

- **공정 필터**: `전체` 또는 개별 공정 선택
- **전체 선택 시**: 공정×작업자 피벗 테이블. 분류는 권호수·건 **두 컬럼**으로 분리
- **개별 공정 선택 시**: 작업자별 권호수·수량 집계 + 바 차트 + 일별 추이 라인 차트
- 단위: 분류·색인·재편철·공개구분 = 건, 면표시·스캔·보정 = 면

---

## UI 패턴
- **Enter 자동 행 추가**: 입력폼 마지막 셀에서 Enter → 새 행 추가 + 포커스
- **인라인 편집**: 이력 테이블 더블클릭 or F2 → 셀이 input 전환 → Enter 저장 / Esc 취소
- **레이블번호 검색**: 이력 테이블 필터에 실시간 검색바 (`#hl`)
- **게이지 차트**: Chart.js doughnut, `circumference:180, rotation:-90` (반원)
- **게이지 delta**: 공정율(%) - 기간진행률(%) (+ 앞서는 중, - 지연)
- **전체 현황 테이블**: 페이지네이션 없이 스크롤 (`max-height: calc(100vh - 320px)`), 헤더 sticky

---

## 주요 CSS 클래스

| 클래스 | 용도 |
|--------|------|
| `.scan-cum-block` | 스캔 가로 배치 블록 (grid-column: span 2) |
| `.scan-inline-item` | 스캔 블록 내 개별 항목 |
| `.scan-inline-divider` | 스캔 항목 사이 구분선 |
| `.ds-hrow` / `.ds-hcol` | 일별 총괄표 셀 수평 레이아웃 |
| `.cm-hrow` / `.cm-hcol` | 누적합계 카드 수평 레이아웃 |
| `.detail-tbl` | 대시보드 공정별 상세 테이블 (table-layout 자동) |
| `.dt-bar-wrap` / `.dt-bar-bg` / `.dt-bar-fill` | 공정율 바 (셀 너비 꽉 채움) |
| `.detail-chip` | 실적 세부 태그 |
| `.scan-parent-row` / `.scan-child-row` | 대시보드 상세 테이블 스캔 행 |
| `.scroll-table-wrap` | 전체 현황 스크롤 테이블 (헤더 sticky) |
| `.hist-row` / `.hist-row.editing` | 이력 행 인라인 편집 |

---

## 초기 데이터 로드
첫 실행 시 `fetch('../data.json')` 시도 → 기존 Streamlit 데이터 자동 가져오기
