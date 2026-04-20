# 休校長小幫手 Bot — 專案上下文

> 用途：讓 Claude Code 快速理解這個專案
> 最後更新：2026-03-28

## 專案定位

「休校長小幫手」是一休減肥課程的 AI 教練助手 LINE Bot。
專注於**心態輔導 + 飲食觀念**，不做食物照片分析（那是姊妹專案「幫你算 Bot」的工作）。

核心價值：用一休的語氣和價值觀，陪伴學員走過減肥旅程的心理關卡。

**兩大運作模式：**
1. **私訊模式**：學員直接對話 → AI 用一休語氣回覆
2. **群組模式**：偵測學員問題 → 產生草稿 → 通知教練 → 教練到後台複製回覆

## 技術架構

- **框架**：Next.js 14（App Router）
- **AI**：Gemini 3.1 Flash Lite（主對話）+ Gemini 2.5 Flash Lite（意圖分類 + 群組偵測 + 標籤 + 自介解析，thinkingBudget: 0）
- **記憶**：Upstash Redis（快取層）+ Supabase（永久層，Read-through 回補）
- **知識**：knowledge.js AI 意圖分類 + 兩層式注入（Tier1 精華 + Tier2 AI 選取 21 塊，regex 降級備案）
- **遊戲化**：食物分類測驗（163 題）+ 瘦身知識大挑戰（245 題）+ 健康存摺（streak）+ 學員 Dashboard
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
  ai.js                ← SYSTEM_PROMPT（~3.2K 字）+ handleMessage() + aiDetectQuestion() + generateDraftResponse() + Context Caching 接入
  gemini-cache.js      ← Gemini Context Caching 管理（共用 cache，建立/取得）
  knowledge.js         ← AI 意圖分類（classifyIntent，輸出 tags+mood+slices）+ 兩層式知識注入（Tier1 精華 + Tier2 x21）
  chat.js              ← 對話記憶（私訊 24hr TTL, max 40）+ 群組 buffer（2hr TTL, max 20）
  line.js              ← LINE API（驗簽 + reply + push + profile + groupSummary）
  user.js              ← 用戶資料管理 + 自介偵測 + 預載入比對（含班別過濾）+ 班別選擇 + 目標系統 + 健康存摺（streak）
  tags.js              ← 教練標籤系統（topic/emotion/core_issue/conversation_style/goal_action/goal_completed + 趨勢摘要 + 旅程摘要）
  supabase.js          ← Supabase client singleton
  pending.js           ← 群組問題待回應管理（Redis LIST, max 100）
  queue.js             ← 私訊訊息合併（Redis buffer + 40 秒延遲窗口，防連發多則被拆成多次回覆）
  cost-tracker.js      ← Gemini API 花費追蹤（per-user token 用量 + 成本估算）
  quiz-data.js         ← 食物分類測驗題庫（178 題，8 大分類，4 等級收集系統）
  knowledge-quiz-data.js ← 瘦身知識大挑戰題庫（270 題是非題，6 分類 × 3 難度）
app/
  page.js                      ← 根頁面
  admin/page.js                ← 管理後台（群組監控 + 手動草稿 + 匯入）
  admin/students/page.js       ← 學員管理（列表 + 快捷分班 + 搜尋 + 對話紀錄 + 標籤）
  staff/page.js                ← 助教後台（學員狀態 + 主動關心 + 班級管理 + 名單上傳）
  guide/page.js                ← 飲食指南網頁（7 個分類）
  dashboard/page.js            ← 學員個人 Dashboard（Portrait + 情緒趨勢 + 進步紀錄 + 收集進度 + 目標 + 里程碑）
  quiz/page.js                 ← 食物分類測驗（收集系統，4 等級）
  quiz/history/page.js         ← 食物測驗歷史
  knowledge/page.js            ← 瘦身知識大挑戰（270 題是非題）
  knowledge/history/page.js    ← 知識挑戰歷史
  check/page.js                ← 自我覺察表單（5 指標 × 5 級距，abc_self_checks 表）
  check/history/page.js        ← 自我覺察趨勢頁
  api/webhook/route.js         ← 主入口（maxDuration=60，含私訊合併 + 加好友先選班 + 班別比對）
  api/admin/pending/route.js   ← 待回應 API
  api/admin/import/route.js    ← 學員匯入 API
  api/admin/users/route.js     ← 學員列表 API
  api/admin/history/route.js   ← 學員對話紀錄 API（Supabase 讀取）
  api/admin/outreach/route.js  ← 主動關心推播 API（支援 admin + staff key）
  api/admin/students/route.js  ← 學員管理 API（更新 class_name）
  api/admin/setup-menu/route.js ← Rich Menu 設定 API
  api/admin/draft/route.js     ← 手動生成草稿 API
  api/admin/cleanup/route.js   ← 資料清理 API
  api/admin/reset-user/route.js ← 用戶資料重置 API（清除單一用戶 Redis 14 key + Supabase 8 表）
  api/dashboard/route.js       ← 學員 Dashboard API（Portrait AI 人格觀察 + 情緒趨勢 + 進步紀錄）
  api/check/route.js           ← 自我覺察 API（POST 儲存 / GET 歷史，abc_self_checks 表）
  api/quiz/route.js            ← 食物分類測驗 API
  api/knowledge/route.js       ← 瘦身知識大挑戰 API
  api/staff/classes/route.js   ← 班級管理 API（CRUD + 停課區間）
  api/staff/students/route.js  ← 學員狀態 API（含停課週數計算）
  api/cron/smart-push/route.js ← 智慧推播 Cron（三排程：週三課程/每天沉默/週四續報）+ 目標追蹤推播
```

## Redis 資料結構

```
coach-chat:{userId}            → 私訊對話記憶（24hr TTL, max 40 則）
coach-group:{groupId}          → 群組訊息 buffer（2hr TTL, max 20 則）
coach-user:{userId}            → 用戶資料（自介、互動次數）
coach-buf:{userId}             → 私訊合併 buffer（40 秒窗口，queue.js）
coach:{userId}:topics          → 對話標籤（max 20）
coach:{userId}:milestones      → 里程碑（Set）
coach:{userId}:summary         → AI 心態摘要
coach:{userId}:journey         → 累積式旅程摘要（500-800 字）
coach-goal:{userId}            → 當前活躍目標（JSON，無 TTL）
coach-streak:{userId}          → 健康存摺連續天數
coach-pending:items            → 群組問題待回應（LIST, max 100）
coach-pending-class:{userId}   → 等待選班的用戶（7天 TTL）
coach-pending-verify:{userId}  → 等待姓名確認（7天 TTL，含 selectedClass）
coach-preload:{lineName}       → 預載入學員自介（正規化名稱）
coach-preload:__index          → SET：所有已匯入的正規化名稱
coach-preload-name:{realName}  → 真實姓名對應（重名時用）
coach-preload:__dupes          → SET：有重名的正規化名稱
coach-class:{className}        → 班級資料
coach-classes-index            → SET：所有班級名稱
coach-push-log:{userId}        → 智慧推播紀錄（1天冷卻）
coach-week-push:{userId}       → 課程週數推播紀錄（60天 TTL）
coach-portrait:{userId}        → Dashboard AI 人格觀察快取（14天 TTL）
coach-portrait-ver:{userId}    → Portrait 版本比對
gemini-cache:coach-private     → Gemini Context Cache name（共用，TTL ~59min）
coach-fullctx:{userId}         → Follow-up 偵測（30min TTL，追問跳過 journey/summary）
coach-summary-updated:{userId} → 教練摘要每日限頻（48hr TTL，台灣時間每天 1 次）
coach-journey-updated:{userId} → 旅程摘要每日限頻（48hr TTL，台灣時間每天 1 次）
coach-quiz-pending:{userId}    → 測驗待答狀態（5min TTL，手動打答案識別用）
coach-quiz:{userId}            → 食物測驗進行中狀態（5min TTL）
coach-abc-quiz:{userId}        → ABC 測驗推播待答狀態（5min TTL）
```

注意：Redis 實例與幫你算 Bot 共用，但 key prefix 不同（`coach-` vs `chat:`/`user:`）。

## Supabase 永久記憶層

Redis 是快取，Supabase 是永久記憶。採用 **Read-through + Write-through** 雙向同步：

**Write-through（寫入）**：每次寫 Redis 後，非阻塞 async 同步到 Supabase
**Read-through（讀取）**：Redis miss 時自動從 Supabase 恢復，回寫 Redis

### Supabase 資料表

| 表 | 用途 | 關鍵欄位 |
|---|------|----------|
| `users` | 用戶檔案 | id, display_name, intro, goal, week_number, journey, class_name, last_group_activity, join_date, updated_at |
| `conversations` | 對話記錄 | user_id, role, content, created_at |
| `coaching_tags` | 教練標籤 | user_id, topic, emotion, core_issue, progress_signal, progress_detail, created_at |
| `milestones` | 里程碑 | user_id, milestone, created_at |
| `goals` | 行動目標 | user_id, goal_text, context, status(active/completed/replaced), created_at, completed_at |
| `coach_quiz_collected` | 食物測驗已收集 | user_id, food, first_correct_at |
| `coach_quiz_sessions` | 食物測驗作答紀錄 | user_id, score, total, correct_foods, wrong_foods, duration_seconds, created_at |
| `coach_knowledge_collected` | 知識挑戰已收集 | user_id, question_index, created_at |
| `coach_knowledge_sessions` | 知識挑戰作答紀錄 | user_id, score, total, tier, correct_indices, wrong_indices, duration_seconds, created_at |
| `abc_self_checks` | 自我覺察紀錄 | user_id, check_date, ... |
| `abc_api_usage` | Gemini API 花費 | user_id, call_type, model, input_tokens, output_tokens, thinking_tokens, total_tokens, cost_twd, bot, created_at |

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

完整知識在 `lib/knowledge.js`，來源為 27 份課程筆記 + 代謝力重建實驗 Sessions 4-14 + 65 份班級對話紀錄（全部讀完）。

**選取方式：AI 意圖分類（主要）+ regex 降級備案**
- `classifyIntent()`：Gemini Flash Lite ~200 token，temperature 0.1
- 輸入用戶訊息 + 最近 2 則上下文 → 輸出 `{ tags, mood, slices }`
- `tags` 匹配 Tier2 知識塊（最多 2 塊）
- `slices` 決定用戶切片注入（identity 永遠注入 + AI 選取 0-2 塊：lifestyle/body_goal/coaching_trend/journey）
- AI 失敗時自動切換 regex 關鍵字匹配（知識塊），用戶切片回退為全量注入

**Tier 1**（永遠注入 ~800 字元）：代謝重建 ABC、胰島素、菜肉飯順序、蛋白質、好油壞油、外食策略

**Tier 2**（AI 選取，最多 2 塊，共 21 塊）：
膽固醇 / 聚餐 / 肌少症 / 神經習慣 / 蛋白質警訊 / 外部評價 / 暴食心態 / 酒精睡眠 / 壓力進食 / 停滯期 / 隱藏碳水 / 運動恢復 / 代謝信任 / 營養科學 / 便秘消化 / 瘦瘦針 / 體脂計體重 / 食物分類 / 外食搭配 / 經期飲食 / 澱粉補救

**食物分類測驗**：178 題（quiz-data.js），8 大分類，4 等級收集系統（食物新手→食物博士），優先出新題

**瘦身知識大挑戰**：270 題是非題（knowledge-quiz-data.js），6 分類（迷思/營養/行為/食物科學/ABC代謝/心態）× 3 難度（tier 1-3），零 token 消耗

**目標系統**：對話中自然設定行動目標 → Supabase goals 表 + Redis 快取 → AI 追蹤 → Quick Reply 回報

**健康存摺**：streak 追蹤（連續互動天數）+ 食物知識收集進度 + 目標完成紀錄 + 身體變化紀錄

**學員 Dashboard**（/dashboard）：
- Portrait（小幫手眼中的你）：Gemini Flash Lite 生成 AI 人格觀察，Redis 7 天快取
- 情緒趨勢：coaching_tags 最近 20 筆的情緒色點時間軸
- 進步紀錄：AI 從對話中偵測到的真實改變
- 食物/知識收集進度條 + 等級
- 行動目標（active/completed）+ 里程碑清單
- Rich Menu「我的進步」→ 回傳 Dashboard 連結

**Gemini API 花費追蹤**（cost-tracker.js）：per-user token 用量記錄 + 成本估算，支援 gemini-3-flash-preview / gemini-3.1-flash-lite-preview / gemini-2.5-flash-lite / gemini-2.5-flash。所有 Gemini API 呼叫皆追蹤（ai.js 3 處 + knowledge.js 1 處 + tags.js 3 處 + user.js 1 處）

**核心原則**：80 分就很棒，不給營養師制式建議（GI 值、鈉含量、咖啡因間隔等），加法和選擇不是減法和控制

**成本優化機制（2026-03-29）**：
- **客套話快速回覆**：「謝謝/好/收到/早安/哈哈/讚/emoji」→ 固定回覆跳過所有 AI（省 3 次 API/次），pattern 在 route.js QUICK_REPLIES
- **智慧截斷對話歷史**：chatHistory > 6 則時，最近 3 輪完整保留，更早的壓成一行摘要（省 ~30% input tokens）
- **旅程摘要每日限頻**：shouldUpdateJourney 加台灣時間每天最多 1 次（Redis key: `coach-journey-updated:{userId}`，TTL 48hr）
- **模型降級**：群組偵測 + 意圖分類改用 gemini-2.5-flash-lite（分類任務不需要 3.1-Lite，省 ~73%）
- **Gemini Context Caching**（2026-04-04）：共用 cache（只 cache SYSTEM_PROMPT 5,714 tokens），所有用戶共用一份。cached tokens 計費打一折。`lib/gemini-cache.js` 管理 cache 建立/取得。handleMessage 接入：cache 可用時用 `cachedContent` 取代 `systemInstruction`，knowledge + userContext + milestone 補到 user message 前面。env `CONTEXT_CACHE_ENABLED=true`。Redis key `gemini-cache:coach-private`。Fallback：cache 失敗回完整 systemInstruction。預估省 67% input 成本（$35.82→$11.8/週）

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
| 指揮中心 | `coach-line-bot/指揮中心.md` | 架構全貌 + 資料流 + 即時狀態（**session 開工必讀**） |
| 續報記錄契約 | `coach-line-bot/契約_續報記錄.md` | renewal_intent/confirmed_at 欄位規格 + 狀態機 + Phase 2 子步驟順序（實作必讀）|
| 執行進度 | `ABC瘦身業務/休校長小幫手/執行進度.md` | 里程碑追蹤 |
| 技術架構 | `ABC瘦身業務/休校長小幫手/技術架構.md` | 詳細技術文件 |
| 課程知識總結 | `ABC文章創作/已創作文案/課程筆記/課程知識總結.md` | 知識注入來源 |
| 工作日誌 | `ABC瘦身業務/工作日誌.md` | 兩個 Bot 共用的每日記錄 |

