'use client';

import { useState, useEffect } from 'react';
import { KNOWLEDGE_QUIZZES, KNOWLEDGE_CATEGORIES, KNOWLEDGE_LEVELS } from '@/lib/knowledge-quiz-data';

const TOTAL_QUESTIONS = KNOWLEDGE_QUIZZES.length;

const LEVELS = KNOWLEDGE_LEVELS.map(l => ({ min: l.min, title: l.title, emoji: l.emoji }));

function getLevel(count) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (count >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

function getNextLevel(count) {
  for (let i = 0; i < LEVELS.length; i++) {
    if (count < LEVELS[i].min) return LEVELS[i];
  }
  return null;
}

const CATEGORY_COLORS = {
  myth: { bg: '#FFF3E0', color: '#E65100', emoji: '💡' },
  abc: { bg: '#FFEBEE', color: '#C62828', emoji: '🔥' },
  nutrition: { bg: '#E8F5E9', color: '#2E7D32', emoji: '🥗' },
  mindset: { bg: '#E3F2FD', color: '#1565C0', emoji: '🧠' },
  behavior: { bg: '#F3E5F5', color: '#6A1B9A', emoji: '🎯' },
  food_science: { bg: '#FFF8E1', color: '#F57F17', emoji: '🔬' },
};

export default function KnowledgeHistoryPage() {
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collected, setCollected] = useState([]);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const u = params.get('u');
    if (u) {
      setUserId(u);
      fetchData(u);
    } else {
      setLoading(false);
    }
  }, []);

  async function fetchData(uid) {
    try {
      const res = await fetch(`/api/knowledge?userId=${encodeURIComponent(uid)}`);
      if (res.ok) {
        const data = await res.json();
        setCollected(data.collected || []);
        setSessions(data.recentSessions || []);
      }
    } catch (e) {
      console.error('Failed to fetch:', e);
    }
    setLoading(false);
  }

  const PRIMARY = '#2D5A3D';
  const level = getLevel(collected.length);
  const nextLevel = getNextLevel(collected.length);
  const collectedSet = new Set(collected);

  const containerStyle = {
    maxWidth: 440,
    margin: '0 auto',
    minHeight: '100vh',
    background: '#faf9f7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ textAlign: 'center', color: '#999' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15 }}>載入中...</div>
          </div>
        </div>
      </div>
    );
  }

  // Group questions by category
  const questionsByCategory = {};
  for (const cat of KNOWLEDGE_CATEGORIES) {
    questionsByCategory[cat.id] = KNOWLEDGE_QUIZZES
      .map((q, i) => ({ ...q, _index: i }))
      .filter(q => q.category === cat.id);
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${PRIMARY}, #3D7A52)`,
        padding: '32px 24px 24px',
        color: 'white',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 40 }}>{level.emoji}</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>{level.title}</div>
        <div style={{ fontSize: 14, opacity: 0.9, marginTop: 6 }}>
          已掌握 {collected.length} / {TOTAL_QUESTIONS} 個知識點
        </div>
        {nextLevel && (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            再掌握 {nextLevel.min - collected.length} 個就能升級成 {nextLevel.emoji} {nextLevel.title}
          </div>
        )}
        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, height: 8, marginTop: 12, overflow: 'hidden' }}>
          <div style={{
            width: `${(collected.length / TOTAL_QUESTIONS) * 100}%`,
            height: '100%',
            background: 'rgba(255,255,255,0.8)',
            borderRadius: 8,
          }} />
        </div>
      </div>

      <div style={{ padding: '20px' }}>
        {/* Knowledge collection by category */}
        {KNOWLEDGE_CATEGORIES.map(cat => {
          const catQuestions = questionsByCategory[cat.id] || [];
          const catColor = CATEGORY_COLORS[cat.id];
          const catCollectedCount = catQuestions.filter(q => collectedSet.has(q._index)).length;

          return (
            <div key={cat.id} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#333' }}>
                  {catColor.emoji} {cat.name}
                </div>
                <div style={{ fontSize: 12, color: '#aaa' }}>
                  {catCollectedCount}/{catQuestions.length}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {catQuestions.map(q => {
                  const isCollected = collectedSet.has(q._index);
                  return (
                    <div
                      key={q._index}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 12,
                        fontSize: 14,
                        lineHeight: 1.4,
                        background: isCollected ? catColor.bg : '#f0f0f0',
                        color: isCollected ? catColor.color : '#ccc',
                        border: isCollected ? `1px solid ${catColor.color}22` : '1px solid #e8e4e0',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        {isCollected ? (q.answer ? '⭕' : '❌') : '❓'}
                      </span>{' '}
                      {isCollected ? q.statement : q.statement.substring(0, 6) + '...'}
                      {isCollected && (
                        <div style={{ fontSize: 12, marginTop: 4, opacity: 0.75 }}>{q.explain}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#333', marginBottom: 10 }}>最近挑戰紀錄</div>
            {sessions.slice(0, 5).map((s, i) => {
              const d = new Date(s.date);
              const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
              const mins = s.duration ? Math.floor(s.duration / 60) : 0;
              const secs = s.duration ? s.duration % 60 : 0;
              const timeStr = mins > 0 ? `${mins}分${secs}秒` : s.duration ? `${secs}秒` : '';
              const tierLabel = s.tier === 0 ? '混合' : s.tier === 1 ? '基礎' : s.tier === 2 ? '進階' : '高手';

              return (
                <div key={i} style={{
                  background: 'white',
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginBottom: 6,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: PRIMARY }}>{s.score}/{s.total}</div>
                    <div style={{ fontSize: 12, color: '#aaa' }}>{dateStr} · {tierLabel}</div>
                  </div>
                  {timeStr && (
                    <div style={{ fontSize: 12, color: '#888' }}>{timeStr}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Action button */}
        <a
          href={`/knowledge${userId ? `?u=${userId}` : ''}`}
          style={{
            display: 'block',
            textAlign: 'center',
            width: '100%',
            padding: '16px',
            borderRadius: 14,
            border: 'none',
            background: PRIMARY,
            color: 'white',
            fontSize: 17,
            fontWeight: 700,
            textDecoration: 'none',
            marginTop: 20,
            boxShadow: '0 4px 12px rgba(45,90,61,0.3)',
          }}
        >
          再挑戰一次！
        </a>
      </div>
    </div>
  );
}
