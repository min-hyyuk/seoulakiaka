import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, date, timedelta
import json
import os

# ============================================================
# 설정
# ============================================================
st.set_page_config(
    page_title="기록물 정리사업 공정관리 대시보드",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(DATA_DIR, "data.json")

# 공정 정의 (순서대로)
PROCESSES = ["분류", "면표시", "문서스캔", "도면스캔", "보정", "색인", "재편철", "공개구분"]
PROCESS_COLORS = {
    "분류": "#FF6B6B", "면표시": "#FFA94D", "문서스캔": "#FFD43B",
    "도면스캔": "#A9E34B", "보정": "#69DB7C", "색인": "#38D9A9",
    "재편철": "#4DABF7", "공개구분": "#9775FA",
}

# 단위 정의
PROCESS_UNITS = {
    "분류": {"primary": "권", "secondary": "건"},
    "면표시": {"primary": "권", "secondary": "면"},
    "문서스캔": {"primary": "권", "secondary": "면"},
    "도면스캔": {"primary": "권", "secondary": "면"},
    "보정": {"primary": "권", "secondary": "면"},
    "색인": {"primary": "권", "secondary": "건"},
    "재편철": {"primary": "권", "secondary": "건"},
    "공개구분": {"primary": "권", "secondary": "건"},
}

AUTO_PROCESSES = ["재편철", "공개구분"]


# ============================================================
# 데이터 관리
# ============================================================
def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        changed = False
        if "labels" not in data:
            data["labels"] = {}
            changed = True
        if "targets" in data and "분류" in data["targets"]:
            data["targets"] = {
                "target_kwon": data["project"].get("total_kwon", 12000),
                "target_myun": data["project"].get("total_myun", 1250000),
            }
            changed = True
        if changed:
            save_data(data)
        return data
    return get_default_data()


def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_default_data():
    return {
        "project": {
            "name": "2026년 중요기록물 정리사업",
            "start_date": "2026-03-16",
            "end_date": "2026-12-16",
            "total_kwon": 12000,
            "total_myun": 1250000,
        },
        "targets": {
            "target_kwon": 12000,
            "target_myun": 1250000,
        },
        "workers": [],
        "labels": {},
        "daily_logs": [],
        "sampling_logs": [],
    }


# ============================================================
# 유틸리티
# ============================================================
def get_daily_df(data):
    """labels 데이터 + 레거시 daily_logs에서 일별 DataFrame 생성"""
    rows = []

    for label_num, label_data in data.get("labels", {}).items():
        bunryu = label_data.get("분류", {})
        kwon = bunryu.get("kwon", 1)
        gun = bunryu.get("gun", 0)

        for proc in PROCESSES:
            if proc not in label_data:
                continue
            entry = label_data[proc]
            if proc == "분류":
                p, s = entry.get("kwon", 0), entry.get("gun", 0)
            elif proc in ["면표시", "문서스캔", "도면스캔", "보정"]:
                p, s = kwon, entry.get("myun", 0)
            elif proc == "색인":
                p, s = kwon, entry.get("gun", 0)
            else:
                p, s = kwon, gun

            rows.append({
                "date": entry.get("date", ""),
                "worker": entry.get("worker", ""),
                "process": proc,
                "primary_qty": p,
                "secondary_qty": s,
            })

    for log in data.get("daily_logs", []):
        if "label" not in log:
            rows.append({
                "date": log["date"],
                "worker": log["worker"],
                "process": log["process"],
                "primary_qty": log.get("primary_qty", 0),
                "secondary_qty": log.get("secondary_qty", 0),
            })

    if not rows:
        return pd.DataFrame(columns=["date", "worker", "process", "primary_qty", "secondary_qty"])

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    return df


def calc_cumulative(df, targets):
    """공정별 누적 실적 계산"""
    target_kwon = targets.get("target_kwon", 0)
    target_myun = targets.get("target_myun", 0)

    result = {}
    for proc in PROCESSES:
        proc_df = df[df["process"] == proc] if len(df) > 0 else pd.DataFrame()
        cum_primary = int(proc_df["primary_qty"].sum()) if len(proc_df) > 0 else 0
        cum_secondary = int(proc_df["secondary_qty"].sum()) if len(proc_df) > 0 else 0

        t_p = target_kwon
        t_s = target_myun

        result[proc] = {
            "cum_primary": cum_primary,
            "cum_secondary": cum_secondary,
            "target_primary": t_p,
            "target_secondary": t_s,
            "rate_primary": round(cum_primary / t_p * 100, 1) if t_p > 0 else 0,
            "rate_secondary": round(cum_secondary / t_s * 100, 1) if t_s > 0 else 0,
            "remain_primary": max(0, t_p - cum_primary),
            "remain_secondary": max(0, t_s - cum_secondary),
        }
    return result


def get_label_stage(label_data):
    """레이블의 현재 완료 공정 단계 판별"""
    last = "미작업"
    for proc in PROCESSES:
        if proc in label_data:
            last = proc
    if last == "공개구분":
        return "완료"
    return last


# ============================================================
# 메인 앱
# ============================================================
def main():
    data = load_data()

    st.sidebar.title("📊 공정관리 대시보드")
    st.sidebar.markdown(f"**{data['project']['name']}**")
    st.sidebar.markdown(
        f"📅 {data['project']['start_date']} ~ {data['project']['end_date']}"
    )

    page = st.sidebar.radio(
        "메뉴",
        ["📈 대시보드", "📋 공정진행표", "👥 작업자별 현황", "🔍 품질검사", "⚙️ 설정"],
    )

    # 공정진행표 하위 공정 메뉴
    sub_process = None
    if page == "📋 공정진행표":
        st.sidebar.markdown("---")
        st.sidebar.markdown("**공정별 시트**")
        sub_items = ["전체 현황"] + PROCESSES
        sub_process = st.sidebar.radio("공정 선택", sub_items, label_visibility="collapsed")

    if page == "📈 대시보드":
        page_dashboard(data)
    elif page == "📋 공정진행표":
        if sub_process == "전체 현황":
            page_progress(data)
        else:
            page_process_sheet(data, sub_process)
    elif page == "👥 작업자별 현황":
        page_worker_stats(data)
    elif page == "🔍 품질검사":
        page_sampling(data)
    elif page == "⚙️ 설정":
        page_settings(data)


# ============================================================
# 📈 대시보드
# ============================================================
def page_dashboard(data):
    st.title("📈 공정 현황 대시보드")

    df = get_daily_df(data)
    cum = calc_cumulative(df, data["targets"])

    st.subheader("전체 진행 현황")

    rates = [cum[p]["rate_primary"] for p in PROCESSES]
    avg_rate = sum(rates) / len(rates)

    start = datetime.strptime(data["project"]["start_date"], "%Y-%m-%d").date()
    end = datetime.strptime(data["project"]["end_date"], "%Y-%m-%d").date()
    today = date.today()
    total_days = (end - start).days
    elapsed_days = max(0, min((today - start).days, total_days))
    remain_days = max(0, (end - today).days)
    time_rate = round(elapsed_days / total_days * 100, 1) if total_days > 0 else 0

    total_labels = len(data.get("labels", {}))

    col1, col2, col3, col4, col5 = st.columns(5)
    with col1:
        st.metric("평균 공정율", f"{avg_rate:.1f}%")
    with col2:
        st.metric("기간 진행률", f"{time_rate:.1f}%")
    with col3:
        st.metric("잔여일", f"{remain_days}일")
    with col4:
        work_days = df["date"].nunique() if len(df) > 0 else 0
        st.metric("작업일수", f"{work_days}일")
    with col5:
        st.metric("등록 레이블", f"{total_labels:,}건")

    if avg_rate < time_rate - 10:
        st.warning(f"⚠️ 공정율({avg_rate:.1f}%)이 기간진행률({time_rate}%)보다 낮습니다. 일정 지연 위험!")
    elif avg_rate >= time_rate:
        st.success(f"✅ 공정율({avg_rate:.1f}%)이 기간진행률({time_rate}%) 이상입니다.")

    st.divider()

    st.subheader("공정별 진행률")

    cols = st.columns(4)
    for i, proc in enumerate(PROCESSES):
        with cols[i % 4]:
            c = cum[proc]
            unit_p = PROCESS_UNITS[proc]["primary"]
            unit_s = PROCESS_UNITS[proc]["secondary"]

            fig = go.Figure(
                go.Indicator(
                    mode="gauge+number+delta",
                    value=c["rate_primary"],
                    number={"suffix": "%", "font": {"size": 28}},
                    title={"text": f"<b>{proc}</b>", "font": {"size": 16}},
                    delta={"reference": time_rate, "suffix": "%p"},
                    gauge={
                        "axis": {"range": [0, 100], "tickwidth": 1},
                        "bar": {"color": PROCESS_COLORS[proc]},
                        "steps": [
                            {"range": [0, 50], "color": "#f0f0f0"},
                            {"range": [50, 80], "color": "#e8e8e8"},
                            {"range": [80, 100], "color": "#e0e0e0"},
                        ],
                        "threshold": {
                            "line": {"color": "red", "width": 2},
                            "thickness": 0.75,
                            "value": time_rate,
                        },
                    },
                )
            )
            fig.update_layout(height=200, margin=dict(l=20, r=20, t=40, b=10))
            st.plotly_chart(fig, use_container_width=True)

            st.caption(
                f"실적: {c['cum_primary']:,}{unit_p} / {c['cum_secondary']:,}{unit_s}  \n"
                f"잔여: {c['remain_primary']:,}{unit_p}"
            )

    st.divider()

    st.subheader("공정별 상세 현황")

    table_data = []
    for proc in PROCESSES:
        c = cum[proc]
        unit_p = PROCESS_UNITS[proc]["primary"]
        unit_s = PROCESS_UNITS[proc]["secondary"]
        table_data.append({
            "공정": proc,
            f"목표({unit_p})": f"{c['target_primary']:,}",
            f"실적({unit_p})": f"{c['cum_primary']:,}",
            f"공정율": f"{c['rate_primary']}%",
            f"잔여({unit_p})": f"{c['remain_primary']:,}",
            f"실적({unit_s})": f"{c['cum_secondary']:,}",
        })
    st.dataframe(pd.DataFrame(table_data), use_container_width=True, hide_index=True)

    st.divider()

    if len(df) > 0:
        st.subheader("일별 공정 추이")

        tab1, tab2 = st.tabs(["일별 실적", "누적 실적"])

        with tab1:
            daily_agg = (
                df.groupby(["date", "process"])["secondary_qty"]
                .sum()
                .reset_index()
            )
            fig = px.bar(
                daily_agg, x="date", y="secondary_qty",
                color="process", color_discrete_map=PROCESS_COLORS,
                labels={"date": "날짜", "secondary_qty": "수량", "process": "공정"},
                title="일별 공정 실적",
            )
            fig.update_layout(height=400)
            st.plotly_chart(fig, use_container_width=True)

        with tab2:
            cumul_data = []
            for proc in PROCESSES:
                proc_df = df[df["process"] == proc].sort_values("date")
                if len(proc_df) == 0:
                    continue
                daily_sum = proc_df.groupby("date")["secondary_qty"].sum().reset_index()
                daily_sum["cumulative"] = daily_sum["secondary_qty"].cumsum()
                daily_sum["process"] = proc
                cumul_data.append(daily_sum)

            if cumul_data:
                cumul_df = pd.concat(cumul_data)
                fig = px.line(
                    cumul_df, x="date", y="cumulative",
                    color="process", color_discrete_map=PROCESS_COLORS,
                    labels={"date": "날짜", "cumulative": "누적 수량", "process": "공정"},
                    title="공정별 누적 추이",
                )
                fig.update_layout(height=400)
                st.plotly_chart(fig, use_container_width=True)


# ============================================================
# 📋 공정별 시트 (공정진행표 하위)
# ============================================================
def page_process_sheet(data, process):
    st.title(f"📋 {process}")

    # 1. 작업자 & 작업일자
    col1, col2 = st.columns(2)
    with col1:
        workers = data["workers"] if data["workers"] else ["(작업자를 먼저 등록하세요)"]
        worker = st.selectbox("작업자", workers, key=f"worker_{process}")
    with col2:
        input_date = st.date_input("작업일자", value=date.today(), key=f"date_{process}")

    can_input = data["workers"] and worker != "(작업자를 먼저 등록하세요)"

    st.divider()

    # 2. 실적 입력 시트
    st.subheader("실적 입력")

    if not can_input:
        st.warning("⚙️ 설정에서 작업자를 먼저 등록해주세요.")
    else:
        input_df = _render_input_editor(process)
        entries = _extract_entries(data, process, input_df)

        if entries:
            # 합계 표시
            if process == "분류":
                st.info(f"입력: {len(entries)}건 | 합계: {sum(e['kwon'] for e in entries):,}권 / {sum(e['gun'] for e in entries):,}건")
            elif process in ["면표시", "문서스캔", "도면스캔", "보정"]:
                st.info(f"입력: {len(entries)}건 | 합계: {sum(e['myun'] for e in entries):,}면")
            elif process == "색인":
                st.info(f"입력: {len(entries)}건 | 합계: {sum(e['gun'] for e in entries):,}건")
            elif process in AUTO_PROCESSES:
                no_data = [e["label"] for e in entries if e.get("kwon", 0) == 0 and e.get("gun", 0) == 0]
                msg = f"입력: {len(entries)}건"
                if no_data:
                    msg += f" | 분류 미완: {len(no_data)}건"
                st.info(msg)

            if st.button("💾 저장", type="primary", key=f"save_{process}"):
                _save_entries(data, worker, input_date.isoformat(), process, entries)
                save_data(data)
                st.success(f"✅ {input_date} {worker} - {process} {len(entries)}건 저장 완료!")
                st.rerun()

    st.divider()

    # 3. 작업자별 작업 이력 (편집 가능)
    _render_worker_log(data, worker, process)

    st.divider()

    # 4. 일자별 해당 공정 실적
    _render_process_daily(data, process)


def _render_input_editor(process):
    """공정별 입력 에디터 렌더링"""
    if process == "분류":
        st.caption("레이블, 권, 건을 입력하세요. 비고는 특이사항이 있을 때만 작성합니다.")
        return st.data_editor(
            pd.DataFrame({"레이블": pd.Series(dtype="str"), "권": pd.Series(dtype="int64"),
                           "건": pd.Series(dtype="int64"), "비고": pd.Series(dtype="str")}),
            num_rows="dynamic",
            column_config={
                "레이블": st.column_config.TextColumn("레이블", required=True, width="medium"),
                "권": st.column_config.NumberColumn("권", min_value=0, default=1, width="small"),
                "건": st.column_config.NumberColumn("건", min_value=0, default=0, width="small"),
                "비고": st.column_config.TextColumn("비고", width="large"),
            },
            key=f"editor_{process}",
            use_container_width=True,
        )
    elif process in ["면표시", "문서스캔", "도면스캔", "보정"]:
        st.caption("레이블과 면수를 입력하세요.")
        return st.data_editor(
            pd.DataFrame({"레이블": pd.Series(dtype="str"), "면": pd.Series(dtype="int64")}),
            num_rows="dynamic",
            column_config={
                "레이블": st.column_config.TextColumn("레이블", required=True, width="medium"),
                "면": st.column_config.NumberColumn("면", min_value=0, default=0, width="small"),
            },
            key=f"editor_{process}",
            use_container_width=True,
        )
    elif process == "색인":
        st.caption("레이블과 건수를 입력하세요.")
        return st.data_editor(
            pd.DataFrame({"레이블": pd.Series(dtype="str"), "건": pd.Series(dtype="int64")}),
            num_rows="dynamic",
            column_config={
                "레이블": st.column_config.TextColumn("레이블", required=True, width="medium"),
                "건": st.column_config.NumberColumn("건", min_value=0, default=0, width="small"),
            },
            key=f"editor_{process}",
            use_container_width=True,
        )
    elif process in AUTO_PROCESSES:
        st.caption("레이블번호만 입력하세요. 분류 데이터에서 권/건이 자동 반영됩니다.")
        return st.data_editor(
            pd.DataFrame({"레이블": pd.Series(dtype="str")}),
            num_rows="dynamic",
            column_config={
                "레이블": st.column_config.TextColumn("레이블", required=True, width="medium"),
            },
            key=f"editor_{process}",
            use_container_width=True,
        )
    return pd.DataFrame()


def _render_process_daily(data, process):
    """해당 공정의 일자별 실적"""
    st.subheader(f"{process} 일자별 실적")

    labels = data.get("labels", {})
    daily = {}

    for label_num, label_data in labels.items():
        if process not in label_data:
            continue
        entry = label_data[process]
        d = entry.get("date", "")
        w = entry.get("worker", "")
        if not d:
            continue

        if d not in daily:
            daily[d] = {"레이블수": 0, "작업자목록": set()}

        daily[d]["레이블수"] += 1
        if w:
            daily[d]["작업자목록"].add(w)

        if process == "분류":
            daily[d]["권"] = daily[d].get("권", 0) + entry.get("kwon", 0)
            daily[d]["건"] = daily[d].get("건", 0) + entry.get("gun", 0)
        elif process in ["면표시", "문서스캔", "도면스캔", "보정"]:
            daily[d]["면"] = daily[d].get("면", 0) + entry.get("myun", 0)
        elif process == "색인":
            daily[d]["건"] = daily[d].get("건", 0) + entry.get("gun", 0)

    if not daily:
        st.caption("아직 실적이 없습니다.")
        return

    rows = []
    for d in sorted(daily.keys(), reverse=True):
        v = daily[d]
        row = {"날짜": d, "레이블수": v["레이블수"], "작업자": ", ".join(sorted(v["작업자목록"]))}
        if process == "분류":
            row["권"] = v.get("권", 0)
            row["건"] = v.get("건", 0)
        elif process in ["면표시", "문서스캔", "도면스캔", "보정"]:
            row["면"] = v.get("면", 0)
        elif process == "색인":
            row["건"] = v.get("건", 0)
        rows.append(row)

    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)


def _render_worker_log(data, worker, process):
    """선택한 작업자의 해당 공정 작업 이력 (수정/삭제 기능 포함)"""
    st.subheader(f"{worker} - {process} 작업 이력")

    labels = data.get("labels", {})
    rows = []

    for label_num, label_data in labels.items():
        if process not in label_data:
            continue
        entry = label_data[process]
        if entry.get("worker") != worker:
            continue

        row = {"레이블": label_num, "작업일": entry.get("date", "")}

        if process == "분류":
            row["권"] = entry.get("kwon", 0)
            row["건"] = entry.get("gun", 0)
            row["비고"] = entry.get("note", "")
        elif process in ["면표시", "문서스캔", "도면스캔", "보정"]:
            row["면"] = entry.get("myun", 0)
        elif process == "색인":
            row["건"] = entry.get("gun", 0)
        elif process in AUTO_PROCESSES:
            row["권"] = entry.get("kwon", 0)
            row["건"] = entry.get("gun", 0)

        rows.append(row)

    if not rows:
        st.caption("아직 작업 이력이 없습니다.")
        return

    log_df = pd.DataFrame(rows).sort_values("작업일", ascending=False).reset_index(drop=True)

    # 요약
    if process == "분류":
        st.caption(f"총 {len(log_df)}건 | {log_df['권'].sum():,}권 / {log_df['건'].sum():,}건")
    elif process in ["면표시", "문서스캔", "도면스캔", "보정"]:
        st.caption(f"총 {len(log_df)}건 | {log_df['면'].sum():,}면")
    elif process == "색인":
        st.caption(f"총 {len(log_df)}건 | {log_df['건'].sum():,}건")
    elif process in AUTO_PROCESSES:
        st.caption(f"총 {len(log_df)}건")

    # 편집 모드 토글
    edit_mode = st.toggle("편집 모드", key=f"edit_mode_{process}")

    if not edit_mode:
        st.dataframe(log_df, use_container_width=True, hide_index=True)
        return

    # --- 편집 모드 ---

    # 체크박스로 선택
    select_col = [False] * len(log_df)
    log_df.insert(0, "선택", select_col)

    edited_df = st.data_editor(
        log_df,
        column_config={
            "선택": st.column_config.CheckboxColumn("선택", width="small"),
            "레이블": st.column_config.TextColumn("레이블", disabled=True, width="medium"),
            "작업일": st.column_config.TextColumn("작업일", disabled=True, width="small"),
        },
        disabled=["레이블", "작업일"],
        use_container_width=True,
        hide_index=True,
        key=f"edit_log_{process}",
    )

    selected_labels = edited_df[edited_df["선택"] == True]["레이블"].tolist()

    col_del, col_change, _ = st.columns([1, 2, 3])

    # 선택 삭제
    with col_del:
        if selected_labels:
            if st.button(f"🗑️ {len(selected_labels)}건 삭제", type="primary", key=f"del_{process}"):
                for lbl in selected_labels:
                    if lbl in data["labels"] and process in data["labels"][lbl]:
                        del data["labels"][lbl][process]
                        # 해당 레이블에 다른 공정 데이터도 없으면 레이블 자체 삭제
                        remaining = [k for k in data["labels"][lbl] if k in PROCESSES]
                        if not remaining:
                            del data["labels"][lbl]
                save_data(data)
                st.success(f"✅ {len(selected_labels)}건 삭제 완료!")
                st.rerun()

    # 작업자 변경
    with col_change:
        if selected_labels:
            other_workers = [w for w in data["workers"] if w != worker]
            if other_workers:
                new_worker = st.selectbox(
                    "작업자 변경",
                    other_workers,
                    key=f"change_worker_{process}",
                    label_visibility="collapsed",
                    placeholder="변경할 작업자 선택",
                )
                if st.button(f"👤 선택 {len(selected_labels)}건 → {new_worker}", key=f"apply_change_{process}"):
                    for lbl in selected_labels:
                        if lbl in data["labels"] and process in data["labels"][lbl]:
                            data["labels"][lbl][process]["worker"] = new_worker
                    save_data(data)
                    st.success(f"✅ {len(selected_labels)}건 작업자 → {new_worker} 변경 완료!")
                    st.rerun()

    if not selected_labels:
        st.caption("레이블을 선택하면 삭제 또는 작업자 변경이 가능합니다.")


def _extract_entries(data, process, input_df):
    """data_editor에서 유효한 엔트리를 추출"""
    if input_df is None or len(input_df) == 0:
        return []

    entries = []
    seen = set()

    for _, row in input_df.iterrows():
        label = str(row.get("레이블", "")).strip() if pd.notna(row.get("레이블")) else ""
        if not label or label in seen:
            continue
        seen.add(label)

        if process == "분류":
            kwon = int(row.get("권", 1)) if pd.notna(row.get("권")) else 1
            gun = int(row.get("건", 0)) if pd.notna(row.get("건")) else 0
            entry = {"label": label, "kwon": kwon, "gun": gun}
            note = str(row.get("비고", "")).strip() if pd.notna(row.get("비고")) else ""
            if note:
                entry["note"] = note
            entries.append(entry)

        elif process in ["면표시", "문서스캔", "도면스캔", "보정"]:
            myun = int(row.get("면", 0)) if pd.notna(row.get("면")) else 0
            entries.append({"label": label, "myun": myun})

        elif process == "색인":
            gun = int(row.get("건", 0)) if pd.notna(row.get("건")) else 0
            entries.append({"label": label, "gun": gun})

        elif process in AUTO_PROCESSES:
            info = data.get("labels", {}).get(label, {}).get("분류", {})
            entries.append({
                "label": label,
                "kwon": info.get("kwon", 0),
                "gun": info.get("gun", 0),
            })

    return entries


def _save_entries(data, worker, date_str, process, entries):
    """레이블 엔트리를 labels 데이터에 저장"""
    labels = data.setdefault("labels", {})

    for entry in entries:
        label_num = entry["label"]
        label = labels.setdefault(label_num, {})

        record = {"date": date_str, "worker": worker}

        if process == "분류":
            record["kwon"] = entry["kwon"]
            record["gun"] = entry["gun"]
            if entry.get("note"):
                record["note"] = entry["note"]
        elif process in ["면표시", "문서스캔", "도면스캔", "보정"]:
            record["myun"] = entry["myun"]
        elif process == "색인":
            record["gun"] = entry["gun"]
        elif process in AUTO_PROCESSES:
            bunryu = label.get("분류", {})
            record["kwon"] = entry.get("kwon", bunryu.get("kwon", 0))
            record["gun"] = entry.get("gun", bunryu.get("gun", 0))

        label[process] = record


# ============================================================
# 📋 공정진행표 (전체 현황)
# ============================================================
def page_progress(data):
    st.title("📋 공정진행표")

    labels = data.get("labels", {})

    if not labels:
        st.info("등록된 레이블이 없습니다. 좌측 공정별 시트에서 레이블을 등록해주세요.")
        return

    # --- 상단 요약 ---
    st.subheader("공정별 완료 현황")

    total_labels = len(labels)
    stage_counts = {}
    proc_completion = {proc: 0 for proc in PROCESSES}

    for label_data in labels.values():
        stage = get_label_stage(label_data)
        stage_counts[stage] = stage_counts.get(stage, 0) + 1
        for proc in PROCESSES:
            if proc in label_data:
                proc_completion[proc] += 1

    cols = st.columns(4)
    for i, proc in enumerate(PROCESSES):
        with cols[i % 4]:
            cnt = proc_completion[proc]
            rate = round(cnt / total_labels * 100, 1) if total_labels > 0 else 0
            st.metric(proc, f"{cnt:,} / {total_labels:,}", f"{rate}%")

    st.divider()

    st.subheader("현재 단계별 분포")

    stage_order = ["미작업"] + PROCESSES[:-1] + ["완료"]
    stage_data = []
    for stage in stage_order:
        cnt = stage_counts.get(stage, 0)
        if cnt > 0:
            stage_data.append({"단계": stage, "레이블수": cnt})

    if stage_data:
        stage_df = pd.DataFrame(stage_data)
        fig = px.bar(
            stage_df, x="단계", y="레이블수",
            color="단계", title="현재 공정 단계별 레이블 수",
            text="레이블수",
        )
        fig.update_layout(height=300, showlegend=False)
        fig.update_traces(textposition="outside")
        st.plotly_chart(fig, use_container_width=True)

    st.divider()

    # --- 검색 & 필터 ---
    st.subheader("레이블 상세")

    col_search, col_filter = st.columns([2, 1])
    with col_search:
        search = st.text_input("레이블 검색", placeholder="레이블번호 입력")
    with col_filter:
        filter_stage = st.selectbox("현재 단계 필터", ["전체"] + stage_order)

    # --- 진행표 테이블 (xlsx 진행표 시트 포맷) ---
    rows = []
    for label_num in sorted(labels.keys()):
        label_data = labels[label_num]
        stage = get_label_stage(label_data)

        if search and search not in label_num:
            continue
        if filter_stage != "전체" and stage != filter_stage:
            continue

        bunryu = label_data.get("분류", {})
        kwon = bunryu.get("kwon", "")
        gun_bunryu = bunryu.get("gun", "")

        # 면수: 각 공정별로 따로 표시
        myun_myunpyosi = label_data.get("면표시", {}).get("myun", "")
        myun_scan = label_data.get("문서스캔", {}).get("myun", "")
        myun_bojung = label_data.get("보정", {}).get("myun", "")

        # 색인 건수
        gun_saekin = label_data.get("색인", {}).get("gun", "")

        row = {
            "레이블번호": label_num,
            "현재완료공정": stage,
            "분권수": kwon,
            "건수(분류)": gun_bunryu,
            "건수(색인)": gun_saekin,
            "면수(면표시)": myun_myunpyosi,
            "면수(스캔)": myun_scan,
            "면수(보정)": myun_bojung,
        }

        # 각 공정별 완료여부 + 일자
        for proc in PROCESSES:
            if proc in label_data:
                d = label_data[proc].get("date", "")
                if d:
                    try:
                        row[f"{proc}"] = datetime.strptime(d, "%Y-%m-%d").strftime("%m-%d")
                    except (ValueError, TypeError):
                        row[f"{proc}"] = "O"
                else:
                    row[f"{proc}"] = "O"
            else:
                row[f"{proc}"] = ""

        # 비고
        note = bunryu.get("note", "")
        row["비고"] = note if note else ""
        rows.append(row)

    if not rows:
        st.info("검색 조건에 맞는 레이블이 없습니다.")
        return

    progress_df = pd.DataFrame(rows)

    # 컬럼 순서 정의 (xlsx 진행표 시트 포맷)
    col_order = [
        "레이블번호", "현재완료공정", "분권수",
        "건수(분류)", "건수(색인)",
        "면수(면표시)", "면수(스캔)", "면수(보정)",
        "분류", "면표시", "문서스캔", "도면스캔", "보정", "색인", "재편철", "공개구분",
        "비고",
    ]
    existing_cols = [c for c in col_order if c in progress_df.columns]
    progress_df = progress_df[existing_cols]

    # 페이지네이션
    page_size = 50
    total_pages = max(1, (len(rows) - 1) // page_size + 1)

    col_info, col_page = st.columns([3, 1])
    with col_info:
        st.caption(f"총 {len(rows):,}건")
    with col_page:
        page_num = st.number_input("페이지", min_value=1, max_value=total_pages, value=1, key="progress_page")

    start_idx = (page_num - 1) * page_size
    end_idx = min(start_idx + page_size, len(rows))

    st.dataframe(
        progress_df.iloc[start_idx:end_idx],
        use_container_width=True,
        hide_index=True,
        height=min(len(rows[start_idx:end_idx]) * 35 + 38, 800),
    )

    st.caption(f"페이지 {page_num}/{total_pages} ({start_idx + 1}~{end_idx}건)")

    st.divider()

    # --- 레이블 상세 조회 ---
    st.subheader("레이블 상세 조회")
    detail_label = st.text_input("레이블번호 입력", key="detail_label_input")

    if detail_label.strip() and detail_label.strip() in labels:
        ld = labels[detail_label.strip()]
        bunryu = ld.get("분류", {})

        st.markdown(f"**레이블: {detail_label.strip()}**")
        st.markdown(f"- 현재 단계: **{get_label_stage(ld)}**")
        if bunryu:
            st.markdown(f"- 분권수: {bunryu.get('kwon', '-')} / 건수: {bunryu.get('gun', '-')}")
            if bunryu.get("note"):
                st.markdown(f"- 비고: {bunryu['note']}")

        detail_rows = []
        for proc in PROCESSES:
            if proc in ld:
                entry = ld[proc]
                qty = ""
                if proc == "분류":
                    qty = f"{entry.get('kwon', 0)}권, {entry.get('gun', 0)}건"
                elif proc in ["면표시", "문서스캔", "도면스캔", "보정"]:
                    qty = f"{entry.get('myun', 0)}면"
                elif proc == "색인":
                    qty = f"{entry.get('gun', 0)}건"
                elif proc in AUTO_PROCESSES:
                    qty = f"{entry.get('kwon', 0)}권, {entry.get('gun', 0)}건 (자동)"

                detail_rows.append({
                    "공정": proc,
                    "완료여부": "O",
                    "완료일": entry.get("date", "-"),
                    "작업자": entry.get("worker", "-"),
                    "작업량": qty,
                })
            else:
                detail_rows.append({
                    "공정": proc,
                    "완료여부": "",
                    "완료일": "",
                    "작업자": "",
                    "작업량": "",
                })

        st.dataframe(pd.DataFrame(detail_rows), use_container_width=True, hide_index=True)

    elif detail_label.strip():
        st.warning(f"레이블 '{detail_label.strip()}'을(를) 찾을 수 없습니다.")


# ============================================================
# 👥 작업자별 현황
# ============================================================
def page_worker_stats(data):
    st.title("👥 작업자별 현황")

    df = get_daily_df(data)
    if len(df) == 0:
        st.info("입력된 실적 데이터가 없습니다.")
        return

    col1, col2 = st.columns(2)
    with col1:
        start_filter = st.date_input("시작일", value=df["date"].min().date())
    with col2:
        end_filter = st.date_input("종료일", value=df["date"].max().date())

    filtered = df[(df["date"].dt.date >= start_filter) & (df["date"].dt.date <= end_filter)]

    if len(filtered) == 0:
        st.warning("선택 기간에 데이터가 없습니다.")
        return

    st.subheader("작업자별 공정별 실적")

    worker_proc = (
        filtered.groupby(["worker", "process"])
        .agg({"primary_qty": "sum", "secondary_qty": "sum", "date": "nunique"})
        .reset_index()
    )
    worker_proc.columns = ["작업자", "공정", "수량1 합계", "수량2 합계", "작업일수"]

    pivot = filtered.pivot_table(
        index="worker", columns="process",
        values="secondary_qty", aggfunc="sum", fill_value=0,
    )
    st.dataframe(pivot, use_container_width=True)

    fig = px.bar(
        worker_proc, x="작업자", y="수량2 합계",
        color="공정", color_discrete_map=PROCESS_COLORS,
        title="작업자별 공정 실적", barmode="stack",
    )
    fig.update_layout(height=400)
    st.plotly_chart(fig, use_container_width=True)

    st.subheader("작업자별 일평균 생산성")
    worker_daily = (
        filtered.groupby("worker")
        .agg({"secondary_qty": "sum", "date": "nunique"})
        .reset_index()
    )
    worker_daily["일평균"] = (worker_daily["secondary_qty"] / worker_daily["date"]).round(1)
    worker_daily.columns = ["작업자", "총 수량", "작업일수", "일평균"]
    worker_daily = worker_daily.sort_values("일평균", ascending=False)
    st.dataframe(worker_daily, use_container_width=True, hide_index=True)


# ============================================================
# 🔍 품질검사
# ============================================================
def page_sampling(data):
    st.title("🔍 품질검사")

    st.markdown("""
    품질목표 **99.9%** 달성을 위한 품질검사 도구입니다.
    - 주 단위 전수검사 및 월 단위 샘플링 검사 기록
    - 오류율 자동 계산 및 적합/부적합 판정
    """)

    if "sampling_logs" not in data:
        data["sampling_logs"] = []

    tab1, tab2 = st.tabs(["검사 입력", "검사 현황"])

    with tab1:
        st.subheader("품질검사 입력")

        col1, col2, col3 = st.columns(3)
        with col1:
            insp_date = st.date_input("검사일자", value=date.today(), key="insp_date")
        with col2:
            insp_type = st.selectbox("검사유형", ["전수검사", "샘플링검사"])
        with col3:
            insp_process = st.selectbox("검사공정", ["기록물정리", "색인", "이미지"])

        col4, col5, col6 = st.columns(3)
        with col4:
            total_checked = st.number_input("검사 건수", min_value=1, value=100)
        with col5:
            error_count = st.number_input("오류 건수", min_value=0, value=0)
        with col6:
            inspector = st.selectbox(
                "검사자",
                data["workers"] if data["workers"] else ["(작업자를 먼저 등록하세요)"],
            )

        error_rate = round(error_count / total_checked * 100, 3) if total_checked > 0 else 0
        quality_rate = round(100 - error_rate, 3)

        error_detail = st.text_area("오류 상세 내용", placeholder="오류 유형 및 내용을 기재하세요...")

        if error_rate <= 0.1:
            st.success(f"✅ **적합** | 품질률: {quality_rate}% | 오류율: {error_rate}%")
        else:
            st.error(f"❌ **부적합** | 품질률: {quality_rate}% | 오류율: {error_rate}% (기준: 0.1% 이하)")

        if st.button("💾 검사결과 저장", type="primary"):
            data["sampling_logs"].append({
                "date": insp_date.isoformat(),
                "type": insp_type,
                "process": insp_process,
                "total_checked": total_checked,
                "error_count": error_count,
                "error_rate": error_rate,
                "quality_rate": quality_rate,
                "inspector": inspector,
                "detail": error_detail,
                "result": "적합" if error_rate <= 0.1 else "부적합",
            })
            save_data(data)
            st.success("검사결과가 저장되었습니다!")
            st.rerun()

    with tab2:
        st.subheader("검사 이력")

        if data.get("sampling_logs"):
            sdf = pd.DataFrame(data["sampling_logs"])
            sdf["date"] = pd.to_datetime(sdf["date"])

            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("총 검사횟수", f"{len(sdf)}회")
            with col2:
                avg_quality = sdf["quality_rate"].mean()
                st.metric("평균 품질률", f"{avg_quality:.2f}%")
            with col3:
                pass_count = len(sdf[sdf["result"] == "적합"])
                st.metric("적합 횟수", f"{pass_count}/{len(sdf)}")
            with col4:
                avg_error = sdf["error_rate"].mean()
                st.metric("평균 오류율", f"{avg_error:.3f}%")

            st.subheader("공정별 품질률 추이")
            fig = px.line(
                sdf.sort_values("date"),
                x="date", y="quality_rate", color="process",
                markers=True, title="공정별 품질률 추이",
                labels={"date": "검사일", "quality_rate": "품질률(%)", "process": "공정"},
            )
            fig.add_hline(y=99.9, line_dash="dash", line_color="red", annotation_text="목표: 99.9%")
            fig.update_layout(height=350)
            st.plotly_chart(fig, use_container_width=True)

            st.subheader("검사 이력 테이블")
            display = sdf.copy()
            display["date"] = display["date"].dt.strftime("%Y-%m-%d")
            display.columns = [
                "날짜", "유형", "공정", "검사건수", "오류건수",
                "오류율(%)", "품질률(%)", "검사자", "상세내용", "판정",
            ]
            st.dataframe(display, use_container_width=True, hide_index=True)
        else:
            st.info("아직 검사 이력이 없습니다.")


# ============================================================
# ⚙️ 설정
# ============================================================
def page_settings(data):
    st.title("⚙️ 사업 설정")

    tab1, tab2, tab3 = st.tabs(["사업 정보", "작업자 관리", "데이터 관리"])

    with tab1:
        st.subheader("사업 기본 정보")
        proj = data["project"]

        name = st.text_input("사업명", value=proj["name"])
        col1, col2 = st.columns(2)
        with col1:
            s_date = st.date_input(
                "시작일",
                value=datetime.strptime(proj["start_date"], "%Y-%m-%d").date(),
                key="proj_start",
            )
        with col2:
            e_date = st.date_input(
                "종료일",
                value=datetime.strptime(proj["end_date"], "%Y-%m-%d").date(),
                key="proj_end",
            )

        st.divider()
        st.subheader("목표량 설정")
        st.caption("전체 공정 공통 목표입니다.")

        col3, col4 = st.columns(2)
        with col3:
            total_kwon = st.number_input(
                "목표 권수", value=data["targets"].get("target_kwon", proj.get("total_kwon", 12000)), min_value=0
            )
        with col4:
            total_myun = st.number_input(
                "목표 면수", value=data["targets"].get("target_myun", proj.get("total_myun", 1250000)), min_value=0
            )

        if st.button("💾 사업정보 저장", type="primary"):
            data["project"]["name"] = name
            data["project"]["start_date"] = s_date.isoformat()
            data["project"]["end_date"] = e_date.isoformat()
            data["project"]["total_kwon"] = total_kwon
            data["project"]["total_myun"] = total_myun
            data["targets"]["target_kwon"] = total_kwon
            data["targets"]["target_myun"] = total_myun
            save_data(data)
            st.success("저장 완료!")

    with tab2:
        st.subheader("작업자 관리")

        if data["workers"]:
            st.markdown(f"현재 등록: **{len(data['workers'])}명**")

            col_top1, col_top2 = st.columns([3, 1])
            with col_top2:
                if st.button("🗑️ 전체 삭제", type="secondary"):
                    st.session_state["confirm_delete_all"] = True

            if st.session_state.get("confirm_delete_all"):
                st.warning("⚠️ 정말로 모든 작업자를 삭제하시겠습니까?")
                c1, c2 = st.columns(2)
                with c1:
                    if st.button("✅ 예, 전체 삭제", type="primary"):
                        data["workers"] = []
                        save_data(data)
                        st.session_state["confirm_delete_all"] = False
                        st.success("전체 삭제 완료!")
                        st.rerun()
                with c2:
                    if st.button("❌ 취소"):
                        st.session_state["confirm_delete_all"] = False
                        st.rerun()

            st.divider()

            st.markdown("**삭제할 작업자를 선택하세요:**")
            selected_for_delete = []
            workers_per_row = 4
            for row_start in range(0, len(data["workers"]), workers_per_row):
                row_workers = data["workers"][row_start:row_start + workers_per_row]
                cols = st.columns(workers_per_row)
                for j, w in enumerate(row_workers):
                    with cols[j]:
                        if st.checkbox(w, key=f"chk_worker_{row_start + j}"):
                            selected_for_delete.append(w)

            if selected_for_delete:
                st.info(f"선택된 작업자: {', '.join(selected_for_delete)} ({len(selected_for_delete)}명)")
                if st.button(f"🗑️ 선택한 {len(selected_for_delete)}명 삭제", type="primary"):
                    data["workers"] = [w for w in data["workers"] if w not in selected_for_delete]
                    save_data(data)
                    st.success(f"{len(selected_for_delete)}명 삭제 완료!")
                    st.rerun()
        else:
            st.info("등록된 작업자가 없습니다.")

        st.divider()

        st.subheader("작업자 추가")
        new_worker = st.text_input("작업자 이름", placeholder="이름 입력 후 추가 버튼")
        bulk_workers = st.text_area(
            "여러 명 한번에 추가 (쉼표 또는 줄바꿈으로 구분)",
            placeholder="홍길동, 김철수, 이영희\n또는\n홍길동\n김철수\n이영희",
        )

        col_add1, col_add2 = st.columns(2)
        with col_add1:
            if st.button("➕ 1명 추가") and new_worker:
                if new_worker not in data["workers"]:
                    data["workers"].append(new_worker)
                    save_data(data)
                    st.success(f"{new_worker}님 추가!")
                    st.rerun()
                else:
                    st.warning(f"{new_worker}님은 이미 등록되어 있습니다.")
        with col_add2:
            if st.button("➕ 일괄 추가") and bulk_workers:
                names = [n.strip() for n in bulk_workers.replace("\n", ",").split(",") if n.strip()]
                added = []
                for n in names:
                    if n not in data["workers"]:
                        data["workers"].append(n)
                        added.append(n)
                if added:
                    save_data(data)
                    st.success(f"{len(added)}명 추가: {', '.join(added)}")
                    st.rerun()
                else:
                    st.warning("추가할 새 작업자가 없습니다 (이미 등록됨).")

    with tab3:
        st.subheader("데이터 백업 / 복원")

        col1, col2 = st.columns(2)
        with col1:
            st.download_button(
                "📥 데이터 백업 (JSON)",
                data=json.dumps(data, ensure_ascii=False, indent=2),
                file_name=f"dashboard_backup_{date.today().isoformat()}.json",
                mime="application/json",
            )
        with col2:
            uploaded = st.file_uploader("📤 데이터 복원 (JSON)", type="json")
            if uploaded:
                restored = json.loads(uploaded.read().decode("utf-8"))
                if st.button("복원 실행"):
                    save_data(restored)
                    st.success("데이터 복원 완료!")
                    st.rerun()

        st.divider()

        st.subheader("실적 데이터 초기화")
        st.caption("사업 설정(사업명, 기간, 목표, 작업자)은 유지하고 레이블 및 실적 로그를 삭제합니다.")
        if st.button("🔄 실적 데이터 초기화"):
            st.session_state["confirm_reset_logs"] = True

        if st.session_state.get("confirm_reset_logs"):
            label_count = len(data.get("labels", {}))
            log_count = len(data.get("daily_logs", []))
            sampling_count = len(data.get("sampling_logs", []))
            st.warning(
                f"⚠️ 레이블 {label_count}건 + 일일 실적 {log_count}건 + 검사 이력 {sampling_count}건을 모두 삭제합니다."
            )
            c1, c2 = st.columns(2)
            with c1:
                if st.button("✅ 예, 초기화", type="primary", key="confirm_reset"):
                    data["labels"] = {}
                    data["daily_logs"] = []
                    data["sampling_logs"] = []
                    save_data(data)
                    st.session_state["confirm_reset_logs"] = False
                    st.success("초기화 완료!")
                    st.rerun()
            with c2:
                if st.button("❌ 취소", key="cancel_reset"):
                    st.session_state["confirm_reset_logs"] = False
                    st.rerun()


# ============================================================
# 실행
# ============================================================
if __name__ == "__main__":
    main()
