/**
 * 瘦身知識大挑戰 — 題庫
 *
 * 所有消費端（webhook、web quiz、history 頁、API）都從這裡 import。
 * 題目格式：是非題（O/X），每題有 statement、answer、explain、category、tier。
 */

// === 知識分類 ===
export const KNOWLEDGE_CATEGORIES = [
  { id: 'myth', name: '常見迷思', emoji: '💡', description: '打破你以為對的觀念' },
  { id: 'abc', name: 'ABC 代謝重建', emoji: '🔥', description: 'ABC 代謝重建瘦身法的核心' },
  { id: 'nutrition', name: '營養知識', emoji: '🥗', description: '吃對比吃少更重要' },
  { id: 'mindset', name: '心態觀念', emoji: '🧠', description: '瘦身是一場心態修煉' },
  { id: 'behavior', name: '行為習慣', emoji: '🎯', description: '日常習慣決定體態' },
  { id: 'food_science', name: '食物科學', emoji: '🔬', description: '食物背後的科學' },
];

// === 等級定義 ===
export const KNOWLEDGE_LEVELS = [
  { min: 0, title: '瘦身小白', emoji: '🌱' },
  { min: 10, title: '知識新手', emoji: '📖' },
  { min: 30, title: '觀念達人', emoji: '⭐' },
  { min: 60, title: '代謝專家', emoji: '🏆' },
  { min: 90, title: '知識大師', emoji: '👑' },
  { min: 120, title: '全制霸', emoji: '🎖️' },
];

// === 題庫 ===
export const KNOWLEDGE_QUIZZES = [
  // ============================================================
  // myth (常見迷思) — 約 25 題
  // ============================================================

  // Tier 1
  { statement: '少吃多動是最有效的減肥方法', answer: false, explain: '長期少吃會讓代謝向下適應，越忍越慢。吃對比吃少重要 💡', category: 'myth', tier: 1 },
  { statement: '吃飽也可以瘦', answer: true, explain: '蛋白質吃夠+胰島素穩定，吃飽反而代謝好，自然會瘦 😊', category: 'myth', tier: 1 },
  { statement: '減肥就是要忍耐', answer: false, explain: '犧牲心態一定失敗，選擇心態才持久。你是在選更好的，不是在犧牲 💪', category: 'myth', tier: 1 },
  { statement: '運動是減肥最重要的事', answer: false, explain: '飲食佔 90%，運動佔 10%。先把吃的調好，運動是加分題 🏃', category: 'myth', tier: 1 },
  { statement: '只要熱量赤字就一定會瘦', answer: false, explain: '代謝會向下適應，長期赤字反而更難瘦。身體不是計算機 📉', category: 'myth', tier: 1 },
  { statement: '吃宵夜一定會胖', answer: false, explain: '看吃什麼比看幾點吃重要。但晚上胰島素敏感度確實較低，選蛋白質比較好 🌙', category: 'myth', tier: 1 },
  { statement: '不吃澱粉就會瘦', answer: false, explain: '碳水是工具不是敵人，完全不吃反而影響代謝和情緒 🍚', category: 'myth', tier: 1 },
  { statement: '瘦的人代謝一定比較好', answer: false, explain: '外表看不出代謝狀態，很多瘦的人內臟脂肪也很高 😮', category: 'myth', tier: 1 },
  { statement: '喝水會水腫', answer: false, explain: '水喝不夠身體才會留水。多喝水反而幫助代謝、消水腫 💧', category: 'myth', tier: 1 },
  { statement: '體重機上的數字最重要', answer: false, explain: '體重會因水分、肌肉量波動。體態、精神、衣服鬆緊才是真的指標 ⚖️', category: 'myth', tier: 1 },

  // Tier 2
  { statement: '快速減肥會流失肌肉', answer: true, explain: '快速減肥掉 25-40% 肌肉，肌肉流失=代謝變差=復胖更快 😰', category: 'myth', tier: 2 },
  { statement: '蛋白質吃太多會傷腎', answer: false, explain: '健康的人不會。長期蛋白質不足反而容易肌少症、免疫力下降 🥩', category: 'myth', tier: 2 },
  { statement: '膽固醇高是因為吃太多蛋', answer: false, explain: '血中膽固醇跟蛋關係不大，跟慢性發炎和代謝失調比較有關 🥚', category: 'myth', tier: 2 },
  { statement: '脂肪吃多了一定會胖', answer: false, explain: '好油不會胖！酪梨、堅果、橄欖油都是好油。糖油混合物才是問題 🥑', category: 'myth', tier: 2 },
  { statement: '一天只能吃兩顆蛋', answer: false, explain: '這是過時觀念。健康的人一天 3-4 顆蛋都沒問題，蛋是超級食物 🥚', category: 'myth', tier: 2 },
  { statement: '所有碳水化合物都是不好的', answer: false, explain: '原型碳水（地瓜、糙米）是好工具，精緻碳水（白糖、白麵包）才要減少 🌾', category: 'myth', tier: 2 },
  { statement: '減肥期間不能吃火鍋', answer: false, explain: '火鍋是外食好選擇！選清湯底、多涮肉片蔬菜、少吃加工餃類就好 🍲', category: 'myth', tier: 2 },
  { statement: '局部運動可以局部瘦', answer: false, explain: '脂肪是全身性消耗的，狂做仰臥起坐不會只瘦肚子 🏋️', category: 'myth', tier: 2 },

  // Tier 3
  { statement: 'BMI 是判斷健康的最佳指標', answer: false, explain: 'BMI 忽略肌肉量和骨架。一個健身的人 BMI 可能「過重」但體脂很低 📊', category: 'myth', tier: 3 },
  { statement: '瘦的人不會有胰島素阻抗', answer: false, explain: 'TOFI：外瘦內胖。外表瘦但內臟脂肪高，一樣有胰島素阻抗的風險 😮', category: 'myth', tier: 3 },
  { statement: '果糖會直接刺激胰島素', answer: false, explain: '果糖不直接刺激胰島素，但大量果糖會造成肝臟脂質新生，增加代謝負擔 🍯', category: 'myth', tier: 3 },
  { statement: '基礎代謝率是天生固定的', answer: false, explain: '基礎代謝會隨飲食、肌肉量、荷爾蒙改變。好的飲食和肌肉訓練可以提升代謝 🔥', category: 'myth', tier: 3 },

  // ============================================================
  // abc (ABC 代謝重建) — 約 20 題
  // ============================================================

  // Tier 1
  { statement: 'ABC 的 A 代表「加營養」', answer: true, explain: 'A = Add 加營養。先把好的加進來，身體自然不會想要壞的 ➕', category: 'abc', tier: 1 },
  { statement: 'ABC 建議的進食順序是先吃飯再吃菜', answer: false, explain: '正確順序：先菜 → 肉 → 飯。蔬菜纖維先打底，減緩血糖上升 🥬🥩🍚', category: 'abc', tier: 1 },
  { statement: 'ABC 瘦身法需要計算卡路里', answer: false, explain: '胰島素穩定比數字重要。吃對食物、用對順序，不需要每天算卡路里 🔢', category: 'abc', tier: 1 },
  { statement: '每餐都一定要吃澱粉', answer: false, explain: '碳水是工具不是必須，看整天 balance。輕碳水日少吃澱粉也完全 OK 👌', category: 'abc', tier: 1 },
  { statement: 'ABC 代謝重建瘦身法的核心是「加法思維」', answer: true, explain: '增加好的，而非限制壞的。先把營養吃夠，自然不會想吃垃圾食物 ✨', category: 'abc', tier: 1 },
  { statement: 'ABC 瘦身法要求完全戒掉甜食', answer: false, explain: '80/20 法則：80% 的時間做對就很好。偶爾吃甜食不是犯罪，是正常的 🍰', category: 'abc', tier: 1 },
  { statement: 'ABC 的 B 代表「平衡飲食」', answer: true, explain: 'B = Balance 平衡。營養素均衡搭配，不是極端的只吃某一類 ⚖️', category: 'abc', tier: 1 },
  { statement: 'ABC 的 C 代表「改變習慣」', answer: true, explain: 'C = Change 改變。用新的好習慣取代舊的壞習慣，慢慢建立新的生活模式 🔄', category: 'abc', tier: 1 },

  // Tier 2
  { statement: 'ABC 的核心是讓胰島素穩定', answer: true, explain: '胰島素是脂肪儲存的開關。胰島素穩定了，身體才會開始燃燒脂肪 🔑', category: 'abc', tier: 2 },
  { statement: '輕碳水日的意思是完全不吃碳水', answer: false, explain: '蔬菜本身就有碳水，不是零碳水。輕碳水是減少精緻澱粉，不是消滅碳水 🥗', category: 'abc', tier: 2 },
  { statement: '80% 的時間做對就很好了', answer: true, explain: '80/20 法則：不需要 100% 完美。80% 做對就能看到效果，剩下 20% 享受生活 🎯', category: 'abc', tier: 2 },
  { statement: '代謝重建的底層邏輯是降低慢性發炎', answer: true, explain: '慢性發炎是代謝失調的根源。吃對食物、降低發炎，代謝自然回到正軌 🔥', category: 'abc', tier: 2 },
  { statement: '每天一定要吃三餐才是正確的', answer: false, explain: '沒有一定要幾餐。可以按照個人生活習慣、當天飲食狀況彈性調整，這才是真正的彈性 🕐', category: 'abc', tier: 1 },
  { statement: '代謝重建需要先讓身體從「省電模式」切換到「正常模式」', answer: true, explain: '長期節食的人代謝已經向下適應，要先吃夠營養讓代謝回升，體重才會健康下降 🔋', category: 'abc', tier: 2 },

  // Tier 3
  { statement: '代謝靈活性是指身體能在燃糖和燃脂之間自由切換', answer: true, explain: '代謝靈活的人，有碳水就燒糖、沒碳水就燒脂肪，切換自如不會疲累 ⚡', category: 'abc', tier: 3 },
  { statement: '胰島素阻抗只會發生在糖尿病患者身上', answer: false, explain: '胰島素阻抗是漸進的過程，很多看起來健康的人已經有輕度阻抗了 ⚠️', category: 'abc', tier: 3 },

  // ============================================================
  // nutrition (營養知識) — 約 25 題
  // ============================================================

  // Tier 1
  { statement: '雞蛋是很好的蛋白質來源', answer: true, explain: '雞蛋有完整胺基酸、好油脂、膽鹼，是CP值最高的蛋白質食物 🥚', category: 'nutrition', tier: 1 },
  { statement: '每餐蛋白質建議量大約是一個手掌大', answer: true, explain: '一掌心大的肉 ≈ 20-30g 蛋白質，簡單好記不用秤 🤚', category: 'nutrition', tier: 1 },
  { statement: '無糖豆漿是好的蛋白質來源', answer: true, explain: '無糖豆漿蛋白質豐富，植物性蛋白的好選擇！記得選無糖 🥛', category: 'nutrition', tier: 1 },
  { statement: '蔬菜應該盡量多吃', answer: true, explain: '蔬菜纖維多、熱量低，能穩定血糖又增加飽足感。放心吃！🥬', category: 'nutrition', tier: 1 },
  { statement: '水果越甜表示糖分越高', answer: false, explain: '甜度跟糖分不完全相關。有些水果甜度高但升糖不高，有些相反 🍎', category: 'nutrition', tier: 1 },
  { statement: '豬肉是好的蛋白質來源', answer: true, explain: '豬肉富含蛋白質和維生素 B 群，選瘦肉部位就是很好的蛋白質 🥩', category: 'nutrition', tier: 1 },
  { statement: '牛奶可以補充蛋白質', answer: true, explain: '牛奶有優質蛋白質和鈣質，全脂牛奶的脂肪也是好油 🥛', category: 'nutrition', tier: 1 },
  { statement: '早餐吃麵包配果汁是健康的選擇', answer: false, explain: '麵包是精緻碳水，果汁是濃縮果糖，兩個一起血糖會飆很快 🍞🧃', category: 'nutrition', tier: 1 },
  { statement: '堅果是好的油脂來源', answer: true, explain: '堅果含好油、蛋白質、礦物質。每天一小把就好，因為熱量密度高 🥜', category: 'nutrition', tier: 1 },
  { statement: '吃蛋白質比較有飽足感', answer: true, explain: '蛋白質的飽足感最持久，血糖也比較穩定，不容易餓 😋', category: 'nutrition', tier: 1 },
  { statement: '白飯比糙米更適合減肥', answer: false, explain: '糙米有更多纖維和營養素，升糖速度比白飯慢，是更好的碳水選擇 🍚', category: 'nutrition', tier: 1 },
  { statement: '地瓜是好的碳水化合物選擇', answer: true, explain: '地瓜富含纖維和營養素，升糖指數比白飯低，是原型碳水的好選擇 🍠', category: 'nutrition', tier: 1 },

  // Tier 2
  { statement: '飽和脂肪在低碳水的前提下是安全的', answer: true, explain: '低碳水時身體會把飽和脂肪當能量燃燒。怕的是高碳+高油的組合 🧈', category: 'nutrition', tier: 2 },
  { statement: '橄欖油適合高溫油炸', answer: false, explain: '橄欖油發煙點較低，高溫容易變質。高溫用椰子油或豬油更穩定 🫒', category: 'nutrition', tier: 2 },
  { statement: '蛋白質每公斤體重建議 1.2-1.6 克', answer: true, explain: '這是維持肌肉量的基本需求。60 公斤的人一天至少需要 72-96g 蛋白質 💪', category: 'nutrition', tier: 2 },
  { statement: '肌肉是身體最大的血糖消費者', answer: true, explain: '80% 餐後血糖清除靠肌肉！肌肉越多，身體處理血糖的能力越好 💪', category: 'nutrition', tier: 2 },
  { statement: '吃好油（橄欖油、魚油）反而有助於減脂', answer: true, explain: '好的油脂能幫助脂溶性維生素吸收、穩定荷爾蒙、增加飽足感。怕油才會讓身體更想囤油 🫒', category: 'nutrition', tier: 2 },
  { statement: '維生素 D 跟減肥有關', answer: true, explain: '維生素 D 不足跟肥胖、胰島素阻抗有關。適度曬太陽+補充很重要 ☀️', category: 'nutrition', tier: 2 },
  { statement: '乳清蛋白粉可以取代所有蛋白質食物', answer: false, explain: '蛋白粉是補充品不是替代品。原型食物的營養更完整，粉只是方便用 🥤', category: 'nutrition', tier: 2 },
  { statement: '纖維可以降低食物的升糖反應', answer: true, explain: '纖維會減緩糖的吸收速度，這就是為什麼要先吃菜再吃飯 🥦', category: 'nutrition', tier: 2 },

  // Tier 3
  { statement: '身體的皮下脂肪和內臟脂肪，主要來自吃太多油', answer: false, explain: '其實大部分體脂肪來自肝臟把多餘的碳水轉成脂肪儲存。少油不會瘦，控好碳水才是關鍵 🧪', category: 'nutrition', tier: 2 },
  { statement: '胰島素低時身體代謝率會提升', answer: true, explain: '胰島素低時身體切換到燃脂模式，每天可多消耗 200-500 大卡 🔥', category: 'nutrition', tier: 3 },
  { statement: '腸道菌叢會影響體重管理', answer: true, explain: '腸道細菌影響營養吸收、發炎反應、食慾荷爾蒙，是代謝的隱藏關鍵 🦠', category: 'nutrition', tier: 3 },

  // ============================================================
  // mindset (心態觀念) — 約 20 題
  // ============================================================

  // Tier 1
  { statement: '吃錯一餐就代表今天失敗了', answer: false, explain: '每餐都是新開始！吃錯一餐不代表什麼，下一餐調回來就好 🌅', category: 'mindset', tier: 1 },
  { statement: '慢慢來比較快', answer: true, explain: '一個月 1.5-2 公斤最健康，快速減的也會快速回來 🐢', category: 'mindset', tier: 1 },
  { statement: '瘦是健康的附加價值', answer: true, explain: '焦點放在變健康，瘦是自然的結果。為了健康而改變，才能持久 ✨', category: 'mindset', tier: 1 },
  { statement: '看別人的進度會幫助自己更有動力', answer: false, explain: '比較是偷走快樂的賊。每個人身體不同，專注自己的進步就好 🌱', category: 'mindset', tier: 1 },
  { statement: '只要夠努力，一定可以一個月瘦 10 公斤', answer: false, explain: '一個月瘦 10 公斤不健康也不持久。1.5-2 公斤才是身體能承受的速度 🚫', category: 'mindset', tier: 1 },
  { statement: '減肥失敗的人都是因為意志力不夠', answer: false, explain: '靠意志力遲早會用完。理解為什麼要這樣吃、享受這個過程，才不需要硬撐 🧠', category: 'mindset', tier: 1 },
  { statement: '對自己好一點，不用每次都要求完美', answer: true, explain: '80 分就很棒了！完美主義反而是減肥最大的敵人 💛', category: 'mindset', tier: 1 },
  { statement: '體重停滯就代表方法錯了', answer: false, explain: '停滯期是身體在調整，是正常的過程。只要方向對，耐心等待就好 ⏳', category: 'mindset', tier: 1 },

  // Tier 2
  { statement: '體重沒下降就代表沒有進步', answer: false, explain: '體態、精神、睡眠品質、衣服鬆緊度都是進步指標，不是只有體重 📈', category: 'mindset', tier: 2 },
  { statement: '破戒後應該用運動來「補償」', answer: false, explain: '運動不是懲罰！吃多了下一餐調回來就好，不需要用運動來贖罪 🙅', category: 'mindset', tier: 2 },
  { statement: '用感謝代替責備，對身體說謝謝', answer: true, explain: '「謝謝身體陪我走到這裡」比「為什麼我這麼胖」有力量多了 💝', category: 'mindset', tier: 2 },
  { statement: '注意力放在哪裡，結果就在哪裡', answer: true, explain: '一直想著「不能吃」反而更想吃。把注意力放在「可以吃什麼」更有效 🎯', category: 'mindset', tier: 2 },
  { statement: '減肥需要告訴身邊所有人', answer: false, explain: '不需要昭告天下。有些人會給壓力、有些會酸。找到支持你的人就好 🤫', category: 'mindset', tier: 2 },
  { statement: '每次嘴饞都代表意志力薄弱', answer: false, explain: '嘴饞是正常的生理反應，可能是蛋白質不夠或血糖波動。先喝水、吃點蛋白質 😌', category: 'mindset', tier: 2 },

  // Tier 3
  { statement: '減肥不是一輩子的事，健康才是一輩子的事', answer: true, explain: '一休不希望大家一輩子都在減肥，太辛苦了。他想教的是一個可以瘦一輩子的方式，讓你有一天不再需要他 🌟', category: 'mindset', tier: 1 },

  // ============================================================
  // behavior (行為習慣) — 約 15 題
  // ============================================================

  // Tier 1
  { statement: '吃飯速度越快越容易胖', answer: true, explain: '咀嚼不夠，大腦來不及收到飽足訊號，等你覺得飽已經吃太多了 🍽️', category: 'behavior', tier: 1 },
  { statement: '喝水對代謝有幫助', answer: true, explain: '水是所有代謝反應的溶劑。每天至少體重 x 30ml，代謝才跑得動 💧', category: 'behavior', tier: 1 },
  { statement: '睡眠不足會影響體重', answer: true, explain: '睡不好會讓飢餓素上升、瘦體素下降，隔天特別想吃高糖高油的 😴', category: 'behavior', tier: 1 },
  { statement: '吃飯時看手機不影響飲食', answer: false, explain: '分心吃飯容易吃過量，因為大腦沒有好好接收飽足訊號 📱', category: 'behavior', tier: 1 },
  { statement: '飯前喝一杯水可以幫助控制食量', answer: true, explain: '飯前 15-30 分鐘喝水，胃有了水分基礎，不容易一下吃太多 🥛', category: 'behavior', tier: 1 },
  { statement: '餐前先想好要吃什麼，比到了再選更好', answer: true, explain: '肚子餓的時候判斷力最差。提前計畫好，就不會在饑餓時做出錯誤選擇 📝', category: 'behavior', tier: 1 },
  { statement: '咀嚼次數越多越好', answer: true, explain: '每口嚼 20-30 下，食物磨碎更好消化，大腦也有時間接收飽足感 😋', category: 'behavior', tier: 1 },

  // Tier 2
  { statement: '斷食時間越長越好', answer: false, explain: '適度空腹有好處，但過長反而會流失肌肉。吃的時候吃對更重要 ⏰', category: 'behavior', tier: 2 },
  { statement: '運動後 30 分鐘內馬上吃東西會容易變胖', answer: false, explain: '運動後反而是很好的補充時機！身體會優先把能量拿來修復肌肉和補充肝糖，不容易囤積脂肪 🏋️', category: 'behavior', tier: 2 },
  { statement: '壓力大的時候特別想吃東西是正常的', answer: true, explain: '壓力荷爾蒙（皮質醇）會讓你渴望高糖高油。知道原因就不會自責 😤', category: 'behavior', tier: 2 },
  { statement: '逛超市最好吃飽再去', answer: true, explain: '空腹逛超市會買更多垃圾食物，這是人類本能，不是你意志力差 🛒', category: 'behavior', tier: 2 },
  { statement: '週末放鬆吃兩天不會影響整週的成果', answer: false, explain: '週末兩天大吃可以抵消五天的努力。80/20 是每天的 80%，不是五天認真兩天放飛 📅', category: 'behavior', tier: 2 },

  // Tier 3
  { statement: '長期壓力會讓皮質醇升高，促進脂肪堆積在腹部', answer: true, explain: '皮質醇高會讓脂肪特別喜歡堆在肚子，這就是「壓力肥」的原因 😰', category: 'behavior', tier: 3 },

  // ============================================================
  // food_science (食物科學) — 約 15 題
  // ============================================================

  // Tier 1
  { statement: '加工食品要盡量減少', answer: true, explain: '看得到原本長什麼樣子的食物最好。越加工、添加物越多，身體負擔越大 🏭', category: 'food_science', tier: 1 },
  { statement: '「零卡」飲料就是完全沒有影響', answer: false, explain: '代糖可能影響腸道菌叢和甜味偏好，讓你更渴望甜食 🥤', category: 'food_science', tier: 1 },
  { statement: '看食品標示是個好習慣', answer: true, explain: '學會看成分表，尤其是糖、鈉、反式脂肪。成分越少越好 📋', category: 'food_science', tier: 1 },
  { statement: '果汁跟水果一樣健康', answer: false, explain: '榨成汁之後纖維沒了，只剩糖。一杯柳橙汁要 4-5 顆橘子的糖，但吃不到纖維 🍊', category: 'food_science', tier: 1 },
  { statement: '天然的糖跟加工的糖對身體一樣', answer: false, explain: '天然食物裡的糖有纖維和營養素減緩吸收，加工糖是空熱量直衝血糖 🍬', category: 'food_science', tier: 1 },
  { statement: '「低脂」食品通常比較健康', answer: false, explain: '低脂食品常加更多糖來補味道，結果比原版更不健康 ⚠️', category: 'food_science', tier: 1 },
  { statement: '調味料裡可能藏了很多糖', answer: true, explain: '番茄醬、沙拉醬、烤肉醬含糖量驚人。一大匙番茄醬就有 4g 糖 🧂', category: 'food_science', tier: 1 },
  { statement: '原型食物比加工食品好', answer: true, explain: '看得出原本樣子的食物（雞腿、蔬菜、雞蛋）營養最完整，身體最好利用 🍗', category: 'food_science', tier: 1 },

  // Tier 2
  { statement: '同一種食物，煮法不同營養價值也不同', answer: true, explain: '水煮 vs 油炸差很多！高溫油炸會破壞營養、產生有害物質 🍳', category: 'food_science', tier: 2 },
  { statement: '冷飯比熱飯的升糖指數低', answer: true, explain: '冷卻後的飯會產生抗性澱粉，升糖比較慢。隔夜飯反而比新鮮白飯好 🍚', category: 'food_science', tier: 2 },
  { statement: '食物的 GI 值（升糖指數）越低越好', answer: false, explain: 'GI 值是參考但不是唯一標準。吃的順序、搭配、份量都會影響實際血糖反應 📈', category: 'food_science', tier: 2 },
  { statement: '蛋白質有熱效應，消化本身就會消耗熱量', answer: true, explain: '蛋白質的食物熱效應 20-30%，等於吃 100 大卡蛋白質，有 20-30 大卡拿去消化了 🔥', category: 'food_science', tier: 2 },
  { statement: '精緻糖會讓大腦產生類似成癮的反應', answer: true, explain: '糖會刺激多巴胺，讓你越吃越想吃。這不是你意志力差，是糖的化學作用 🧠', category: 'food_science', tier: 2 },

  // Tier 3
  { statement: '反式脂肪已經被全面禁止使用', answer: false, explain: '台灣 2018 年禁止部分氫化油，但天然反式脂肪（如牛肉、乳品中）仍存在，量很少無需擔心 🔬', category: 'food_science', tier: 3 },
  { statement: 'Omega-3 和 Omega-6 的比例對健康很重要', answer: true, explain: '現代飲食 Omega-6 太多（炸物、加工油），會促進發炎。多吃魚、少用大豆油來平衡 🐟', category: 'food_science', tier: 3 },

  // ============================================================
  // 補充題（各分類，達到 ~120 題）
  // ============================================================

  // myth 補充
  { statement: '流汗越多代表瘦越多', answer: false, explain: '流汗是散熱，不是燃脂。穿雨衣跑步只會脫水，不會瘦 💦', category: 'myth', tier: 1 },
  { statement: '吃素一定比較瘦', answer: false, explain: '素食也可能高糖高油。很多素料是加工食品，油脂和碳水都不低 🌿', category: 'myth', tier: 1 },
  { statement: '年紀大了代謝一定會變差', answer: false, explain: '研究發現 20-60 歲代謝率變化不大。肌肉量才是關鍵，練肌肉任何年齡都有效 👴', category: 'myth', tier: 2 },

  // abc 補充
  { statement: 'ABC 代謝重建鼓勵你先把蛋白質吃夠', answer: true, explain: '蛋白質是代謝重建的基石，吃夠才能維持肌肉、穩定血糖 💪', category: 'abc', tier: 1 },
  { statement: '代謝重建的過程中體重可能暫時不動甚至微升', answer: true, explain: '這是正常的！代謝在修復中，先讓身體重新信任你，體重之後自然會下來 📈', category: 'abc', tier: 2 },

  // nutrition 補充
  { statement: '酪梨是水果但主要成分是好油脂', answer: true, explain: '酪梨的脂肪含量高但都是單元不飽和脂肪酸，是好油的代表食物 🥑', category: 'nutrition', tier: 1 },

  // mindset 補充
  { statement: '跟朋友聚餐吃大餐也是生活的一部分', answer: true, explain: '享受生活不是犯罪。聚餐開心吃，下一餐調回來就好。人生不是只有減肥 🎉', category: 'mindset', tier: 1 },
  { statement: '看到別人吃零食自己也想吃，代表自己太軟弱', answer: false, explain: '這是正常的社交效應和本能反應，不是軟弱。提前吃夠蛋白質可以減少誘惑 😌', category: 'mindset', tier: 1 },
  { statement: '復胖不代表失敗，代表你需要更好的方法', answer: true, explain: '復胖是方法的問題，不是你的問題。找到適合自己的方式才能長久 🔄', category: 'mindset', tier: 2 },

  // behavior 補充
  { statement: '固定時間吃飯比隨便吃更好', answer: true, explain: '規律的飲食節奏讓身體有預期，荷爾蒙分泌更穩定，代謝也更好 🕐', category: 'behavior', tier: 1 },
  { statement: '充足的睡眠對代謝和減肥有幫助', answer: true, explain: '充足睡眠讓瘦體素（Leptin）正常分泌，減少隔天暴食的機率 😴', category: 'behavior', tier: 1 },

  // food_science 補充
  { statement: '蛋白質加熱後營養會流失', answer: false, explain: '蛋白質加熱會變性但不會流失營養。煮熟的蛋白質反而更好消化吸收 🍳', category: 'food_science', tier: 1 },
  { statement: '超加工食品的添加物會影響代謝', answer: true, explain: '人工添加物可能干擾荷爾蒙和腸道菌叢，盡量選成分單純的食物 🏭', category: 'food_science', tier: 2 },

  // ============================================================
  // 高手題補充（tier 3，共 20 題，涵蓋各分類）
  // ============================================================

  // myth 高手
  { statement: '低脂飲食比低碳飲食更能降低心血管風險', answer: false, explain: '多項研究顯示低碳飲食在改善三酸甘油脂、HDL 等心血管指標上優於低脂飲食 🫀', category: 'myth', tier: 3 },
  { statement: '代糖完全不影響胰島素', answer: false, explain: '部分代糖（如蔗糖素）可能透過腸道甜味受體和腸道菌叢間接影響胰島素反應 🧪', category: 'myth', tier: 3 },
  { statement: '瘦的人不可能有脂肪肝', answer: false, explain: 'TOFI（外瘦內胖）很常見。外表瘦但內臟脂肪高，肝臟照樣囤脂肪 🔬', category: 'myth', tier: 3 },
  { statement: '高強度運動比中強度更能燃脂', answer: false, explain: '高強度主要燒糖原，中低強度反而脂肪氧化比例更高。但最重要的還是飲食 🏃', category: 'myth', tier: 3 },

  // nutrition 高手
  { statement: '空腹喝咖啡會刺激皮質醇升高', answer: true, explain: '咖啡因會促進皮質醇分泌。搭配食物一起喝可以緩衝這個效應 ☕', category: 'nutrition', tier: 3 },
  { statement: '膽固醇主要由肝臟自行合成，飲食影響不到20%', answer: true, explain: '身體 80% 膽固醇是自己做的。吃蛋不會讓膽固醇飆高，身體會自動調節 🥚', category: 'nutrition', tier: 3 },
  { statement: '蛋白質攝取過多會轉化成脂肪儲存', answer: false, explain: '蛋白質轉脂肪的代謝路徑效率極低，實際上多餘的蛋白質大多被排出或用於產熱 💪', category: 'nutrition', tier: 3 },
  { statement: '間歇性斷食的主要好處來自「少吃」', answer: false, explain: '主要好處是讓胰島素有時間下降，啟動細胞自噬和脂肪氧化。吃的時候吃對更重要。ABC 建議自然的 12 小時空腹就好，不需要硬撐長時間斷食 ⏰', category: 'nutrition', tier: 3 },

  // abc 高手
  { statement: '胰島素阻抗可以透過飲食在幾週內開始改善', answer: true, explain: '減少精緻碳水 + 增加蛋白質 + 適度空腹，2-4 週就能看到胰島素敏感度改善 📉', category: 'abc', tier: 3 },
  { statement: '長期高碳水飲食是造成胰島素阻抗的唯一原因', answer: false, explain: '睡眠不足、壓力、久坐、慢性發炎都會加重胰島素阻抗。飲食是最大因素但不是唯一 🧩', category: 'abc', tier: 3 },

  // mindset 高手
  { statement: '完美主義者在減肥上的成功率比彈性思維者高', answer: false, explain: '研究顯示完美主義者更容易因為一次「破功」就全面放棄。彈性思維（80/20）反而成功率更高 🧠', category: 'mindset', tier: 3 },

  // behavior 高手
  { statement: '褲頭變鬆、精神變好，比體重下降更能代表身體在改善', answer: true, explain: '體態、精神、睡眠品質、衣服鬆緊度都是代謝改善的真實指標。體重只是其中一個參考，而且常常是最慢反映的 💪', category: 'behavior', tier: 1 },

  // food_science 高手
  { statement: '微波加熱食物會破壞營養比明火加熱多', answer: false, explain: '微波加熱時間短、溫度相對低，營養保留反而比長時間高溫烹調更好 🔬', category: 'food_science', tier: 3 },
  { statement: '發酵食物中的益生菌大部分會被胃酸殺死', answer: false, explain: '雖然部分會被殺死，但很多乳酸菌能存活通過胃酸。而且發酵產生的代謝物本身就有益 🥒', category: 'food_science', tier: 3 },

  // ============================================================
  // 第二波 100 題（2026-03-27）
  // 來源：課程筆記 + 小克洞察 + knowledge.js Tier2
  // 難度：tier 1-2（簡單到中階）
  // ============================================================

  // --- 飲品真相（小克洞察） ---
  { statement: '燕麥奶是好的蛋白質替代品', answer: false, explain: '燕麥奶的主要成分是澱粉，還會加油讓口感滑順。想補蛋白質選豆漿比較好 🥛', category: 'nutrition', tier: 1 },
  { statement: '杏仁奶的主要營養成分是蛋白質', answer: false, explain: '杏仁奶主要是油脂類，蛋白質含量很低。植物奶裡只有豆漿才是蛋白質 🥜', category: 'nutrition', tier: 1 },
  { statement: '豆漿是植物奶裡面蛋白質最高的', answer: true, explain: '豆漿是唯一真正算蛋白質的植物奶。燕麥奶=澱粉、杏仁奶=油脂、鮮奶=乳品類 😊', category: 'nutrition', tier: 1 },
  { statement: '蜂蜜水算是健康飲品', answer: false, explain: '蜂蜜的主要成分是糖，蜂蜜水就是含糖飲料。雖然天然，但對胰島素的影響一樣 🍯', category: 'nutrition', tier: 1 },
  { statement: '拿鐵選特大杯可以補充更多蛋白質', answer: false, explain: '特大杯 500ml 奶量太多，乳糖也是糖。選中杯或大杯就好 ☕', category: 'nutrition', tier: 2 },
  { statement: '果汁打碎後跟直接吃水果營養一樣', answer: false, explain: '打碎後纖維被破壞、營養容易氧化，而且一杯果汁要好幾顆水果的糖分。直接吃水果比較好 🍊', category: 'food_science', tier: 1 },
  { statement: '喝茶跟喝咖啡可以算在每天的飲水量裡', answer: false, explain: '茶和咖啡有利尿作用，喝了反而會排更多水。飲水量只算純水 💧', category: 'behavior', tier: 1 },
  { statement: '生理期可以喝黑糖水暖身，喝多少都沒關係', answer: false, explain: '黑糖水還是糖水，一天建議不超過 400cc。可以暖身但要注意量 🩸', category: 'nutrition', tier: 2 },

  // --- 食物分類陷阱（小克洞察） ---
  { statement: '花生是蛋白質類', answer: false, explain: '花生的主要成分是油脂，不是蛋白質。想補蛋白質選毛豆比較好 🥜', category: 'nutrition', tier: 1 },
  { statement: '米漿是好的早餐飲品', answer: false, explain: '米漿是米+花生做的，主要成分是澱粉+油脂，糖分也不低。早餐選無糖豆漿更好 🥛', category: 'nutrition', tier: 1 },
  { statement: '冬粉看起來清淡，熱量應該很低', answer: false, explain: '冬粉是綠豆澱粉做的，一碗跟一碗白飯差不多。別被透明的外表騙了 😮', category: 'food_science', tier: 1 },
  { statement: '馬鈴薯沙拉是蔬菜沙拉', answer: false, explain: '馬鈴薯是澱粉，加上美乃滋就是澱粉+油脂。當碳水吃，不要當蔬菜吃 🥔', category: 'nutrition', tier: 1 },
  { statement: '蛋沙拉是好的蛋白質來源', answer: false, explain: '蛋沙拉裡藏了很多美乃滋（油脂+糖），蛋白質的比例反而不高。直接吃水煮蛋更好 🥚', category: 'nutrition', tier: 2 },
  { statement: '可頌麵包的油脂含量很高', answer: true, explain: '可頌是用大量奶油層層摺出來的，油脂和糖分都很高。偶爾吃沒關係，但不適合當日常早餐 🥐', category: 'food_science', tier: 1 },
  { statement: '穀粉沖泡飲是健康的早餐選擇', answer: false, explain: '穀粉的主要成分就是澱粉，很多還額外加糖。等於喝一碗稀飯加糖 🥣', category: 'food_science', tier: 1 },
  { statement: '芋粿跟芋頭一樣是澱粉', answer: true, explain: '芋粿是芋頭加在來米做的，雙倍澱粉。好吃但要算在碳水的份量裡 😄', category: 'nutrition', tier: 1 },
  { statement: '百頁豆腐跟一般豆腐一樣是好的蛋白質', answer: false, explain: '百頁豆腐加了大量油脂，油脂含量是板豆腐的好幾倍。豆腐排序：板豆腐 > 嫩豆腐 > 凍豆腐 > 百頁/油豆腐 🧈', category: 'nutrition', tier: 1 },
  { statement: '花枝丸可以當主要的蛋白質來源', answer: false, explain: '花枝丸加了很多澱粉和油脂，真正的花枝含量不高。想吃海鮮蛋白質直接吃花枝或蝦比較好 🦑', category: 'nutrition', tier: 2 },
  { statement: '海帶是醃製品，要盡量少吃', answer: false, explain: '海帶是海藻類，不是醃製品。含碘和纖維，是好的蔬菜選擇 🌊', category: 'nutrition', tier: 1 },

  // --- 肉類選擇（小克洞察） ---
  { statement: '雞翅是雞肉裡面脂肪最高的部位', answer: true, explain: '雞翅的皮和脂肪比例很高。想吃低脂雞肉選雞胸、雞腿去皮比較好 🍗', category: 'nutrition', tier: 1 },
  { statement: '牛肋條是低脂的牛肉部位', answer: false, explain: '牛肋條油花很多，油脂含量高。想吃低脂牛肉選板腱、菲力或牛肩里肌 🥩', category: 'nutrition', tier: 2 },
  { statement: '滷排骨一定比炸排骨健康', answer: false, explain: '很多滷排骨其實是先炸再滷的，油脂含量不見得比較低。點餐前可以問一下店家 🍖', category: 'food_science', tier: 2 },
  { statement: '肉燥飯的肉燥可以當蛋白質', answer: false, explain: '肉燥是用肥肉末加油爆炒出來的，油脂比蛋白質多得多。想補蛋白質另外點一顆滷蛋更實在 🍚', category: 'nutrition', tier: 1 },

  // --- 外食實戰（小克洞察 + 課程筆記） ---
  { statement: '自助餐夾菜時，夾上層的菜比較不油', answer: true, explain: '油會往下沉，上層的菜相對油比較少。這個小技巧可以減少不少油脂攝取 🥬', category: 'behavior', tier: 1 },
  { statement: '便當的白飯可以用青菜來替換', answer: true, explain: '跟老闆說「飯少一點，菜多一點」或直接換成菜，是最簡單的外食升級 🍱', category: 'behavior', tier: 1 },
  { statement: '火鍋選麻辣鍋底跟清湯底，對減肥的影響差不多', answer: false, explain: '麻辣鍋底有大量油脂，光是湯底的熱量就差很多。選清湯、昆布或番茄湯底比較好 🍲', category: 'behavior', tier: 1 },
  { statement: '滷味是比較健康的外食選擇', answer: true, explain: '滷味可以自己選食材，選蛋、豆腐、蔬菜、雞肉，營養組合很好控制 😊', category: 'behavior', tier: 1 },
  { statement: '健康餐盒通常有比較多樣的配菜', answer: true, explain: '好的健康餐盒有 5-7 種配菜，蛋白質和蔬菜的種類比便當多很多，比較容易達標 🥗', category: 'behavior', tier: 1 },
  { statement: '關東煮的筊白筍和白蘿蔔可以算蔬菜', answer: true, explain: '筊白筍、白蘿蔔、杏鮑菇都是好的蔬菜選擇，在超商就能輕鬆補到蔬菜 🏪', category: 'nutrition', tier: 1 },
  { statement: '車輪餅可以當碳水吃', answer: true, explain: '車輪餅的外皮是麵粉做的，算碳水。如果要吃的話最多 2 個，配蛋白質和蔬菜一起吃 🧇', category: 'nutrition', tier: 2 },
  { statement: '粉漿蛋餅跟一般蛋餅差不多', answer: false, explain: '粉漿蛋餅的油和澱粉都比一般蛋餅多。如果點了，吃一半就好 🥞', category: 'food_science', tier: 2 },

  // --- 調味料與加工（小克洞察） ---
  { statement: '味噌的鈉含量很高', answer: true, explain: '20 克味噌就含了一天一半的鈉攝取量。味噌湯好喝但不要每天喝太多 🍜', category: 'food_science', tier: 2 },
  { statement: '麵線的鈉含量比白飯高很多', answer: true, explain: '麵線在製作過程中加了大量鹽，鈉含量很高。吃的時候不要再加太多調味料 🍝', category: 'food_science', tier: 2 },
  { statement: '潤餅裡的花生粉通常是純花生磨的', answer: false, explain: '市售花生粉很多都有加糖，甜甜的花生粉=花生+糖。可以請老闆少加或不加 🥜', category: 'food_science', tier: 2 },
  { statement: '糖醋料理通常油脂和糖都很高', answer: true, explain: '糖醋魚、糖醋排骨都是先炸再裹糖醋醬，油+糖的組合對胰島素衝擊很大 🍬', category: 'food_science', tier: 1 },
  { statement: '甜的黑豆跟原味黑豆一樣健康', answer: false, explain: '甜黑豆是黑豆+糖煮的，等於好蛋白質加了壞糖。要吃黑豆選原味的 🫘', category: 'nutrition', tier: 1 },

  // --- 素食者知識（課程筆記） ---
  { statement: '素食者很難補充到足夠的蛋白質', answer: false, explain: '豆腐、豆乾、生豆皮、毛豆、蛋都是好的蛋白質來源。重點是每餐都要吃到 🌱', category: 'nutrition', tier: 2 },
  { statement: '素料（素雞、素肉）是好的蛋白質選擇', answer: false, explain: '大部分素料都是加工品，加了很多油和澱粉。選原型的豆腐、毛豆比較好 🧆', category: 'nutrition', tier: 1 },

  // --- 特殊族群（課程筆記） ---
  { statement: '多囊性卵巢（PCOS）的人不能吃豆類', answer: false, explain: '多囊的人豆類和奶類都可以正常吃。穩定飲食對荷爾蒙恢復很有幫助 💜', category: 'nutrition', tier: 2 },
  { statement: '甲狀腺低下的人靠飲食控制也能改善體重', answer: true, explain: '甲狀腺低下不代表不能瘦，搭配運動和正確飲食還是能看到改變 💪', category: 'myth', tier: 2 },
  { statement: '上夜班的人應該照一般人的時間吃飯', answer: false, explain: '夜班族照自己的生活作息吃就好。上班前至少喝一杯無糖豆漿補蛋白質 🌙', category: 'behavior', tier: 2 },
  { statement: '胃不舒服的時候應該直接恢復正常飲食', answer: false, explain: '胃不舒服要先讓胃休息，從稀釋運動飲料→白粥白饅頭→慢慢恢復。急著吃反而更不舒服 🤢', category: 'behavior', tier: 2 },

  // --- 代謝與胰島素（knowledge.js Tier1 + Tier2） ---
  { statement: '碳水化合物是最會刺激胰島素分泌的營養素', answer: true, explain: '碳水 > 蛋白質 > 脂肪。所以控制碳水的量和品質，對穩定胰島素最有效 📊', category: 'abc', tier: 1 },
  { statement: '脂肪幾乎不會刺激胰島素分泌', answer: true, explain: '油脂對胰島素的影響最小。所以吃好油不會讓你變胖，反而幫助燃脂 🥑', category: 'abc', tier: 1 },
  { statement: '胰島素高的時候，身體會鎖住脂肪不讓它燃燒', answer: true, explain: '高胰島素=脂肪儲存模式。要燃脂就要讓胰島素降下來，這就是 ABC 的核心 🔒', category: 'abc', tier: 1 },
  { statement: '慢性發炎跟肥胖沒有關係', answer: false, explain: '慢性發炎會加重胰島素阻抗，讓身體更容易囤積脂肪。代謝重建的底層邏輯之一就是降低發炎 🔥', category: 'abc', tier: 2 },
  { statement: '久坐不動也會影響胰島素敏感度', answer: true, explain: '久坐會讓肌肉對胰島素的反應變差。就算飲食做對了，也要記得多動動 🪑', category: 'abc', tier: 2 },

  // --- 菜肉飯順序法（knowledge.js Tier1） ---
  { statement: '先吃菜再吃肉再吃飯，可以降低餐後血糖飆升', answer: true, explain: 'UCLA 研究證實菜肉飯順序可以降低 35% 的餐後血糖飆升。簡單但有效 📉', category: 'abc', tier: 1 },
  { statement: '每口食物咀嚼 20 下有助於消化和飽足感', answer: true, explain: '慢慢咀嚼可以讓飽足感訊號傳到大腦，自然就不會吃太多 😊', category: 'behavior', tier: 1 },
  { statement: '吃飯順序只是心理作用，對血糖沒有實際影響', answer: false, explain: '有研究證實先吃蔬菜和蛋白質可以減緩碳水的吸收速度，血糖波動明顯變小 📊', category: 'myth', tier: 1 },
  { statement: '蔬菜建議量是每餐兩個拳頭大', answer: true, explain: '兩拳頭的蔬菜可以提供足夠纖維，幫助穩定血糖和增加飽足感 🥦', category: 'abc', tier: 1 },
  { statement: '蛋白質的建議量是每餐一個手掌大', answer: true, explain: '一個手掌大小的肉、魚或豆腐，大約就是該餐需要的蛋白質量。簡單好記 🤚', category: 'abc', tier: 1 },

  // --- 蛋白質深入（knowledge.js + 課程筆記） ---
  { statement: '蛋白質吃不夠可能會掉頭髮', answer: true, explain: '頭髮主要由蛋白質組成，長期不足會影響頭髮生長。這是身體發出的警訊 💇', category: 'nutrition', tier: 1 },
  { statement: '蛋白質吃不夠反而會越減越肥', answer: true, explain: '蛋白質不足→肌肉流失→代謝下降→更容易囤積脂肪。這是很多人減肥失敗的原因 😱', category: 'nutrition', tier: 1 },
  { statement: '長輩需要的蛋白質比年輕人少', answer: false, explain: '長輩反而需要更多蛋白質（每公斤體重 1.5-2 倍），因為肌肉流失速度加快，預防肌少症很重要 👴', category: 'nutrition', tier: 2 },
  { statement: '蛋白質不要只吃雞胸肉，要多樣化', answer: true, explain: '雞胸肉很好，但蛋、魚、豆腐、豬肉、牛肉都是好的蛋白質。多樣化營養更均衡 🍽️', category: 'nutrition', tier: 1 },

  // --- 油脂知識（knowledge.js Tier1） ---
  { statement: '沙拉油是好的烹飪用油', answer: false, explain: '沙拉油、大豆油都是不太好的油。選酪梨油、橄欖油、奶油、椰子油比較好 🫒', category: 'nutrition', tier: 1 },
  { statement: '奶油是不健康的油脂', answer: false, explain: '在低碳水的前提下，奶油是可以安心使用的好油脂。重點是搭配的碳水要控制 🧈', category: 'myth', tier: 2 },

  // --- 停滯期（knowledge.js Tier2） ---
  { statement: '體重停住不動的時候應該吃更少', answer: false, explain: '吃更少只會讓代謝更慢。停滯期要持續做對的事，身體會自己調整過來 ⏸️', category: 'myth', tier: 1 },
  { statement: '停滯期是身體在重新調整的正常過程', answer: true, explain: '身體會經歷「排水→停滯→再下降」的階梯式變化，停滯期代表身體正在適應新的代謝模式 📶', category: 'abc', tier: 1 },
  { statement: '停滯期時看體態比看體重更重要', answer: true, explain: '體重不動但褲子變鬆、腰圍變小，代表脂肪在減少、肌肉在增加。這才是真正的進步 📏', category: 'mindset', tier: 1 },

  // --- 加法思維與心態（課程筆記 + 一休金句） ---
  { statement: '減肥最重要的是「不吃什麼」', answer: false, explain: '一休說「不吃什麼比較難，但增加什麼容易得多」。加法思維比減法思維更容易持久 ➕', category: 'mindset', tier: 1 },
  { statement: '偶爾吃大餐不需要有罪惡感', answer: true, explain: '聚餐是生活的一部分。享受當下，下一餐回到正軌就好。不需要補償也不需要自責 🎉', category: 'mindset', tier: 1 },
  { statement: '減肥復胖的根本原因通常是用錯方法', answer: true, explain: '一休說「其實過去復胖根本原因是用錯方法」。不是你不夠努力，是方法不對 💡', category: 'mindset', tier: 1 },
  { statement: '剝奪感是長期瘦身最大的敵人', answer: true, explain: '「不感到剝奪、不感到恐懼，而是能有意識的選擇」——這才是能維持一輩子的方式 🧠', category: 'mindset', tier: 1 },
  { statement: '有時候我們吃的不是食物，而是情緒', answer: true, explain: '壓力大、心情不好的時候特別想吃東西，這是情緒性進食。認出來就是改變的第一步 🫂', category: 'mindset', tier: 1 },
  { statement: '破功一次就等於前面的努力都白費了', answer: false, explain: '每一餐都是新的開始。一次破功不會抹殺之前的努力，回到正軌就好 💪', category: 'mindset', tier: 1 },
  { statement: '膽固醇數值改善比瘦幾公斤更值得開心', answer: true, explain: '一休說「膽固醇數值變好絕對比瘦幾公斤更值得開心」。健康指標的改善才是真正的收穫 ❤️', category: 'mindset', tier: 1 },
  { statement: '減肥的過程中不應該讓自己感到飢餓', answer: true, explain: '一直餓的話身體會進入省電模式，代謝下降。吃對的食物讓自己吃飽，反而瘦得更快 😊', category: 'abc', tier: 1 },

  // --- 飢餓的種類（課程筆記） ---
  { statement: '所有的飢餓感都是因為吃太少', answer: false, explain: '飢餓有四種：吃太少的餓、營養素不夠的餓、蛋白質不夠的餓、習慣吃多的餓。要分辨是哪一種 🤔', category: 'nutrition', tier: 2 },
  { statement: '蛋白質吃不夠也會讓你一直覺得餓', answer: true, explain: '蛋白質是最有飽足感的營養素。如果吃完飯很快又餓了，可能是蛋白質不夠 🥩', category: 'nutrition', tier: 1 },

  // --- 運動與恢復（knowledge.js Tier2） ---
  { statement: '運動後黃金 30 分鐘內補充營養很重要', answer: true, explain: '運動後 30 分鐘內補充醣類和蛋白質（比例約 3-4:1），恢復效果最好 🏋️', category: 'behavior', tier: 2 },
  { statement: '每天都要高強度運動才能瘦', answer: false, explain: '運動是加分題不是必考題。先把飲食調好，散步、走路也是很好的運動 🚶', category: 'myth', tier: 1 },

  // --- 睡眠與壓力（knowledge.js Tier2） ---
  { statement: '睡不好會讓你更想吃高熱量食物', answer: true, explain: '睡眠不足會讓飢餓素上升，而且飢餓素會特別讓你想吃高熱量、高糖的食物 😴', category: 'behavior', tier: 2 },
  { statement: '壓力大的時候脂肪容易堆積在肚子', answer: true, explain: '壓力讓皮質醇升高，皮質醇會促進脂肪堆積在腹部。管理壓力也是瘦身的一部分 😰', category: 'behavior', tier: 2 },
  { statement: '喝酒不太會影響減肥效果', answer: false, explain: '酒精會優先被代謝，暫停脂肪燃燒。而且喝酒後特別容易放縱吃東西 🍺', category: 'behavior', tier: 1 },

  // --- 神經習慣與行為改變（knowledge.js Tier2） ---
  { statement: '養成一個新的飲食習慣大約需要 21-66 天', answer: true, explain: '大腦需要時間建立新的神經連結。堅持 3-9 週，新習慣就會變成自動反應 🧠', category: 'behavior', tier: 2 },
  { statement: '每次想吃零食的衝動大約只會持續 10-15 分鐘', answer: true, explain: '嘴饞的衝動像浪一樣會來也會走。忍過那幾分鐘，喝杯水或做點別的事就好了 🌊', category: 'behavior', tier: 2 },
  { statement: '家裡放什麼零食不重要，重要的是意志力', answer: false, explain: '環境影響比意志力大得多。家裡不放不健康的零食，改放堅果、毛豆，就不需要靠意志力了 🏠', category: 'behavior', tier: 1 },

  // --- 聚餐與社交（knowledge.js Tier2） ---
  { statement: '聚餐前先吃點蛋白質，到場比較不會暴吃', answer: true, explain: '出門前先吃顆蛋或喝杯豆漿，有底墊比較不會因為太餓而失控 🥚', category: 'behavior', tier: 1 },
  { statement: '吃到飽餐廳就是減肥的大敵', answer: false, explain: '吃到飽也能吃得好：先裝蔬菜和蛋白質，少拿澱粉和甜點。方法對了，哪裡都能吃 🍽️', category: 'behavior', tier: 2 },

  // --- 肌少症（knowledge.js Tier2） ---
  { statement: '肌肉流失只會發生在老年人身上', answer: false, explain: '長期節食、蛋白質不足的年輕人也會肌肉流失。肌肉是代謝的引擎，要好好保護 💪', category: 'myth', tier: 2 },
  { statement: '肌肉量越多，基礎代謝率越高', answer: true, explain: '肌肉是身體最大的血糖消費者和代謝引擎。所以要吃夠蛋白質保住肌肉 🏋️', category: 'nutrition', tier: 1 },

  // --- 外部評價（knowledge.js Tier2 + 課程筆記） ---
  { statement: '家人說「你又在減肥」的時候，最好解釋清楚你的方法', answer: false, explain: '不需要說服別人。做給自己看，等身體開始改變，他們自然會看到 🤫', category: 'mindset', tier: 2 },
  { statement: '別人的眼光不應該成為你改變的動力', answer: true, explain: '為自己的健康改變，比為了別人的評價改變更持久。內在動機才是長久的燃料 🔥', category: 'mindset', tier: 2 },

  // --- 課程進行中的心態（課程筆記） ---
  { statement: '第 4-5 週感到倦怠是不正常的', answer: false, explain: '第 4-5 週是常見的心理倦怠期，不是體重停滯。這是正常的過程，撐過去就好了 ⏰', category: 'mindset', tier: 2 },
  { statement: '「吃兩口應該沒關係」的想法要特別注意', answer: true, explain: '這是最常見的滑坡起點。不是不能吃，而是要有意識地選擇，不是無意識地放鬆 ⚠️', category: 'mindset', tier: 2 },
  { statement: '減肥期間完全不看體重計比較好', answer: false, explain: '可以看，但不要每天看。一週量一次就好，重點是看趨勢而不是單日數字 ⚖️', category: 'behavior', tier: 2 },

  // --- 有借有還原則（課程筆記） ---
  { statement: '假日吃了大餐，下一餐回到正軌就好', answer: true, explain: '這就是「有借有還」原則。大餐後不需要懲罰自己，下一餐正常吃就好 😊', category: 'abc', tier: 1 },
  { statement: '假日可以完全放飛兩天不用管飲食', answer: false, explain: '完全放飛兩天會影響整週的成果。假日也能享受，但保持意識——知道自己在選什麼 🎯', category: 'behavior', tier: 1 },

  // --- 體感指標（課程筆記） ---
  { statement: '精神變好是代謝開始改善的訊號之一', answer: true, explain: '吃對了之後，精神、睡眠、午後不昏沉，這些都是代謝改善的真實指標 ✨', category: 'abc', tier: 1 },
  { statement: '不想吃甜食了，代表身體的代謝在恢復', answer: true, explain: '當胰島素穩定下來，對甜食的渴望自然會降低。這是身體在告訴你「我好多了」🎉', category: 'abc', tier: 1 },
  { statement: '飯後不會昏沉想睡，是血糖穩定的表現', answer: true, explain: '飯後血糖飆升→胰島素大量分泌→血糖急降→昏沉想睡。不會想睡代表血糖很穩定 😊', category: 'abc', tier: 1 },

  // --- 補充品（課程筆記） ---
  { statement: '魚油對減肥有幫助', answer: true, explain: '魚油含 Omega-3，有助於降低發炎和改善胰島素敏感度。但劑量和品質很重要，建議問一休老師 🐟', category: 'nutrition', tier: 2 },
  { statement: '益生菌可以幫助體重管理', answer: true, explain: '腸道菌叢會影響代謝和食慾。吃發酵食物或適當補充益生菌對腸道健康有幫助 🦠', category: 'nutrition', tier: 2 },

  // --- 煮食小知識（小克洞察） ---
  { statement: '白飯放涼再加熱，升糖指數會比剛煮好的低', answer: true, explain: '白飯放涼會產生抗性澱粉，升糖指數變低。隔夜飯反而對血糖比較友善 🍚', category: 'food_science', tier: 2 },
  { statement: '氣炸鍋炸出來的食物一定比油炸健康', answer: false, explain: '如果食物本身是預炸的（像炸雞塊、薯條），氣炸只是重新加熱，油脂已經在裡面了 🍟', category: 'food_science', tier: 2 },
  { statement: '外面餐廳的蔬菜湯可以放心喝', answer: false, explain: '自己煮的蔬菜湯可以喝，但外面的湯通常加了很多油和調味料。蔬菜撈起來吃，湯少喝 🍲', category: 'food_science', tier: 2 },
  { statement: '用低脂肉的方法是看營養標籤的脂肪含量', answer: true, explain: '同樣是肉，脂肪含量可以差很多。看營養標籤是最準確的判斷方法 🏷️', category: 'food_science', tier: 2 },
  { statement: '白菜滷裡面如果加了豬皮，油脂就很高', answer: true, explain: '豬皮幾乎全是膠原蛋白和油脂。白菜滷本來清淡，加了豬皮就變油膩了 🥬', category: 'food_science', tier: 1 },
  { statement: '鹹水雞的蔬菜隔天可以微加熱當早餐', answer: true, explain: '鹹水雞的蔬菜和雞肉帶回家，隔天微加熱就是現成的蛋白質+蔬菜早餐 🐔', category: 'behavior', tier: 1 },
  { statement: '滷肉飯改成雞肉飯會比較好', answer: true, explain: '雞肉飯的蛋白質比較高、油脂比較低。小小的替換就能讓一餐升級 🍗', category: 'behavior', tier: 1 },
];
