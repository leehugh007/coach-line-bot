'use client';
import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';

const STATUS_MAP = {
  active: { label: '🟢 活躍', color: '#2E7D32', bg: '#E8F5E9' },
  watch: { label: '🟡 待關注', color: '#F57F17', bg: '#FFF8E1' },
  care: { label: '🔴 需關心', color: '#C62828', bg: '#FFEBEE' },
  never: { label: '⚪ 未互動', color: '#666', bg: '#F5F5F5' },
  unknown: { label: '❓ 未知', color: '#999', bg: '#F5F5F5' },
};

export default function StaffPage() {
  const [staffKey, setStaffKey] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState('students');
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [classFilter, setClassFilter] = useState('');
  const [loading, setLoading] = useState(false);

  // 班級管理 form
  const [newClassName, setNewClassName] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');

  // 名單上傳
  const [importText, setImportText] = useState('');
  const [importClassName, setImportClassName] = useState('');
  const [importResult, setImportResult] = useState(null);

  // Auth
  useEffect(() => {
    const saved = localStorage.getItem('coach-staff-key');
    if (saved) {
      setStaffKey(saved);
      setUnlocked(true);
    }
  }, []);

  const headers = { 'x-staff-key': staffKey, 'Content-Type': 'application/json' };

  const login = async (pw) => {
    try {
      const res = await fetch('/api/staff/classes', { headers: { 'x-staff-key': pw } });
      if (res.ok) {
        setStaffKey(pw);
        setUnlocked(true);
        localStorage.setItem('coach-staff-key', pw);
      } else {
        alert('密碼錯誤');
      }
    } catch { alert('連線失敗'); }
  };

  // Load data
  const loadClasses = useCallback(async () => {
    const res = await fetch('/api/staff/classes', { headers });
    if (res.ok) {
      const data = await res.json();
      setClasses(data.classes || []);
    }
  }, [staffKey]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    const url = classFilter ? `/api/staff/students?class=${encodeURIComponent(classFilter)}` : '/api/staff/students';
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      setStudents(data.students || []);
    }
    setLoading(false);
  }, [staffKey, classFilter]);

  useEffect(() => {
    if (unlocked) {
      loadClasses();
      loadStudents();
    }
  }, [unlocked, loadClasses, loadStudents]);

  // Class CRUD
  const addClass = async () => {
    if (!newClassName || !newStartDate) return alert('請填寫班級名稱和開學日期');
    await fetch('/api/staff/classes', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: newClassName, startDate: newStartDate, endDate: newEndDate || null }),
    });
    setNewClassName('');
    setNewStartDate('');
    setNewEndDate('');
    loadClasses();
  };

  const deleteClass = async (name) => {
    if (!confirm(`確定刪除「${name}」？`)) return;
    await fetch(`/api/staff/classes?name=${encodeURIComponent(name)}`, { method: 'DELETE', headers });
    loadClasses();
  };

  // Import
  const handleImport = async () => {
    if (!importText.trim() || !importClassName) return alert('請填寫名單和選擇班級');
    // 每行一個學員，格式：LINE名稱 | 真實姓名 | 自介（可選）
    const lines = importText.trim().split('\n').filter(l => l.trim());
    const students = lines.map(line => {
      const parts = line.split('|').map(p => p.trim());
      return {
        lineName: parts[0] || '',
        realName: parts[1] || parts[0] || '',
        className: importClassName,
        intro: parts[2] || '',
      };
    }).filter(s => s.lineName);

    const res = await fetch('/api/admin/import', {
      method: 'POST',
      headers: { ...headers, 'x-admin-key': staffKey },
      body: JSON.stringify({ students }),
    });
    const result = await res.json();
    setImportResult(result);
    setImportText('');
  };

  // Login screen
  if (!unlocked) {
    return (
      <div style={{ maxWidth: 400, margin: '80px auto', padding: 20, textAlign: 'center' }}>
        <h2>助教後台</h2>
        <p style={{ color: '#888', fontSize: 14 }}>請輸入助教密碼</p>
        <input
          type="password"
          placeholder="密碼"
          style={{ padding: '10px 14px', fontSize: 16, width: '100%', borderRadius: 8, border: '1px solid #ddd', marginBottom: 12 }}
          onKeyDown={(e) => e.key === 'Enter' && login(e.target.value)}
        />
        <button
          onClick={() => login(document.querySelector('input[type=password]').value)}
          style={{ padding: '10px 24px', fontSize: 16, borderRadius: 8, border: 'none', background: '#E8734A', color: 'white', cursor: 'pointer', width: '100%' }}
        >
          登入
        </button>
      </div>
    );
  }

  const tabs = [
    { id: 'students', label: '學員狀態' },
    { id: 'classes', label: '班級管理' },
    { id: 'import', label: '名單上傳' },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16, fontFamily: '-apple-system, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>助教後台</h1>
        <span style={{ fontSize: 12, color: '#999' }}>休校長小幫手</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #eee', paddingBottom: 8 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer',
            background: tab === t.id ? '#E8734A' : '#f5f5f5',
            color: tab === t.id ? 'white' : '#666',
            fontWeight: tab === t.id ? 700 : 400, fontSize: 14,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ===== 學員狀態 ===== */}
      {tab === 'students' && (
        <div>
          {/* 篩選 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <select
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
            >
              <option value="">全部班級</option>
              {classes.map(c => <option key={c.name} value={c.name}>{c.name}{c.isActive ? ' (進行中)' : ''}</option>)}
            </select>
            <button onClick={loadStudents} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 14 }}>
              重新整理
            </button>
            <span style={{ fontSize: 13, color: '#888', lineHeight: '36px' }}>
              共 {students.length} 位
              {students.filter(s => s.status === 'care').length > 0 && ` · ${students.filter(s => s.status === 'care').length} 位需要關心`}
            </span>
          </div>

          {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>載入中⋯</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f9f9f9', textAlign: 'left' }}>
                  <th style={{ padding: '10px 8px', borderBottom: '2px solid #eee' }}>學員</th>
                  <th style={{ padding: '10px 8px', borderBottom: '2px solid #eee' }}>班級</th>
                  <th style={{ padding: '10px 8px', borderBottom: '2px solid #eee' }}>週數</th>
                  <th style={{ padding: '10px 8px', borderBottom: '2px solid #eee' }}>互動</th>
                  <th style={{ padding: '10px 8px', borderBottom: '2px solid #eee' }}>最後互動</th>
                  <th style={{ padding: '10px 8px', borderBottom: '2px solid #eee' }}>狀態</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => {
                  const st = STATUS_MAP[s.status] || STATUS_MAP.unknown;
                  return (
                    <tr key={i} style={{ background: s.status === 'care' ? '#FFF5F5' : s.status === 'watch' ? '#FFFDE7' : 'white' }}>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>{s.name}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', color: '#666' }}>{s.className || '-'}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0' }}>{s.currentWeek ? `第${s.currentWeek}週` : '-'}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0' }}>{s.totalInteractions}次</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', color: '#888', fontSize: 12 }}>
                        {s.lastInteraction ? new Date(s.lastInteraction).toLocaleDateString('zh-TW') : '從未'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ===== 班級管理 ===== */}
      {tab === 'classes' && (
        <div>
          <div style={{ background: '#f9f9f9', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>新增班級</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input placeholder="班級名稱（例：2026年3月班）" value={newClassName} onChange={e => setNewClassName(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, flex: '1 1 200px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <label style={{ fontSize: 13, color: '#666' }}>開學</label>
                <input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <label style={{ fontSize: 13, color: '#666' }}>結業</label>
                <input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }} />
              </div>
              <button onClick={addClass} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#E8734A', color: 'white', cursor: 'pointer', fontWeight: 600 }}>新增</button>
            </div>
          </div>

          {classes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>尚未新增班級</div>
          ) : (
            <div>
              {classes.map(c => (
                <div key={c.name} style={{
                  background: 'white', borderRadius: 12, padding: 16, marginBottom: 10,
                  border: `1px solid ${c.isActive ? '#E8734A' : '#eee'}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      {c.name}
                      {c.isActive && <span style={{ fontSize: 12, color: '#E8734A', marginLeft: 8 }}>進行中 · 第{c.currentWeek}週</span>}
                    </div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
                      {c.startDate} ~ {c.endDate || '未設定'} · {c.weeks}週
                    </div>
                  </div>
                  <button onClick={() => deleteClass(c.name)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'white', color: '#c00', cursor: 'pointer', fontSize: 12 }}>刪除</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== 名單上傳 ===== */}
      {tab === 'import' && (
        <div>
          <div style={{ background: '#f9f9f9', borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>上傳學員名單</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>選擇班級</label>
              <select value={importClassName} onChange={e => setImportClassName(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, width: '100%' }}>
                <option value="">請選擇班級</option>
                {classes.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            {/* Excel 上傳 */}
            <div style={{ marginBottom: 16, padding: 20, border: '2px dashed #ddd', borderRadius: 12, textAlign: 'center', background: 'white' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>上傳 Excel 檔案</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
                支援 .xlsx / .xls，欄位需包含「LINE 名稱」（必填），「真實姓名」「自介」選填
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const data = await file.arrayBuffer();
                    const wb = XLSX.read(data);
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

                    if (rows.length === 0) return alert('Excel 裡沒有資料');

                    // 自動偵測欄位名稱（支援多種命名）
                    const cols = Object.keys(rows[0]);
                    const findCol = (keywords) => cols.find(c => keywords.some(k => c.toLowerCase().includes(k)));
                    const lineCol = findCol(['line', '名稱', 'line名', '帳號', '暱稱', 'display']);
                    const nameCol = findCol(['真實', '姓名', '本名', 'name', '名字']);
                    const introCol = findCol(['自介', '介紹', 'intro', '自我']);
                    const idCol = findCol(['學號', 'id', '編號', 'student']);

                    if (!lineCol) {
                      alert(`找不到「LINE 名稱」欄位。\n偵測到的欄位：${cols.join(', ')}\n\n請確認 Excel 裡有包含 LINE 名稱的欄位`);
                      return;
                    }

                    // 轉成預覽文字
                    const preview = rows.map(r => {
                      const parts = [r[lineCol]];
                      if (nameCol && r[nameCol]) parts.push(r[nameCol]);
                      if (introCol && r[introCol]) parts.push(r[introCol]);
                      return parts.join(' | ');
                    }).join('\n');

                    setImportText(preview);
                    alert(`成功讀取 ${rows.length} 筆資料，請確認後點「上傳名單」`);
                  } catch (err) {
                    alert('讀取 Excel 失敗：' + err.message);
                  }
                  e.target.value = ''; // reset input
                }}
                style={{ fontSize: 14 }}
              />
            </div>

            {/* 或文字貼上 */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>
                或直接貼上（每行一位：LINE 名稱 | 真實姓名 | 自介）
              </label>
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={'Elaine Yeh | 宜萍 | 金融業，第二期學員\nAnnie | Annie | 12月班班長'}
                rows={8}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, fontFamily: 'monospace', resize: 'vertical' }}
              />
            </div>

            {importText && (
              <div style={{ fontSize: 13, color: '#666', marginBottom: 12, padding: 8, background: '#E8F5E9', borderRadius: 8 }}>
                預覽：{importText.trim().split('\n').length} 位學員
              </div>
            )}

            <button onClick={handleImport} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#E8734A', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              上傳名單
            </button>

            {importResult && (
              <div style={{ marginTop: 12, padding: 12, background: '#E8F5E9', borderRadius: 8, fontSize: 14 }}>
                {importResult.imported != null ? `成功匯入 ${importResult.imported} 位` : JSON.stringify(importResult)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
