'use client';

import { useState, useEffect } from 'react';

export default function StudentsPage() {
  const [adminKey, setAdminKey] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState('');

  // 學員列表
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  // 學員詳情
  const [selectedId, setSelectedId] = useState(null);
  const [selectedInfo, setSelectedInfo] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [tags, setTags] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // 分班編輯
  const [editingClass, setEditingClass] = useState(null);
  const [classInput, setClassInput] = useState('');

  // 批量分班
  const [batchClassInput, setBatchClassInput] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);

  // 修復名字
  const [fixingNames, setFixingNames] = useState(false);

  // 自動恢復登入（直接信任，不重新驗證）
  useEffect(() => {
    const saved = localStorage.getItem('coach-admin-key');
    if (saved) {
      setAdminKey(saved);
      setUnlocked(true);
    }
  }, []);

  // 解鎖後自動載入
  useEffect(() => {
    if (unlocked && adminKey) loadStudents();
  }, [unlocked, adminKey]);

  async function handleUnlock(e) {
    e.preventDefault();
    if (!password.trim()) { setPwError('請輸入管理密鑰'); return; }
    setPwError('');
    try {
      const res = await fetch('/api/admin/history', { headers: { 'x-admin-key': password.trim() } });
      if (res.status === 401) { setPwError('密鑰錯誤'); return; }
      setAdminKey(password.trim());
      setUnlocked(true);
      localStorage.setItem('coach-admin-key', password.trim());
    } catch (err) {
      setPwError('連線失敗：' + err.message);
    }
  }

  async function loadStudents() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/history', { headers: { 'x-admin-key': adminKey } });
      const data = await res.json();
      if (res.ok && data.ok) setStudents(data.users || []);
    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  }

  async function loadDetail(userId) {
    setDetailLoading(true);
    setSelectedId(userId);
    setSelectedInfo(students.find(u => u.id === userId) || null);
    setConversations([]);
    setTags([]);
    setShowAll(false);
    try {
      const res = await fetch(`/api/admin/history?user=${userId}`, { headers: { 'x-admin-key': adminKey } });
      const data = await res.json();
      if (res.ok && data.ok) {
        setConversations(data.conversations || []);
        setTags(data.tags || []);
        if (data.user) setSelectedInfo(data.user);
      }
    } catch (err) {
      console.error('Detail error:', err);
    }
    setDetailLoading(false);
  }

  async function updateClass(userId, className) {
    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ userId, className }),
      });
      if (res.ok) {
        setStudents(prev => prev.map(s => s.id === userId ? { ...s, class_name: className } : s));
      }
    } catch (err) {
      console.error('Update class error:', err);
    }
    setEditingClass(null);
    setClassInput('');
  }

  async function batchAssignClass() {
    const className = batchClassInput.trim();
    if (!className) return;
    const unassigned = students.filter(s => !s.class_name && s.conversation_count > 0);
    if (unassigned.length === 0) { alert('沒有需要分班的學員'); return; }
    if (!confirm(`確定要把 ${unassigned.length} 位未分班學員全部分到「${className}」嗎？`)) return;

    setBatchLoading(true);
    let success = 0;
    for (const s of unassigned) {
      try {
        const res = await fetch('/api/admin/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
          body: JSON.stringify({ userId: s.id, className }),
        });
        if (res.ok) success++;
      } catch (_) {}
    }
    setBatchLoading(false);
    setBatchClassInput('');
    alert(`已完成：${success}/${unassigned.length} 位學員分到「${className}」`);
    loadStudents();
  }

  // 取得所有班別（用於篩選）
  const allClasses = [...new Set(students.map(s => s.class_name).filter(Boolean))];

  // 篩選
  const filtered = students.filter(s => {
    const matchSearch = !search ||
      (s.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.goal || '').toLowerCase().includes(search.toLowerCase());
    const matchClass = classFilter === 'all' ||
      (classFilter === 'unassigned' ? !s.class_name : s.class_name === classFilter);
    return matchSearch && matchClass;
  });

  function timeAgo(isoStr) {
    if (!isoStr) return '';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '剛剛';
    if (mins < 60) return `${mins} 分鐘前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} 小時前`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} 天前`;
    return `${Math.floor(days / 30)} 個月前`;
  }

  // ===== 密碼閘門 =====
  if (!unlocked) {
    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f5f5f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: 40, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>學員管理</h1>
          <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>請輸入管理密鑰</p>
          <form onSubmit={handleUnlock}>
            <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setPwError(''); }}
              placeholder="管理密鑰" autoFocus
              style={{ width: '100%', padding: '12px 16px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, marginBottom: 12, boxSizing: 'border-box' }}
            />
            {pwError && <div style={{ color: '#C62828', fontSize: 13, marginBottom: 12 }}>{pwError}</div>}
            <button type="submit" style={{ width: '100%', padding: '12px', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', background: '#7B1FA2', color: 'white' }}>進入</button>
          </form>
        </div>
      </div>
    );
  }

  // ===== 學員詳情頁 =====
  if (selectedId) {
    const PREVIEW = 30;
    const display = showAll ? conversations : conversations.slice(-PREVIEW);
    const hidden = conversations.length - display.length;

    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f5f5f5', minHeight: '100vh', padding: 20 }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          {/* 頂部導航 */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button onClick={() => { setSelectedId(null); setSelectedInfo(null); }}
              style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#666' }}>
              ← 返回列表
            </button>
            <a href="/admin" style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#666', textDecoration: 'none', display: 'inline-block' }}>
              管理後台
            </a>
          </div>

          {/* 學員資訊卡 */}
          {selectedInfo && (
            <div style={{ background: 'white', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontSize: 20, margin: '0 0 4px 0' }}>{selectedInfo.display_name || '未知'}</h2>
                  {selectedInfo.class_name && (
                    <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, background: '#E8EAF6', color: '#3F51B5', fontWeight: 600 }}>
                      {selectedInfo.class_name}
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, color: '#888' }}>
                  {selectedInfo.join_date && <div>加入：{new Date(selectedInfo.join_date).toLocaleDateString('zh-TW')}</div>}
                  <div>對話：{conversations.length} 則</div>
                </div>
              </div>
              {selectedInfo.goal && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#F3E5F5', borderRadius: 8, fontSize: 14, color: '#6A1B9A' }}>
                  目標：{selectedInfo.goal}
                </div>
              )}
              {selectedInfo.intro && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#666', lineHeight: 1.6 }}>
                  {selectedInfo.intro.substring(0, 200)}{selectedInfo.intro.length > 200 ? '...' : ''}
                </div>
              )}
              {selectedInfo.journey && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ fontSize: 13, color: '#7B1FA2', cursor: 'pointer', fontWeight: 600 }}>旅程摘要</summary>
                  <div style={{ marginTop: 6, fontSize: 13, color: '#555', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {selectedInfo.journey}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* 標籤 */}
          {tags.length > 0 && (
            <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>最近心態標籤</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tags.slice(0, 15).map((t, i) => (
                  <span key={i} style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, background: '#F3E5F5', color: '#7B1FA2' }}>
                    {t.topic || '?'} / {t.emotion || '?'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 對話紀錄 */}
          <div style={{ background: 'white', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>對話紀錄</div>
            {detailLoading ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>載入中...</div>
            ) : (
              <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                {hidden > 0 && (
                  <button onClick={() => setShowAll(true)}
                    style={{ width: '100%', padding: 10, border: '1px dashed #ccc', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#7B1FA2', marginBottom: 10, fontWeight: 600 }}>
                    載入更早的 {hidden} 則對話
                  </button>
                )}
                {display.map((msg, i) => (
                  <div key={i} style={{
                    padding: '8px 14px', marginBottom: 6, borderRadius: 12, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                    maxWidth: '85%',
                    ...(msg.role === 'user'
                      ? { background: '#E3F2FD', marginLeft: 'auto', borderBottomRightRadius: 2 }
                      : { background: '#F5F5F5', marginRight: 'auto', borderBottomLeftRadius: 2 }),
                  }}>
                    <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>
                      {msg.role === 'user' ? '學員' : '小幫手'} — {new Date(msg.created_at).toLocaleString('zh-TW')}
                    </div>
                    {msg.content}
                  </div>
                ))}
                {conversations.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 30, color: '#aaa', fontSize: 14 }}>尚無對話紀錄</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===== 學員列表頁 =====
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f5f5f5', minHeight: '100vh', padding: 20 }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {/* 頂部導航 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, margin: '0 0 4px 0' }}>學員管理</h1>
            <p style={{ color: '#888', fontSize: 13, margin: 0 }}>查看學員對話紀錄、分班管理</p>
          </div>
          <a href="/admin" style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#666', textDecoration: 'none' }}>
            管理後台
          </a>
        </div>

        {/* 搜尋 + 篩選 */}
        <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋學員名字或目標..."
              style={{ flex: 1, padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
            />
            <button onClick={loadStudents} disabled={loading}
              style={{ padding: '10px 16px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#7B1FA2', color: 'white', whiteSpace: 'nowrap' }}>
              {loading ? '載入中...' : '重新載入'}
            </button>
            {students.some(s => !s.display_name || s.id?.startsWith('U') && !s.display_name) && (
              <button onClick={async () => {
                setFixingNames(true);
                try {
                  const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'x-admin-key': adminKey } });
                  const data = await res.json();
                  alert(`修復完成：${data.fixed}/${data.total} 位學員名字已更新`);
                  loadStudents();
                } catch (err) { alert('失敗：' + err.message); }
                setFixingNames(false);
              }} disabled={fixingNames}
                style={{ padding: '10px 16px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#E65100', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {fixingNames ? '修復中...' : '修復缺少的名字'}
              </button>
            )}
          </div>

          {/* 班別篩選 */}
          {allClasses.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setClassFilter('all')}
                style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: classFilter === 'all' ? '2px solid #7B1FA2' : '1px solid #ddd', background: classFilter === 'all' ? '#F3E5F5' : 'white', color: classFilter === 'all' ? '#7B1FA2' : '#666', fontWeight: classFilter === 'all' ? 600 : 400 }}>
                全部 ({students.length})
              </button>
              {allClasses.map(c => {
                const count = students.filter(s => s.class_name === c).length;
                return (
                  <button key={c} onClick={() => setClassFilter(c)}
                    style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: classFilter === c ? '2px solid #7B1FA2' : '1px solid #ddd', background: classFilter === c ? '#F3E5F5' : 'white', color: classFilter === c ? '#7B1FA2' : '#666', fontWeight: classFilter === c ? 600 : 400 }}>
                    {c} ({count})
                  </button>
                );
              })}
              <button onClick={() => setClassFilter('unassigned')}
                style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: classFilter === 'unassigned' ? '2px solid #FF9800' : '1px solid #ddd', background: classFilter === 'unassigned' ? '#FFF3E0' : 'white', color: classFilter === 'unassigned' ? '#E65100' : '#666', fontWeight: classFilter === 'unassigned' ? 600 : 400 }}>
                未分班 ({students.filter(s => !s.class_name).length})
              </button>
            </div>
          )}

          {/* 新增班別 */}
          {students.filter(s => !s.class_name).length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>新增班別：</span>
              <input type="text" value={batchClassInput} onChange={(e) => setBatchClassInput(e.target.value)}
                placeholder="輸入新班別名稱（例：2026年3月班）"
                style={{ flex: 1, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                onKeyDown={(e) => { if (e.key === 'Enter' && batchClassInput.trim()) { setClassFilter('all'); setBatchClassInput(''); } }}
              />
              <span style={{ fontSize: 11, color: '#aaa' }}>輸入後會出現在快捷按鈕中</span>
            </div>
          )}
        </div>

        {/* 統計 */}
        <div style={{ fontSize: 13, color: '#888', marginBottom: 8, paddingLeft: 4 }}>
          共 {filtered.length} 位學員{search ? `（搜尋：${search}）` : ''}{classFilter !== 'all' ? `（${classFilter === 'unassigned' ? '未分班' : classFilter}）` : ''}
        </div>

        {/* 學員列表 */}
        <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          {filtered.map((s) => (
            <div key={s.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <div
                onClick={() => loadDetail(s.id)}
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{s.display_name || s.id?.substring(0, 12) + '...'}</span>
                    {s.class_name && (
                      <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: '#E8EAF6', color: '#3F51B5', fontWeight: 600 }}>
                        {s.class_name}
                      </span>
                    )}
                  </div>
                  {s.goal && <div style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.goal}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: '#7B1FA2', fontWeight: 600 }}>{s.conversation_count || 0} 則</div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>{timeAgo(s.updated_at)}</div>
                  </div>
                  {/* 快捷分班按鈕 */}
                  {!s.class_name ? (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      {[...allClasses, ...(batchClassInput.trim() && !allClasses.includes(batchClassInput.trim()) ? [batchClassInput.trim()] : [])].map(c => (
                        <button key={c} onClick={() => updateClass(s.id, c)}
                          style={{ padding: '3px 8px', border: '1px solid #7B1FA2', borderRadius: 6, fontSize: 10, cursor: 'pointer', background: 'white', color: '#7B1FA2', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {c}
                        </button>
                      ))}
                      <button onClick={() => { setEditingClass(s.id); setClassInput(''); }}
                        style={{ padding: '3px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 10, cursor: 'pointer', background: 'white', color: '#aaa' }}
                        title="自訂班別">
                        ⋯
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingClass(s.id); setClassInput(s.class_name || ''); }}
                      style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'white', color: '#888' }}>
                      改班
                    </button>
                  )}
                </div>
              </div>

              {/* 自訂分班編輯（展開） */}
              {editingClass === s.id && (
                <div style={{ padding: '8px 16px 14px', background: '#FAFAFA', display: 'flex', gap: 8, alignItems: 'center' }}
                  onClick={(e) => e.stopPropagation()}>
                  <input type="text" value={classInput} onChange={(e) => setClassInput(e.target.value)}
                    placeholder="班別名稱" autoFocus
                    style={{ flex: 1, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') updateClass(s.id, classInput.trim()); }}
                  />
                  <button onClick={() => updateClass(s.id, classInput.trim())}
                    style={{ padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#7B1FA2', color: 'white', fontWeight: 600 }}>
                    儲存
                  </button>
                  {s.class_name && (
                    <button onClick={() => updateClass(s.id, '')}
                      style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'white', color: '#C62828' }}>
                      移除
                    </button>
                  )}
                  <button onClick={() => setEditingClass(null)}
                    style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'white', color: '#888' }}>
                    取消
                  </button>
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 14 }}>
              {students.length === 0 ? '尚無學員資料' : '沒有符合條件的學員'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
