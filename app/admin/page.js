'use client';

import { useState } from 'react';

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [studentCount, setStudentCount] = useState(0);
  const [importStatus, setImportStatus] = useState(null);
  const [statusResult, setStatusResult] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState('');

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
    if (!adminKey.trim()) { setImportStatus({ type: 'error', msg: '請輸入管理密鑰' }); return; }
    if (!fileData) { setImportStatus({ type: 'error', msg: '請先選擇 JSON 檔案' }); return; }
    setLoading('import');
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey.trim() },
        body: JSON.stringify(fileData),
      });
      const result = await res.json();
      if (res.ok && result.ok) {
        setImportStatus({ type: 'success', msg: '✅ ' + result.message });
      } else {
        setImportStatus({ type: 'error', msg: '❌ ' + (result.error || '未知錯誤') });
      }
    } catch (err) {
      setImportStatus({ type: 'error', msg: '❌ 連線失敗：' + err.message });
    }
    setLoading('');
  }

  async function checkStatus() {
    if (!adminKey.trim()) { setStatusResult({ type: 'error', msg: '請輸入管理密鑰' }); return; }
    setLoading('status');
    try {
      const res = await fetch('/api/admin/import', {
        headers: { 'x-admin-key': adminKey.trim() },
      });
      const result = await res.json();
      if (res.ok && result.ok) {
        setStatusResult({ type: 'info', total: result.total, matched: result.matched, unmatched: result.unmatched });
        setStudents(result.students || []);
      } else if (res.status === 401) {
        setStatusResult({ type: 'error', msg: '❌ 密鑰錯誤，請確認 Admin Key' });
      } else {
        setStatusResult({ type: 'error', msg: '❌ ' + (result.error || '未知錯誤') });
      }
    } catch (err) {
      setStatusResult({ type: 'error', msg: '❌ 連線失敗：' + err.message });
    }
    setLoading('');
  }

  const colors = {
    success: { bg: '#E8F5E9', border: '#A5D6A7', text: '#2E7D32' },
    error: { bg: '#FFEBEE', border: '#EF9A9A', text: '#C62828' },
    info: { bg: '#E3F2FD', border: '#90CAF9', text: '#1565C0' },
  };

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f5f5f5', minHeight: '100vh', padding: '20px' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', marginBottom: 8, fontSize: 24 }}>休校長小幫手 管理後台</h1>
        <p style={{ textAlign: 'center', color: '#888', marginBottom: 30, fontSize: 14 }}>學員自我介紹匯入 & 比對狀態查詢</p>

        {/* 設定 */}
        <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #4CAF50', display: 'inline-block' }}>連線設定</h2>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 }}>管理密鑰 (Admin Key)</label>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="輸入你在 Vercel 設定的 ADMIN_API_KEY"
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15 }}
            />
          </div>
        </div>

        {/* 匯入 */}
        <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #4CAF50', display: 'inline-block' }}>匯入學員資料</h2>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>選擇 JSON 檔案（coach-import-data.json），一鍵匯入學員自介資料</p>
          <input type="file" accept=".json" onChange={handleFile} style={{ marginBottom: 8 }} />
          {fileName && (
            <div style={{ background: '#F5F5F5', padding: '10px 14px', borderRadius: 8, marginTop: 8, fontSize: 13, color: '#666' }}>
              📄 {fileName} — 共 {studentCount} 筆學員資料
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={doImport}
              disabled={!fileData || loading === 'import'}
              style={{ padding: '12px 28px', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: fileData ? 'pointer' : 'not-allowed', background: fileData ? '#4CAF50' : '#ccc', color: 'white' }}
            >
              {loading === 'import' ? '⏳ 匯入中...' : '匯入資料'}
            </button>
          </div>
          {importStatus && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 8, fontSize: 14, background: colors[importStatus.type].bg, color: colors[importStatus.type].text, border: '1px solid ' + colors[importStatus.type].border }}>
              {importStatus.msg}
            </div>
          )}
        </div>

        {/* 狀態 */}
        <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 18, marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #2196F3', display: 'inline-block' }}>比對狀態</h2>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>查看已匯入的學員，以及是否已跟 LINE userId 成功配對</p>
          <button
            onClick={checkStatus}
            disabled={loading === 'status'}
            style={{ padding: '12px 28px', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', background: '#2196F3', color: 'white' }}
          >
            {loading === 'status' ? '⏳ 查詢中...' : '查詢狀態'}
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
                        {s.matched ? '已配對 ✓' : '等待中'}
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
