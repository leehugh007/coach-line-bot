'use client';

import { useState, useEffect } from 'react';

/* ── 情緒色彩對照 ── */
const EMOTION_MAP = {
  positive: { label: '正面', color: '#2a9d6f', bg: '#f3f9f5' },
  curious: { label: '好奇', color: '#1565C0', bg: '#E3F2FD' },
  calm: { label: '平靜', color: '#2a9d6f', bg: '#f3f9f5' },
  neutral: { label: '平穩', color: '#6b6560', bg: '#f5f3f0' },
  anxious: { label: '焦慮', color: '#e67e22', bg: '#fef6ee' },
  frustrated: { label: '沮喪', color: '#c0392b', bg: '#fdf0ef' },
  struggling: { label: '掙扎', color: '#c0392b', bg: '#fdf0ef' },
  confused: { label: '困惑', color: '#e67e22', bg: '#fef6ee' },
};

function getEmotionInfo(emotion) {
  return EMOTION_MAP[emotion] || EMOTION_MAP.neutral;
}

/* ── 里程碑中文 ── */
function formatMilestone(m) {
  const map = {
    'chat_5': '第 5 次對話',
    'chat_10': '第 10 次對話',
    'chat_25': '第 25 次對話',
    'chat_50': '第 50 次對話',
    'chat_100': '第 100 次對話',
    'positive_streak': '連續正向進步',
    'first_quiz': '第一次食物大挑戰',
    'first_knowledge': '第一次知識大挑戰',
    'first_self_check': '第一次自我覺察',
    'streak_7': '連續互動 7 天',
    'streak_14': '連續互動 14 天',
  };
  return map[m] || m;
}

/* ── 日期格式 ── */
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function daysAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return `${diff} 天前`;
}

/* ── 頁面 ── */
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

  if (loading) return (
    <div style={S.page}>
      <div style={S.container}>
        <p style={{ textAlign: 'center', padding: 60, color: '#a8a29e', fontSize: 14 }}>載入中...</p>
      </div>
    </div>
  );
  if (error) return (
    <div style={S.page}>
      <div style={S.container}>
        <p style={{ textAlign: 'center', padding: 60, color: '#c0392b', fontSize: 14 }}>{error}</p>
      </div>
    </div>
  );
  if (!data) return null;

  const { profile, quizProgress, knowledgeProgress, selfChecks, goals, milestones, stats, journey, emotionTrend, progressRecords } = data;

  // 加入天數
  const daysSinceJoin = profile.joinDate
    ? Math.max(1, Math.ceil((Date.now() - new Date(profile.joinDate).getTime()) / 86400000))
    : null;

  // 活躍目標
  const activeGoals = goals.filter(g => g.status === 'active');
  const completedGoals = goals.filter(g => g.status === 'completed');

  return (
    <div style={S.page}>
      <div style={S.container}>

        {/* ── 頂部：你好 ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 800, color: '#2a2520', margin: 0, letterSpacing: '-0.3px' }}>
              {profile.displayName}，你好
            </h1>
            <p style={{ fontSize: 13, color: '#6b6560', margin: '4px 0 0' }}>
              {profile.className && <>{profile.className}・</>}
              已經一起走了 {daysSinceJoin || stats.activeDays} 天
            </p>
          </div>
          {profile.className && (
            <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: '#f3f9f5', color: '#2a9d6f', fontWeight: 600 }}>
              {profile.className}
            </span>
          )}
        </div>

        <div style={{ height: 8 }} />

        {/* ── 小幫手眼中的你 ── */}
        {journey && (
          <div style={{ ...S.card, background: '#f3f9f5', border: '1px solid rgba(42,157,111,0.2)' }}>
            <p style={{ fontSize: 12, color: '#2a9d6f', fontWeight: 600, margin: '0 0 10px' }}>
              小幫手眼中的你
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: '#2a2520', margin: 0 }}>
              {journey.length > 350 ? journey.substring(0, 350) + '...' : journey}
            </p>
          </div>
        )}

        {/* ── 你的情緒旅程 ── */}
        {emotionTrend && emotionTrend.length >= 3 && (
          <div style={S.card}>
            <h2 style={S.cardTitle}>你的心情變化</h2>
            <p style={S.cardSub}>每一次對話，小幫手都記得你當下的感受</p>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
              {emotionTrend.map((e, i) => {
                const info = getEmotionInfo(e.emotion);
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 36 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 14,
                      background: info.bg, border: `2px solid ${info.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 10, height: 10, borderRadius: 5, background: info.color }} />
                    </div>
                    <span style={{ fontSize: 9, color: '#a8a29e' }}>{formatDate(e.date)}</span>
                  </div>
                );
              })}
            </div>
            {/* 圖例 */}
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              {['positive', 'curious', 'neutral', 'anxious', 'frustrated'].map(k => {
                const info = getEmotionInfo(k);
                return (
                  <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b6560' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: info.color, display: 'inline-block' }} />
                    {info.label}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 進步紀錄 ── */}
        {progressRecords && progressRecords.length > 0 && (
          <div style={{ ...S.card, border: '2px solid #2a9d6f' }}>
            <h2 style={S.cardTitle}>你的進步紀錄</h2>
            <p style={S.cardSub}>這些是小幫手從對話中發現的——你真的在改變</p>
            <div style={{ marginTop: 8 }}>
              {progressRecords.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < progressRecords.length - 1 ? '1px solid #eee9e5' : 'none' }}>
                  <div style={{ width: 24, height: 24, borderRadius: 12, background: '#2a9d6f', color: 'white', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>✓</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, color: '#2a2520', margin: 0, lineHeight: 1.6 }}>{p.detail}</p>
                    <p style={{ fontSize: 11, color: '#a8a29e', margin: '2px 0 0' }}>{daysAgo(p.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 食物分類收集 ── */}
        <div style={S.card}>
          <h2 style={S.cardTitle}>食物分類收集</h2>
          <p style={S.cardSub}>認識越多食物，選擇越自由</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#2a9d6f' }}>{quizProgress.level}</span>
            <span style={{ fontSize: 13, color: '#a8a29e' }}>{quizProgress.collected} / {quizProgress.total}</span>
          </div>
          <div style={S.progressTrack}>
            <div style={{ ...S.progressFill, width: `${(quizProgress.collected / quizProgress.total) * 100}%` }} />
          </div>
          {quizProgress.collected < quizProgress.total && (
            <p style={{ fontSize: 12, color: '#6b6560', margin: '8px 0 0' }}>
              再認識 <strong style={{ color: '#2a2520' }}>{quizProgress.total - quizProgress.collected}</strong> 種就全制霸
            </p>
          )}
          <a href={`/quiz?u=${encodeURIComponent(userId)}`} style={S.actionLink}>繼續挑戰 →</a>
        </div>

        {/* ── 瘦身知識收集 ── */}
        <div style={S.card}>
          <h2 style={S.cardTitle}>瘦身知識收集</h2>
          <p style={S.cardSub}>知道為什麼，才不會走回頭路</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#2a9d6f' }}>{knowledgeProgress.level}</span>
            <span style={{ fontSize: 13, color: '#a8a29e' }}>{knowledgeProgress.collected} / {knowledgeProgress.total}</span>
          </div>
          <div style={S.progressTrack}>
            <div style={{ ...S.progressFill, width: `${(knowledgeProgress.collected / knowledgeProgress.total) * 100}%` }} />
          </div>
          {knowledgeProgress.collected < knowledgeProgress.total && (
            <p style={{ fontSize: 12, color: '#6b6560', margin: '8px 0 0' }}>
              再答對 <strong style={{ color: '#2a2520' }}>{knowledgeProgress.total - knowledgeProgress.collected}</strong> 題就全制霸
            </p>
          )}
          <a href={`/knowledge?u=${encodeURIComponent(userId)}`} style={S.actionLink}>繼續挑戰 →</a>
        </div>

        {/* ── 自我覺察趨勢 ── */}
        <div style={S.card}>
          <h2 style={S.cardTitle}>自我覺察</h2>
          <p style={S.cardSub}>身體的回應，是最誠實的成績單</p>
          {selfChecks.length === 0 ? (
            <p style={{ fontSize: 13, color: '#a8a29e', textAlign: 'center', padding: 12 }}>
              還沒有自我觀察紀錄
            </p>
          ) : (
            <>
              {/* 最新分數 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{
                  fontSize: 32, fontWeight: 800, lineHeight: 1,
                  color: selfChecks[0].total_score >= 20 ? '#2a9d6f' : selfChecks[0].total_score >= 15 ? '#689F38' : '#e67e22',
                }}>
                  {selfChecks[0].total_score}
                </span>
                <span style={{ fontSize: 14, color: '#a8a29e' }}>/25</span>
                <span style={{ fontSize: 12, color: '#a8a29e', marginLeft: 'auto' }}>
                  {selfChecks[0].check_date}
                </span>
              </div>
              {/* 趨勢圖 */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 64 }}>
                {[...selfChecks].reverse().map((c, i) => {
                  const pct = (c.total_score / 25) * 100;
                  const color = c.total_score >= 20 ? '#2a9d6f' : c.total_score >= 15 ? '#689F38' : '#e67e22';
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color }}>{c.total_score}</span>
                      <div style={{ width: '100%', height: `${pct}%`, minHeight: 4, background: color, borderRadius: 3, opacity: 0.8 }} />
                      <span style={{ fontSize: 9, color: '#a8a29e' }}>{c.check_date?.substring(5)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <a href={`/check?u=${encodeURIComponent(userId)}`} style={S.actionLink}>
            {selfChecks.length > 0 ? '查看完整趨勢 →' : '開始第一次觀察 →'}
          </a>
        </div>

        {/* ── 行動目標 ── */}
        <div style={S.card}>
          <h2 style={S.cardTitle}>我的目標</h2>
          <p style={S.cardSub}>你說過的話，小幫手都記得</p>
          {goals.length === 0 ? (
            <p style={{ fontSize: 13, color: '#a8a29e', textAlign: 'center', padding: 12 }}>
              在對話中告訴小幫手你想做到什麼，就會出現在這裡
            </p>
          ) : (
            <div>
              {activeGoals.map((g, i) => (
                <div key={`a-${i}`} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #eee9e5' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, border: '2px solid #2a9d6f', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p style={{ fontSize: 14, color: '#2a2520', margin: 0 }}>{g.goal_text}</p>
                    <p style={{ fontSize: 11, color: '#a8a29e', margin: '2px 0 0' }}>
                      {formatDate(g.created_at)} 設定・進行中
                    </p>
                  </div>
                </div>
              ))}
              {completedGoals.map((g, i) => (
                <div key={`c-${i}`} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: i < completedGoals.length - 1 ? '1px solid #eee9e5' : 'none' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: '#2a9d6f', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 14, color: '#a8a29e', margin: 0 }}>{g.goal_text}</p>
                    <p style={{ fontSize: 11, color: '#a8a29e', margin: '2px 0 0' }}>
                      {formatDate(g.completed_at)} 完成
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 里程碑 ── */}
        <div style={S.card}>
          <h2 style={S.cardTitle}>你的里程碑</h2>
          <p style={S.cardSub}>每一個第一次，都是你以前做不到的事</p>
          {milestones.length === 0 ? (
            <p style={{ fontSize: 13, color: '#a8a29e', textAlign: 'center', padding: 12 }}>
              繼續跟小幫手聊天，里程碑很快就會出現
            </p>
          ) : (
            <div>
              {milestones.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < milestones.length - 1 ? '1px solid #eee9e5' : 'none' }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 11, background: '#2a9d6f', color: 'white',
                    fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>✓</div>
                  <span style={{ fontSize: 14, color: '#2a2520', flex: 1 }}>{formatMilestone(m.milestone)}</span>
                  <span style={{ fontSize: 11, color: '#a8a29e' }}>{formatDate(m.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 快捷入口 ── */}
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`/quiz?u=${encodeURIComponent(userId)}`} style={S.quickBtn}>
            <span style={{ fontSize: 20 }}>🍱</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>食物大挑戰</span>
          </a>
          <a href={`/knowledge?u=${encodeURIComponent(userId)}`} style={S.quickBtn}>
            <span style={{ fontSize: 20 }}>🧠</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>知識大挑戰</span>
          </a>
          <a href={`/check?u=${encodeURIComponent(userId)}`} style={S.quickBtn}>
            <span style={{ fontSize: 20 }}>🪞</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>自我覺察</span>
          </a>
        </div>

        {/* ── 底部鼓勵語 ── */}
        <div style={{ ...S.card, background: '#f3f9f5', border: '1px solid rgba(42,157,111,0.2)', textAlign: 'center', marginTop: 8 }}>
          <p style={{ fontSize: 14, color: '#6b6560', lineHeight: 1.8, margin: 0 }}>
            「你已經走了 {stats.activeDays} 天、對話了 {stats.totalConversations} 次。
            <br />每一次開口，都是在為自己加油。」
          </p>
          <p style={{ fontSize: 12, color: '#a8a29e', margin: '10px 0 0' }}>— 休校長小幫手</p>
        </div>

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
}

/* ── 共用樣式 ── */
const S = {
  page: {
    minHeight: '100vh',
    background: '#faf9f7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  container: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '32px 20px 40px',
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: '20px 22px',
    marginBottom: 12,
    border: '1px solid #eee9e5',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#2a2520',
    margin: '0 0 2px',
  },
  cardSub: {
    fontSize: 12,
    color: '#a8a29e',
    margin: '0 0 14px',
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    background: '#eee9e5',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    background: '#2a9d6f',
    transition: 'width 0.5s ease',
  },
  actionLink: {
    display: 'block',
    textAlign: 'center',
    color: '#2a9d6f',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
    padding: '10px 0 0',
  },
  quickBtn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '14px 8px',
    borderRadius: 14,
    background: 'white',
    border: '1px solid #eee9e5',
    textDecoration: 'none',
    color: '#2a2520',
  },
};
