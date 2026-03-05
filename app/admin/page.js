'use client';

import { useState, useEffect, useCallback } from 'react';

export default function AdminPage() {
  // 密碼閘門
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [pwError, setPwError] = useState('');

  // 管理功能
  const [adminKey, setAdminKey] = useState('');
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [studentCount, setStudentCount] = useState(0);
  const [importStatus, setImportStatus] = useState(null);
  const [statusResult, setStatusResult] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState('');

  // 群組問題監控
  const [pendingItems, setPendingItems] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState('');
  const [copiedId, setCopiedId] = useState('');

  // 密碼驗證
  async function handleUnlock(e) {
    e.preventDefault();
    if (!password.trim()) { setPwError('請輸入管理密鑰'); return; }
    setPwError('');
    try {
      const res = await fetch('/api/admin/import', {
        headers: { 'x-admin-key': password.trim() },
      });
      if (res.status === 401) {
        setPwError('密鑰錯誤，請重新輸入');
        return;
      }
      setAdminKey(password.trim());
      setUnlocked(true);
    } catch (err) {
      setPwError('連線失敗：' + err.message);
    }
  }

  // === 群組問題監控功能 ===

  const loadPending = useCallback(async () => {
    if (!adminKey) return;
    setPendingLoading(true);
    setPendingError('');
    try {
      const res = await fetch('/api/admin/pending', {
        headers: { 'x-admin-key': adminKey },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setPendingItems(data.items || []);
      } else {
        setPendingError(data.error || '載入失敗');
      }
    } catch (err) {
      setPendingError('連線失敗：' + err.message);
    }
    setPendingLoading(false);
  }, [adminKey]);

  // 解鎖後自動載入待回應
  useEffect(() => {
    if (unlocked && adminKey) {
      loadPending();
    }
  }, [unlocked, adminKey, loadPending]);

  async function dismissPending(id) {
    try {
      const res = await fetch('/api/admin/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ action: 'dismiss', id }),
      });
      if (res.ok) {
        setPendingItems(prev => prev.filter(item => item.id !== id));
      }
    } catch (err) {
      console.error('Dismiss error:', err);
    }
  }

  async function clearAllPending() {
    if (!confirm('確定要清空所有待回應項目？')) return;
    try {
      const res = await fetch('/api/admin/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ action: 'clear' }),
      });
      if (res.ok) {
        setPendingItems([]);
      }
    } catch (err) {
      console.error('Clear error:', err);
    }
  }

  async function copyDraft(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 2000);
    }
  }

  // === 匯入功能 ===

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!data.students || !Array.isArray(data.students)) {
          setImportStatus({ type: 'error', msg: '檔案格式錯誤：缺少 students 陣列' });
          return;
        }
        setFileData(data);
        setFileName(file.name);
        setStudentCount(data.students.length);
        setImportStatus(null);
      } catch (err) {
        setImportStatus({ type: 'error', msg: '無法解析 JSON：' + err.message });
      }
    };
    reader.readAsText(file);
  }

  async function doImport() {
    if (!fileData) { setImportStatus({ type: 'error', msg: '請先選擇 JSON 檔案' }); return; }
    setLoading('import');
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify(fileData),
      });
      const result = await res.json();
      if (res.ok && result.ok) {
        setImportStatus({ type: 'success', msg: result.message });
      } else {
        setImportStatus({ type: 'error', msg: result.error || '未知錯誤' });
      }
    } catch (err) {
      setImportStatus({ type: 'error', msg: '連線失敗：' + err.message });
    }
    setLoading('');
  }

  async function checkStatus() {
    setLoading('status');
    try {
      const res = await fetch('/api/admin/import', {
        headers: { 'x-admin-key': adminKey },
      });
      const result = await res.json();
      if (res.ok && result.ok) {
        setStatusResult({ type: 'info', total: result.total, matched: result.matched, unmatched: result.unmatched });
        setStudents(result.students || []);
      } else if (res.status === 401) {
        setStatusResult({ type: 'error', msg: '密鑰錯誤' });
      } else {
        setStatusResult({ type: 'error', msg: result.error || '未知錯誤' });
      }
    } catch (err) {
      setStatusResult({ type: 'error', msg: '連線失敗：' + err.message });
    }
    setLoading('');
  }

  const colors = {
    success: { bg: '#E8F5E9', border: '#A5D6A7', text: '#2E7D32' },
    error: { bg: '#FFEBEE', border: '#EF9A9A', text: '#C62828' },
    info: { bg: '#E3F2FD', border: '#90CAF9', text: '#1565C0' },
  };

  const topicMap = { mindset: '心態', diet: '飲食', plateau: '體重停滯', emotion: '情緒', other: '其他' };
  const topicColors = {
    mindset: { bg: '#E8F5E9', text: '#2E7D32' },
    diet: { bg: '#FFF3E0', text: '#E65100' },
    plateau: { bg: '#E3F2FD', text: '#1565C0' },
    emotion: { bg: '#FCE4EC', text: '#C62828' },
    other: { bg: '#F5F5F5', text: '#616161' },
  };

  function timeAgo(isoStr) {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '剛剛';
    if (mins < 60) return `${mins} 分鐘前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} 小時前`;
    return `${Math.floor(hrs / 24)} 天前`;
  }

  // ===== 密碼閘門畫面 =====
  if (!unlocked) {
    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f5f5f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: 40, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>休校長小幫手</h1>
          <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>管理後台需要密鑰才能進入</p>
          <form onSubmit={handleUnlock}>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPwError(''); }}
              placeholder="請輸入管理密鑰"
              autoFocus
              style={{ width: '100%', padding: '12px 16px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, marginBottom: 12, boxSizing: 'border-box' }}
            />
            {pwError && (
              <div style={{ color: '#C62828', fontSize: 13, marginBottom: 12 }}>{pwError}</div>
            )}
            <button
              type="submit"
              style={{ width: '100%', padding: '12px', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', background: '#4CAF50', color: 'white' }}
            >
              進入後台
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ===== 管理後台主畫面 =====
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f5f5f5', minHeight: '100vh', padding: '20px' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', marginBottom: 8, fontSize: 24 }}>休校長小幫手 管理後台</h1>
        <p style={{ textAlign: 'center', color: '#888', marginBottom: 30, fontSize: 14 }}>群組問題監控 & 學員資料管理</p>

        {/* ===== 群組問題監控 ===== */}
        <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, paddingBottom: 8, borderBottom: '2px solid #E53935', display: 'inline-block', margin: 0 }}>群組問題監控</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={loadPending}
                disabled={pendingLoading}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#E53935', color: 'white' }}
              >
                {pendingLoading ? '載入中...' : '重新載入'}
              </button>
              {pendingItems.length > 0 && (
                <button
                  onClick={clearAllPending}
                  style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#666' }}
                >
                  清空全部
                </button>
              )}
            </div>
          </div>

          <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
            Bot 在群組偵測到的學員問題，已自動產生草稿回覆。複製後到 LINE 群組 tag 學員回應。
          </p>

          {pendingError && (
            <div style={{ padding: 14, borderRadius: 8, fontSize: 14, background: colors.error.bg, color: colors.error.text, border: '1px solid ' + colors.error.border, marginBottom: 12 }}>
              {pendingError}
            </div>
          )}

          {pendingItems.length === 0 && !pendingLoading && !pendingError && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#aaa', fontSize: 14 }}>
              目前沒有待回應的問題
            </div>
          )}

          {pendingItems.map((item) => (
            <div key={item.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 16, marginBottom: 12, background: '#FAFAFA' }}>
              {/* 標題列 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{item.studentName}</span>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                    background: (topicColors[item.topic] || topicColors.other).bg,
                    color: (topicColors[item.topic] || topicColors.other).text,
                  }}>
                    {topicMap[item.topic] || '其他'}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: '#aaa' }}>{timeAgo(item.createdAt)}</span>
              </div>

              {/* 學員原始訊息 */}
              <div style={{ background: '#FFF8E1', padding: '10px 14px', borderRadius: 8, fontSize: 14, marginBottom: 10, lineHeight: 1.6, borderLeft: '3px solid #FFB300' }}>
                {item.message}
              </div>

              {/* AI 草稿 */}
              <div style={{ background: '#E8F5E9', padding: '10px 14px', borderRadius: 8, fontSize: 14, marginBottom: 12, lineHeight: 1.6, borderLeft: '3px solid #66BB6A', whiteSpace: 'pre-wrap' }}>
                {item.draft}
              </div>

              {/* 操作按鈕 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => copyDraft(item.draft, item.id)}
                  style={{
                    flex: 1, padding: '10px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    background: copiedId === item.id ? '#66BB6A' : '#4CAF50', color: 'white',
                    transition: 'background 0.2s',
                  }}
                >
                  {copiedId === item.id ? '已複製！' : '複製草稿'}
                </button>
                <button
                  onClick={() => dismissPending(item.id)}
                  style={{ padding: '10px 20px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, cursor: 'pointer', background: 'white', color: '#888' }}
                >
                  標記完成
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ===== 匯入學員資料 ===== */}
        <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #4CAF50', display: 'inline-block' }}>匯入學員資料</h2>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>選擇 JSON 檔案，一鍵匯入學員自介資料</p>
          <input type="file" accept=".json" onChange={handleFile} style={{ marginBottom: 8 }} />
          {fileName && (
            <div style={{ background: '#F5F5F5', padding: '10px 14px', borderRadius: 8, marginTop: 8, fontSize: 13, color: '#666' }}>
              {fileName} — 共 {studentCount} 筆學員資料
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={doImport}
              disabled={!fileData || loading === 'import'}
              style={{ padding: '12px 28px', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: fileData ? 'pointer' : 'not-allowed', background: fileData ? '#4CAF50' : '#ccc', color: 'white' }}
            >
              {loading === 'import' ? '匯入中...' : '匯入資料'}
            </button>
          </div>
          {importStatus && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 8, fontSize: 14, background: colors[importStatus.type].bg, color: colors[importStatus.type].text, border: '1px solid ' + colors[importStatus.type].border }}>
              {importStatus.msg}
            </div>
          )}
        </div>

        {/* ===== 比對狀態 ===== */}
        <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #2196F3', display: 'inline-block' }}>比對狀態</h2>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>查看已匯入的學員，以及是否已跟 LINE userId 成功配對</p>
          <button
            onClick={checkStatus}
            disabled={loading === 'status'}
            style={{ padding: '12px 28px', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', background: '#2196F3', color: 'white' }}
          >
            {loading === 'status' ? '查詢中...' : '查詢狀態'}
          </button>

          {statusResult && statusResult.type === 'error' && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 8, fontSize: 14, background: colors.error.bg, color: colors.error.text, border: '1px solid ' + colors.error.border }}>
              {statusResult.msg}
            </div>
          )}

          {statusResult && statusResult.type === 'info' && (
            <>
              <div style={{ display: 'flex', gap: 20, textAlign: 'center', marginTop: 16 }}>
                <div style={{ flex: 1, padding: 12, background: '#F5F5F5', borderRadius: 8 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#4CAF50' }}>{statusResult.total}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>總匯入數</div>
                </div>
                <div style={{ flex: 1, padding: 12, background: '#F5F5F5', borderRadius: 8 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#2196F3' }}>{statusResult.matched}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>已配對</div>
                </div>
                <div style={{ flex: 1, padding: 12, background: '#F5F5F5', borderRadius: 8 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#FF9800' }}>{statusResult.unmatched}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>等待配對</div>
                </div>
              </div>
              {students.length > 0 && (
                <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
                  {students.map((s, i) => (
                    <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{s.lineName || s.name || '?'}{s.className ? ` (${s.className})` : ''}</span>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                        background: s.matched ? '#C8E6C9' : '#FFF9C4',
                        color: s.matched ? '#2E7D32' : '#F57F17'
                      }}>
                        {s.matched ? '已配對' : '等待中'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
