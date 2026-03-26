'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FOOD_QUIZZES, QUIZ_LEVELS } from '@/lib/quiz-data';

const TOTAL_FOODS = FOOD_QUIZZES.length;
const QUIZ_COUNT = 10;

const LEVELS = QUIZ_LEVELS.map(l => ({ min: l.min, title: l.title, emoji: l.emoji }));

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

// Category colors for display
const CATEGORY_COLORS = {
  '澱粉': { bg: '#FFF3E0', color: '#E65100', emoji: '🍚' },
  '蛋白質': { bg: '#E8F5E9', color: '#2E7D32', emoji: '🥩' },
  '蔬菜': { bg: '#F1F8E9', color: '#33691E', emoji: '🥬' },
  '油脂': { bg: '#FFF8E1', color: '#F57F17', emoji: '🥑' },
  '水果': { bg: '#FCE4EC', color: '#880E4F', emoji: '🍎' },
  '堅果': { bg: '#FFF8E1', color: '#F57F17', emoji: '🥜' },
};

export default function QuizPage() {
  const [userId, setUserId] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | start | game | result
  const [collected, setCollected] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState([]); // { food, chosen, correct, isCorrect, explain }
  const [showFeedback, setShowFeedback] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [duration, setDuration] = useState(0);
  const [saving, setSaving] = useState(false);
  const [resultData, setResultData] = useState(null);
  const feedbackTimer = useRef(null);

  // Parse userId from URL
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
      const res = await fetch(`/api/quiz?userId=${encodeURIComponent(uid)}`);
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
    // Prioritize foods user hasn't answered correctly
    const uncollected = FOOD_QUIZZES.filter(q => !collected.includes(q.food));
    const collectedQuizzes = FOOD_QUIZZES.filter(q => collected.includes(q.food));

    let selected = [];
    // Shuffle uncollected first
    const shuffledUncollected = [...uncollected].sort(() => Math.random() - 0.5);
    const shuffledCollected = [...collectedQuizzes].sort(() => Math.random() - 0.5);

    // Take from uncollected first, then fill with collected
    selected = [...shuffledUncollected, ...shuffledCollected].slice(0, QUIZ_COUNT);
    // Shuffle final selection
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
    if (showFeedback) return; // prevent double tap
    const q = questions[currentQ];
    const isCorrect = chosen === q.correct;
    const newAnswer = { food: q.food, chosen, correct: q.correct, isCorrect, explain: q.explain };
    const newAnswers = [...answers, newAnswer];
    setAnswers(newAnswers);
    setShowFeedback(true);

    // Auto advance after 2 seconds
    feedbackTimer.current = setTimeout(() => {
      advanceQuestion(newAnswers);
    }, 2000);
  }, [showFeedback, questions, currentQ, answers]);

  function advanceQuestion(currentAnswers) {
    if (feedbackTimer.current) {
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = null;
    }
    setShowFeedback(false);
    if (currentQ + 1 >= QUIZ_COUNT) {
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
    const correctFoods = finalAnswers.filter(a => a.isCorrect).map(a => a.food);
    const wrongFoods = finalAnswers.filter(a => !a.isCorrect).map(a => a.food);

    if (userId) {
      setSaving(true);
      try {
        const res = await fetch('/api/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            score,
            total: QUIZ_COUNT,
            correctFoods,
            wrongFoods,
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

  // === STYLES ===
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
            <div style={{ fontSize: 32, marginBottom: 12 }}>🍽️</div>
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
          <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>食物分類大挑戰</div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>看看你能認出幾種食物的真面目！</div>
        </div>

        <div style={{ padding: '24px 20px' }}>
          {/* Collected count card */}
          <div style={{ background: 'white', borderRadius: 16, padding: '20px', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>你已經收集了</div>
            <div style={{ fontSize: 48, fontWeight: 800, color: PRIMARY }}>{collected.length}</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 12 }}>/ {TOTAL_FOODS} 種食物</div>
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
                再收集 {nextLevel.min - collected.length} 種就能升級成{nextLevel.emoji} {nextLevel.title}
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ background: '#e8e4e0', borderRadius: 8, height: 8, marginBottom: 24, overflow: 'hidden' }}>
            <div style={{
              width: `${(collected.length / TOTAL_FOODS) * 100}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${PRIMARY}, #43A047)`,
              borderRadius: 8,
              transition: 'width 0.5s ease',
            }} />
          </div>

          {/* Rules */}
          <div style={{ background: 'white', borderRadius: 12, padding: '16px 20px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#333' }}>遊戲規則</div>
            <div style={{ fontSize: 14, color: '#666', lineHeight: 1.8 }}>
              每次挑戰 <strong>10 題</strong>，每題有兩個選項<br/>
              答對的食物會加入你的收集<br/>
              收集越多，等級越高！<br/>
              優先出你還沒收集的食物
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
              href={`/quiz/history${userId ? `?u=${userId}` : ''}`}
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
              查看我的收集 →
            </a>
          )}
        </div>
      </div>
    );
  }

  // === GAME SCREEN ===
  if (phase === 'game') {
    const q = questions[currentQ];
    const progress = ((currentQ + (showFeedback ? 1 : 0)) / QUIZ_COUNT) * 100;
    const currentAnswer = showFeedback ? answers[answers.length - 1] : null;

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
          <div style={{ fontSize: 14, color: '#888', fontWeight: 600 }}>第 {currentQ + 1} / {QUIZ_COUNT} 題</div>
          <div style={{ fontSize: 14, color: PRIMARY, fontWeight: 600 }}>{score} 對</div>
        </div>

        {/* Question card */}
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{
            background: 'white',
            borderRadius: 20,
            padding: '40px 24px 32px',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            marginBottom: 24,
            border: showFeedback
              ? `3px solid ${currentAnswer?.isCorrect ? CORRECT_GREEN : WRONG_RED}`
              : '3px solid transparent',
            transition: 'border-color 0.3s',
          }}>
            <div style={{ fontSize: 14, color: '#aaa', marginBottom: 8 }}>這個食物是什麼類？</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#2a2520', marginBottom: 8 }}>{q.food}</div>

            {showFeedback && currentAnswer && (
              <div style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 12,
                background: currentAnswer.isCorrect ? '#E8F5E9' : '#FFEBEE',
                fontSize: 14,
                lineHeight: 1.6,
                color: currentAnswer.isCorrect ? '#2E7D32' : '#C62828',
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {currentAnswer.isCorrect ? '答對了！' : `是${currentAnswer.correct}，不是${currentAnswer.chosen}`}
                </div>
                <div style={{ color: '#555' }}>{currentAnswer.explain}</div>
              </div>
            )}
          </div>

          {/* Options */}
          {!showFeedback ? (
            <div style={{ display: 'flex', gap: 12 }}>
              {[q.optA, q.optB].map(opt => {
                const cat = CATEGORY_COLORS[opt] || { bg: '#f0f0f0', color: '#666', emoji: '?' };
                return (
                  <button
                    key={opt}
                    onClick={() => handleAnswer(opt)}
                    style={{
                      flex: 1,
                      padding: '20px 12px',
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
                    <div style={{ fontSize: 28, marginBottom: 6 }}>{cat.emoji}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>{opt}</div>
                  </button>
                );
              })}
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

    const scorePercent = (score / QUIZ_COUNT) * 100;
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
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1 }}>{score}<span style={{ fontSize: 24, opacity: 0.7 }}>/{QUIZ_COUNT}</span></div>
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
              已收集 <strong style={{ color: PRIMARY }}>{totalCollected}</strong> / {TOTAL_FOODS} 種食物
            </div>
            <div style={{ background: '#e8e4e0', borderRadius: 8, height: 8, overflow: 'hidden' }}>
              <div style={{
                width: `${(totalCollected / TOTAL_FOODS) * 100}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${PRIMARY}, #43A047)`,
                borderRadius: 8,
              }} />
            </div>
            {resultNextLevel && (
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 8 }}>
                再收集 {resultNextLevel.min - totalCollected} 種就能升級
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
                🆕 新收集的食物！
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {newCollected.map(food => {
                  const quiz = FOOD_QUIZZES.find(q => q.food === food);
                  const cat = quiz ? CATEGORY_COLORS[quiz.correct] : { bg: '#eee', color: '#666' };
                  return (
                    <span key={food} style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: 12,
                      background: cat.bg,
                      color: cat.color,
                      fontSize: 13,
                      fontWeight: 600,
                    }}>
                      {food}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Answer review */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#333', marginBottom: 10 }}>本次答題</div>

            {correctAnswers.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: CORRECT_GREEN, fontWeight: 600, marginBottom: 6 }}>✓ 答對 ({correctAnswers.length})</div>
                {correctAnswers.map(a => (
                  <div key={a.food} style={{
                    background: '#E8F5E9',
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 4,
                    fontSize: 14,
                  }}>
                    <strong>{a.food}</strong> → {a.correct}
                  </div>
                ))}
              </div>
            )}

            {wrongAnswers.length > 0 && (
              <div>
                <div style={{ fontSize: 13, color: WRONG_RED, fontWeight: 600, marginBottom: 6 }}>✗ 答錯 ({wrongAnswers.length})</div>
                {wrongAnswers.map(a => (
                  <div key={a.food} style={{
                    background: '#FFEBEE',
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 4,
                    fontSize: 14,
                  }}>
                    <strong>{a.food}</strong>：你選 {a.chosen}，正確是 <strong>{a.correct}</strong>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{a.explain}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <button
            onClick={startGame}
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
            href={`/quiz/history${userId ? `?u=${userId}` : ''}`}
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
            查看我的收集
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
