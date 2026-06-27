import React, { useState, useEffect, useMemo } from "react";

// ============================================================
// クルマ購入プランナー
// ヴォクシー / ノア / フリード 購入判断ツール
// ローン試算 × 家計負担 × 維持費込み総コスト
// ============================================================

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=IBM+Plex+Mono:wght@500;700&display=swap');
.cpp-root { font-family: 'Noto Sans JP', sans-serif; }
.cpp-num { font-family: 'IBM Plex Mono', 'Noto Sans JP', monospace; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) {
  .cpp-root * { transition: none !important; animation: none !important; }
}
`;

// ---- 色トークン（見積書×計器パネル） ----
const C = {
  bg: "#EFF2F6",       // 薄いブルーグレー（事務用紙）
  ink: "#16293E",      // 濃紺（インク）
  sub: "#5A6B7E",      // 補助テキスト
  card: "#FFFFFF",
  line: "#D7DEE7",
  accent: "#1D5FBF",   // 計器ブルー
  ok: "#1A7F4B",
  warn: "#C77700",
  bad: "#C0392B",
};

const STORAGE_KEY = "car-planner-v1";

const yen = (n) =>
  isFinite(n) ? Math.round(n).toLocaleString("ja-JP") : "—";
const man = (n) => (isFinite(n) ? (n / 10000).toFixed(1) : "—");

// 元利均等の月額返済
function monthlyPayment(principal, annualRatePct, years) {
  if (principal <= 0 || years <= 0) return 0;
  const n = years * 12;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ---- 金利プリセット（2026年6月時点の目安・要確認） ----
const RATE_PRESETS = [
  { label: "ろうきん", rate: 1.7, note: "勤務先の会員資格があれば最有力" },
  { label: "千葉銀行", rate: 2.4, note: "地銀。取引口座があれば優遇の可能性" },
  { label: "ネット銀行", rate: 2.9, note: "楽天・イオン・au等。Web完結" },
  { label: "ディーラー", rate: 7.5, note: "審査は速いが金利は高め" },
];

// ---- 候補車データ（過去リサーチに基づく目安値） ----
const CARS = [
  {
    id: "voxy",
    name: "ヴォクシー R80 ZS煌II HV",
    tag: "本命",
    tax: 36000,        // 自動車税/年（1.8L HV・2019年式想定）
    fuelEff: 19.0,     // 実燃費目安 km/L
    inspection: 55000, // 車検・法定費用 年割
    insurance: 65000,  // 任意保険/年 目安
    maint: 35000,      // タイヤ・オイル等/年
    memo: "2019〜2020年式が予算内の狙い目。燃費◎で維持費が軽い。",
  },
  {
    id: "noah",
    name: "ノア R80 Si HV",
    tag: "対抗",
    tax: 36000,
    fuelEff: 19.0,
    inspection: 55000,
    insurance: 65000,
    maint: 35000,
    memo: "中身はヴォクシーと兄弟車。相場が安ければこちらもアリ。",
  },
  {
    id: "voxyG",
    name: "ヴォクシー R80 ガソリン",
    tag: "比較用",
    tax: 36000,
    fuelEff: 12.5,
    inspection: 55000,
    insurance: 65000,
    maint: 35000,
    memo: "車両は安いが燃料費が重い。総コストで逆転するか要確認。",
  },
  {
    id: "freed",
    name: "フリード GB7 HV",
    tag: "コンパクト",
    tax: 30500,        // 1.5L
    fuelEff: 19.5,
    inspection: 50000,
    insurance: 60000,
    maint: 30000,
    memo: "一回り小さく税金も安い。3列目の広さは要実車確認。",
  },
];

const DEFAULTS = {
  price: 3000000,
  down: 1000000,
  rate: 1.7,
  years: 5,
  income: 450000,   // 世帯手取り/月
  mortgage: 100000, // 住宅ローン/月
  km: 8000,         // 年間走行距離
  fuelPrice: 175,   // ガソリン円/L
  carId: "voxy",
};

// ---- 燃料ゲージ風メーター ----
function GaugeMeter({ ratio }) {
  // ratio: 合計返済比率（0〜0.5を表示域に）
  const clamped = Math.max(0, Math.min(ratio, 0.5));
  const angle = -90 + (clamped / 0.5) * 180; // -90°〜+90°
  const color =
    ratio < 0.3 ? C.ok : ratio < 0.35 ? C.warn : C.bad;
  return (
    <svg viewBox="0 0 200 120" style={{ width: "100%", maxWidth: 260 }}>
      {/* 目盛り帯 */}
      <path d="M 20 100 A 80 80 0 0 1 116 22" fill="none" stroke={C.ok} strokeWidth="14" strokeLinecap="round" opacity="0.85" />
      <path d="M 116 22 A 80 80 0 0 1 146 36" fill="none" stroke={C.warn} strokeWidth="14" opacity="0.85" />
      <path d="M 146 36 A 80 80 0 0 1 180 100" fill="none" stroke={C.bad} strokeWidth="14" strokeLinecap="round" opacity="0.85" />
      {/* 針 */}
      <g transform={`rotate(${angle} 100 100)`} style={{ transition: "transform .5s ease" }}>
        <line x1="100" y1="100" x2="100" y2="32" stroke={C.ink} strokeWidth="4" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="100" r="7" fill={C.ink} />
      <text x="20" y="116" fontSize="11" fill={C.sub}>0%</text>
      <text x="92" y="14" fontSize="11" fill={C.sub}>25%</text>
      <text x="166" y="116" fontSize="11" fill={C.sub}>50%</text>
      <text x="100" y="78" fontSize="20" fontWeight="700" fill={color} textAnchor="middle" className="cpp-num">
        {(ratio * 100).toFixed(1)}%
      </text>
    </svg>
  );
}

// ---- 入力行 ----
function Field({ label, value, onChange, unit, step = 10000, min = 0, max }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 4, letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="cpp-num"
          style={{
            flex: 1, padding: "10px 12px", fontSize: 16, fontWeight: 700,
            color: C.ink, background: "#FBFCFE",
            border: `1.5px solid ${C.line}`, borderRadius: 8, width: "100%",
          }}
        />
        <span style={{ fontSize: 13, color: C.sub, whiteSpace: "nowrap" }}>{unit}</span>
      </div>
    </label>
  );
}

function Slider({ label, value, onChange, min, max, step, format }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.sub }}>{label}</span>
        <span className="cpp-num" style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>
          {format(value)}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: C.accent }}
      />
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 13, fontWeight: 900, color: C.ink, letterSpacing: "0.12em",
      borderLeft: `4px solid ${C.accent}`, paddingLeft: 8, marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

export default function CarPurchasePlanner() {
  const [s, setS] = useState(DEFAULTS);
  const [tab, setTab] = useState("loan");
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  // 保存データの読み込み
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r && r.value) setS({ ...DEFAULTS, ...JSON.parse(r.value) });
      } catch (e) { /* 初回は未保存 */ }
      setLoaded(true);
    })();
  }, []);

  // 自動保存（入力が変わったら1秒後）
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(s));
        setSavedAt(new Date());
      } catch (e) { /* 保存失敗は黙ってスキップ */ }
    }, 1000);
    return () => clearTimeout(t);
  }, [s, loaded]);

  const set = (k) => (v) => setS((p) => ({ ...p, [k]: v }));

  // ---- 計算 ----
  const calc = useMemo(() => {
    const principal = Math.max(s.price - s.down, 0);
    const monthly = monthlyPayment(principal, s.rate, s.years);
    const total = monthly * s.years * 12;
    const interest = total - principal;
    const car = CARS.find((c) => c.id === s.carId) || CARS[0];
    const fuelYear = (s.km / car.fuelEff) * s.fuelPrice;
    const maintYear = car.tax + car.inspection + car.insurance + car.maint + fuelYear;
    const ratioCar = monthly / s.income;
    const ratioAll = (monthly + s.mortgage) / s.income;
    const total5y = s.down + total + maintYear * 5;
    return { principal, monthly, total, interest, car, fuelYear, maintYear, ratioCar, ratioAll, total5y };
  }, [s]);

  const verdict =
    calc.ratioAll < 0.3
      ? { c: C.ok, t: "無理のない範囲", d: "住宅ローンと合わせても世帯手取りの30%未満。教育費の増加にも備えやすい水準です。" }
      : calc.ratioAll < 0.35
      ? { c: C.warn, t: "ややきつめ", d: "合計返済が30〜35%。頭金を増やすか期間を見直すと安心です。" }
      : { c: C.bad, t: "要再検討", d: "合計返済が35%超。予算減・頭金増・期間延長のいずれかを検討推奨。" };

  const tabs = [
    { id: "loan", label: "ローン試算" },
    { id: "budget", label: "家計チェック" },
    { id: "cost", label: "総コスト" },
    { id: "cars", label: "候補車" },
  ];

  return (
    <div className="cpp-root" style={{ minHeight: "100vh", background: C.bg, color: C.ink }}>
      <style>{FONT_CSS}</style>

      {/* ヘッダー：月々支払（オドメーター風） */}
      <header style={{ background: C.ink, color: "#fff", padding: "20px 16px 16px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.25em", opacity: 0.7, fontWeight: 700 }}>
            クルマ購入プランナー
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 13, opacity: 0.8 }}>月々</span>
            <span className="cpp-num" style={{
              fontSize: 44, fontWeight: 700, lineHeight: 1,
              background: "#0C1B2C", padding: "4px 14px", borderRadius: 8,
              border: "1px solid #2B4160",
              letterSpacing: "0.02em",
            }}>
              {yen(calc.monthly)}
            </span>
            <span style={{ fontSize: 13, opacity: 0.8 }}>円</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }} className="cpp-num">
            借入 {man(calc.principal)}万円 ／ 金利 {s.rate}% ／ {s.years}年 ／ 利息総額 {man(calc.interest)}万円
          </div>
        </div>
      </header>

      {/* タブ */}
      <nav style={{
        display: "flex", maxWidth: 560, margin: "0 auto",
        background: C.card, borderBottom: `1.5px solid ${C.line}`,
        position: "sticky", top: 0, zIndex: 5,
      }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: "12px 4px", fontSize: 13, fontWeight: 700,
              background: "none", border: "none", cursor: "pointer",
              color: tab === t.id ? C.accent : C.sub,
              borderBottom: tab === t.id ? `3px solid ${C.accent}` : "3px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 60px" }}>

        {/* ============ ローン試算 ============ */}
        {tab === "loan" && (
          <div style={{ background: C.card, borderRadius: 12, padding: 18, border: `1px solid ${C.line}` }}>
            <SectionTitle>借入条件</SectionTitle>
            <Slider label="車両価格（諸費用込み）" value={s.price} onChange={set("price")}
              min={1500000} max={4000000} step={50000} format={(v) => `${man(v)}万円`} />
            <Slider label="頭金" value={s.down} onChange={set("down")}
              min={0} max={2000000} step={50000} format={(v) => `${man(v)}万円`} />
            <Slider label="返済期間" value={s.years} onChange={set("years")}
              min={1} max={8} step={1} format={(v) => `${v}年`} />
            <Slider label="金利（年率）" value={s.rate} onChange={set("rate")}
              min={0.5} max={10} step={0.1} format={(v) => `${v.toFixed(1)}%`} />

            <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, margin: "6px 0 8px" }}>
              金利プリセット（2026年6月時点の目安・要確認）
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {RATE_PRESETS.map((p) => (
                <button key={p.label} onClick={() => set("rate")(p.rate)}
                  style={{
                    textAlign: "left", padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                    border: s.rate === p.rate ? `2px solid ${C.accent}` : `1.5px solid ${C.line}`,
                    background: s.rate === p.rate ? "#EAF1FB" : "#FBFCFE",
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{p.label}
                    <span className="cpp-num" style={{ color: C.accent, marginLeft: 6 }}>{p.rate}%</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{p.note}</div>
                </button>
              ))}
            </div>

            {/* 結果表 */}
            <div style={{ marginTop: 18, borderTop: `1.5px dashed ${C.line}`, paddingTop: 14 }}>
              <SectionTitle>試算結果</SectionTitle>
              {[
                ["借入額", `${yen(calc.principal)} 円`],
                ["月々の返済", `${yen(calc.monthly)} 円`],
                ["総返済額", `${yen(calc.total)} 円`],
                ["利息総額", `${yen(calc.interest)} 円`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ fontSize: 13, color: C.sub, fontWeight: 700 }}>{k}</span>
                  <span className="cpp-num" style={{ fontSize: 15, fontWeight: 700 }}>{v}</span>
                </div>
              ))}
              <p style={{ fontSize: 11, color: C.sub, marginTop: 10, lineHeight: 1.6 }}>
                ※ 元利均等返済・ボーナス払いなしで計算。実際の金利は審査結果により変動します。申込前に各社公式サイトで最新条件をご確認ください。
              </p>
            </div>
          </div>
        )}

        {/* ============ 家計チェック ============ */}
        {tab === "budget" && (
          <div style={{ background: C.card, borderRadius: 12, padding: 18, border: `1px solid ${C.line}` }}>
            <SectionTitle>世帯の前提</SectionTitle>
            <Field label="世帯手取り（月）" value={s.income} onChange={set("income")} unit="円" step={10000} />
            <Field label="住宅ローン返済（月）" value={s.mortgage} onChange={set("mortgage")} unit="円" step={5000} />

            <div style={{ textAlign: "center", marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 4 }}>
                合計返済比率（住宅＋クルマ ÷ 世帯手取り）
              </div>
              <GaugeMeter ratio={calc.ratioAll} />
            </div>

            <div style={{
              background: `${verdict.c}14`, border: `1.5px solid ${verdict.c}`,
              borderRadius: 10, padding: "12px 14px", marginTop: 8,
            }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: verdict.c }}>{verdict.t}</div>
              <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.7 }}>{verdict.d}</div>
            </div>

            <div style={{ marginTop: 16 }}>
              {[
                ["クルマ単体の返済比率", `${(calc.ratioCar * 100).toFixed(1)}%`, "目安：15〜20%以内"],
                ["返済合計（月）", `${yen(calc.monthly + s.mortgage)} 円`, ""],
                ["返済後に残る金額（月）", `${yen(s.income - calc.monthly - s.mortgage)} 円`, "生活費・教育費・積立の原資"],
              ].map(([k, v, n]) => (
                <div key={k} style={{ padding: "10px 0", borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: C.sub, fontWeight: 700 }}>{k}</span>
                    <span className="cpp-num" style={{ fontSize: 15, fontWeight: 700 }}>{v}</span>
                  </div>
                  {n && <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{n}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============ 総コスト ============ */}
        {tab === "cost" && (
          <div style={{ background: C.card, borderRadius: 12, padding: 18, border: `1px solid ${C.line}` }}>
            <SectionTitle>走り方の前提</SectionTitle>
            <Slider label="年間走行距離" value={s.km} onChange={set("km")}
              min={3000} max={20000} step={500} format={(v) => `${v.toLocaleString()} km`} />
            <Slider label="ガソリン価格" value={s.fuelPrice} onChange={set("fuelPrice")}
              min={140} max={220} step={1} format={(v) => `${v} 円/L`} />

            <SectionTitle>年間維持費（{calc.car.name}）</SectionTitle>
            {[
              ["自動車税", calc.car.tax],
              ["車検・法定費用（年割）", calc.car.inspection],
              ["任意保険", calc.car.insurance],
              ["メンテ・タイヤ等", calc.car.maint],
              [`燃料費（実燃費 ${calc.car.fuelEff} km/L）`, calc.fuelYear],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
                <span style={{ fontSize: 13, color: C.sub, fontWeight: 700 }}>{k}</span>
                <span className="cpp-num" style={{ fontSize: 14, fontWeight: 700 }}>{yen(v)} 円</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${C.ink}` }}>
              <span style={{ fontSize: 14, fontWeight: 900 }}>維持費 合計／年</span>
              <span className="cpp-num" style={{ fontSize: 16, fontWeight: 900, color: C.accent }}>{yen(calc.maintYear)} 円</span>
            </div>

            <div style={{
              marginTop: 16, background: C.ink, color: "#fff",
              borderRadius: 10, padding: "14px 16px",
            }}>
              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700 }}>5年間の総コスト（頭金＋返済＋維持費）</div>
              <div className="cpp-num" style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }}>
                {man(calc.total5y)}<span style={{ fontSize: 14 }}> 万円</span>
              </div>
              <div className="cpp-num" style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                ＝ 月あたり約 {yen(calc.total5y / 60)} 円
              </div>
            </div>
            <p style={{ fontSize: 11, color: C.sub, marginTop: 10, lineHeight: 1.6 }}>
              ※ 維持費は一般的な目安値です。保険料は等級・年齢条件で大きく変わるため、見積りで要確認。駐車場代は自宅保有のため含めていません。
            </p>
          </div>
        )}

        {/* ============ 候補車 ============ */}
        {tab === "cars" && (
          <div>
            {CARS.map((c) => {
              const fuel = (s.km / c.fuelEff) * s.fuelPrice;
              const maint = c.tax + c.inspection + c.insurance + c.maint + fuel;
              const active = s.carId === c.id;
              return (
                <button key={c.id} onClick={() => set("carId")(c.id)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                    background: active ? "#EAF1FB" : C.card,
                    border: active ? `2px solid ${C.accent}` : `1.5px solid ${C.line}`,
                    borderRadius: 12, padding: 16, marginBottom: 12,
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 15, fontWeight: 900 }}>{c.name}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 900, color: "#fff",
                      background: c.tag === "本命" ? C.accent : C.sub,
                      borderRadius: 99, padding: "3px 10px",
                    }}>{c.tag}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.sub, marginTop: 6, lineHeight: 1.7 }}>{c.memo}</div>
                  <div className="cpp-num" style={{ fontSize: 13, marginTop: 8, fontWeight: 700 }}>
                    維持費目安 <span style={{ color: C.accent }}>{man(maint)}万円/年</span>
                    <span style={{ color: C.sub, fontWeight: 400 }}>（燃料 {man(fuel)}万円含む）</span>
                  </div>
                  {active && (
                    <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, marginTop: 6 }}>
                      ✓ 総コスト計算に使用中
                    </div>
                  )}
                </button>
              );
            })}
            <p style={{ fontSize: 11, color: C.sub, lineHeight: 1.6 }}>
              ※ 燃費・税額は年式/グレードにより異なります（2019〜2020年式想定の目安・要確認）。タップすると「総コスト」タブの計算対象が切り替わります。
            </p>
          </div>
        )}

        {savedAt && (
          <div style={{ textAlign: "center", fontSize: 11, color: C.sub, marginTop: 16 }}>
            入力内容を自動保存しています（{savedAt.toLocaleTimeString("ja-JP")} 保存）
          </div>
        )}
      </main>
    </div>
  );
}
