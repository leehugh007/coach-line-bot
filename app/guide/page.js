'use client';
import { useState } from 'react';

// ===== 食物分類資料 =====
const FOOD_CATEGORIES = [
  {
    id: 'starch',
    name: '澱粉類',
    emoji: '🍚',
    color: '#E8734A',
    desc: '跟飯加起來一拳頭',
    items: [
      { name: '白飯', note: '半碗~一拳頭', tag: '主食' },
      { name: '地瓜', note: '200g≈一餐澱粉，好的原型澱粉', tag: '推薦' },
      { name: '南瓜', note: '好的原型澱粉，跟飯加起來一拳頭', tag: '推薦' },
      { name: '玉米', note: '是澱粉不是蔬菜！一根≈一餐澱粉量', tag: '常搞混' },
      { name: '山藥', note: '是澱粉，跟飯合計一拳頭', tag: '常搞混' },
      { name: '馬鈴薯', note: '是澱粉不是蔬菜，好的原型澱粉', tag: '常搞混' },
      { name: '蓮藕', note: '是澱粉，可替代白飯', tag: '常搞混' },
      { name: '菱角', note: '是澱粉，20顆≈一餐', tag: '常搞混' },
      { name: '皇帝豆', note: '是澱粉不是蛋白質', tag: '常搞混' },
      { name: '栗子', note: '是澱粉', tag: '常搞混' },
      { name: '薏仁', note: '是澱粉（四神湯裡的也算）', tag: '常搞混' },
      { name: '冬粉', note: '是澱粉，跟飯不要同時吃', tag: '常搞混' },
      { name: '米血糕/豬血糕', note: '是澱粉加工品', tag: '常搞混' },
      { name: '芋粿', note: '是澱粉，份量大，一個拳頭就好', tag: '注意' },
      { name: '麵茶', note: '是澱粉！2湯匙≈1/4碗飯', tag: '常搞混' },
      { name: '燕麥奶', note: '是澱粉不是奶！通常還加油', tag: '常搞混' },
      { name: '糙米/五穀飯', note: '比白飯好，好的原型澱粉', tag: '推薦' },
      { name: '水餃', note: '6-8顆≈一餐澱粉量', tag: '注意' },
      { name: '鷹嘴豆/雪蓮子', note: '是澱粉，跟飯加起來一拳頭', tag: '常搞混' },
    ]
  },
  {
    id: 'protein',
    name: '蛋白質',
    emoji: '🥩',
    color: '#4AAD8E',
    desc: '每餐一手掌（含手指）',
    items: [
      { name: '雞胸肉', note: '低脂優質蛋白', tag: '推薦' },
      { name: '雞腿（去皮）', note: '去皮後是好選擇', tag: '推薦' },
      { name: '豬里肌', note: '低脂豬肉首選', tag: '推薦' },
      { name: '牛板腱', note: '100g=100大卡，火鍋首選！', tag: '推薦' },
      { name: '魚/海鮮', note: '蝦、蛤蜊、魚片都很好', tag: '推薦' },
      { name: '雞蛋', note: '一天2-3顆沒問題，蛋黃放心吃', tag: '推薦' },
      { name: '板豆腐/嫩豆腐', note: '好的植物蛋白', tag: '推薦' },
      { name: '豆乾', note: '好的植物蛋白', tag: '推薦' },
      { name: '生豆皮', note: '好的植物蛋白（不是炸豆皮）', tag: '推薦' },
      { name: '毛豆', note: '是蛋白質不是蔬菜！好的植物蛋白', tag: '常搞混' },
      { name: '無糖豆漿', note: '是蛋白質，首選蛋白質飲品', tag: '推薦' },
      { name: '牛小排', note: '100g=400大卡！是板腱的4倍', tag: '注意' },
      { name: '豬五花/豬梅花', note: '油脂非常高，盡量避免', tag: '注意' },
      { name: '雞翅', note: '雞肉裡脂肪最高的部位', tag: '注意' },
      { name: '蒸蛋', note: '水分多飽足感不夠，換豆乾/滷蛋更耐餓', tag: '注意' },
      { name: '鮭魚/鯖魚', note: '好的蛋白質+好油，可去皮', tag: '推薦' },
      { name: '蒟蒻麵/豆腐麵', note: '豆腐麵是蛋白質但不能替代澱粉', tag: '常搞混' },
    ]
  },
  {
    id: 'fat',
    name: '油脂類',
    emoji: '🥑',
    color: '#D4A855',
    desc: '堅果一平湯匙/天',
    items: [
      { name: '酪梨', note: '是油脂不是蔬菜也不是水果', tag: '常搞混' },
      { name: '堅果', note: '一天一平湯匙（白色免洗湯匙不凸出來）', tag: '注意' },
      { name: '橄欖油/苦茶油', note: '好油，炒菜淋菜都好', tag: '推薦' },
      { name: '酪梨油', note: '好油', tag: '推薦' },
      { name: '奶油/椰子油', note: '碳水控好的前提下可以用', tag: '推薦' },
      { name: '花生/花生粉', note: '是油脂不是蛋白質！量大不用再加油', tag: '常搞混' },
      { name: '椰奶', note: '是油脂不是乳製品', tag: '常搞混' },
      { name: '杏仁奶', note: '是油脂不是奶', tag: '常搞混' },
      { name: '百頁豆腐', note: '油脂非常高！不是好豆腐，改選板豆腐', tag: '常搞混' },
      { name: '黑芝麻', note: '是油脂/堅果種子類，一天一湯匙', tag: '注意' },
      { name: '沙茶醬', note: '含糖含油，少用', tag: '注意' },
      { name: '千島醬', note: '500大卡/100g！蛋黃+大量油做的', tag: '注意' },
      { name: '美乃滋', note: '幾乎都是油', tag: '注意' },
    ]
  },
  {
    id: 'vegetable',
    name: '蔬菜',
    emoji: '🥬',
    color: '#5B9E4A',
    desc: '每餐至少一拳頭（熟菜）',
    items: [
      { name: '各種葉菜類', note: '高麗菜、青江菜、地瓜葉⋯全部都好', tag: '推薦' },
      { name: '各種菇類', note: '金針菇、杏鮑菇、香菇都算', tag: '推薦' },
      { name: '大番茄', note: '是蔬菜（小番茄才是水果）', tag: '常搞混' },
      { name: '小黃瓜', note: '隨身攜帶的蔬菜救星', tag: '推薦' },
      { name: '海帶/海藻', note: '是蔬菜/膳食纖維', tag: '推薦' },
      { name: '木耳', note: '膳食纖維，無糖黑白木耳露也算', tag: '推薦' },
      { name: '玉米筍', note: '是蔬菜（玉米是澱粉，玉米筍是蔬菜）', tag: '常搞混' },
      { name: '秋葵', note: '好蔬菜，鹹水雞常選', tag: '推薦' },
      { name: '泡菜', note: '鹽糖醃漬，不算理想蔬菜來源', tag: '注意' },
      { name: '筊白筍/白蘿蔔', note: '超商關東煮可選的蔬菜', tag: '推薦' },
    ]
  },
  {
    id: 'fruit',
    name: '水果',
    emoji: '🍎',
    color: '#CC6B8E',
    desc: '一天兩拳頭，分兩次吃',
    items: [
      { name: '芭樂', note: '減重首選水果（去籽，中心籽糖量不低）', tag: '推薦' },
      { name: '莓果類', note: '藍莓、草莓都很好', tag: '推薦' },
      { name: '柑橘類', note: '橘子、柳丁、葡萄柚', tag: '推薦' },
      { name: '蘋果', note: '好選擇，一拳頭', tag: '推薦' },
      { name: '小番茄', note: '是水果不是蔬菜！', tag: '常搞混' },
      { name: '香蕉', note: '一根(15cm)≈兩份水果！注意份量', tag: '注意' },
      { name: '芒果/荔枝', note: '比較甜，注意份量（半拳頭）', tag: '注意' },
      { name: '西瓜', note: '可以吃，注意份量', tag: '注意' },
      { name: '果汁', note: '打成汁營養氧化+無纖維，吃原型水果比較好', tag: '注意' },
      { name: '果乾', note: '除非無添加風乾型，否則含大量油糖。20g=一份水果', tag: '注意' },
    ]
  },
  {
    id: 'processed',
    name: '加工品',
    emoji: '⚠️',
    color: '#888',
    desc: '偶爾吃就好，換原型食物更好',
    items: [
      { name: '火腿 → 里肌肉', note: '加工品，換原型肉', tag: '替換' },
      { name: '培根 → 原型肉', note: '一定是肥的，換掉', tag: '替換' },
      { name: '肉鬆 → 水煮鮪魚', note: '加工程度高', tag: '替換' },
      { name: '香腸 → 雞腿去皮', note: '加大量鹽跟亞硝酸鹽', tag: '替換' },
      { name: '貢丸 → 板豆腐', note: '100g=238大卡！一斤=1440大卡', tag: '替換' },
      { name: '甜不辣 → 板豆腐', note: '澱粉+加工品', tag: '替換' },
      { name: '蟹味棒 → 蝦仁', note: '加工程度高', tag: '替換' },
      { name: '油豆腐 → 板豆腐', note: '是炸過的！', tag: '替換' },
      { name: '三角豆包 → 生豆皮', note: '是炸過的！', tag: '替換' },
      { name: '花枝丸', note: '1-2個OK但不要當主要蛋白質', tag: '注意' },
      { name: '冷凍炸物', note: '不管怎麼加熱都算炸物（出廠已預炸）', tag: '注意' },
      { name: '薯餅', note: '預炸加工品', tag: '注意' },
    ]
  },
];

// ===== 外食場景資料 =====
const EATING_OUT = [
  {
    id: 'convenience',
    name: '便利商店',
    emoji: '🏪',
    items: [
      '萬用組合：茶葉蛋2顆 + 無糖豆漿 + 生菜沙拉（和風醬用沾的）+ 地瓜半條',
      '蔬菜不夠？帶小黃瓜和大番茄出門（營養師叫它「左右護法」）',
      '沙拉選全家海藻沙拉比較好吃',
      '醬料替代：無糖優格直接倒沙拉上當醬',
      '飯糰選雞肉口味不選肉鬆',
      '地瓜選$30以下的份量比較剛好',
      '關東煮可選筊白筍、白蘿蔔、杏鮑菇當蔬菜',
    ],
    avoid: '三明治（麵包量多）、奶茶、含糖飲料',
  },
  {
    id: 'buffet',
    name: '自助餐/便當',
    emoji: '🍱',
    items: [
      '關鍵：三格配菜都選蔬菜，才剛好一餐的蔬菜量',
      '主菜：滷雞腿去皮 > 烤魚 > 炸排骨去皮',
      '飯減半，或請老闆多一份青菜換飯',
      '去油法：把菜放到沒吃的飯上面滾一滾',
      '夾菜夾上層的（底下浸汁較油較鹹）',
      '深綠色蔬菜優先選擇',
    ],
    avoid: '糖醋、三杯、紅燒、蜜汁（都加很多糖）、茄子（通常過油）',
  },
  {
    id: 'breakfast',
    name: '早餐店',
    emoji: '🥞',
    items: [
      '推薦：去醬里肌蔬菜蛋餅 + 無糖豆漿',
      '吐司只吃一片夾料，全麥優先',
      '補蔬菜：自備小黃瓜，或請老闆蛋餅加蔬菜',
      '飲料：無糖豆漿 > 低脂鮮奶 > 無糖紅茶',
      '貝果去醬，選原味/全麥',
    ],
    avoid: '薯餅（預炸）、火腿培根肉鬆（加工品）、奶茶、米漿、蔥抓餅（油量超高）、粉漿蛋餅（吃一半就好）',
  },
  {
    id: 'hotpot',
    name: '火鍋',
    emoji: '🍲',
    items: [
      '外食首選！一人一鍋可以自己控制',
      '湯底：清湯、昆布 ✅ ｜麻辣、牛奶、起司 ❌',
      '順序：蔬菜先煮先撈 → 再放肉 → 湯不喝',
      '肉選牛板腱（100大卡）不選牛小排（400大卡）！差4倍',
      '豬選里肌不選梅花（梅花=肥）',
      '火鍋料全換成蔬菜（直接跟店員說）',
      '沾醬：蘿蔔泥+蒜末+薄鹽醬油+白醋+辣椒',
      '用菜盤裡的芋頭/南瓜/玉米當原型澱粉',
    ],
    avoid: '沙茶醬（超油）、火鍋料（加工品）、冬粉跟飯不要同時點',
  },
  {
    id: 'luwei',
    name: '滷味/鹹水雞',
    emoji: '🍢',
    items: [
      '好選擇：豆乾、板豆腐、滷蛋、各種青菜、雞肉、花椰菜',
      '鹹水雞是夜市最佳選擇！三樣蔬菜+雞胸肉',
      '跟老闆說不要加香油',
      '不加肉燥',
      '多喝水（鈉高）',
    ],
    avoid: '百頁豆腐（油脂高）、油豆腐（炸的）、甜不辣（加工品）、科學麵',
  },
  {
    id: 'noodle',
    name: '麵食',
    emoji: '🍜',
    items: [
      '清湯麵不喝湯 > 乾麵（拌油更多）',
      '牛肉麵選清燉 > 紅燒',
      '炒飯炒麵吸油多，改白飯湯麵',
      '麵量抓一拳頭',
    ],
    avoid: '羹麵（勾芡=隱藏澱粉）、大腸麵線（麵線是炸過的）、肉燥乾麵（油脂高）',
  },
  {
    id: 'japanese',
    name: '日式料理',
    emoji: '🍣',
    items: [
      '很推薦！日本人沒那麼胖是有原因的',
      '生魚片：幾乎零加工，低熱量高蛋白',
      '定食：魚定食最好，豬排雞排選里肌的',
      '高麗菜絲無限續！多吃就對了',
      '味噌湯可以喝',
      '選五穀飯或糙米飯',
    ],
    avoid: '炸物類（炸蝦、炸豬排優先選烤的）',
  },
  {
    id: 'korean',
    name: '韓式燒肉',
    emoji: '🥓',
    items: [
      '肉選牛舌、牛板腱、雞胸、章魚 ✅',
      '用生菜包肉（增加蔬菜量）',
      '多點泡菜、各種蔬菜、海帶芽湯',
      '年糕可以吃一點點解饞，不當主食',
    ],
    avoid: '豬五花、豬梅花（太肥）',
  },
  {
    id: 'western',
    name: '西餐',
    emoji: '🥩',
    items: [
      '牛排選菲力（比較瘦）',
      '開胃菜選生菜沙拉、烤蔬菜',
      '配菜選烤蔬菜、烤馬鈴薯（跟店家說不要奶油）',
      '醬料：鹽、芥末、Wasabi 就好（Wasabi配牛排其實很搭）',
    ],
    avoid: '濃湯、焗烤、千島醬、黑胡椒醬、起司醬',
  },
  {
    id: 'chinese',
    name: '中式合菜/喜宴',
    emoji: '🥢',
    items: [
      '餐前先喝300-500cc水',
      '先夾清蒸海鮮（鮑魚、龍蝦、魚）、各種青菜、白斬雞',
      '以茶代酒',
      '吃慢一點、多聊天、放下筷子、多幫別人夾菜',
      '主動點菜，掌握主動權',
      '穿合身一點的衣服（提醒自己不要吃太撐）',
    ],
    avoid: '勾芡羹湯（超甜超油）、糖醋、獅子頭、炒飯炒麵、甜湯甜點',
  },
  {
    id: 'pasta',
    name: '義大利麵',
    emoji: '🍝',
    items: [
      '醬料排序：清炒 > 紅醬 > 粉紅醬 > 白醬（油脂遞增）',
      '青醬健康但油量高，盤底會有一層油',
      '麵條選細麵/天使麵（少沾醬）',
      '配菜選蔬菜和海鮮',
    ],
    avoid: '筆管麵/螺旋麵（會卡很多醬料）、培根奶油義大利麵（617大卡/100g）',
  },
  {
    id: 'subway',
    name: 'Subway',
    emoji: '🥪',
    items: [
      '麵包選燕麥',
      '肉選原味嫩雞或照燒嫩雞',
      '菜可以加多',
      '醬選橄欖油或紅酒醋',
    ],
    avoid: '千島醬、凱薩醬、濃湯（高脂有些高糖）',
  },
  {
    id: 'nightmarket',
    name: '夜市',
    emoji: '🏮',
    items: [
      '鹹水雞（超推！菜多、選雞胸肉、不要香油）',
      '潤餅改良版（不要糖粉花生粉蛋酥，保留蔬菜）',
      '烤玉米、烤地瓜',
      '滷味（選原型食物）',
      '烤串（選瘦肉）',
      '關東煮（豆腐、高麗菜卷、蛋、地瓜）',
    ],
    avoid: '大腸包小腸（兩碗飯+20g油）、鹹酥雞、珍奶（兩碗飯+15顆糖）、蚵仔煎（511大卡/100g）、地瓜球、甜甜圈',
  },
  {
    id: 'ironplate',
    name: '鐵板燒',
    emoji: '🔥',
    items: [
      '營養師說「蠻好的外食地點」',
      '請師傅少油少鹽',
      '白飯只填半碗',
      '荷包蛋不加醬',
      '菜和蛋白質很容易吃到足量',
    ],
    avoid: '醬汁太多的料理',
  },
];

// ===== 份量指南 =====
const PORTIONS = [
  { name: '蔬菜', amount: '一拳頭（熟菜）或兩拳頭（生菜）', freq: '每餐至少', emoji: '🥬', color: '#5B9E4A' },
  { name: '蛋白質', amount: '一手掌（含手指）', freq: '每餐', emoji: '🥩', color: '#4AAD8E' },
  { name: '澱粉', amount: '一拳頭（所有澱粉加起來）', freq: '每餐', emoji: '🍚', color: '#E8734A' },
  { name: '水果', amount: '一拳頭', freq: '一天最多兩次', emoji: '🍎', color: '#CC6B8E' },
  { name: '堅果', amount: '一平湯匙（白色免洗湯匙不凸出來）', freq: '一天', emoji: '🥜', color: '#D4A855' },
  { name: '乳品', amount: '240ml/杯', freq: '一天1-2杯', emoji: '🥛', color: '#7BB3D1' },
];

// ===== 聚餐錦囊 =====
const TIPS = [
  { num: 1, text: '餐前喝500cc水', detail: '可以少吃20%！' },
  { num: 2, text: '每口嚼20-30下', detail: '幫助消化，增加飽足感' },
  { num: 3, text: '菜肉飯順序', detail: '做到就成功一半！先菜→再肉→最後飯' },
  { num: 4, text: '醬料用沾的不要淋', detail: '淋的會全部吃下去' },
  { num: 5, text: '以茶代酒', detail: '健康又助消化' },
  { num: 6, text: '八分飽就停', detail: '「還可以再吃一點」的時候就停' },
  { num: 7, text: '飯後散步', detail: '穩定血糖，幫助消化' },
  { num: 8, text: '選原型食物', detail: '看得出原本樣子最好' },
  { num: 9, text: '主動點菜', detail: '控制權在你手上' },
  { num: 10, text: '保持好心情', detail: '只吃開心的飯，不吃壓力的飯' },
];

// ===== 肚子餓了 =====
const HUNGER_GUIDE = [
  {
    id: 'morning',
    time: '上午餓',
    emoji: '☀️',
    reason: '可能早餐蛋白質不夠、或吃太少',
    snacks: ['茶葉蛋', '無糖豆漿', '堅果一小包', '水果一拳頭'],
    tip: '檢查早餐有沒有吃到一手掌蛋白質，蛋白質夠了通常不會上午就餓',
  },
  {
    id: 'afternoon',
    time: '下午餓',
    emoji: '🌤️',
    reason: '正常的！午餐到晚餐間隔長',
    snacks: ['堅果一平匙', '水果一拳頭', '無糖希臘優格', '茶葉蛋', '無糖豆漿', '85%以上黑巧克力1-2片', '毛豆', '烘烤黑/黃豆'],
    tip: '下午茶選蛋白質或好油脂比選碳水更耐餓',
  },
  {
    id: 'night',
    time: '睡前餓',
    emoji: '🌙',
    reason: '晚餐可能吃太少或吃太早',
    snacks: ['先喝水等10分鐘', '200ml鮮奶', '200ml無糖豆漿'],
    tip: '真的餓就吃，不要忍到隔天暴食。但不要喝太多水影響睡眠',
  },
  {
    id: 'office',
    time: '在公司',
    emoji: '🏢',
    reason: '可能是壓力餓或習慣餓',
    snacks: ['堅果小包（放抽屜）', '水果（蘋果/芭樂最方便）', '無糖豆漿/鮮奶', '海苔'],
    tip: '先問自己：是真的餓還是嘴巴想吃？喝杯水等10分鐘再決定',
  },
];

const HUNGER_TYPES = [
  { type: '吃太少的餓', solution: '正餐份量吃夠，菜3肉2飯1', emoji: '📉' },
  { type: '蛋白質不夠的餓', solution: '每餐確保一手掌蛋白質', emoji: '🥩' },
  { type: '營養素不夠的餓', solution: '六大類營養都要均衡', emoji: '🥗' },
  { type: '習慣吃多的餓', solution: '先喝水等10分鐘，用替代不用忍', emoji: '🧠' },
];

// ===== 經期飲食（來自休校長「女性月經週期×ABC代謝重建」完整課程）=====
const PERIOD_GUIDE = [
  {
    id: 'period',
    phase: '月經期（Day 1-5）',
    emoji: '🔄',
    subtitle: '重置期',
    desc: '荷爾蒙回到基線，身體在重新開始',
    metabolic: '胰島素敏感度開始回升，黃體期滯留的水分開始排出 → 體重會自然掉下來',
    items: [
      { food: '紅肉（牛肉、豬肝）', note: '鐵質隨經血流失，需要補回來' },
      { food: '深綠色蔬菜', note: '也是鐵的好來源' },
      { food: '薑茶', note: '暖子宮、舒緩經痛' },
      { food: '正常ABC飲食', note: '不用特別改變，不餓就不用硬吃' },
    ],
    tips: ['不舒服就休息，舒服就可以做輕度運動（走路、伸展）', '上個月黃體期漲的體重，這幾天會開始退', '生冷食物暫停，生菜沙拉改溫沙拉或炒蔬菜'],
  },
  {
    id: 'follicular',
    phase: '濾泡期（Day 6-13）',
    emoji: '🌟',
    subtitle: '代謝順風期 — 整個月最友善的階段',
    desc: '雌激素穩定上升，胰島素敏感度最好，身體偏好燒脂肪',
    metabolic: '肌肉搶碳水的能力最強、食慾穩定不容易暴食、力量和恢復都比較好',
    items: [
      { food: '正常ABC飲食', note: '身體自己會跑得很順' },
      { food: '可以嘗試挑戰性訓練', note: '力量訓練在這個階段最適合' },
    ],
    tips: ['這個階段你會覺得ABC超簡單、身體超配合', '代謝重建效果最明顯：體重下降、體脂變化', '不用刻意多吃少吃，正常走就好'],
  },
  {
    id: 'ovulation',
    phase: '排卵期（Day 14 前後）',
    emoji: '⚡',
    subtitle: '運動表現高峰',
    desc: '雌激素最高峰+睪固酮小高峰，力量和運動表現最佳',
    metabolic: '代謝狀態還是很好，但排卵後就是轉折點',
    items: [
      { food: '正常ABC飲食', note: '跟濾泡期一樣，代謝狀態好' },
      { food: '力量訓練可以好好發揮', note: '這幾天是整個月表現最好的' },
    ],
    tips: ['有些人排卵時會輕微下腹痛，這是正常的'],
  },
  {
    id: 'luteal',
    phase: '黃體期（Day 15-28）',
    emoji: '🌊',
    subtitle: '代謝逆風期 — 最需要理解的階段',
    desc: '黃體素大量分泌，胰島素敏感度下降，想吃甜食是大腦化學在改變不是意志力差',
    metabolic: '基礎代謝率升高100-300大卡（你真的比較餓）、水分滯留1-3公斤（是水不是胖）、身體偏好燒糖不燒脂肪',
    items: [
      { food: '增加色胺酸食物', note: '雞肉、魚、堅果、香蕉 — 色胺酸是血清素原料' },
      { food: '增加鎂的攝取', note: '深綠色蔬菜、堅果、85%黑巧克力 — 鎂參與血清素合成' },
      { food: '多吃蛋白質和好油脂', note: '比碳水更能穩住食慾' },
      { food: '黑豆水', note: '補蛋白質+去水腫' },
      { food: '不要少吃！', note: '基礎代謝率升高，少吃→血糖更不穩→更想吃甜食→惡性循環' },
    ],
    tips: [
      '體重上升1-3公斤是水，月經來就會排掉',
      '多吃200-300大卡是正常的，大部分被升高的代謝率消耗了',
      '想吃甜食是血清素下降，不是意志力差',
      '不要跟渴望硬拼，用增加營養素的方式穩住大腦化學',
      '覺得特別累就降低運動強度，不是偷懶是尊重身體',
    ],
  },
];

const PERIOD_MYTHS = [
  {
    myth: '經前暴食就是破戒',
    truth: '基礎代謝率升高+血清素下降，身體本來就需要更多能量。多吃的200-300大卡大部分被代謝消耗了。真正的問題是愧疚感引發的惡性循環。',
  },
  {
    myth: '經前體重上升代表變胖了',
    truth: '1-3公斤幾乎100%是水。用月趨勢看（每次月經結束後第7天量，跟上個月同天比），不要用日體重判斷。',
  },
  {
    myth: '月經期不能運動',
    truth: '這時胰島素敏感度在回升，輕度到中度運動反而可以緩解經痛（運動釋放腦內啡）。不舒服就休息，舒服就動。',
  },
  {
    myth: '女生應該跟著週期調整飲食計畫',
    truth: '不需要那麼複雜。ABC代謝重建的核心是代謝靈活性，不是多一套規則。你需要的是「理解後不恐慌」，不是「黃體期少吃碳水」。',
  },
];

// ===== 飲品指南 =====
const DRINK_CATEGORIES = [
  {
    id: 'recommend',
    name: '推薦飲品',
    emoji: '✅',
    items: [
      { name: '水', note: '每天至少2000cc，最好的選擇', tag: '首選' },
      { name: '無糖茶', note: '紅茶綠茶烏龍茶都好', tag: '推薦' },
      { name: '黑咖啡', note: '與正餐間隔至少1小時（影響鐵鈣吸收）', tag: '推薦' },
      { name: '無糖豆漿', note: '是蛋白質！一休的排序：豆漿>牛奶>植物奶', tag: '推薦' },
      { name: '氣泡水', note: '零熱量，滿足想喝刺激口感的需求', tag: '推薦' },
      { name: '切片檸檬水', note: '增添風味的好選擇', tag: '推薦' },
      { name: '無糖鮮奶茶', note: '要用鮮奶不是奶精', tag: '推薦' },
    ],
  },
  {
    id: 'classify',
    name: '植物奶分類（超常搞混）',
    emoji: '🥛',
    items: [
      { name: '鮮奶', note: '乳品類（蛋白質+鈣），一天1-2杯', tag: '乳品' },
      { name: '無糖豆漿', note: '蛋白質！首選蛋白質飲品', tag: '蛋白質' },
      { name: '燕麥奶', note: '是澱粉不是奶！通常還加油', tag: '澱粉' },
      { name: '杏仁奶', note: '是油脂不是奶！蛋白質含量極低', tag: '油脂' },
      { name: '椰奶', note: '是油脂不是乳製品', tag: '油脂' },
      { name: '米漿', note: '糊化澱粉+含糖，不建議', tag: '澱粉' },
    ],
  },
  {
    id: 'handshake',
    name: '手搖飲怎麼點',
    emoji: '🧋',
    items: [
      { name: '無糖茶/無糖鮮奶茶', note: '可以喝', tag: '推薦' },
      { name: '仙草凍/桂花凍', note: '加料OK的選擇', tag: '推薦' },
      { name: '珍珠', note: '製作時就加很多糖，「無糖珍奶」其實還是有糖', tag: '注意' },
      { name: '杏仁凍', note: '是澱粉類，跟珍珠一樣要注意', tag: '注意' },
      { name: '濃縮果汁類', note: '手搖飲店很少用水果本人，都是濃縮果汁', tag: '注意' },
      { name: '啵啵球/蒟蒻球', note: '查一下含糖量，很多有12g糖', tag: '注意' },
    ],
  },
  {
    id: 'avoid',
    name: '要注意的',
    emoji: '⚠️',
    items: [
      { name: '含糖飲料', note: '造成肥胖最大原因之一，高果糖糖漿直接變腹部脂肪', tag: '避開' },
      { name: '果汁', note: '快速吸收糖分+無纖維，吃原型水果比較好', tag: '避開' },
      { name: '蜂蜜水', note: '蜂蜜也是糖！用水果切片加水替代', tag: '避開' },
      { name: '三合一咖啡', note: '精緻糖+奶精，先調整頻率一週最多兩次', tag: '注意' },
      { name: '奶茶', note: '奶精是油脂不是奶', tag: '避開' },
      { name: '拿鐵選中杯', note: '特大杯奶量約500ml太多，大杯或中杯剛好', tag: '注意' },
    ],
  },
  {
    id: 'alcohol',
    name: '喝酒怎麼辦',
    emoji: '🍷',
    items: [
      { name: '紅酒', note: '35-50ml，相對好的選擇', tag: '少量' },
      { name: '清酒/白酒', note: '次選', tag: '少量' },
      { name: '啤酒', note: '250cc以內', tag: '少量' },
      { name: '一杯酒配一杯水', note: '避免宿醉', tag: '技巧' },
      { name: '不要空腹喝', note: '先吃東西再喝', tag: '技巧' },
      { name: '最多兩杯', note: '酒精1g=7大卡，身體優先代謝酒精暫停燃脂', tag: '注意' },
    ],
  },
];

// ===== 三日調整法 =====
const THREE_DAY = [
  { day: '聚餐前一天', emoji: '📋', items: ['吃清淡一點', '多喝水', '正常執行 ABC'] },
  { day: '聚餐當天', emoji: '🍽️', items: ['菜肉飯順序', '餐前喝水', '飯後多走路', '用今天學的策略'] },
  { day: '聚餐後一天', emoji: '🌿', items: ['飲食清淡', '多走路多喝水', '讓腸胃休息', '不要有罪惡感！'] },
];

// ===== 標籤顏色 =====
const TAG_COLORS = {
  '推薦': { bg: '#E8F5E9', color: '#2E7D32' },
  '常搞混': { bg: '#FFF3E0', color: '#E65100' },
  '注意': { bg: '#FBE9E7', color: '#BF360C' },
  '替換': { bg: '#E3F2FD', color: '#1565C0' },
  '主食': { bg: '#F3E5F5', color: '#6A1B9A' },
};

export default function GuidePage() {
  const [activeTab, setActiveTab] = useState('food');
  const [activeCategory, setActiveCategory] = useState('starch');
  const [expandedScene, setExpandedScene] = useState(null);

  const tabs = [
    { id: 'food', name: '食物分類', emoji: '🔍' },
    { id: 'eating', name: '外食攻略', emoji: '🍱' },
    { id: 'hunger', name: '肚子餓了', emoji: '😋' },
    { id: 'period', name: '經期飲食', emoji: '🌸' },
    { id: 'drink', name: '喝什麼', emoji: '🥤' },
    { id: 'portion', name: '份量指南', emoji: '✋' },
    { id: 'tips', name: '聚餐錦囊', emoji: '🎯' },
  ];

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', background: '#faf9f7', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #E8734A, #CC6B8E)', padding: '24px 20px 16px', color: 'white' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>ABC 飲食小幫手</div>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>休校長的課程精華，隨時查、隨時用</div>
      </div>

      {/* Tabs — horizontal scroll */}
      <div style={{ background: 'white', borderBottom: '1px solid #eee9e5', position: 'sticky', top: 0, zIndex: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'flex', minWidth: 'max-content' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 400, whiteSpace: 'nowrap',
                color: activeTab === tab.id ? '#E8734A' : '#888',
                borderBottom: activeTab === tab.id ? '2px solid #E8734A' : '2px solid transparent',
              }}
            >
              {tab.emoji} {tab.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {/* ===== 食物分類 ===== */}
        {activeTab === 'food' && (
          <>
            {/* Category pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {FOOD_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                    background: activeCategory === cat.id ? cat.color : '#f0ece8',
                    color: activeCategory === cat.id ? 'white' : '#666',
                  }}
                >
                  {cat.emoji} {cat.name}
                </button>
              ))}
            </div>

            {/* Active category content */}
            {(() => {
              const cat = FOOD_CATEGORIES.find(c => c.id === activeCategory);
              if (!cat) return null;
              return (
                <div>
                  <div style={{ fontSize: 14, color: '#888', marginBottom: 12, padding: '8px 12px', background: '#f5f0eb', borderRadius: 8 }}>
                    {cat.emoji} {cat.desc}
                  </div>
                  {cat.items.map((item, i) => {
                    const tagStyle = TAG_COLORS[item.tag] || { bg: '#f0f0f0', color: '#666' };
                    return (
                      <div key={i} style={{
                        background: 'white', borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', gap: 10,
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 15, color: '#2a2520' }}>{item.name}</div>
                          <div style={{ fontSize: 13, color: '#777', marginTop: 2 }}>{item.note}</div>
                        </div>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                          background: tagStyle.bg, color: tagStyle.color, fontWeight: 600,
                        }}>
                          {item.tag}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        )}

        {/* ===== 外食攻略 ===== */}
        {activeTab === 'eating' && (
          <div>
            {EATING_OUT.map(scene => (
              <div key={scene.id} style={{ background: 'white', borderRadius: 12, marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <button
                  onClick={() => setExpandedScene(expandedScene === scene.id ? null : scene.id)}
                  style={{
                    width: '100%', padding: '14px 16px', border: 'none', background: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 24 }}>{scene.emoji}</span>
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: '#2a2520' }}>{scene.name}</span>
                  <span style={{ fontSize: 18, color: '#ccc', transform: expandedScene === scene.id ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>▼</span>
                </button>
                {expandedScene === scene.id && (
                  <div style={{ padding: '0 16px 16px' }}>
                    {scene.items.map((item, i) => (
                      <div key={i} style={{ fontSize: 14, color: '#444', padding: '6px 0', borderTop: i === 0 ? '1px solid #f0ece8' : 'none' }}>
                        ✅ {item}
                      </div>
                    ))}
                    {scene.avoid && (
                      <div style={{ marginTop: 8, padding: '10px 12px', background: '#FBE9E7', borderRadius: 8, fontSize: 13, color: '#BF360C' }}>
                        ❌ 避開：{scene.avoid}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ===== 肚子餓了 ===== */}
        {activeTab === 'hunger' && (
          <div>
            <div style={{ background: '#FFF8E1', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>一休說：餓有四種</div>
              {HUNGER_TYPES.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', fontSize: 14 }}>
                  <span>{h.emoji}</span>
                  <div><strong>{h.type}</strong> → {h.solution}</div>
                </div>
              ))}
            </div>

            {HUNGER_GUIDE.map(h => (
              <div key={h.id} style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{h.emoji} {h.time}</div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>{h.reason}</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>可以吃：</div>
                {h.snacks.map((s, i) => (
                  <div key={i} style={{ fontSize: 14, color: '#444', padding: '3px 0' }}>✅ {s}</div>
                ))}
                <div style={{ marginTop: 10, padding: '10px 12px', background: '#f5f0eb', borderRadius: 8, fontSize: 13, color: '#666' }}>
                  💡 {h.tip}
                </div>
              </div>
            ))}

            <div style={{ marginTop: 16, padding: 16, background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>「有借有還」概念</div>
              <div style={{ fontSize: 14, color: '#555', lineHeight: 1.8 }}>
                吃了甜食 → 下一餐扣澱粉<br/>
                吃了炸物 → 下一餐多蔬菜清淡<br/>
                假日放飛 → 平日拉回<br/><br/>
                <strong>不是懲罰，是平衡。</strong>不需要自責，我們來學習怎麼調整。
              </div>
            </div>
          </div>
        )}

        {/* ===== 經期飲食 ===== */}
        {activeTab === 'period' && (
          <div>
            <div style={{ textAlign: 'center', padding: '12px 16px', background: '#FCE4EC', borderRadius: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#880E4F' }}>
                月經週期讓代謝在順風和逆風之間擺盪<br/>這是設計好的，不是你的問題
              </div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>— 休校長「女性月經週期×ABC代謝重建」課程</div>
            </div>

            {PERIOD_GUIDE.map(p => (
              <div key={p.id} style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>{p.emoji} {p.phase}</div>
                {p.subtitle && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E8734A', marginBottom: 6 }}>{p.subtitle}</div>
                )}
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>{p.desc}</div>
                {p.metabolic && (
                  <div style={{ fontSize: 13, color: '#555', padding: '8px 12px', background: '#f5f0eb', borderRadius: 8, marginBottom: 10, lineHeight: 1.6 }}>
                    ⚡ {p.metabolic}
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 4 }}>建議飲食：</div>
                {p.items.map((item, i) => (
                  <div key={i} style={{ padding: '6px 0' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#2a2520' }}>✅ {item.food}</div>
                    <div style={{ fontSize: 13, color: '#777', marginLeft: 22 }}>{item.note}</div>
                  </div>
                ))}
                {p.tips && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: '#FFF8E1', borderRadius: 8 }}>
                    {p.tips.map((tip, i) => (
                      <div key={i} style={{ fontSize: 13, color: '#F57F17', padding: '3px 0' }}>💡 {tip}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* 迷思打破 */}
            <div style={{ fontSize: 16, fontWeight: 700, color: '#2a2520', margin: '20px 0 12px' }}>常見迷思打破</div>
            {PERIOD_MYTHS.map((m, i) => (
              <div key={i} style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#BF360C', marginBottom: 6 }}>❌ 迷思：{m.myth}</div>
                <div style={{ fontSize: 14, color: '#2E7D32', lineHeight: 1.6 }}>✅ {m.truth}</div>
              </div>
            ))}

            <div style={{ marginTop: 16, padding: 16, background: '#FCE4EC', borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: '#880E4F', fontWeight: 600, lineHeight: 1.8 }}>
                記住三件事：<br/>
                1. 順風逆風是設計好的，不是你的問題<br/>
                2. 黃體期體重上升幾乎都是水<br/>
                3. 代謝重建是讓你在逆風期也不會慌的能力
              </div>
            </div>
          </div>
        )}

        {/* ===== 喝什麼 ===== */}
        {activeTab === 'drink' && (
          <div>
            {DRINK_CATEGORIES.map(cat => (
              <div key={cat.id} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#2a2520', marginBottom: 8 }}>
                  {cat.emoji} {cat.name}
                </div>
                {cat.items.map((item, i) => {
                  const tagColors = {
                    '首選': { bg: '#E8F5E9', color: '#2E7D32' },
                    '推薦': { bg: '#E8F5E9', color: '#2E7D32' },
                    '乳品': { bg: '#E3F2FD', color: '#1565C0' },
                    '蛋白質': { bg: '#E8F5E9', color: '#2E7D32' },
                    '澱粉': { bg: '#FFF3E0', color: '#E65100' },
                    '油脂': { bg: '#FFF3E0', color: '#E65100' },
                    '注意': { bg: '#FBE9E7', color: '#BF360C' },
                    '避開': { bg: '#FFEBEE', color: '#B71C1C' },
                    '少量': { bg: '#FFF8E1', color: '#F57F17' },
                    '技巧': { bg: '#E3F2FD', color: '#1565C0' },
                  };
                  const ts = tagColors[item.tag] || { bg: '#f0f0f0', color: '#666' };
                  return (
                    <div key={i} style={{
                      background: 'white', borderRadius: 10, padding: '12px 14px', marginBottom: 6,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', gap: 10,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, color: '#2a2520' }}>{item.name}</div>
                        <div style={{ fontSize: 13, color: '#777', marginTop: 2 }}>{item.note}</div>
                      </div>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                        background: ts.bg, color: ts.color, fontWeight: 600,
                      }}>
                        {item.tag}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ===== 份量指南 ===== */}
        {activeTab === 'portion' && (
          <div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 16, textAlign: 'center' }}>
              用自己的手量，不用秤不用算
            </div>
            <div style={{ fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 16, padding: '10px', background: '#f5f0eb', borderRadius: 8 }}>
              菜肉飯比例 = 3 : 2 : 1
            </div>
            {PORTIONS.map((p, i) => (
              <div key={i} style={{
                background: 'white', borderRadius: 12, padding: '16px', marginBottom: 10,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 50, height: 50, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, background: `${p.color}15`,
                }}>
                  {p.emoji}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#2a2520' }}>{p.name}</div>
                  <div style={{ fontSize: 14, color: '#666', marginTop: 2 }}>{p.amount}</div>
                  <div style={{ fontSize: 12, color: p.color, fontWeight: 600, marginTop: 2 }}>{p.freq}</div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 20, background: 'white', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>其他小提醒</div>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.8 }}>
                - 水：每天至少2000cc（茶和咖啡不算，會利尿）<br/>
                - 咖啡與正餐間隔至少1小時（影響鐵鈣吸收）<br/>
                - 蛋白質分散吃吸收率比集中一次吃好<br/>
                - 水果建議飯後吃，不要空腹單獨吃
              </div>
            </div>
          </div>
        )}

        {/* ===== 聚餐錦囊 ===== */}
        {activeTab === 'tips' && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#2a2520', marginBottom: 12 }}>十個必勝錦囊</div>
            {TIPS.map(tip => (
              <div key={tip.num} style={{
                background: 'white', borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', gap: 12, alignItems: 'center',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: '#E8734A', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0,
                }}>
                  {tip.num}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#2a2520' }}>{tip.text}</div>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 1 }}>{tip.detail}</div>
                </div>
              </div>
            ))}

            <div style={{ fontSize: 15, fontWeight: 700, color: '#2a2520', margin: '24px 0 12px' }}>三日調整法</div>
            {THREE_DAY.map((d, i) => (
              <div key={i} style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{d.emoji} {d.day}</div>
                {d.items.map((item, j) => (
                  <div key={j} style={{ fontSize: 14, color: '#555', padding: '3px 0' }}>- {item}</div>
                ))}
              </div>
            ))}

            <div style={{ marginTop: 20, padding: 16, background: '#FFF8E1', borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: '#F57F17', fontWeight: 600 }}>
                「食物是用來享受的，不是用來恐懼的。<br/>學會聰明選擇，你就可以同時擁有美食和健康。」
              </div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>— 休校長</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '20px 16px 32px', fontSize: 12, color: '#bbb' }}>
        休校長小幫手 — ABC 代謝重建瘦身法
      </div>
    </div>
  );
}
