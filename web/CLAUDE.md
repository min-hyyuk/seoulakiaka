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
    [labelNum]: { box, batch, ... }   // batch = 반출/반입회차 (transfer_records와 연결 키)
  },
  labels: {
    [labelNum]: {
      분류:    { date, worker, kwon, gun, note },
      면표시:  { date, worker, myun, note },
      문서스캔: { date, worker, myun, domyun_type, note },  // domyun_type: '도면포함'
      도면스캔: { date, worker, myun, domyun_type, note },  // domyun_type: '전체도면'
      보정:    { date, worker, myun, note },
      색인:    { date, worker, gun, note },
      재편철:  { date, worker, kwon, gun, note },
      공개구분: { date, worker, kwon, gun, note }
    }
  },
  transfer_records: [
    { group, name, batch, transferDate, place, qty, split, exclude, childExclude, merge, fullSplit, kwon, inPlace }
  ],
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
- 대시보드 상세 테이블: 스캔합계(부모, 클릭 시 자식 토글) → 문서스캔(자식) → 도면스캔(자식)
- 일별 총괄표 누적합계: 스캔합계·문서스캔·도면스캔 **한 줄 가로 배치** (`.scan-cum-block`)
- 전체 현황 완료 카드: 동일한 가로 배치 구조

---

## 공정별 목표 기준
| 공정 | 실적 단위 | 목표 | 상세테이블 표기 |
|------|----------|------|----------------|
| 분류 | 권호수 (cp) | 12,000권 (tkwon) | 12,000권 |
| 면표시 | 면 (cs) | 125만면 (tmyun) | 1,250,000면 |
| 스캔합계 | 면 (문서+도면 cs 합산) | 125만면 | 1,250,000면 |
| 문서스캔 | 면 (cs) | 125만면 | — (자식행) |
| 도면스캔 | 면 (cs) | 125만면 | — (자식행) |
| 보정 | 면 (cs) | 125만면 | 1,250,000면 |
| 색인 | 건 (cs=gun) | 125만면 기준 | 12,000권 |
| 재편철 | 권호수 (cp) | 12,000권 | 12,000권 |
| 공개구분 | 권호수 (cp) | 12,000권 | 12,000권 |

---

## 잔여량 단위 규칙 (대시보드 상세 테이블)
- **권**: 분류, 색인, 재편철, 공개구분
- **면**: 면표시, 스캔합계, 보정

---

## 게이지 delta 표기
- 가장 최근 작업일 **전날 대비** 공정율 변화량 (`+X%p` / `-X%p`)
- 상승 → 초록, 하락 → 빨강, 동일 → 회색
- `cumPrev`: 최신 날짜 항목 제외 후 계산한 이전 누적 공정율

---

## 실적 세부 칩 (detailChips)
| 공정 | 표시 칩 |
|------|---------|
| 분류 | 권(레이블수), 권호수, 건 |
| 면표시 | 권호수, 건, 면 |
| 스캔합계 | 권호수, 건, 면 |
| 문서스캔 | 권호수, 건, 면 |
| 도면스캔 | 권호수, 건, 면 |
| 보정 | 권호수, 건, 면 |
| 색인 | 권호수, 건, 면(연관 레이블 파생) |
| 재편철 | 권호수, 건, 면(연관 레이블 파생) |
| 공개구분 | 권호수, 건, 면(연관 레이블 파생) |

> 색인·재편철·공개구분의 면 = 동일 레이블의 보정→면표시→스캔 순으로 참조

---

## 반입반출 현황

### 데이터 구조 (`transfer_records`)
- `group`: '반출' 또는 '반입'
- `name`: 회차 (수기 입력, 설명용. 예: "01(서소문서고 3월1차) 1차")
- `batch`: 반출/반입회차 (레이블 연결 키. 예: "아동카드")
- `transferDate`: 반출/반입일자
- `place`: 반출장소
- `qty`: 반출수량(철) — **자동 집계** (label_registry에서 batch 매칭 레이블 수)
- `split/exclude/childExclude/merge/fullSplit`: 분철/제외/아동카드제외/합권/전권분철
- `kwon`: 권호수구분
- `inPlace`: 반입장소

### 자동 계산
- **반출수량(철)** = `label_registry`에서 해당 `batch`로 등록된 레이블 수
- **DB구축완료** = 해당 회차에서 공개구분(최종공정)까지 완료된 레이블 수

### 레이블 연결
- `transfer_records.batch` ↔ `label_registry[num].batch` 로 연결
- 레이블 업로드 시 새 batch 감지 → transfer_records에 자동 행 추가

### 엑셀 업로드 (통합)
- **반입반출 현황 페이지에서만 업로드** (설정에서 제거)
- 업로드 → 미리보기 → 레이블 등록 + 반입반출 회차 자동 생성
- 설정 > 레이블 등록: 등록된 레이블 목록 조회·삭제만 가능

### 인라인 편집
- 더블클릭 또는 F2로 셀 편집 모드 진입
- Enter 저장, Esc 취소, Tab 다음 셀 이동
- 반출수량(철)과 DB구축완료는 자동 계산 (편집 불가)

---

## 주요 함수

| 함수 | 역할 |
|------|------|
| `loadData()` / `saveData()` | localStorage 읽기/쓰기 |
| `calcCumulative(data)` | 공정별 누적 실적·공정율 계산. 반환: `{cp, cs, tkwon, tmyun, rp, rs, remP, remS}` |
| `getDailyAgg(data)` | 일별 집계 |
| `getTimeInfo(data)` | 기간진행률 계산 |
| `navigate(page, sub)` | 페이지 라우팅 |
| `renderDashboard()` | 대시보드 (게이지 7개 + 상세 테이블) |
| `renderTransferPage()` | 반입반출 현황 (총괄표 + 레이블 업로드) |
| `renderProgressOverview()` | 전체 현황 (목표 기준 완료 카드 + 스크롤 테이블) |
| `renderDailySummary()` | 일별 총괄표 (누적합계 + 일별 실적 테이블) |
| `renderProcessSheet()` | 공정별 시트 (입력/이력) |
| `addInputRow(proc, focusFirst)` | 입력행 추가 |
| `renderHistTable(proc)` | 작업이력 테이블 (더블클릭 인라인편집, 레이블번호 검색바, 컬럼 드롭다운 필터) |
| `startRowEdit(row)` / `saveRowEdit(row)` / `cancelRowEdit(row)` | 인라인 편집 |
| `renderWorkerStats()` / `updateWorkerStats()` | 작업자별 현황 (공정 필터 + 정렬 필터) |
| `renderQuality()` | 품질검사 |
| `renderSettings()` | 설정 |
| `exportData()` / `importData()` | JSON 백업/복원 |
| `toggleScanChildren(row)` | 대시보드 상세 테이블 스캔 자식행 토글 |
| `showColFilter(th, tableId, colIdx)` | 컬럼 헤더 드롭다운 필터 표시 |
| `applyCFSort(tableId, colIdx, dir)` | 컬럼 오름차순/내림차순 정렬 |
| `getBatchStats(batchName)` | 반입회차별 연결 레이블 통계 (총수/분류완료/공정완료) |
| `showBatchLabels(batchName)` | 회차별 연결 레이블 목록 + 공정 진행률 모달 |
| `startTfCellEdit(cell)` | 반입반출 테이블 인라인 셀 편집 |
| `previewLabelFile(input)` | 엑셀 파일 미리보기 |
| `importLabels(replace)` | 레이블 등록 + 반입반출 회차 자동 생성 |

---

## 페이지 구조 (사이드바 메뉴 순서)

| 메뉴 | 설명 |
|------|------|
| 📈 대시보드 | 전체 진행 현황, 공정별 진행률 게이지, 공정별 상세 현황 |
| — 구분선 — | |
| 📦 반입반출 현황 | 반출/반입 총괄표, 레이블 엑셀 업로드 (통합) |
| — 구분선 — | |
| 📅 일별 총괄표 | 누적합계 + 일별 실적 테이블 |
| 📋 공정진행표 | sub: 전체 현황 / 분류 / 면표시 / ... / 공개구분 |
| 👥 작업자별 현황 | 공정 필터, 정렬, 차트 |
| — 구분선 — | |
| 🔍 품질검사 | 레이블 검사, 검사 현황, 오류 분석, 재작업 관리 |
| — 구분선 — | |
| ⚙️ 설정 | 프로젝트 설정, 레이블 목록 조회, 작업자 관리, 데이터 백업 |

---

## 입력폼 키보드 동작
- **레이블 칸 Enter** → 새 행 추가 + 레이블 칸 포커스
- **권/건/면/비고 칸 Enter** → 기존 다음 행의 같은 칸으로 이동 (엑셀 방식)
- **Tab / Shift+Tab** → 같은 행 다음/이전 칸 이동
- **→ 방향키** (커서 끝) → 다음 칸 이동
- **← 방향키** (커서 처음) → 이전 칸 이동
- 권/건/면 칸: 기본값 없이 placeholder만 표시 (빈 상태에서 바로 입력)
- 숫자 입력칸: 스피너 화살표 제거 (`inputmode="numeric"`)

---

## 컬럼 헤더 드롭다운 필터

- **적용 테이블**: `progress-tbl` (전체현황), `hist-tbl` (공정별 이력)
- 헤더 클릭 → 오름차순/내림차순 정렬 + 고유값 체크박스 필터
- 드롭다운 내 검색창으로 값 빠르게 탐색
- 활성 필터 컬럼 헤더 색상 강조 (`cf-active`)
- `window._colFilters = { 'tableId:colIdx': Set }` — 필터 상태
- `window._colSorts = { 'tableId:colIdx': 'asc'|'desc' }` — 정렬 상태
- 배경 불투명 (`#fff`) — 뒤 텍스트 겹침 방지

---

## UI 패턴
- **인라인 편집**: 이력 테이블/반입반출 테이블 더블클릭 or F2 → 셀 input 전환 → Enter 저장 / Esc 취소
- **레이블번호 검색**: 이력 테이블 필터에 실시간 검색바 (`#hl`)
- **게이지 차트**: Chart.js doughnut, `circumference:180, rotation:-90` (반원)
- **게이지 delta**: 전날 대비 공정율 변화량 (초록/빨강/회색)
- **전체 현황 테이블**: 페이지네이션 없이 스크롤 (`max-height: calc(100vh - 320px)`), 헤더 sticky, 가운데 정렬
- **스캔합계 토글**: 상세 테이블에서 스캔합계 행 클릭 시 문서스캔·도면스캔 자식행 접기/펼치기
- **도면유형 표기**: 전체현황 레이블 테이블에서 문서스캔·도면스캔 셀에 도면포함/전체도면 표기
- **사이드바 구분선**: `.nav-divider` — 메뉴 그룹 사이 점선 구분

---

## 주요 CSS 클래스

| 클래스 | 용도 |
|--------|------|
| `.scan-cum-block` | 스캔 가로 배치 블록 (grid-column: span 2) |
| `.scan-inline-item` | 스캔 블록 내 개별 항목 |
| `.scan-inline-divider` | 스캔 항목 사이 구분선 |
| `.ds-hrow` / `.ds-hcol` | 일별 총괄표 셀 수평 레이아웃 |
| `.cm-hrow` / `.cm-hcol` | 누적합계 카드 수평 레이아웃 |
| `.detail-tbl` | 대시보드 공정별 상세 테이블 |
| `.dt-bar-wrap` / `.dt-bar-bg` / `.dt-bar-fill` | 공정율 바 (셀 너비 꽉 채움) |
| `.detail-chip` | 실적 세부 태그 |
| `.scan-parent-row` / `.scan-child-row` | 대시보드 상세 테이블 스캔 행 |
| `.scan-toggle-icon` | 스캔합계 토글 아이콘 (▾/▸) |
| `.scroll-table-wrap` | 전체 현황 스크롤 테이블 (헤더 sticky, 가운데 정렬) |
| `.hist-row` / `.hist-row.editing` | 이력 행 인라인 편집 |
| `.col-filter-dropdown` | 컬럼 드롭다운 필터 컨테이너 (배경 불투명) |
| `.cfd-sort` / `.cfd-sort-btn` | 드롭다운 내 정렬 버튼 |
| `.cfd-item` / `.cfd-val` / `.cfd-apply` | 드롭다운 필터 내부 요소 |
| `.th-cf` / `.cf-active` | 필터 가능 헤더 / 활성 필터 헤더 |
| `.transfer-tbl` | 반입반출 현황 테이블 |
| `.tf-row` / `.tf-cell` / `.tf-calc` | 반입반출 행/셀/자동계산셀 |
| `.tf-batch` | 반출/반입회차 셀 (연결 키, 강조 표시) |
| `.tf-group` / `.tf-subtotal` / `.tf-total` | 반입반출 그룹/소계/합계 행 |
| `.tf-edit-input` | 반입반출 인라인 편집 입력 |
| `.nav-divider` | 사이드바 메뉴 그룹 구분선 (점선) |

---

## 초기 데이터 로드
첫 실행 시 `fetch('../data.json')` 시도 → 기존 Streamlit 데이터 자동 가져오기
