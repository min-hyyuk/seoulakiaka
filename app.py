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
    "색인": {"primary": "권", "secondary": "면"},
    "재편철": {"primary": "권호수", "secondary": "건"},
    "공개구분": {"primary": "권호수", "secondary": "건"},
}


# ============================================================
# 데이터 관리
# ============================================================
def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        # 구버전 호환: targets 구조 마이그레이션
        if "targets" in data and "분류" in data["targets"]:
            # 구버전 (공정별 개별 목표) → 신버전 (통합 목표)
            data["targets"] = {
                "target_kwon": data["project"].get("total_kwon", 12000),
                "target_myun": data["project"].get("total_myun", 1250000),
            }
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
        "daily_logs": [],
        "sampling_logs": [],
    }


# ============================================================
# 유틸리티
# ============================================================
def get_daily_df(data):
    if not data["daily_logs"]:
        return pd.DataFrame(columns=["date", "worker", "process", "primary_qty", "secondary_qty"])
    df = pd.DataFrame(data["daily_logs"])
    df["date"] = pd.to_datetime(df["date"])
    return df


def calc_cumulative(df, targets):
    """공정별 누적 실적 계산 (통합 목표 기준)"""
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
        ["📈 대시보드", "✏️ 일일 실적 입력", "👥 작업자별 현황", "🔍 샘플링 검사", "⚙️ 설정"],
    )

    if page == "📈 대시보드":
        page_dashboard(data)
    elif page == "✏️ 일일 실적 입력":
        page_daily_input(data)
    elif page == "👥 작업자별 현황":
        page_worker_stats(data)
    elif page == "🔍 샘플링 검사":
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

    # --- 상단 요약 ---
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

    # 실적 집계
    total_cum_kwon = sum(cum[p]["cum_primary"] for p in PROCESSES)
    total_cum_myun = sum(cum[p]["cum_secondary"] for p in PROCESSES)

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
        st.metric("전체 누적 실적", f"{total_cum_kwon:,}권 / {total_cum_myun:,}면")

    if avg_rate < time_rate - 10:
        st.warning(f"⚠️ 공정율({avg_rate:.1f}%)이 기간진행률({time_rate}%)보다 낮습니다. 일정 지연 위험!")
    elif avg_rate >= time_rate:
        st.success(f"✅ 공정율({avg_rate:.1f}%)이 기간진행률({time_rate}%) 이상입니다.")

    st.divider()

    # --- 공정별 게이지 ---
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
                f"잔여: {c['remain_primary']:,}{unit_p} / {c['remain_secondary']:,}{unit_s}"
            )

    st.divider()

    # --- 공정별 상세 테이블 ---
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
            f"공정율({unit_p})": f"{c['rate_primary']}%",
            f"잔여({unit_p})": f"{c['remain_primary']:,}",
            f"실적({unit_s})": f"{c['cum_secondary']:,}",
        })
    st.dataframe(pd.DataFrame(table_data), use_container_width=True, hide_index=True)

    st.divider()

    # --- 일별 추이 ---
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
# ✏️ 일일 실적 입력
# ============================================================
def page_daily_input(data):
    st.title("✏️ 일일 실적 입력")

    col1, col2 = st.columns(2)
    with col1:
        input_date = st.date_input("작업일자", value=date.today())
    with col2:
        worker = st.selectbox("작업자", data["workers"] if data["workers"] else ["(작업자를 먼저 등록하세요)"])

    st.divider()

    st.subheader("공정별 실적 입력")
    st.caption("해당 공정의 작업량을 입력하세요. 작업하지 않은 공정은 0으로 두면 됩니다.")

    entries = []
    cols = st.columns(2)

    for i, proc in enumerate(PROCESSES):
        with cols[i % 2]:
            unit_p = PROCESS_UNITS[proc]["primary"]
            unit_s = PROCESS_UNITS[proc]["secondary"]

            with st.expander(f"🔸 {proc}", expanded=False):
                c1, c2 = st.columns(2)
                with c1:
                    p_qty = st.number_input(
                        f"{unit_p}", min_value=0, value=0, key=f"{proc}_p"
                    )
                with c2:
                    s_qty = st.number_input(
                        f"{unit_s}", min_value=0, value=0, key=f"{proc}_s"
                    )
                if p_qty > 0 or s_qty > 0:
                    entries.append((proc, p_qty, s_qty))

    st.divider()

    # 입력 미리보기
    if entries:
        st.subheader("입력 미리보기")
        preview = []
        for proc, p, s in entries:
            unit_p = PROCESS_UNITS[proc]["primary"]
            unit_s = PROCESS_UNITS[proc]["secondary"]
            preview.append({
                "공정": proc,
                f"수량1({unit_p})": p,
                f"수량2({unit_s})": s,
            })
        st.dataframe(pd.DataFrame(preview), use_container_width=True, hide_index=True)

    can_save = len(entries) > 0 and data["workers"] and worker != "(작업자를 먼저 등록하세요)"
    if st.button("💾 저장", type="primary", disabled=not can_save):
        for proc, p_qty, s_qty in entries:
            data["daily_logs"].append({
                "date": input_date.isoformat(),
                "worker": worker,
                "process": proc,
                "primary_qty": p_qty,
                "secondary_qty": s_qty,
            })
        save_data(data)
        st.success(f"✅ {input_date} {worker}님의 실적 {len(entries)}건이 저장되었습니다!")
        st.rerun()

    st.divider()

    # --- 일자별 공정 실적 요약 (최근 입력 내역 대체) ---
    st.subheader("일자별 공정 실적")

    df = get_daily_df(data)
    if len(df) > 0:
        # 날짜 범위 필터
        col_f1, col_f2 = st.columns(2)
        with col_f1:
            view_start = st.date_input(
                "조회 시작일",
                value=max(df["date"].min().date(), input_date - timedelta(days=14)),
                key="view_start",
            )
        with col_f2:
            view_end = st.date_input("조회 종료일", value=input_date, key="view_end")

        filtered = df[(df["date"].dt.date >= view_start) & (df["date"].dt.date <= view_end)]

        if len(filtered) > 0:
            # 일자별 공정별 피벗 (secondary_qty 기준)
            pivot = filtered.pivot_table(
                index=filtered["date"].dt.strftime("%Y-%m-%d"),
                columns="process",
                values="secondary_qty",
                aggfunc="sum",
                fill_value=0,
            )
            # 공정 순서 정렬
            ordered_cols = [p for p in PROCESSES if p in pivot.columns]
            pivot = pivot[ordered_cols]
            pivot["합계"] = pivot.sum(axis=1)
            pivot.index.name = "날짜"

            st.dataframe(pivot, use_container_width=True)

            # 일자별 차트
            chart_data = filtered.groupby(
                [filtered["date"].dt.strftime("%Y-%m-%d"), "process"]
            )["secondary_qty"].sum().reset_index()
            chart_data.columns = ["날짜", "공정", "수량"]

            fig = px.bar(
                chart_data, x="날짜", y="수량",
                color="공정", color_discrete_map=PROCESS_COLORS,
                title="일자별 공정 실적",
                barmode="group",
            )
            fig.update_layout(height=350)
            st.plotly_chart(fig, use_container_width=True)

            # 일자별 작업자별 상세 (접을 수 있게)
            with st.expander("📋 일자별 작업자별 상세 보기"):
                detail = filtered.copy()
                detail["date"] = detail["date"].dt.strftime("%Y-%m-%d")
                detail_pivot = detail.pivot_table(
                    index=["date", "worker"],
                    columns="process",
                    values="secondary_qty",
                    aggfunc="sum",
                    fill_value=0,
                )
                ordered_detail = [p for p in PROCESSES if p in detail_pivot.columns]
                detail_pivot = detail_pivot[ordered_detail]
                detail_pivot["합계"] = detail_pivot.sum(axis=1)
                detail_pivot.index.names = ["날짜", "작업자"]
                st.dataframe(detail_pivot, use_container_width=True)
        else:
            st.info("선택 기간에 데이터가 없습니다.")
    else:
        st.info("아직 입력된 실적이 없습니다.")


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
# 🔍 샘플링 검사
# ============================================================
def page_sampling(data):
    st.title("🔍 샘플링 검사 관리")

    st.markdown("""
    품질목표 **99.9%** 달성을 위한 샘플링 검사 도구입니다.
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

    # ---- 탭1: 사업 정보 + 통합 목표량 ----
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
        st.caption("전체 공정 공통 목표입니다. 건수는 작업 실적에서 자동 집계됩니다.")

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

    # ---- 탭2: 작업자 관리 (전체삭제 + 체크박스 일괄삭제) ----
    with tab2:
        st.subheader("작업자 관리")

        if data["workers"]:
            st.markdown(f"현재 등록: **{len(data['workers'])}명**")

            # 전체 삭제 버튼
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

            # 체크박스 선택 삭제
            st.markdown("**삭제할 작업자를 선택하세요:**")
            selected_for_delete = []

            # 한 줄에 4명씩 표시
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

        # 작업자 추가
        st.subheader("작업자 추가")
        new_worker = st.text_input("작업자 이름", placeholder="이름 입력 후 추가 버튼")

        # 여러 명 한번에 추가
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
                # 쉼표 또는 줄바꿈으로 분리
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

    # ---- 탭3: 데이터 관리 ----
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

        # 실적 데이터 초기화
        st.subheader("실적 데이터 초기화")
        st.caption("사업 설정(사업명, 기간, 목표, 작업자)은 유지하고 실적 로그만 삭제합니다.")
        if st.button("🔄 실적 데이터 초기화"):
            st.session_state["confirm_reset_logs"] = True

        if st.session_state.get("confirm_reset_logs"):
            st.warning(f"⚠️ 일일 실적 {len(data['daily_logs'])}건 + 검사 이력 {len(data.get('sampling_logs', []))}건을 모두 삭제합니다.")
            c1, c2 = st.columns(2)
            with c1:
                if st.button("✅ 예, 초기화", type="primary", key="confirm_reset"):
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
