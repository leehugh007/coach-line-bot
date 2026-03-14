# 休校長小幫手 Bot — 專案上下文

> 用途：讓 Claude Code 快速理解這個專案
> 最後更新：2026-03-14

## 專案定位

「休校長小幫手」是一休減肥課程的 AI 教練助手 LINE Bot。
專注於**心態輔導 + 飲食觀念**，不做食物照片分析（那是姊妹專案「幫你算 Bot」的工作）。

核心價值：用一休的語氣和價值觀，陪伴學員走過減肥旅程的心理關卡。

**兩大運作模式：**
1. **私訊模式**：學員直接對話 → AI 用一休語氣回覆
2. **群組模式**：偵測學員問題 → 產生草稿 → 通知教練 → 教練到後台複製回覆

## 技術架構

- **框架**：Next.js 14（App Router）
- **AI**：Gemini 3.1 Flash Lite（thinkingBudget: 1024）
- **記憶**：Upstash Redis（快取層）+ Supabase（永久層，Read-through 回補）
- **知識**：knowledge.js AI 意圖分類 + 兩層式注入（Tier1 精華 + Tier2 AI 選取 14 塊，regex 降級備案）
- **部署**：Vercel（push main = 自動部署）
- **LINE**：Messaging API（Reply 優先，Push fallback）

詳細技術文件：`ABC瘦身業務/休校長小幫手/技術架構.md`

## GitHub & Vercel

- **GitHub**：https://github.com/leehugh007/coach-line-bot
- **Vercel**：https://coach-line-bot.vercel.app
- **Vercel Project ID**：`prj_rYRaUpQ37DruqR2hNMah2DQpzqaG`
- **Vercel Team ID**：`team_TjsHfN2RqcvIwZVqD3gBDHyu`

## 環境變數

| Key | 用途 |
|-----|------|
| `LINE_CHANNEL_SECRET` | LINE 簽名驗證 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE 發送訊息 |
| `GEMINI_API_KEY` | Gemini API（與幫你算 Bot 共用） |
| `KV_REST_API_URL` | Upstash Redis URL（與幫你算 Bot 共用同一個 Redis） |
| `KV_REST_API_TOKEN` | Upstash Redis Token |
| `SUPABASE_URL` | Supabase 專案 URL（永久記憶層） |
| `SUPABASE_KEY` | Supabase anon key |
| `ADMIN_API_KEY` | 管理後台驗證 |
| `COACH_USER_ID` | 教練的 LINE userId（群組偵測推播通知用） |

## 檔案結構

```
lib/
  ai.js          ← SYSTEM_PROMPT（瘦身後 ~3.2K 字）+ handleMessage() + aiDetectQuestion() + generateDraftResponse()
  knowledge.js   ← AI 意圖分類（classifyIntent，輸出 tags+mood+slices）+ 兩層式知識注入（Tier1 精華 + Tier2 x14，regex 降級備案）
  chat.js        ← 對話記憶（私訊 24hr TTL, max 40）+ 群組 buffer（2hr TTL, max 20）
  line.js        ← LINE API（驗簽 + reply + push + profile + groupSummary）
  user.js        ← 用戶資料管理 + 自介偵測 + 預載入比對
  tags.js        ← 教練標籤系統（topic/emotion/core_issue/conversation_style + 趨勢摘要 + 旅程摘要）
  supabase.js    ← Supabase client singleton
  pending.js     ← 群組問題待回應管理（Redis LIST, max 100）
app/
  admin/page.js  ← 管理後台（群組監控 + 學員匯入 + 比對狀態 + 學員對話紀錄）
  api/webhook/route.js  ← 主入口（maxDuration=60，含私訊訊息合併 8s buffer）
  api/admin/pending/route.js  ← 待回應 API
  api/admin/import/route.js   ← 學員匯入 API
  api/admin/users/route.js    ← 學員列表 API
  api/admin/history/route.js  ← 學員對話紀錄 API（Supabase 讀取）
```

## Redis 資料結構

```
coach-chat:{userId}           → 私訊對話記憶（24hr TTL, max 40 則）
coach-group:{groupId}         → 群組訊息 buffer（2hr TTL, max 20 則）
coach-user:{userId}           → 用戶資料（自介、互動次數）
coach-preloaded:{lineName}    → 預載入學員自介
coach:{userId}:topics         → 對話標籤（max 20）
coach:{userId}:milestones     → 里程碑（Set）
coach:{userId}:summary        → AI 心態摘要
coach:{userId}:journey        → 累積式旅程摘要（500-800 字）
coach-pending:items           → 群組問題待回應（LIST, max 100）
```

注意：Redis 實例與幫你算 Bot 共用，但 key prefix 不同（`coach-` vs `chat:`/`user:`）。

## Supabase 永久記憶層

Redis 是快取，Supabase 是永久記憶。採用 **Read-through + Write-through** 雙向同步：

**Write-through（寫入）**：每次寫 Redis 後，非阻塞 async 同步到 Supabase
**Read-through（讀取）**：Redis miss 時自動從 Supabase 恢復，回寫 Redis

### Supabase 資料表

| 表 | 用途 | 關鍵欄位 |
|---|------|----------|
| `users` | 用戶檔案 | id, display_name, intro, goal, week_number, journey, join_date, updated_at |
| `conversations` | 對話記錄 | user_id, role, content, created_at |
| `coaching_tags` | 教練標籤 | user_id, topic, emotion, core_issue, progress_signal, created_at |
| `milestones` | 里程碑 | user_id, milestone, created_at |

### Read-through 回補邏輯

| 模組 | 函式 | Redis miss 時的行為 |
|------|------|---------------------|
| user.js | `getUser()` | 查 `users` 表 + `conversations` count → 重建 profile → AI 重新解析自介 |
| chat.js | `getChatHistory()` | 查 `conversations` 最近 40 則 → 倒序翻正序 → 回寫 Redis |
| tags.js | `getRecentTopics()` | 查 `coaching_tags` 最近 20 則 → 解析格式 → 回寫 Redis |
| tags.js | `getTopicCount()` | 查 `coaching_tags` count → 返回數字 |
| tags.js | `getCoachingSummary()` | 查 `coaching_tags` ≥3 則 → AI 重新產生摘要 → 回寫 Redis |
| tags.js | `getJourneySummary()` | 查 `users.journey` → 回寫 Redis |

### 旅程摘要系統

- **觸發**：每 10 次對話（`topicCount % 10 === 0`）
- **累積式**：讀前一版旅程 + 近 20 標籤 + 摘要 + 里程碑 → AI 產生更新版
- **格式**：500-800 字，記錄開始動機、階段進展、困難與克服、目前狀態
- **存放**：Redis `coach:{userId}:journey` + Supabase `users.journey`
- **注入**：在 `buildUserContext()` 中作為「學員旅程」區塊，引導 AI 引用過去經歷

## 知識注入系統

完整知識在 `lib/knowledge.js`，來源為 27 份課程筆記 + 代謝力重建實驗 Sessions 4-14。

**選取方式：AI 意圖分類（主要）+ regex 降級備案**
- `classifyIntent()`：Gemini Flash Lite ~200 token，temperature 0.1
- 輸入用戶訊息 + 最近 2 則上下文 → 輸出 `{ tags, mood, slices }`
- `tags` 匹配 Tier2 知識塊（最多 2 塊）
- `slices` 決定用戶切片注入（identity 永遠注入 + AI 選取 0-2 塊：lifestyle/body_goal/coaching_trend/journey）
- AI 失敗時自動切換 regex 關鍵字匹配（知識塊），用戶切片回退為全量注入

**Tier 1**（永遠注入 ~800 字元）：代謝重建 ABC、胰島素、菜肉飯順序、蛋白質、好油壞油、外食策略

**Tier 2**（AI 選取，最多 2 塊，共 14 塊）：
膽固醇 / 聚餐 / 肌少症 / 神經習慣 / 蛋白質警訊 / 外部評價 / 暴食心態 / 酒精睡眠 / 壓力進食 / 停滯期 / 隱藏碳水 / 運動恢復 / 代謝信任 / 營養科學

更新流程：新課程筆記 → 更新課程知識總結.md → 更新 knowledge.js Tier2 → push main

## SYSTEM_PROMPT 核心內容

完整 prompt 在 `lib/ai.js`，約 254 行，包含：

1. **7 大核心教學理念**：瘦是附加價值、選擇不是犧牲、注意力的力量、每餐都是新開始、試錯=學習、內在評價>外部評價、用感謝代替責備
2. **營養核心知識**：菜肉飯順序法、拳頭手掌法、蛋白質優先、外食指引、停滯期觀念
3. **一休經典金句**：心態類、失敗挫折類、自我價值類、飲食類（適時自然引用）
4. **回覆風格**：溫暖直接、用比喻說故事、200-400 字、不用 bullet points
5. **7 種常見情境指引**：破戒自責、嘴饞、停滯期、被評價、想放棄、營養問題、非相關問題

## 群組偵測系統

- **訊息 buffer**：每則群組訊息都存入 Redis（不管是不是問題）
- **AI 偵測**：帶上下文判斷，「寧可多抓」策略，含隱晦心態訊號
- **信心指數**：0.0-1.0，推播通知顯示 🔴(80%+) 🟡(60-80%) ⚪(<60%)
- **草稿回覆**：走完整 SYSTEM_PROMPT + 知識注入（不是通用 AI）
- **後台顯示**：群組名稱標籤（班別辨識）+ 學員名 + 分類 + 草稿 + 複製按鈕

## 專案文件導航

| 文件 | 位置 | 用途 |
|------|------|------|
| 執行進度 | `ABC瘦身業務/休校長小幫手/執行進度.md` | 里程碑追蹤 |
| 技術架構 | `ABC瘦身業務/休校長小幫手/技術架構.md` | 詳細技術文件 |
| 課程知識總結 | `ABC文章創作/已創作文案/課程筆記/課程知識總結.md` | 知識注入來源 |
| 工作日誌 | `ABC瘦身業務/工作日誌.md` | 兩個 Bot 共用的每日記錄 |

## 品牌紅線（同幫你算 Bot）

- 不叫生酮，品牌名「ABC 代謝重建瘦身法」
- 不推薦個股、不預測市場
- 不當大師：「我不是比你厲害，只是比你早犯錯」
- 不販賣焦慮：恐懼當鉤子可以，但必須給出路
- 加法思維：增加好的，而非限制壞的
- 台灣用語，不用中國用語

## 一休的工作偏好

- 不要過度問問題，能判斷就直接做
- 合併內容時不要覆蓋，要結合兩邊最好的部分
- 回應要快、要簡潔、先做再說
