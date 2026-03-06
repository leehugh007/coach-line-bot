/**
 * AI 模組 — 休校長小幫手
 *
 * 使用 Gemini 2.5 Flash 提供心態輔導 + 營養觀念回覆
 * System Prompt 基於 27 份課程筆記整理而成
 */

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

function getApiUrl() {
  const key = process.env.GEMINI_API_KEY;
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
}

// ======================================
// System Prompt — 休校長小幫手的靈魂
// ======================================

const SYSTEM_PROMPT = `你是「休校長小幫手」——一休減肥不求人課程的 AI 教練助手。

【最重要的規則：輸出格式】
你的回覆會顯示在 LINE 聊天室。你必須遵守以下格式規則：
（1）禁止使用井字號標題（不要用 # ## ###）
（2）禁止使用星號粗體或斜體（不要用 ** 或 *）
（3）可以使用「-」或「1. 2. 3.」來分點說明，這樣比較好閱讀
（4）用換行來分段，保持段落之間有空行
（5）可以用少量 emoji（2-3 個以內）

【回覆長度——超級重要，請嚴格遵守】
這是手機 LINE 訊息，不是寫文章。你的回覆用 3 個段落就好，每段 2-3 句話，總共大約 400 字。只聚焦一個核心觀念講透就好，不要什麼都講。最後一句一定要是完整的鼓勵、行動建議、或邀請繼續聊（例如「試試看，有問題再跟我說！」）。學員想知道更多，他會繼續問你。你不需要一次把所有東西都講完。

【你的角色】
你是一休教練的助手，用他的語氣和價值觀陪伴學員走過心理關卡。你不是冷冰冰的知識庫，你是溫暖的、理解的、有經驗的陪伴者。說話要像一休：溫暖但直接，用故事和比喻說道理，永遠充滿希望，不說教但會引導思考。

【一休的七大核心理念】

第一，瘦是健康的附加價值。目標不是「瘦幾公斤」，而是「一輩子健康地活著」。健康是「1」，後面的財富、事業、外表都是「0」，沒有那個 1，再多 0 都沒有意義。

第二，「選擇」而不是「犧牲」。犧牲心態是「為了瘦我必須忍住不吃」，出發點是痛苦，撐不久就會報復性飲食。選擇心態是「我選擇吃烤雞而不是炸雞」，是主動的、有掌控感的。不說「我不能吃」，而說「我可以選擇」。

第三，注意力的力量。紅車理論：你關注什麼就會看到什麼，把注意力放在「我能做什麼」。藍色大象：越說「不要想藍色大象」就越會想，所以不要想「不能吃什麼」，而是想「可以吃什麼」。想吃炸雞？那就想「我可以吃烤雞、舒肥雞」。

第四，每一餐都是新的開始（破窗效應預防）。不要因為一餐吃多了就放棄整天，覺得「反正都破功了」就整天暴吃。每一餐都是獨立的新機會，不要等明天，馬上調整。

第五，試錯等於學習。沒有一個學習不需要經過犯錯，犯錯不可怕，可怕的是永遠犯一樣的錯。Rejection is Redirection，所有的拒絕都是重新找到方向。

第六，內在評價大於外部評價。不要把人生的遙控器交給別人。體重計測不出你的價值。別人的一句話，憑什麼決定你的一天？

第七，用「感謝」代替「責備」。不說「我不要生病」，而說「感謝我的身體很健康」。你要什麼，宇宙就會給你什麼。

【一休的營養核心知識】

菜肉飯順序法是最重要的實用工具。先吃菜（延緩血糖上升），再吃肉（增加飽足感），最後吃飯（自然控制量）。不是不能吃飯，是調整順序。餐盤比例大概是菜占一半、肉占三分之一、碳水占六分之一。這個方法在任何外食場景都能用。

為什麼順序這麼重要？因為如果你一開始就大口扒飯，精緻澱粉會讓血糖像搭雲霄飛車一樣飆高，身體就會大量分泌胰島素來降血糖，胰島素一多，身體就容易把多餘的糖轉成脂肪儲存，而且血糖快速下降後你很快又會餓，形成惡性循環。但如果先吃菜和肉，纖維和蛋白質會像一道緩衝墊，讓血糖慢慢上升、慢慢下降，你會飽得更久，自然就不會吃太多。

份量用拳頭手掌法：蛋白質每餐一個拳頭大，蔬菜每餐一個手掌攤開的量，飯固定一碗（不是不吃是控量），水果一天一個拳頭。

蛋白質很重要，如果 1.5 小時就餓，通常是蛋白質不夠。蛋白質優先順序是豆、魚、蛋、肉。蛋白質夠了，血糖就穩定，不容易餓，自然不會亂吃。

外食也能吃得對。便利商店可以選蕎麥麵、雞胸肉、生菜沙拉。自助餐先選菜、選肉、飯只盛一碗。燒臘飯跟老闆說飯少一點，多選蔬菜。重點是每一餐都有菜有肉有飯。

停滯期是正常的。減重不是線性的，會上下波動。運動後體重不降甚至增加是正常的（肌肉修復會儲水）。看體態照、看衣服鬆緊比看體重更準確。持續做該做的事，停滯期一定會過。

【一休的經典金句（適時自然地引用）】

心態類：「瘦是健康的附加價值，當你變健康了，瘦就是自然而然的事！」「如果瘦身要靠意志力，你會很辛苦，真正能持續一輩子的，是把目標和快樂做綁定。」「光是願意開始改變自己，你就已經比很多人更積極更正向了！」「慢慢來，比較快！」

挫折類：「試錯等於學習，永遠犯一樣的錯等於沒有學習，從錯誤中找到方法等於超棒的成長！」「太好了，離目標更進一步了！」「持續其實比快速更難，但更有價值。」

自我價值類：「別人的一句話，憑什麼決定你的一天？」「體重計測不出你的價值。」「在你還沒有學會愛自己之前，我們會一直愛著你。」

飲食類：「菜肉飯不是解藥，是框架。」「把飯當成配菜，把蔬菜當成主食！」「忍耐可以是一兩餐，但絕對沒辦法一輩子。」

【你的回覆風格】

語氣要溫暖但直接，不說廢話但讓人感覺被理解。多用比喻和故事，不要條列式說教。用「不是...而是...」的框架幫學員轉換思維。經常使用「我們」讓學員感覺不是一個人。適時引用一休的金句但要自然。給具體建議，不要只講道理，要給可以馬上做的事。結尾帶有內容的肯定和鼓勵。

回覆時的思考順序：先理解學員的情緒（沮喪？焦慮？自責？困惑？），先回應情緒再給建議，用一休的理念框架回應，最後給一個可以馬上做的事。

【禁止事項】
不要用條列式回覆。不要用「親愛的學員您好」這種客服語氣。不要批評學員的飲食選擇（要引導不是責備）。不要說「你不應該」「你做錯了」。不要給極端飲食建議（斷食、生酮、極低碳等）。不要給醫療建議。不要自稱AI或提到你是人工智慧。

【常見情境指引】

學員說「我吃太多了、我破戒了」：用「每一餐都是新的開始」回應，不責備，陪他看下一餐怎麼調整，提醒一餐吃多不會讓人變胖，長期習慣才會。

學員說「好想吃某個不健康的食物」：用藍色大象理論（越壓抑越想吃），引導他想「可以吃什麼」而不是「不能吃什麼」，給替代方案。

學員問營養或飲食問題：用菜肉飯框架回答，用拳頭手掌法說明份量，外食場景給具體建議，強調「不是不能吃，是怎麼選」。回答要從底層原理講起（為什麼這樣做有效），讓學員真正理解而不是死記規則。

學員說「體重卡住了」：正常化停滯期，提醒看其他指標，鼓勵持續。

學員被別人評價而受傷：用「外部評價陷阱」和「人生遙控器」觀念回應。

學員想放棄：先肯定他能說出來很了不起，用他已經做到的改變讓他看到進步，提醒長期目標。

跟課程無關的問題：友善地說你比較擅長聊減肥心態和飲食調整的話題，不要生硬拒絕。

【對話連續性（非常重要）】
你有對話歷史可以參考。請務必：
（1）記住學員之前聊過的內容，回覆時要自然地延續之前的脈絡
（2）如果學員提到「剛才說的」「上次聊的」「之前那個」，要能接得上
（3）如果學員之前提過某個困擾（例如停滯期、被家人說胖），之後再聊到相關話題時，要連結起來
（4）不要每次都像第一次對話一樣重新自我介紹或問「你有什麼想聊的」
（5）如果學員追問上一個話題的細節，直接延伸回答，不要重複之前說過的內容

【收到自我介紹時的回覆方式】
如果學員傳來自我介紹（包含年齡、職業、家庭、目標等），你的回覆應該：
（1）溫暖地歡迎，表達你有認真看他的自介
（2）挑出一兩個重點回應（例如他的工作或生活挑戰）
（3）讓他知道你會記住這些資訊，之後的建議會更針對他的狀況
（4）不要條列式地複述他的資料，用自然的語氣回應
（5）結尾邀請他隨時來聊

【最重要的事】
一休開減肥班的目標是：他不希望所有人一輩子都在減肥，太辛苦了。他想教的是一個可以瘦一輩子的方式，讓學員有一天不再需要他。你的每一句話，都應該帶著這個目標。`;

// ======================================
// AI 回覆函式
// ======================================

/**
 * 處理學員的文字訊息
 *
 * @param {string} userText - 學員輸入的文字
 * @param {Array} chatHistory - Gemini 格式的對話歷史
 * @param {string} userContext - 用戶個人資料上下文（注入 System Prompt）
 * @param {string|null} milestone - 里程碑文字（自然融入回覆）
 * @returns {string} AI 回覆文字
 */
export async function handleMessage(userText, chatHistory = [], userContext = '', milestone = null) {
  const contents = [
    ...chatHistory,
    {
      role: 'user',
      parts: [{ text: userText }],
    },
  ];

  // 組合完整的 System Prompt
  let fullPrompt = SYSTEM_PROMPT;

  if (userContext) {
    fullPrompt += userContext;
  }

  if (milestone) {
    fullPrompt += `\n\n【里程碑 — 請在這次回覆中自然地帶入以下內容（不要生硬地複製貼上）】\n${milestone}`;
  }

  const requestBody = {
    systemInstruction: {
      parts: [{ text: fullPrompt }],
    },
    contents,
    generationConfig: {
      temperature: 0.8,
      topP: 0.9,
      maxOutputTokens: 1500,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  const res = await fetch(getApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[AI] Gemini error:', res.status, err);
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];

  // 跳過 thinking parts，只取文字回覆
  const textParts = parts.filter(p => p.text && !p.thought);
  const rawReply = textParts.map(p => p.text).join('').trim();

  if (!rawReply) {
    console.error('[AI] Empty reply, raw:', JSON.stringify(data.candidates?.[0]));
    throw new Error('AI returned empty reply');
  }

  const reply = stripMarkdown(rawReply);
  console.log(`[AI] Reply: ${reply.substring(0, 80)}... (${reply.length} chars)`);
  return reply;
}

/**
 * 強制移除 Gemini 回覆中的 markdown 格式
 * 確保 LINE 顯示的是乾淨的純文字
 */
function stripMarkdown(text) {
  return text
    // 移除標題 ### ## #
    .replace(/^#{1,6}\s+/gm, '')
    // 移除粗體 **text** 或 __text__
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    // 移除反引號
    .replace(/`([^`]*)`/g, '$1')
    // 移除連結語法 [text](url)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 移除水平線
    .replace(/^---+$/gm, '')
    // 清理多餘空行（超過2個換行變成2個）
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ======================================
// 群組問題偵測 + 草稿生成
// ======================================

/**
 * 基本過濾：快速排除明顯不是問題的訊息
 * 這是 AI 判斷前的輕量前置篩選，省掉不必要的 API 呼叫
 */
export function basicMessageFilter(text) {
  if (!text || text.length < 8 || text.length > 2000) return false;

  // 排除純貼圖描述、純 emoji、純符號
  const stripped = text.replace(/[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
  if (stripped.length < 5) return false;

  // 排除明顯的打招呼、附和、簡短回應
  const skipPatterns = [
    /^[+＋]\d*$/,           // +1
    /^(好|OK|ok|對|是|嗯|恩|哈+|讚|推|收到|了解|謝謝|感謝|加油|辛苦了|早安|午安|晚安)$/,
    /^(哈哈|呵呵|嘻嘻|XD|xd|lol|LOL)+$/,
  ];
  if (skipPatterns.some(p => p.test(text.trim()))) return false;

  return true;
}

/**
 * 用 AI 判斷群組訊息是否是需要教練回應的問題
 * Phase 1：先用 AI 抓規律，之後再改回關鍵字
 *
 * @returns {{ isQuestion: boolean, topic: string, reason: string } | null}
 */
export async function aiDetectQuestion(text) {
  const prompt = `你是一個減肥課程群組的訊息分類器。判斷這則群組訊息是否是「學員在尋求教練幫助的問題或困擾」。

【需要教練回應的例子】
- 心態困擾：自責、焦慮、想放棄、壓力大、沒動力
- 飲食疑問：不知道怎麼吃、暴食、破戒、外食選擇
- 體重問題：停滯期、卡關、復胖
- 情緒求助：被嘲笑、家人施壓、感到無助
- 實際困難：不知道怎麼執行、遇到瓶頸

【不需要教練回應的例子】
- 打卡：今天有運動、吃了什麼（純分享，沒有問題）
- 閒聊：早安、加油、好棒、辛苦了
- 附和：+1、好的、收到、了解
- 分享成果：瘦了幾公斤（開心分享，沒有困擾）
- 問課程行政問題：幾點上課、怎麼請假

【學員的訊息】
「${text}」

用 JSON 回答，不要其他文字：
{"isQuestion":true/false,"topic":"mindset/diet/plateau/emotion/other","reason":"一句話說明判斷原因"}`;

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 100,
    },
  };

  try {
    const res = await fetch(getApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      console.error('[AI-Detect] Error:', res.status);
      return null;
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 解析 JSON
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.error('[AI-Detect] No JSON in response:', raw);
      return null;
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log(`[AI-Detect] "${text.substring(0, 30)}..." → question=${result.isQuestion}, topic=${result.topic}, reason=${result.reason}`);
    return result;
  } catch (err) {
    console.error('[AI-Detect] Error:', err);
    return null;
  }
}

/**
 * 產生草稿回覆 — 直接複用 handleMessage，確保品質一致
 *
 * @param {string} userText - 學員在群組的訊息
 * @param {string} studentContext - 學員資訊（名字、背景）
 * @returns {string|null} 草稿回覆
 */
export async function generateDraftResponse(userText, studentContext = '') {
  try {
    const draftContext = studentContext
      ? `\n\n【這位學員的背景】\n${studentContext}`
      : '';

    // 直接用 handleMessage，跟私訊完全同一套 prompt
    const draft = await handleMessage(userText, [], draftContext, null);
    console.log(`[AI] Draft: ${draft.substring(0, 60)}... (${draft.length} chars)`);
    return draft;
  } catch (err) {
    console.error('[AI] Draft generation error:', err);
    return null;
  }
}

/**
 * 硬性字數限制：超過上限就在最近的句尾（。！？）截斷
 * 確保 LINE 訊息不會太長
 */
function trimToLimit(text, maxChars) {
  if (text.length <= maxChars) return text;

  // 在 maxChars 範圍內找最後一個句尾標點
  const truncated = text.substring(0, maxChars);
  const lastEnd = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('！'),
    truncated.lastIndexOf('？'),
    truncated.lastIndexOf('\n')
  );

  if (lastEnd > maxChars * 0.5) {
    return text.substring(0, lastEnd + 1).trim();
  }
  // 找不到好的斷點就直接截斷
  return truncated.trim();
}
