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
  { statement: '蔬菜要多吃，沒有上限', answer: true, explain: '蔬菜纖維多、熱量低，能穩定血糖又增加飽足感。放心吃！🥬', category: 'nutrition', tier: 1 },
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
  { statement: '減肥成功的關鍵是意志力', answer: false, explain: '理解了就自然會做，不需要意志力硬撐。如果需要硬撐，表示方法不對 🔑', category: 'mindset', tier: 2 },
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
  { statement: '體重數字是判斷身體狀態最準確的指標', answer: false, explain: '體重無法反映體脂、肌肉量、水分變化。關注精神、體態、衣服鬆緊和健康指標，比盯著體重計重要得多 📊', category: 'behavior', tier: 1 },
  { statement: '餐前先想好要吃什麼，比到了再選更好', answer: true, explain: '肚子餓的時候判斷力最差。提前計畫好，就不會在饑餓時做出錯誤選擇 📝', category: 'behavior', tier: 1 },
  { statement: '咀嚼次數越多越好', answer: true, explain: '每口嚼 20-30 下，食物磨碎更好消化，大腦也有時間接收飽足感 😋', category: 'behavior', tier: 1 },

  // Tier 2
  { statement: '斷食時間越長越好', answer: false, explain: '適度空腹有好處，但過長反而會流失肌肉。吃的時候吃對更重要 ⏰', category: 'behavior', tier: 2 },
  { statement: '運動後 30 分鐘內馬上吃東西會容易變胖', answer: false, explain: '運動後反而是很好的補充時機！身體會優先把能量拿來修復肌肉和補充肝糖，不容易囤積脂肪 🏋️', category: 'behavior', tier: 1 },
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
  { statement: '魚肉是很好的蛋白質來源', answer: true, explain: '魚肉蛋白質高、脂肪低，還富含 Omega-3，是最優質的蛋白質之一 🐟', category: 'nutrition', tier: 1 },
  { statement: '酪梨是水果但主要成分是好油脂', answer: true, explain: '酪梨的脂肪含量高但都是單元不飽和脂肪酸，是好油的代表食物 🥑', category: 'nutrition', tier: 1 },

  // mindset 補充
  { statement: '跟朋友聚餐吃大餐也是生活的一部分', answer: true, explain: '享受生活不是犯罪。聚餐開心吃，下一餐調回來就好。人生不是只有減肥 🎉', category: 'mindset', tier: 1 },
  { statement: '看到別人吃零食自己也想吃，代表自己太軟弱', answer: false, explain: '這是正常的社交效應和本能反應，不是軟弱。提前吃夠蛋白質可以減少誘惑 😌', category: 'mindset', tier: 1 },
  { statement: '復胖不代表失敗，代表你需要更好的方法', answer: true, explain: '復胖是方法的問題，不是你的問題。找到適合自己的方式才能長久 🔄', category: 'mindset', tier: 2 },

  // behavior 補充
  { statement: '固定時間吃飯比隨便吃更好', answer: true, explain: '規律的飲食節奏讓身體有預期，荷爾蒙分泌更穩定，代謝也更好 🕐', category: 'behavior', tier: 1 },
  { statement: '早睡早起對減肥有幫助', answer: true, explain: '充足睡眠讓瘦體素（Leptin）正常分泌，減少隔天暴食的機率 😴', category: 'behavior', tier: 1 },

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
  { statement: '腸道菌叢的組成會影響一個人的體重', answer: true, explain: '研究發現肥胖者和瘦子的腸道菌叢組成明顯不同。飲食改變可以改善菌叢 🦠', category: 'nutrition', tier: 3 },
  { statement: '間歇性斷食的主要好處來自「少吃」', answer: false, explain: '主要好處是讓胰島素有時間下降，啟動細胞自噬和脂肪氧化。吃的時候吃對更重要 ⏰', category: 'nutrition', tier: 3 },

  // abc 高手
  { statement: '代謝彈性是指身體能靈活切換燃燒糖和脂肪的能力', answer: true, explain: '代謝靈活的人飽了燒脂肪、餓了也燒脂肪。代謝僵化的人只會燒糖，沒糖就餓到慌 🔄', category: 'abc', tier: 3 },
  { statement: '胰島素阻抗可以透過飲食在幾週內開始改善', answer: true, explain: '減少精緻碳水 + 增加蛋白質 + 適度空腹，2-4 週就能看到胰島素敏感度改善 📉', category: 'abc', tier: 3 },
  { statement: '長期高碳水飲食是造成胰島素阻抗的唯一原因', answer: false, explain: '睡眠不足、壓力、久坐、慢性發炎都會加重胰島素阻抗。飲食是最大因素但不是唯一 🧩', category: 'abc', tier: 3 },

  // mindset 高手
  { statement: '完美主義者在減肥上的成功率比彈性思維者高', answer: false, explain: '研究顯示完美主義者更容易因為一次「破功」就全面放棄。彈性思維（80/20）反而成功率更高 🧠', category: 'mindset', tier: 3 },
  { statement: '壓力會直接導致腹部脂肪囤積', answer: true, explain: '皮質醇長期偏高會促進內臟脂肪堆積，尤其是腹部。壓力管理也是減脂的一環 😰', category: 'mindset', tier: 3 },

  // behavior 高手
  { statement: '褲頭變鬆、精神變好，比體重下降更能代表身體在改善', answer: true, explain: '體態、精神、睡眠品質、衣服鬆緊度都是代謝改善的真實指標。體重只是其中一個參考，而且常常是最慢反映的 💪', category: 'behavior', tier: 1 },
  { statement: '在自然光下吃早餐可以幫助調節食慾荷爾蒙', answer: true, explain: '早晨光照能重設生理時鐘，幫助褪黑激素和瘦體素的正常節律，對食慾控制有幫助 🌅', category: 'behavior', tier: 3 },
  { statement: '吃飯時看手機對消化沒有影響', answer: false, explain: '分心進食會減少咀嚼次數、降低飽足感訊號，容易不知不覺吃過量 📱', category: 'behavior', tier: 3 },

  // food_science 高手
  { statement: '微波加熱食物會破壞營養比明火加熱多', answer: false, explain: '微波加熱時間短、溫度相對低，營養保留反而比長時間高溫烹調更好 🔬', category: 'food_science', tier: 3 },
  { statement: '發酵食物中的益生菌大部分會被胃酸殺死', answer: false, explain: '雖然部分會被殺死，但很多乳酸菌能存活通過胃酸。而且發酵產生的代謝物本身就有益 🥒', category: 'food_science', tier: 3 },
];
