'use client';

import { useState, useEffect } from 'react';

export default function DashboardPage() {
  const [userId, setUserId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('u') || '';
    setUserId(uid);
    if (uid) fetchDashboard(uid);
    else { setLoading(false); setError('缺少用戶資訊'); }
  }, []);

  const fetchDashboard = async (uid) => {
    try {
      const res = await fetch(`/api/dashboard?userId=${encodeURIComponent(uid)}`);
      const json = await res.json();
      if (json.ok) setData(json);
      else setError(json.error || '載入失敗');
    } catch (e) {
      setError('網路錯誤');
    }
    setLoading(false);
  };

  if (loading) return <div style={S.container}><p style={S.loading}>載入中...</p></div>;
  if (error) return <div style={S.container}><p style={S.error}>{error}</p></div>;
  if (!data) return null;

  const { profile, quizProgress, knowledgeProgress, selfChecks, goals, milestones, stats, journey } = data;

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.avatar}>{profile.displayName?.[0] || '🙂'}</div>
        <h1 style={S.name}>{profile.displayName}</h1>
        <p style={S.classTag}>{profile.className || '自由學員'}</p>
      </div>

      {/* Stats Row */}
      <div style={S.statsRow}>
        <StatBox label="互動天數" value={stats.activeDays} />
        <StatBox label="總對話" value={stats.totalConversations} />
        <StatBox label="里程碑" value={milestones.length} />
      </div>

      {/* 旅程摘要 */}
      {journey && (
        <Card title="📖 我的旅程">
          <p style={S.journeyText}>{journey.length > 300 ? journey.substring(0, 300) + '...' : journey}</p>
        </Card>
      )}

      {/* 食物分類收集 */}
      <Card title="🍱 食物分類收集">
        <div style={S.progressRow}>
          <span style={S.progressLabel}>{quizProgress.level}</span>
          <span style={S.progressCount}>{quizProgress.collected} / {quizProgress.total}</span>
        </div>
        <div style={S.progressBar}>
          <div style={{ ...S.progressFill, width: `${(quizProgress.collected / quizProgress.total) * 100}%` }} />
        </div>
        <a href={`/quiz/history?u=${encodeURIComponent(userId)}`} style={S.linkBtn}>查看收集明細</a>
      </Card>

      {/* 瘦身知識收集 */}
      <Card title="🧠 瘦身知識收集">
        <div style={S.progressRow}>
          <span style={S.progressLabel}>{knowledgeProgress.level}</span>
          <span style={S.progressCount}>{knowledgeProgress.collected} / {knowledgeProgress.total}</span>
        </div>
        <div style={S.progressBar}>
          <div style={{ ...S.progressFill, width: `${(knowledgeProgress.collected / knowledgeProgress.total) * 100}%` }} />
        </div>
        <a href={`/knowledge/history?u=${encodeURIComponent(userId)}`} style={S.linkBtn}>查看收集明細</a>
      </Card>

      {/* 自我觀察 */}
      <Card title="🪞 自我觀察趨勢">
        {selfChecks.length === 0 ? (
          <p style={S.empty}>尚未填寫自我觀察</p>
        ) : (
          <>
            <div style={S.checkRow}>
              <span style={S.checkLabel}>最新總分</span>
              <span style={{ ...S.checkScore, color: selfChecks[0].total_score >= 20 ? '#2D5A3D' : selfChecks[0].total_score >= 15 ? '#689F38' : '#E65100' }}>
                {selfChecks[0].total_score}/25
              </span>
            </div>
            <div style={S.miniChart}>
              {selfChecks.slice(0, 7).reverse().map((c, i) => (
                <div key={i} style={S.miniBarWrap}>
                  <div style={{ ...S.miniBar, height: `${(c.total_score / 25) * 60}px`, background: c.total_score >= 20 ? '#2D5A3D' : c.total_score >= 15 ? '#689F38' : '#E65100' }} />
                  <span style={S.miniDate}>{c.check_date?.substring(5)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <a href={`/check/history?u=${encodeURIComponent(userId)}`} style={S.linkBtn}>查看完整趨勢</a>
      </Card>

      {/* 行動目標 */}
      <Card title="🎯 行動目標">
        {goals.length === 0 ? (
          <p style={S.empty}>還沒設定目標</p>
        ) : (
          goals.map((g, i) => (
            <div key={i} style={S.goalItem}>
              <span style={g.status === 'completed' ? S.goalDone : S.goalActive}>
                {g.status === 'completed' ? '✅' : '🔵'} {g.goal_text}
              </span>
              {g.completed_at && <span style={S.goalDate}>{g.completed_at.substring(0, 10)}</span>}
            </div>
          ))
        )}
      </Card>

      {/* 里程碑 */}
      {milestones.length > 0 && (
        <Card title="🏆 里程碑">
          {milestones.map((m, i) => (
            <div key={i} style={S.milestone}>
              <span>🎖️ {formatMilestone(m.milestone)}</span>
              <span style={S.milestoneDate}>{m.created_at?.substring(0, 10)}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Action buttons */}
      <div style={S.actions}>
        <a href={`/quiz?u=${encodeURIComponent(userId)}`} style={S.actionBtn}>🍱 食物大挑戰</a>
        <a href={`/knowledge?u=${encodeURIComponent(userId)}`} style={S.actionBtn}>🧠 知識大挑戰</a>
        <a href={`/check?u=${encodeURIComponent(userId)}`} style={S.actionBtn}>🪞 自我觀察</a>
      </div>

      <p style={S.footer}>休校長小幫手 — 你的專屬學習紀錄</p>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={S.card}>
      <h2 style={S.cardTitle}>{title}</h2>
      {children}
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div style={S.statBox}>
      <span style={S.statValue}>{value}</span>
      <span style={S.statLabel}>{label}</span>
    </div>
  );
}

function formatMilestone(m) {
  const map = {
    'chat_5': '第 5 次對話',
    'chat_10': '第 10 次對話',
    'chat_25': '第 25 次對話',
    'chat_50': '第 50 次對話',
    'positive_streak': '連續正向進步',
  };
  return map[m] || m;
}

const S = {
  container: { maxWidth: 440, margin: '0 auto', padding: '0 16px 40px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#FAFAF5', minHeight: '100vh' },
  loading: { textAlign: 'center', padding: 40, color: '#999' },
  error: { textAlign: 'center', padding: 40, color: '#c62828' },
  header: { textAlign: 'center', padding: '32px 0 20px' },
  avatar: { width: 64, height: 64, borderRadius: 32, background: '#2D5A3D', color: '#fff', fontSize: 28, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' },
  name: { fontSize: 22, fontWeight: 700, color: '#333', margin: '0 0 4px' },
  classTag: { fontSize: 13, color: '#fff', background: '#2D5A3D', display: 'inline-block', padding: '2px 12px', borderRadius: 12 },
  statsRow: { display: 'flex', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, background: '#fff', borderRadius: 12, padding: '12px 8px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  statValue: { display: 'block', fontSize: 24, fontWeight: 800, color: '#2D5A3D' },
  statLabel: { fontSize: 11, color: '#999' },
  card: { background: '#fff', borderRadius: 16, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#333', margin: '0 0 12px' },
  progressRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 14, fontWeight: 600, color: '#2D5A3D' },
  progressCount: { fontSize: 13, color: '#888' },
  progressBar: { height: 8, background: '#E8F5E9', borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: '100%', background: '#2D5A3D', borderRadius: 4, transition: 'width 0.5s' },
  linkBtn: { display: 'block', textAlign: 'center', color: '#2D5A3D', fontSize: 13, fontWeight: 600, textDecoration: 'none', padding: '6px 0' },
  checkRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  checkLabel: { fontSize: 14, color: '#666' },
  checkScore: { fontSize: 20, fontWeight: 800 },
  miniChart: { display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'flex-end', marginBottom: 8, minHeight: 70 },
  miniBarWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  miniBar: { width: 24, borderRadius: 4, minHeight: 4 },
  miniDate: { fontSize: 10, color: '#bbb' },
  goalItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f5f5f5' },
  goalActive: { fontSize: 14, color: '#333' },
  goalDone: { fontSize: 14, color: '#888', textDecoration: 'line-through' },
  goalDate: { fontSize: 11, color: '#bbb' },
  milestone: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 },
  milestoneDate: { fontSize: 11, color: '#bbb' },
  actions: { display: 'flex', gap: 8, marginTop: 16, marginBottom: 12 },
  actionBtn: { flex: 1, textAlign: 'center', padding: '12px 0', borderRadius: 12, background: '#2D5A3D', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  empty: { fontSize: 13, color: '#ccc', textAlign: 'center', padding: 8 },
  journeyText: { fontSize: 13, lineHeight: 1.8, color: '#555', margin: 0 },
  footer: { textAlign: 'center', fontSize: 12, color: '#ccc', marginTop: 20 },
};
