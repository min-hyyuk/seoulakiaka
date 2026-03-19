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
└── style.css    — 전체 스타일
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
  workers: [],           // 작업자 목록
  label_registry: {      // 레이블 메타 (엑셀 업로드)
    [labelNum]: { box, batch, ... }
  },
  labels: {              // 공정별 작업 이력
    [labelNum]: {
      분류:   { date, worker, kwon, gun, note },
      면표시: { date, worker, myun, note },
      문서스캔: { date, worker, myun, domyun_type, note },
      도면스캔: { date, worker, myun, domyun_type, note },
      보정:   { date, worker, myun, note },
      색인:   { date, worker, gun, note },
      재편철: { date, worker, kwon, gun, note },
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

## 스캔 계층 구조
- **스캔합계** = 문서스캔 + 도면스캔 (상위 개념)
- 게이지 그리드: 분류 / 면표시 / **스캔합계** / 보정 / 색인 / 재편철 / 공개구분 (7개)
- 공정별 상세 테이블: 스캔합계(부모) → ┣ 문서스캔 → ┗ 도면스캔(자식)

---

## 권호수(kwon) 개념
- **레이블 1개 ≠ 1권** — 분류 작업 시 1레이블이 2~4권으로 나뉠 수 있음
- `분류.kwon` = 권호수 (실제 볼륨 수), `분류.gun` = 건수
- `target_kwon: 12000` = 권호수 기준 목표
- 분류 외 공정의 권호수·건은 해당 레이블의 분류 데이터에서 자동 계산

---

## 주요 함수

| 함수 | 역할 |
|------|------|
| `loadData()` / `saveData()` | localStorage 읽기/쓰기 |
| `calcCumulative(data)` | 공정별 누적 실적·공정율 계산 |
| `getDailyAgg(data)` | 일별 집계 |
| `getTimeInfo(data)` | 기간진행률 계산 |
| `navigate(page, sub)` | 페이지 라우팅 |
| `renderDashboard()` | 대시보드 렌더 |
| `renderProgressOverview()` | 전체 현황 (스크롤 테이블) |
| `renderDailySummary()` | 일별 총괄표 |
| `renderProcessSheet()` | 공정별 시트 (입력/이력) |
| `addInputRow(proc, focusFirst)` | 입력행 추가 (Enter 자동 다음행) |
| `renderHistTable(proc)` | 작업이력 테이블 (더블클릭 인라인편집) |
| `startRowEdit(row)` / `saveRowEdit(row)` / `cancelRowEdit(row)` | 인라인 편집 |
| `renderWorkerStats()` | 작업자별 현황 |
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

## 잔여량 단위 규칙
- **권**: 분류, 색인, 재편철, 공개구분
- **면**: 면표시, 스캔합계, 보정

---

## 일별 총괄표 컬럼 구조
- **분류**: 권(레이블수) / 권호수 / 건 / 인원
- **기타 공정**: 권호수(분류에서 자동) / 건(분류에서 자동) / 면(공정 입력) / 인원
- 날짜 정렬: 오름차순 (최신 날짜 하단)

---

## UI 패턴
- **Enter 자동 행 추가**: 입력폼 마지막 셀에서 Enter → 새 행 추가 + 포커스
- **인라인 편집**: 이력 테이블 더블클릭 or F2 → 셀이 input으로 전환 → Enter 저장 / Esc 취소
- **게이지 차트**: Chart.js doughnut, `circumference:180, rotation:-90` (반원)
- **게이지 delta**: 공정율(%) - 기간진행률(%) 표시 (+ 앞서는 중, - 지연)

---

## 초기 데이터 로드
첫 실행 시 `fetch('../data.json')` 시도 → 기존 Streamlit 데이터 자동 가져오기
