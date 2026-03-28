'use client';

import { useState, useEffect } from 'react';

const FIELDS = [
  { key: 'post_meal_energy', label: '餐後精神', emoji: '⚡' },
  { key: 'hunger_between_meals', label: '飢餓感', emoji: '😌' },
  { key: 'sweet_craving', label: '甜食渴望', emoji: '🍰' },
  { key: 'daily_energy', label: '整天精力', emoji: '🔋' },
  { key: 'body_feeling', label: '身體感覺', emoji: '🪶' },
];

function scoreColor(score) {
  if (score >= 20) return '#2E7D32';
  if (score >= 15) return '#558B2F';
  if (score >= 10) return '#F57F17';
  return '#C62828';
}

function dotColor(val) {
  if (val >= 4) return '#4CAF50';
  if (val >= 3) return '#FFC107';
  if (val >= 2) return '#FF9800';
  return '#F44336';
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

function weekdayLabel(dateStr) {
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  const d = new Date(dateStr + 'T00:00:00+08:00');
  return days[d.getDay()];
}

export default function CheckHistoryPage() {
  const [userId, setUserId] = useState('');
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const u = params.get('u') || '';
    setUserId(u);
    if (!u) {
      setError('缺少用戶資訊，請從 LINE 開啟此頁面');
      setLoading(false);
      return;
    }
    fetchChecks(u);
  }, []);

  async function fetchChecks(uid) {
    setLoading(true);
    try {
      const res = await fetch(`/api/check?userId=${encodeURIComponent(uid)}&limit=14`);
      const data = await res.json();
      if (data.ok) {
        setChecks(data.checks || []);
      } else {
        setError(data.error || '載入失敗');
      }
    } catch (e) {
      setError('網路錯誤，請稍後再試');
    }
    setLoading(false);
  }

  // Checks are desc order from API; reverse for display (oldest left → newest right)
  const ordered = [...checks].reverse();
  const latest = checks[0] || null;
  const oldest = ordered[0] || null;

  // Compute improvement summary
  function getImprovementSummary() {
    if (!oldest || !latest || oldest.check_date === latest.check_date) return null;

    const totalDiff = latest.total_score - oldest.total_score;

    // Find most improved and most declined
    let bestField = null;
    let bestDiff = 0;
    let worstField = null;
    let worstDiff = 0;

    for (const f of FIELDS) {
      const diff = latest[f.key] - oldest[f.key];
      if (diff > bestDiff) { bestDiff = diff; bestField = f; }
      if (diff < worstDiff) { worstDiff = diff; worstField = f; }
    }

    return { totalDiff, bestField, bestDiff, worstField, worstDiff };
  }

  const improvement = getImprovementSummary();

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>載入中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: 'center', padding: 60, color: '#C62828' }}>{error}</div>
      </div>
    );
  }

  if (checks.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>📊 觀察趨勢</h1>
          <p style={styles.subtitle}>你還沒有任何自我觀察紀錄</p>
        </div>
        <a href={`/check?u=${encodeURIComponent(userId)}`} style={styles.ctaBtn}>
          填寫第一筆觀察
        </a>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>📊 觀察趨勢</h1>
        <p style={styles.subtitle}>最近 {checks.length} 次自我觀察紀錄</p>
      </div>

      {/* Overall Trend Summary */}
      {improvement && (
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: '#888' }}>
              {formatDateShort(oldest.check_date)}
            </span>
            <span style={{ fontSize: 20 }}>→</span>
            <span style={{ fontSize: 14, color: '#888' }}>
              {formatDateShort(latest.check_date)}
            </span>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: scoreColor(latest.total_score) }}>
              {improvement.totalDiff > 0 ? '+' : ''}{improvement.totalDiff}
            </span>
            <span style={{ fontSize: 14, color: '#aaa', marginLeft: 4 }}>分</span>
          </div>

          {improvement.bestDiff > 0 && improvement.bestField && (
            <div style={styles.improvementRow}>
              <span style={{ color: '#4CAF50', fontWeight: 600 }}>
                {improvement.bestField.emoji} {improvement.bestField.label}
              </span>
              <span style={{ color: '#4CAF50', fontWeight: 700 }}>+{improvement.bestDiff}</span>
            </div>
          )}
          {improvement.worstDiff < 0 && improvement.worstField && (
            <div style={styles.improvementRow}>
              <span style={{ color: '#FF9800', fontWeight: 600 }}>
                {improvement.worstField.emoji} {improvement.worstField.label}
              </span>
              <span style={{ color: '#FF9800', fontWeight: 700 }}>{improvement.worstDiff}</span>
            </div>
          )}

          {improvement.totalDiff === 0 && improvement.bestDiff === 0 && improvement.worstDiff === 0 && (
            <p style={{ textAlign: 'center', color: '#888', fontSize: 14, margin: 0 }}>
              狀態維持穩定，持續觀察中
            </p>
          )}
        </div>
      )}

      {/* Score Trend Chart */}
      <div style={styles.card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 12 }}>總分趨勢</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
          {ordered.map((c, i) => {
            const heightPct = (c.total_score / 25) * 100;
            const isLatest = i === ordered.length - 1;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: isLatest ? 700 : 500,
                  color: scoreColor(c.total_score),
                }}>{c.total_score}</span>
                <div style={{
                  width: '100%',
                  maxWidth: 32,
                  height: `${heightPct}%`,
                  minHeight: 4,
                  background: isLatest
                    ? `linear-gradient(180deg, ${scoreColor(c.total_score)}, ${scoreColor(c.total_score)}cc)`
                    : `${scoreColor(c.total_score)}88`,
                  borderRadius: 4,
                  border: isLatest ? `2px solid ${scoreColor(c.total_score)}` : 'none',
                }} />
                <span style={{ fontSize: 9, color: '#aaa' }}>{formatDateShort(c.check_date)}</span>
                <span style={{ fontSize: 8, color: '#ccc' }}>{weekdayLabel(c.check_date)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily Detail Cards */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 8 }}>每日明細</div>
      {checks.map((c, i) => {
        const prevCheck = checks[i + 1]; // next in desc order = previous day
        const totalDiff = prevCheck ? c.total_score - prevCheck.total_score : null;

        return (
          <div key={c.check_date} style={styles.dayCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>
                  {formatDateShort(c.check_date)}
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#aaa', marginLeft: 4 }}>
                    ({weekdayLabel(c.check_date)})
                  </span>
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {totalDiff !== null && totalDiff !== 0 && (
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: totalDiff > 0 ? '#4CAF50' : '#FF9800',
                  }}>
                    {totalDiff > 0 ? '+' : ''}{totalDiff}
                  </span>
                )}
                <span style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: scoreColor(c.total_score),
                }}>
                  {c.total_score}
                  <span style={{ fontSize: 11, fontWeight: 400, color: '#bbb' }}>/25</span>
                </span>
              </div>
            </div>

            {/* Indicator dots/bars */}
            <div style={{ display: 'flex', gap: 6 }}>
              {FIELDS.map(f => (
                <div key={f.key} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    height: 6,
                    borderRadius: 3,
                    background: dotColor(c[f.key]),
                    opacity: 0.2 + (c[f.key] / 5) * 0.8,
                    marginBottom: 3,
                  }} />
                  <div style={{ fontSize: 9, color: '#aaa' }}>{f.label.substring(0, 2)}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: dotColor(c[f.key]) }}>{c[f.key]}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* CTA Button */}
      <div style={{ marginTop: 20, marginBottom: 20 }}>
        <a href={`/check?u=${encodeURIComponent(userId)}`} style={styles.ctaBtn}>
          填寫今天的觀察
        </a>
      </div>
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
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#2D5A3D',
    margin: '0 0 4px',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    margin: 0,
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '18px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    marginBottom: 14,
  },
  dayCard: {
    background: '#fff',
    borderRadius: 12,
    padding: '14px 16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    marginBottom: 8,
  },
  improvementRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 12px',
    background: '#FAFAF5',
    borderRadius: 8,
    marginBottom: 4,
    fontSize: 14,
  },
  ctaBtn: {
    display: 'block',
    width: '100%',
    padding: '14px 0',
    borderRadius: 14,
    border: 'none',
    background: '#2D5A3D',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    textAlign: 'center',
    textDecoration: 'none',
    boxSizing: 'border-box',
  },
};
