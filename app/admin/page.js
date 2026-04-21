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

  // 手動草稿生成
  const [manualMessage, setManualMessage] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualDraft, setManualDraft] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState('');

  // 主動關心
  const [outreachUsers, setOutreachUsers] = useState([]);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachSelected, setOutreachSelected] = useState(new Set());
  const [outreachMessage, setOutreachMessage] = useState('{name}，我最近常被同學問到一個問題：「外食的時候到底怎麼選比較好？」其實沒有想像中那麼難，掌握幾個小訣竅就能搭配得不錯。\n\n不知道{name}有沒有剛好也遇到類似的問題？如果有的話，我整理了幾個重點可以跟你分享，你想聽聽看嗎？😊');
  const [outreachSending, setOutreachSending] = useState(false);
  const [outreachResult, setOutreachResult] = useState(null);

  // 學員紀錄（Supabase）
  const [historyUsers, setHistoryUsers] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserInfo, setSelectedUserInfo] = useState(null);
  const [userConversations, setUserConversations] = useState([]);
  const [userTags, setUserTags] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showAllMessages, setShowAllMessages] = useState(false);

  // 自動從 localStorage 恢復登入（直接信任，不重新驗證）
  useEffect(() => {
    const saved = localStorage.getItem('coach-admin-key');
    if (saved) {
      setAdminKey(saved);
      setUnlocked(true);
    }
  }, []);

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
      localStorage.setItem('coach-admin-key', password.trim());
    } catch (err) {
      setPwError('連線失敗：' + err.message);
    }
  }

  // 統一 401 處理：清 localStorage + 踢回登入
  const handleSessionExpired = useCallback(() => {
    localStorage.removeItem('coach-admin-key');
    setAdminKey('');
    setUnlocked(false);
    setPwError('密鑰已失效，請重新登入');
  }, []);

  // === 群組問題監控功能 ===

  const loadPending = useCallback(async () => {
    if (!adminKey) return;
    setPendingLoading(true);
    setPendingError('');
    try {
      const res = await fetch('/api/admin/pending', {
        headers: { 'x-admin-key': adminKey },
      });
      if (res.status === 401) { handleSessionExpired(); return; }
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
  }, [adminKey, handleSessionExpired]);

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

  // === 主動關心功能 ===

  async function loadOutreachUsers() {
    setOutreachLoading(true);
    try {
      const res = await fetch('/api/admin/history', { headers: { 'x-admin-key': adminKey } });
      if (res.status === 401) { handleSessionExpired(); return; }
      const data = await res.json();
      if (res.ok && data.ok) {
        setOutreachUsers(data.users || []);
        setOutreachSelected(new Set());
        setOutreachResult(null);
      }
    } catch (err) {
      console.error('Load outreach users error:', err);
    }
    setOutreachLoading(false);
  }

  function toggleOutreach(userId) {
    setOutreachSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleAllOutreach() {
    if (outreachSelected.size === outreachUsers.length) {
      setOutreachSelected(new Set());
    } else {
      setOutreachSelected(new Set(outreachUsers.map(u => u.id)));
    }
  }

  async function sendOutreach() {
    if (outreachSelected.size === 0) return;
    // 預覽第一位學員的訊息
    const firstUser = outreachUsers.find(u => outreachSelected.has(u.id));
    const previewMsg = outreachMessage.replace(/\{name\}/g, firstUser?.display_name || '同學');
    if (!confirm(`確定要發送給 ${outreachSelected.size} 位學員？\n\n預覽（${firstUser?.display_name || '?'}）：\n${previewMsg}`)) return;
    setOutreachSending(true);
    setOutreachResult(null);
    try {
      // 組合 users 陣列（含 id + name）
      const selectedUsers = outreachUsers
        .filter(u => outreachSelected.has(u.id))
        .map(u => ({ id: u.id, name: u.display_name || null }));
      const res = await fetch('/api/admin/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ users: selectedUsers, message: outreachMessage }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setOutreachResult({ type: 'success', sent: data.sent, failed: data.failed });
        setOutreachSelected(new Set());
      } else {
        setOutreachResult({ type: 'error', msg: data.error || '發送失敗' });
      }
    } catch (err) {
      setOutreachResult({ type: 'error', msg: '連線失敗：' + err.message });
    }
    setOutreachSending(false);
  }

  // === 學員紀錄功能（Supabase） ===

  async function loadHistoryUsers() {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/admin/history', { headers: { 'x-admin-key': adminKey } });
      if (res.status === 401) { handleSessionExpired(); return; }
      const data = await res.json();
      if (res.ok && data.ok) setHistoryUsers(data.users || []);
    } catch (err) {
      console.error('Load history error:', err);
    }
    setHistoryLoading(false);
  }

  async function loadUserDetail(userId) {
    setDetailLoading(true);
    setSelectedUser(userId);
    setSelectedUserInfo(historyUsers.find(u => u.id === userId) || null);
    setUserConversations([]);
    setUserTags([]);
    setShowAllMessages(false);
    try {
      const res = await fetch(`/api/admin/history?user=${userId}`, { headers: { 'x-admin-key': adminKey } });
      if (res.status === 401) { handleSessionExpired(); return; }
      const data = await res.json();
      if (res.ok && data.ok) {
        setUserConversations(data.conversations || []);
        setUserTags(data.tags || []);
        if (data.user) setSelectedUserInfo(data.user);
      }
    } catch (err) {
      console.error('Load detail error:', err);
    }
    setDetailLoading(false);
  }

  const filteredHistoryUsers = historySearch
    ? historyUsers.filter(u =>
        (u.display_name || '').toLowerCase().includes(historySearch.toLowerCase()) ||
        (u.goal || '').toLowerCase().includes(historySearch.toLowerCase())
      )
    : historyUsers;

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

  // === 手動草稿生成 ===

  async function generateManualDraft() {
    if (!manualMessage.trim()) { setManualError('請輸入學員的訊息'); return; }
    setManualLoading(true);
    setManualError('');
    setManualDraft('');
    try {
      const res = await fetch('/api/admin/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ message: manualMessage.trim(), studentName: manualName.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setManualDraft(data.draft);
      } else {
        setManualError(data.error || '產生失敗');
      }
    } catch (err) {
      setManualError('連線失敗：' + err.message);
    }
    setManualLoading(false);
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
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 8 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>休校長小幫手 管理後台</h1>
          <a href="/admin/students" style={{ padding: '6px 14px', border: '2px solid #7B1FA2', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#7B1FA2', textDecoration: 'none', background: 'white' }}>
            👥 學員管理
          </a>
        </div>
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
              {/* 群組名稱 */}
              {item.groupName && (
                <div style={{ fontSize: 12, color: '#1565C0', fontWeight: 600, marginBottom: 6, background: '#E3F2FD', display: 'inline-block', padding: '2px 10px', borderRadius: 10 }}>
                  {item.groupName}
                </div>
              )}
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

        {/* ===== 主動關心 ===== */}
        <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, paddingBottom: 8, borderBottom: '2px solid #FF5722', display: 'inline-block', margin: 0 }}>主動關心</h2>
            <button
              onClick={loadOutreachUsers}
              disabled={outreachLoading}
              style={{ padding: '8px 16px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#FF5722', color: 'white' }}
            >
              {outreachLoading ? '載入中...' : outreachUsers.length ? '重新載入' : '載入學員'}
            </button>
          </div>

          <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
            勾選需要關心的學員，一鍵發送私訊。適合每週檢視沒上傳飲食的同學。
          </p>

          {/* 訊息模板 */}
          {outreachUsers.length > 0 && (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>關心訊息（可編輯，<span style={{ color: '#FF5722' }}>{'{name}'}</span> 會自動替換成學員名字）：</div>
                <textarea
                  value={outreachMessage}
                  onChange={(e) => setOutreachMessage(e.target.value)}
                  rows={4}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 }}
                />
              </div>

              {/* 全選 + 計數 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={outreachSelected.size === outreachUsers.length && outreachUsers.length > 0}
                    onChange={toggleAllOutreach}
                    style={{ width: 16, height: 16 }}
                  />
                  全選
                </label>
                <span style={{ fontSize: 13, color: outreachSelected.size > 0 ? '#FF5722' : '#aaa', fontWeight: outreachSelected.size > 0 ? 600 : 400 }}>
                  已選 {outreachSelected.size} 人
                </span>
              </div>

              {/* 學員列表 + 勾選 */}
              <div style={{ maxHeight: 350, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
                {outreachUsers.map((u) => (
                  <label
                    key={u.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={outreachSelected.has(u.id)}
                      onChange={() => toggleOutreach(u.id)}
                      style={{ width: 16, height: 16, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{u.display_name || u.id?.substring(0, 12) + '...'}</span>
                      {u.goal && <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{u.goal.substring(0, 25)}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#aaa', flexShrink: 0 }}>
                      {u.conversation_count || 0} 則對話
                      {u.updated_at && ` · ${timeAgo(u.updated_at)}`}
                    </div>
                  </label>
                ))}
              </div>

              {/* 發送按鈕 */}
              <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  onClick={sendOutreach}
                  disabled={outreachSending || outreachSelected.size === 0}
                  style={{
                    padding: '12px 28px', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
                    cursor: outreachSelected.size > 0 ? 'pointer' : 'not-allowed',
                    background: outreachSelected.size > 0 ? '#FF5722' : '#ccc', color: 'white',
                  }}
                >
                  {outreachSending ? '發送中...' : `發送給 ${outreachSelected.size} 位學員`}
                </button>
                <span style={{ fontSize: 12, color: '#aaa' }}>使用 LINE Push（注意每月 200 則額度）</span>
              </div>
            </>
          )}

          {outreachUsers.length === 0 && !outreachLoading && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa', fontSize: 14 }}>
              點擊「載入學員」查看可關心的學員
            </div>
          )}

          {/* 發送結果 */}
          {outreachResult && (
            <div style={{
              marginTop: 16, padding: 14, borderRadius: 8, fontSize: 14,
              background: outreachResult.type === 'success' ? colors.success.bg : colors.error.bg,
              color: outreachResult.type === 'success' ? colors.success.text : colors.error.text,
              border: '1px solid ' + (outreachResult.type === 'success' ? colors.success.border : colors.error.border),
            }}>
              {outreachResult.type === 'success'
                ? `已發送 ${outreachResult.sent} 則${outreachResult.failed > 0 ? `，${outreachResult.failed} 則失敗` : ''}`
                : outreachResult.msg
              }
            </div>
          )}
        </div>

        {/* ===== 學員對話紀錄（Supabase）===== */}
        <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, paddingBottom: 8, borderBottom: '2px solid #7B1FA2', display: 'inline-block', margin: 0 }}>學員對話紀錄</h2>
            <button
              onClick={loadHistoryUsers}
              disabled={historyLoading}
              style={{ padding: '8px 16px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#7B1FA2', color: 'white' }}
            >
              {historyLoading ? '載入中...' : historyUsers.length ? '重新載入' : '載入學員'}
            </button>
          </div>

          <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
            從 Supabase 永久資料庫查看所有學員的完整對話紀錄，不受 Redis 24 小時限制。
          </p>

          {/* 搜尋框 + 學員列表 */}
          {historyUsers.length > 0 && !selectedUser && (
            <>
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="搜尋學員名字或目標..."
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginBottom: 10 }}
              />
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>
                共 {filteredHistoryUsers.length} 位學員{historySearch ? `（搜尋：${historySearch}）` : ''}
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {filteredHistoryUsers.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => loadUserDetail(u.id)}
                    style={{ padding: '12px 14px', borderBottom: '1px solid #eee', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{u.display_name || u.id?.substring(0, 12) + '...'}</span>
                      {u.goal && <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{u.goal.substring(0, 30)}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#7B1FA2', fontWeight: 600 }}>{u.conversation_count} 則</span>
                      <span style={{ fontSize: 12, color: '#aaa' }}>{u.updated_at ? timeAgo(u.updated_at) : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {historyUsers.length === 0 && !historyLoading && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa', fontSize: 14 }}>
              點擊「載入學員」查看資料
            </div>
          )}

          {/* 對話詳情 */}
          {selectedUser && (
            <div>
              <button
                onClick={() => { setSelectedUser(null); setSelectedUserInfo(null); setUserConversations([]); setUserTags([]); }}
                style={{ padding: '6px 14px', border: '1px solid #ccc', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#666', marginBottom: 12 }}
              >
                ← 返回列表
              </button>

              {/* 學員摘要卡片 */}
              {selectedUserInfo && (
                <div style={{ background: '#F3E5F5', padding: '12px 16px', borderRadius: 10, marginBottom: 14, fontSize: 14 }}>
                  <span style={{ fontWeight: 700 }}>{selectedUserInfo.display_name || '未知'}</span>
                  {selectedUserInfo.goal && <span style={{ marginLeft: 10, color: '#555' }}>{selectedUserInfo.goal}</span>}
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    共 {userConversations.length} 則對話 · {userTags.length} 筆標籤
                    {selectedUserInfo.join_date && ` · 加入 ${new Date(selectedUserInfo.join_date).toLocaleDateString('zh-TW')}`}
                  </div>
                </div>
              )}

              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa' }}>載入中...</div>
              ) : (
                <>
                  {/* 標籤統計 */}
                  {userTags.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>最近心態標籤：</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {userTags.slice(0, 10).map((t, i) => {
                          const parts = t.tag?.split(':') || [];
                          return (
                            <span key={i} style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, background: '#F3E5F5', color: '#7B1FA2' }}>
                              {parts[0] || '?'} / {parts[1] || '?'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 對話紀錄（預設顯示最近 20 則） */}
                  {(() => {
                    const PREVIEW_COUNT = 20;
                    const total = userConversations.length;
                    const displayMessages = showAllMessages
                      ? userConversations
                      : userConversations.slice(-PREVIEW_COUNT);
                    const hiddenCount = total - displayMessages.length;

                    return (
                      <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                        {hiddenCount > 0 && (
                          <button
                            onClick={() => setShowAllMessages(true)}
                            style={{ width: '100%', padding: '10px', border: '1px dashed #ccc', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#7B1FA2', marginBottom: 10, fontWeight: 600 }}
                          >
                            載入更早的 {hiddenCount} 則對話
                          </button>
                        )}
                        {displayMessages.map((msg, i) => (
                          <div key={i} style={{
                            padding: '8px 14px', marginBottom: 6, borderRadius: 10, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                            maxWidth: '85%',
                            ...(msg.role === 'user'
                              ? { background: '#E3F2FD', marginLeft: 'auto', borderBottomRightRadius: 2 }
                              : { background: '#F5F5F5', marginRight: 'auto', borderBottomLeftRadius: 2 }),
                          }}>
                            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>
                              {msg.role === 'user' ? '學員' : 'AI'} — {new Date(msg.created_at).toLocaleString('zh-TW')}
                            </div>
                            {msg.content}
                          </div>
                        ))}
                        {total === 0 && (
                          <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa', fontSize: 14 }}>
                            尚無對話紀錄
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </div>

        {/* ===== 手動草稿生成 ===== */}
        <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #FF9800', display: 'inline-block' }}>手動草稿生成</h2>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
            貼上學員的訊息，用最新的知識庫產生回覆草稿。適合回溯處理之前的訊息。
          </p>

          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="學員名字（選填）"
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginBottom: 8 }}
            />
            <textarea
              value={manualMessage}
              onChange={(e) => setManualMessage(e.target.value)}
              placeholder="貼上學員的訊息..."
              rows={4}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          <button
            onClick={generateManualDraft}
            disabled={manualLoading || !manualMessage.trim()}
            style={{
              padding: '10px 24px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: manualMessage.trim() ? 'pointer' : 'not-allowed',
              background: manualMessage.trim() ? '#FF9800' : '#ccc', color: 'white',
            }}
          >
            {manualLoading ? '生成中...' : '產生草稿'}
          </button>

          {manualError && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8, fontSize: 14, background: colors.error.bg, color: colors.error.text, border: '1px solid ' + colors.error.border }}>
              {manualError}
            </div>
          )}

          {manualDraft && (
            <div style={{ marginTop: 16 }}>
              <div style={{ background: '#E8F5E9', padding: '12px 16px', borderRadius: 8, fontSize: 14, lineHeight: 1.6, borderLeft: '3px solid #66BB6A', whiteSpace: 'pre-wrap', marginBottom: 10 }}>
                {manualDraft}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => copyDraft(manualDraft, 'manual')}
                  style={{
                    flex: 1, padding: '10px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    background: copiedId === 'manual' ? '#66BB6A' : '#4CAF50', color: 'white',
                  }}
                >
                  {copiedId === 'manual' ? '已複製！' : '複製草稿'}
                </button>
                <button
                  onClick={generateManualDraft}
                  disabled={manualLoading}
                  style={{ padding: '10px 20px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, cursor: 'pointer', background: 'white', color: '#666' }}
                >
                  重新生成
                </button>
              </div>
            </div>
          )}
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
