'use client';

import { useState, useEffect } from 'react';

// Same quiz data as the main quiz page
const FOOD_QUIZZES = [
  { food: '南瓜', correct: '澱粉' },
  { food: '玉米', correct: '澱粉' },
  { food: '蓮藕', correct: '澱粉' },
  { food: '山藥', correct: '澱粉' },
  { food: '芋頭', correct: '澱粉' },
  { food: '菱角', correct: '澱粉' },
  { food: '栗子', correct: '澱粉' },
  { food: '紅豆', correct: '澱粉' },
  { food: '綠豆', correct: '澱粉' },
  { food: '冬粉', correct: '澱粉' },
  { food: '米粉', correct: '澱粉' },
  { food: '蘿蔔', correct: '蔬菜' },
  { food: '玉米筍', correct: '蔬菜' },
  { food: '蒟蒻', correct: '蔬菜' },
  { food: '秋葵', correct: '蔬菜' },
  { food: '百頁豆腐', correct: '油脂' },
  { food: '花生', correct: '油脂' },
  { food: '腰果', correct: '油脂' },
  { food: '培根', correct: '油脂' },
  { food: '貢丸', correct: '油脂' },
  { food: '熱狗', correct: '油脂' },
  { food: '毛豆', correct: '蛋白質' },
  { food: '豆皮', correct: '蛋白質' },
  { food: '蛋豆腐', correct: '蛋白質' },
  { food: '豆漿', correct: '蛋白質' },
  { food: '米漿', correct: '澱粉' },
  { food: '酪梨', correct: '油脂' },
  { food: '椰子', correct: '油脂' },
  { food: '奇亞籽', correct: '油脂' },
  { food: '大番茄', correct: '蔬菜' },
  { food: '小番茄', correct: '水果' },
  { food: '千張', correct: '蛋白質' },
  { food: '蘇打餅', correct: '油脂' },
  { food: '鍋貼', correct: '油脂' },
];

const TOTAL_FOODS = FOOD_QUIZZES.length;

const CATEGORY_COLORS = {
  '澱粉': { bg: '#FFF3E0', color: '#E65100', emoji: '🍚' },
  '蛋白質': { bg: '#E8F5E9', color: '#2E7D32', emoji: '🥩' },
  '蔬菜': { bg: '#F1F8E9', color: '#33691E', emoji: '🥬' },
  '油脂': { bg: '#FFF8E1', color: '#F57F17', emoji: '🥑' },
  '水果': { bg: '#FCE4EC', color: '#880E4F', emoji: '🍎' },
};

const LEVELS = [
  { min: 0, title: '食物新手', emoji: '🌱' },
  { min: 6, title: '分類達人', emoji: '⭐' },
  { min: 15, title: '營養高手', emoji: '🏆' },
  { min: 25, title: '食物大師', emoji: '👑' },
];

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

// Group foods by category
const CATEGORIES_ORDER = ['澱粉', '蛋白質', '油脂', '蔬菜', '水果'];
const FOODS_BY_CATEGORY = {};
for (const cat of CATEGORIES_ORDER) {
  FOODS_BY_CATEGORY[cat] = FOOD_QUIZZES.filter(q => q.correct === cat);
}

export default function HistoryPage() {
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
      const res = await fetch(`/api/quiz?userId=${encodeURIComponent(uid)}`);
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
  const PRIMARY_LIGHT = '#E8F5EC';
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
          已收集 {collected.length} / {TOTAL_FOODS} 種食物
        </div>
        {nextLevel && (
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            再收集 {nextLevel.min - collected.length} 種就能升級成 {nextLevel.emoji} {nextLevel.title}
          </div>
        )}
        {/* Progress bar */}
        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, height: 8, marginTop: 12, overflow: 'hidden' }}>
          <div style={{
            width: `${(collected.length / TOTAL_FOODS) * 100}%`,
            height: '100%',
            background: 'rgba(255,255,255,0.8)',
            borderRadius: 8,
          }} />
        </div>
      </div>

      <div style={{ padding: '20px' }}>
        {/* Food collection grid by category */}
        {CATEGORIES_ORDER.map(cat => {
          const catFoods = FOODS_BY_CATEGORY[cat];
          const catColor = CATEGORY_COLORS[cat];
          const catCollectedCount = catFoods.filter(f => collectedSet.has(f.food)).length;

          return (
            <div key={cat} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#333' }}>
                  {catColor.emoji} {cat}
                </div>
                <div style={{ fontSize: 12, color: '#aaa' }}>
                  {catCollectedCount}/{catFoods.length}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {catFoods.map(q => {
                  const isCollected = collectedSet.has(q.food);
                  return (
                    <div
                      key={q.food}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 600,
                        background: isCollected ? catColor.bg : '#eee',
                        color: isCollected ? catColor.color : '#ccc',
                        border: isCollected ? `1px solid ${catColor.color}33` : '1px solid #ddd',
                      }}
                    >
                      {q.food}
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
                    <div style={{ fontSize: 12, color: '#aaa' }}>{dateStr}</div>
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
          href={`/quiz${userId ? `?u=${userId}` : ''}`}
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
