'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { KNOWLEDGE_QUIZZES, KNOWLEDGE_CATEGORIES, KNOWLEDGE_LEVELS } from '@/lib/knowledge-quiz-data';

const TOTAL_QUESTIONS = KNOWLEDGE_QUIZZES.length;
const QUIZ_COUNT = 10;

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

const TIER_OPTIONS = [
  { value: 'all', label: '全部混合', emoji: '🎲', desc: '隨機混合所有難度' },
  { value: 1, label: '基礎篇', emoji: '🌱', desc: '先打好基礎觀念' },
  { value: 2, label: '進階篇', emoji: '⚡', desc: '挑戰更深的知識' },
  { value: 3, label: '高手篇', emoji: '🔥', desc: '你是真正的瘦身達人嗎？' },
];

const CATEGORY_COLORS = {
  myth: { bg: '#FFF3E0', color: '#E65100', emoji: '💡' },
  abc: { bg: '#FFEBEE', color: '#C62828', emoji: '🔥' },
  nutrition: { bg: '#E8F5E9', color: '#2E7D32', emoji: '🥗' },
  mindset: { bg: '#E3F2FD', color: '#1565C0', emoji: '🧠' },
  behavior: { bg: '#F3E5F5', color: '#6A1B9A', emoji: '🎯' },
  food_science: { bg: '#FFF8E1', color: '#F57F17', emoji: '🔬' },
};

export default function KnowledgeQuizPage() {
  const [userId, setUserId] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | start | game | result
  const [collected, setCollected] = useState([]);
  const [selectedTier, setSelectedTier] = useState('all');
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [duration, setDuration] = useState(0);
  const [saving, setSaving] = useState(false);
  const [resultData, setResultData] = useState(null);
  const feedbackTimer = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const u = params.get('u');
    if (u) {
      setUserId(u);
      fetchUserData(u);
    } else {
      setPhase('start');
    }
  }, []);

  async function fetchUserData(uid) {
    try {
      const res = await fetch(`/api/knowledge?userId=${encodeURIComponent(uid)}`);
      if (res.ok) {
        const data = await res.json();
        setCollected(data.collected || []);
      }
    } catch (e) {
      console.error('Failed to fetch user data:', e);
    }
    setPhase('start');
  }

  function pickQuestions() {
    let pool = KNOWLEDGE_QUIZZES.map((q, i) => ({ ...q, _index: i }));

    // Filter by tier if not "all"
    if (selectedTier !== 'all') {
      pool = pool.filter(q => q.tier === selectedTier);
    }

    // Prioritize uncollected questions
    const collectedSet = new Set(collected);
    const uncollected = pool.filter(q => !collectedSet.has(q._index));
    const alreadyCollected = pool.filter(q => collectedSet.has(q._index));

    const shuffledUncollected = [...uncollected].sort(() => Math.random() - 0.5);
    const shuffledCollected = [...alreadyCollected].sort(() => Math.random() - 0.5);

    const count = Math.min(QUIZ_COUNT, pool.length);
    const selected = [...shuffledUncollected, ...shuffledCollected].slice(0, count);
    return selected.sort(() => Math.random() - 0.5);
  }

  function startGame() {
    const qs = pickQuestions();
    setQuestions(qs);
    setCurrentQ(0);
    setAnswers([]);
    setShowFeedback(false);
    setStartTime(Date.now());
    setResultData(null);
    setPhase('game');
  }

  const handleAnswer = useCallback((chosen) => {
    if (showFeedback) return;
    const q = questions[currentQ];
    const isCorrect = chosen === q.answer;
    const newAnswer = {
      index: q._index,
      statement: q.statement,
      chosen,
      correct: q.answer,
      isCorrect,
      explain: q.explain,
      category: q.category,
    };
    const newAnswers = [...answers, newAnswer];
    setAnswers(newAnswers);
    setShowFeedback(true);

    feedbackTimer.current = setTimeout(() => {
      advanceQuestion(newAnswers);
    }, 2500);
  }, [showFeedback, questions, currentQ, answers]);

  function advanceQuestion(currentAnswers) {
    if (feedbackTimer.current) {
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = null;
    }
    setShowFeedback(false);
    if (currentQ + 1 >= questions.length) {
      finishGame(currentAnswers);
    } else {
      setCurrentQ(prev => prev + 1);
    }
  }

  function handleTapToContinue() {
    if (!showFeedback) return;
    advanceQuestion(answers);
  }

  async function finishGame(finalAnswers) {
    const dur = Math.round((Date.now() - startTime) / 1000);
    setDuration(dur);
    setPhase('result');

    const score = finalAnswers.filter(a => a.isCorrect).length;
    const correctIndices = finalAnswers.filter(a => a.isCorrect).map(a => a.index);
    const wrongIndices = finalAnswers.filter(a => !a.isCorrect).map(a => a.index);

    if (userId) {
      setSaving(true);
      try {
        const tierParam = selectedTier === 'all' ? 0 : selectedTier;
        const res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            score,
            total: questions.length,
            tier: tierParam,
            correctIndices,
            wrongIndices,
            durationSeconds: dur,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setResultData(data);
          setCollected(prev => {
            const newSet = new Set([...prev, ...(data.newCollected || [])]);
            return [...newSet];
          });
        }
      } catch (e) {
        console.error('Failed to save:', e);
      }
      setSaving(false);
    }
  }

  const score = answers.filter(a => a.isCorrect).length;
  const level = getLevel(collected.length);
  const nextLevel = getNextLevel(collected.length);

  const containerStyle = {
    maxWidth: 440,
    margin: '0 auto',
    minHeight: '100vh',
    background: '#faf9f7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const PRIMARY = '#2D5A3D';
  const PRIMARY_LIGHT = '#E8F5EC';
  const CORRECT_GREEN = '#43A047';
  const WRONG_RED = '#E53935';

  // === LOADING ===
  if (phase === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ textAlign: 'center', color: '#999' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
            <div style={{ fontSize: 15 }}>載入中...</div>
          </div>
        </div>
      </div>
    );
  }

  // === START SCREEN ===
  if (phase === 'start') {
    return (
      <div style={containerStyle}>
        <div style={{ background: `linear-gradient(135deg, ${PRIMARY}, #3D7A52)`, padding: '40px 24px 32px', textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🧠</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>瘦身知識大挑戰</div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>測試你的瘦身觀念，打破迷思！</div>
        </div>

        <div style={{ padding: '24px 20px' }}>
          {/* Collected count card */}
          <div style={{ background: 'white', borderRadius: 16, padding: '20px', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>你已經掌握了</div>
            <div style={{ fontSize: 48, fontWeight: 800, color: PRIMARY }}>{collected.length}</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 12 }}>/ {TOTAL_QUESTIONS} 個知識點</div>
            <div style={{
              display: 'inline-block',
              padding: '6px 16px',
              borderRadius: 20,
              background: PRIMARY_LIGHT,
              color: PRIMARY,
              fontSize: 14,
              fontWeight: 600,
            }}>
              {level.emoji} {level.title}
            </div>
            {nextLevel && (
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 8 }}>
                再掌握 {nextLevel.min - collected.length} 個就能升級成{nextLevel.emoji} {nextLevel.title}
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ background: '#e8e4e0', borderRadius: 8, height: 8, marginBottom: 24, overflow: 'hidden' }}>
            <div style={{
              width: `${(collected.length / TOTAL_QUESTIONS) * 100}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${PRIMARY}, #43A047)`,
              borderRadius: 8,
              transition: 'width 0.5s ease',
            }} />
          </div>

          {/* Tier selector */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#333', marginBottom: 12 }}>選擇難度</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {TIER_OPTIONS.map(opt => {
                const isSelected = selectedTier === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedTier(opt.value)}
                    style={{
                      padding: '14px 12px',
                      borderRadius: 14,
                      border: isSelected ? `2px solid ${PRIMARY}` : '2px solid #e8e4e0',
                      background: isSelected ? PRIMARY_LIGHT : 'white',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{opt.emoji}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: isSelected ? PRIMARY : '#333' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rules */}
          <div style={{ background: 'white', borderRadius: 12, padding: '16px 20px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#333' }}>遊戲規則</div>
            <div style={{ fontSize: 14, color: '#666', lineHeight: 1.8 }}>
              每次挑戰 <strong>10 題</strong>是非題<br/>
              判斷敘述是 <strong>⭕ 正確</strong> 或 <strong>❌ 錯誤</strong><br/>
              答對的知識會加入你的收集<br/>
              收集越多，等級越高！
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={startGame}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 14,
              border: 'none',
              background: PRIMARY,
              color: 'white',
              fontSize: 18,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(45,90,61,0.3)',
            }}
          >
            開始挑戰！
          </button>

          {collected.length > 0 && (
            <a
              href={`/knowledge/history${userId ? `?u=${userId}` : ''}`}
              style={{
                display: 'block',
                textAlign: 'center',
                marginTop: 16,
                color: PRIMARY,
                fontSize: 14,
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              查看我的知識收集 →
            </a>
          )}
        </div>
      </div>
    );
  }

  // === GAME SCREEN ===
  if (phase === 'game') {
    const q = questions[currentQ];
    const progress = ((currentQ + (showFeedback ? 1 : 0)) / questions.length) * 100;
    const currentAnswer = showFeedback ? answers[answers.length - 1] : null;
    const catColor = CATEGORY_COLORS[q.category] || { bg: '#f0f0f0', color: '#666', emoji: '?' };
    const catInfo = KNOWLEDGE_CATEGORIES.find(c => c.id === q.category);

    return (
      <div style={containerStyle} onClick={showFeedback ? handleTapToContinue : undefined}>
        {/* Progress bar */}
        <div style={{ background: '#e8e4e0', height: 4 }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: PRIMARY,
            transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px' }}>
          <div style={{ fontSize: 14, color: '#888', fontWeight: 600 }}>第 {currentQ + 1} / {questions.length} 題</div>
          <div style={{ fontSize: 14, color: PRIMARY, fontWeight: 600 }}>{score} 對</div>
        </div>

        {/* Category badge */}
        <div style={{ padding: '0 20px', marginBottom: 8 }}>
          <span style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: 12,
            background: catColor.bg,
            color: catColor.color,
            fontSize: 12,
            fontWeight: 600,
          }}>
            {catColor.emoji} {catInfo?.name || q.category}
          </span>
        </div>

        {/* Question card */}
        <div style={{ padding: '0 20px' }}>
          <div style={{
            background: 'white',
            borderRadius: 20,
            padding: '32px 24px 28px',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            marginBottom: 24,
            border: showFeedback
              ? `3px solid ${currentAnswer?.isCorrect ? CORRECT_GREEN : WRONG_RED}`
              : '3px solid transparent',
            transition: 'border-color 0.3s',
          }}>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: 12 }}>這個說法對嗎？</div>
            <div style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#2a2520',
              lineHeight: 1.5,
              marginBottom: 8,
            }}>
              「{q.statement}」
            </div>

            {showFeedback && currentAnswer && (
              <div style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 12,
                background: currentAnswer.isCorrect ? '#E8F5E9' : '#FFEBEE',
                fontSize: 14,
                lineHeight: 1.6,
                color: currentAnswer.isCorrect ? '#2E7D32' : '#C62828',
                textAlign: 'left',
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {currentAnswer.isCorrect ? '答對了！' : `答案是${currentAnswer.correct ? '⭕ 正確' : '❌ 錯誤'}`}
                </div>
                <div style={{ color: '#555' }}>{currentAnswer.explain}</div>
              </div>
            )}
          </div>

          {/* O/X Buttons */}
          {!showFeedback ? (
            <div style={{ display: 'flex', gap: 16 }}>
              <button
                onClick={() => handleAnswer(true)}
                style={{
                  flex: 1,
                  padding: '22px 12px',
                  borderRadius: 16,
                  border: '2px solid #e8e4e0',
                  background: 'white',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'transform 0.1s',
                }}
                onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <div style={{ fontSize: 36, marginBottom: 4 }}>⭕</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: CORRECT_GREEN }}>正確</div>
              </button>
              <button
                onClick={() => handleAnswer(false)}
                style={{
                  flex: 1,
                  padding: '22px 12px',
                  borderRadius: 16,
                  border: '2px solid #e8e4e0',
                  background: 'white',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'transform 0.1s',
                }}
                onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <div style={{ fontSize: 36, marginBottom: 4 }}>❌</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: WRONG_RED }}>錯誤</div>
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 13, color: '#bbb' }}>點一下繼續</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // === RESULT SCREEN ===
  if (phase === 'result') {
    const correctAnswers = answers.filter(a => a.isCorrect);
    const wrongAnswers = answers.filter(a => !a.isCorrect);
    const newCollected = resultData?.newCollected || [];
    const totalCollected = resultData?.totalCollected ?? collected.length;
    const resultLevel = getLevel(totalCollected);
    const resultNextLevel = getNextLevel(totalCollected);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    const scorePercent = (score / questions.length) * 100;
    let scoreEmoji = '💪';
    let scoreText = '繼續加油！';
    if (scorePercent === 100) { scoreEmoji = '🏆'; scoreText = '全對！太強了！'; }
    else if (scorePercent >= 80) { scoreEmoji = '🎉'; scoreText = '太厲害了！'; }
    else if (scorePercent >= 60) { scoreEmoji = '👍'; scoreText = '不錯喔！'; }
    else if (scorePercent >= 40) { scoreEmoji = '😊'; scoreText = '又多學了幾個！'; }

    return (
      <div style={containerStyle}>
        {/* Score header */}
        <div style={{
          background: `linear-gradient(135deg, ${PRIMARY}, #3D7A52)`,
          padding: '32px 24px',
          textAlign: 'center',
          color: 'white',
        }}>
          <div style={{ fontSize: 48 }}>{scoreEmoji}</div>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1 }}>{score}<span style={{ fontSize: 24, opacity: 0.7 }}>/{questions.length}</span></div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>{scoreText}</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>
            用時 {minutes > 0 ? `${minutes}分` : ''}{seconds}秒
          </div>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Comparison */}
          {resultData?.comparison && (
            <div style={{
              background: 'white',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 16,
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              fontSize: 14,
              color: '#555',
              textAlign: 'center',
            }}>
              {resultData.comparison}
            </div>
          )}

          {/* Collection progress */}
          <div style={{
            background: 'white',
            borderRadius: 16,
            padding: '16px 20px',
            marginBottom: 16,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            textAlign: 'center',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{resultLevel.emoji}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: PRIMARY }}>{resultLevel.title}</span>
            </div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>
              已掌握 <strong style={{ color: PRIMARY }}>{totalCollected}</strong> / {TOTAL_QUESTIONS} 個知識點
            </div>
            <div style={{ background: '#e8e4e0', borderRadius: 8, height: 8, overflow: 'hidden' }}>
              <div style={{
                width: `${(totalCollected / TOTAL_QUESTIONS) * 100}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${PRIMARY}, #43A047)`,
                borderRadius: 8,
              }} />
            </div>
            {resultNextLevel && (
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 8 }}>
                再掌握 {resultNextLevel.min - totalCollected} 個就能升級
              </div>
            )}
          </div>

          {/* New collected */}
          {newCollected.length > 0 && (
            <div style={{
              background: PRIMARY_LIGHT,
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 16,
              border: `1px solid ${PRIMARY}33`,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: PRIMARY, marginBottom: 8 }}>
                🆕 新掌握的知識！
              </div>
              {newCollected.map(idx => {
                const q = KNOWLEDGE_QUIZZES[idx];
                if (!q) return null;
                const catC = CATEGORY_COLORS[q.category] || { bg: '#eee', color: '#666' };
                return (
                  <div key={idx} style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: catC.bg,
                    color: catC.color,
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 4,
                    lineHeight: 1.4,
                  }}>
                    {q.answer ? '⭕' : '❌'} {q.statement}
                  </div>
                );
              })}
            </div>
          )}

          {/* Answer review */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#333', marginBottom: 10 }}>本次答題</div>

            {correctAnswers.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: CORRECT_GREEN, fontWeight: 600, marginBottom: 6 }}>✓ 答對 ({correctAnswers.length})</div>
                {correctAnswers.map(a => (
                  <div key={a.index} style={{
                    background: '#E8F5E9',
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 4,
                    fontSize: 14,
                    lineHeight: 1.4,
                  }}>
                    {a.correct ? '⭕' : '❌'} {a.statement}
                  </div>
                ))}
              </div>
            )}

            {wrongAnswers.length > 0 && (
              <div>
                <div style={{ fontSize: 13, color: WRONG_RED, fontWeight: 600, marginBottom: 6 }}>✗ 答錯 ({wrongAnswers.length})</div>
                {wrongAnswers.map(a => (
                  <div key={a.index} style={{
                    background: '#FFEBEE',
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 4,
                    fontSize: 14,
                    lineHeight: 1.4,
                  }}>
                    <div>{a.correct ? '⭕' : '❌'} {a.statement}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{a.explain}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <button
            onClick={() => { setPhase('start'); }}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 14,
              border: 'none',
              background: PRIMARY,
              color: 'white',
              fontSize: 17,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 12,
              boxShadow: '0 4px 12px rgba(45,90,61,0.3)',
            }}
          >
            再玩一次！
          </button>

          <a
            href={`/knowledge/history${userId ? `?u=${userId}` : ''}`}
            style={{
              display: 'block',
              textAlign: 'center',
              padding: '14px',
              borderRadius: 14,
              border: `2px solid ${PRIMARY}`,
              color: PRIMARY,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            查看我的知識收集
          </a>

          {saving && (
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: '#aaa' }}>
              儲存中...
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
