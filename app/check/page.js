'use client';

import { useState, useEffect } from 'react';

const INDICATORS = [
  {
    key: 'post_meal_energy',
    label: '餐後精神',
    left: '😴 很想睡',
    right: '⚡ 精神很好',
    hint: '吃完飯後的精神狀態',
  },
  {
    key: 'hunger_between_meals',
    label: '兩餐間飢餓感',
    left: '😫 很餓想吃',
    right: '😌 穩穩不餓',
    hint: '兩餐之間會不會突然很餓',
  },
  {
    key: 'sweet_craving',
    label: '甜食渴望',
    left: '🍰 超想吃',
    right: '🙂 不太想',
    hint: '看到甜的、零食的反應',
  },
  {
    key: 'daily_energy',
    label: '整天精力',
    left: '🪫 很累沒力',
    right: '🔋 精力充沛',
    hint: '整體一天的能量感',
  },
  {
    key: 'body_feeling',
    label: '身體感覺',
    left: '😮‍💨 腫脹沉重',
    right: '🪶 輕盈舒服',
    hint: '水腫、褲頭鬆緊、身體輕盈度',
  },
];

const SCORE_LABELS = ['', '1', '2', '3', '4', '5'];

export default function CheckPage() {
  const [scores, setScores] = useState({
    post_meal_energy: 3,
    hunger_between_meals: 3,
    sweet_craving: 3,
    daily_energy: 3,
    body_feeling: 3,
  });
  const [userId, setUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [checkDate, setCheckDate] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUserId(params.get('u') || '');
    // Default to today (Taiwan time)
    const tw = new Date(Date.now() + 8 * 60 * 60 * 1000);
    setCheckDate(tw.toISOString().substring(0, 10));
  }, []);

  const handleSubmit = async () => {
    if (!userId) { setError('缺少用戶資訊，請從 LINE 開啟此頁面'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, checkDate, ...scores }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult(data);
      } else {
        setError(data.error || '送出失敗，請稍後再試');
      }
    } catch (e) {
      setError('網路錯誤，請稍後再試');
    }
    setSubmitting(false);
  };

  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  if (result) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>✅</div>
          <h2 style={styles.resultTitle}>今天的觀察已記錄！</h2>
          <div style={styles.scoreCircle}>
            <span style={styles.scoreNumber}>{result.totalScore}</span>
            <span style={styles.scoreMax}>/25</span>
          </div>
          {result.comparison && (
            <div style={styles.comparison}>
              <p style={styles.comparisonText}>{result.comparison}</p>
            </div>
          )}
          {result.pointsAdded > 0 && (
            <p style={styles.points}>🎯 +{result.pointsAdded} 分</p>
          )}
          <p style={styles.hint}>你可以每天填一次，觀察自己的變化趨勢</p>
          <a
            href={`/check/history?u=${encodeURIComponent(userId)}`}
            style={styles.trendLink}
          >
            📊 查看我的趨勢
          </a>
          <button onClick={() => { setResult(null); }} style={styles.backBtn}>再填一次</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🪞 自我觀察</h1>
        <p style={styles.subtitle}>花 15 秒感受一下今天的身體狀態</p>
        <input
          type="date"
          value={checkDate}
          onChange={(e) => setCheckDate(e.target.value)}
          style={styles.dateInput}
        />
      </div>

      <div style={styles.card}>
        {INDICATORS.map((ind, i) => (
          <div key={ind.key} style={i > 0 ? { ...styles.indicator, borderTop: '1px solid #f0f0f0', paddingTop: 20 } : styles.indicator}>
            <div style={styles.labelRow}>
              <span style={styles.indicatorLabel}>{ind.label}</span>
              <span style={styles.indicatorScore}>{scores[ind.key]}/5</span>
            </div>
            <p style={styles.indicatorHint}>{ind.hint}</p>
            <div style={styles.scaleRow}>
              <span style={styles.scaleLabel}>{ind.left}</span>
              <span style={styles.scaleLabel}>{ind.right}</span>
            </div>
            <div style={styles.buttonRow}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => setScores({ ...scores, [ind.key]: v })}
                  style={scores[ind.key] === v ? styles.scoreButtonActive : styles.scoreButton}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.totalSection}>
        <span style={styles.totalLabel}>今日總分</span>
        <span style={styles.totalScore}>{total}/25</span>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={submitting ? { ...styles.submitBtn, opacity: 0.6 } : styles.submitBtn}
      >
        {submitting ? '送出中...' : '送出觀察 ✨'}
      </button>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 440,
    margin: '0 auto',
    padding: '20px 16px 40px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: '#FAFAF5',
    minHeight: '100vh',
  },
  header: {
    textAlign: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#2D5A3D',
    margin: '0 0 4px',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    margin: '0 0 12px',
  },
  dateInput: {
    fontSize: 15,
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid #ddd',
    color: '#333',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '20px 18px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  indicator: {
    marginBottom: 20,
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  indicatorLabel: {
    fontSize: 16,
    fontWeight: 600,
    color: '#333',
  },
  indicatorScore: {
    fontSize: 14,
    fontWeight: 600,
    color: '#2D5A3D',
  },
  indicatorHint: {
    fontSize: 12,
    color: '#aaa',
    margin: '0 0 8px',
  },
  scaleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  scaleLabel: {
    fontSize: 12,
    color: '#999',
  },
  buttonRow: {
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
  },
  scoreButton: {
    width: 48,
    height: 44,
    borderRadius: 12,
    border: '2px solid #e0e0e0',
    background: '#fff',
    fontSize: 16,
    fontWeight: 600,
    color: '#888',
    cursor: 'pointer',
  },
  scoreButtonActive: {
    width: 48,
    height: 44,
    borderRadius: 12,
    border: '2px solid #2D5A3D',
    background: '#E8F5E9',
    fontSize: 16,
    fontWeight: 700,
    color: '#2D5A3D',
    cursor: 'pointer',
  },
  totalSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: '20px 0 16px',
    padding: '12px 18px',
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  totalLabel: {
    fontSize: 15,
    color: '#666',
  },
  totalScore: {
    fontSize: 22,
    fontWeight: 700,
    color: '#2D5A3D',
  },
  submitBtn: {
    width: '100%',
    padding: '14px 0',
    borderRadius: 14,
    border: 'none',
    background: '#2D5A3D',
    color: '#fff',
    fontSize: 17,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    color: '#c62828',
    fontSize: 14,
    textAlign: 'center',
    margin: '0 0 12px',
  },
  // Result page
  resultTitle: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 700,
    color: '#333',
    margin: '0 0 16px',
  },
  scoreCircle: {
    textAlign: 'center',
    marginBottom: 16,
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: 800,
    color: '#2D5A3D',
  },
  scoreMax: {
    fontSize: 20,
    color: '#aaa',
  },
  comparison: {
    background: '#F1F8E9',
    borderRadius: 12,
    padding: '12px 16px',
    marginBottom: 12,
  },
  comparisonText: {
    fontSize: 14,
    color: '#33691E',
    lineHeight: 1.6,
    margin: 0,
  },
  points: {
    textAlign: 'center',
    fontSize: 15,
    color: '#E65100',
    fontWeight: 600,
    margin: '0 0 12px',
  },
  hint: {
    textAlign: 'center',
    fontSize: 13,
    color: '#999',
    margin: '0 0 16px',
  },
  trendLink: {
    display: 'block',
    width: '100%',
    padding: '12px 0',
    borderRadius: 12,
    border: '2px solid #2D5A3D',
    background: '#fff',
    color: '#2D5A3D',
    fontSize: 15,
    fontWeight: 600,
    textAlign: 'center',
    textDecoration: 'none',
    marginBottom: 8,
    boxSizing: 'border-box',
  },
  backBtn: {
    width: '100%',
    padding: '10px 0',
    borderRadius: 10,
    border: '1px solid #ddd',
    background: '#fff',
    color: '#666',
    fontSize: 14,
    cursor: 'pointer',
  },
};
