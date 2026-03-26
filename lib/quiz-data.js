/**
 * 食物分類測驗題庫 — 共用資料檔
 *
 * 所有消費端（webhook LINE 版、web quiz、history 頁、quiz API）都從這裡 import。
 * 新增 / 修改題目只需要改這一個檔案。
 */

// === 題目分類 ===
export const QUIZ_CATEGORIES = [
  { id: 'starch-disguise', name: '澱粉偽裝系列', emoji: '🍚', description: '偽裝成蔬菜或蛋白質的澱粉' },
  { id: 'protein', name: '蛋白質系列', emoji: '🥩', description: '真的蛋白質 vs 偽裝的' },
  { id: 'fat', name: '油脂系列', emoji: '🥑', description: '真的油脂 + 偽裝的' },
  { id: 'vegetable', name: '蔬菜系列', emoji: '🥬', description: '真蔬菜 + 容易搞混的' },
  { id: 'fruit', name: '水果系列', emoji: '🍎', description: '水果的糖分陷阱' },
  { id: 'beverage', name: '飲品系列', emoji: '🥤', description: '你喝的到底是什麼' },
  { id: 'processed', name: '加工食品/外食系列', emoji: '🍱', description: '台灣小吃的真面目' },
  { id: 'sauce', name: '調味料/醬料系列', emoji: '🧂', description: '隱藏的糖和油' },
];

// === 等級定義 ===
export const QUIZ_LEVELS = [
  { min: 0, title: '食物新手', emoji: '🌱', next: '再認識 {n} 種就升級' },
  { min: 15, title: '分類學徒', emoji: '⭐', next: '再認識 {n} 種就升級' },
  { min: 40, title: '營養達人', emoji: '🏆', next: '再認識 {n} 種就升級' },
  { min: 75, title: '食物專家', emoji: '💎', next: '再認識 {n} 種就升級' },
  { min: 110, title: '分類大師', emoji: '👑', next: '再認識 {n} 種就升級' },
  { min: 149, title: '全制霸', emoji: '🎖️', next: '你已經是最高等級了！' },
];

// === 題庫 ===
export const FOOD_QUIZZES = [
  // ============================================================
  // 澱粉偽裝系列 — 偽裝成蔬菜 / 蛋白質 / 堅果的澱粉
  // ============================================================

  // --- 原有 34 題中的澱粉題 ---
  { food: '南瓜', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '南瓜吃起來甜甜的，很多人當蔬菜，但其實是澱粉類，吃了要算在飯的份量裡 😄', category: 'starch-disguise' },
  { food: '玉米', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '很多人以為玉米是蔬菜，其實它跟飯一樣是澱粉類 😄', category: 'starch-disguise' },
  { food: '蓮藕', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '蓮藕吃起來脆脆的像蔬菜，但其實是澱粉類 😄', category: 'starch-disguise' },
  { food: '山藥', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '山藥跟地瓜一樣是澱粉類，吃了就要減少飯量喔 😄', category: 'starch-disguise' },
  { food: '芋頭', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '芋頭是澱粉！芋頭牛奶、芋圓都是澱粉+澱粉，要注意份量 😄', category: 'starch-disguise' },
  { food: '菱角', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '菱角吃起來像零食，但它其實是澱粉，吃多了等於多吃飯 😄', category: 'starch-disguise' },
  { food: '栗子', optA: '堅果', optB: '澱粉', correct: '澱粉', explain: '栗子雖然長得像堅果，但主要成分是澱粉，不是油脂 😄', category: 'starch-disguise' },
  { food: '紅豆', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '紅豆、綠豆、花豆雖然叫「豆」，但主要成分是澱粉，紅豆湯=甜澱粉水 😄', category: 'starch-disguise' },
  { food: '綠豆', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '綠豆跟紅豆一樣是澱粉！綠豆湯、綠豆沙都算澱粉類 😄', category: 'starch-disguise' },
  { food: '冬粉', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '冬粉看起來清淡透明，但它是綠豆澱粉做的，一碗跟一碗白飯差不多 😮', category: 'starch-disguise' },
  { food: '米粉', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '米粉就是米做的，跟白飯一樣是澱粉！炒米粉看起來少少的但澱粉量不低 😄', category: 'starch-disguise' },
  { food: '米漿', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '米漿是米+花生做的，主要成分是澱粉+油脂，不是蛋白質 😄', category: 'starch-disguise' },

  // --- 新增澱粉偽裝題 ---
  { food: '地瓜', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '地瓜是很好的原型澱粉，但它就是澱粉，吃了要減飯量 😄', category: 'starch-disguise' },
  { food: '馬鈴薯', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '馬鈴薯是澱粉類！薯條、薯泥、焗烤馬鈴薯都是在吃澱粉 😄', category: 'starch-disguise' },
  { food: '薏仁', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '薏仁雖然常被當養生食材，但它就是五穀類的澱粉 😄', category: 'starch-disguise' },
  { food: '蓮子', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '蓮子是澱粉！蓮子湯加糖水就是雙倍糖分炸彈 😮', category: 'starch-disguise' },
  { food: '荸薺', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '荸薺（馬蹄）口感脆脆的像蔬菜，但它其實是澱粉類 😄', category: 'starch-disguise' },
  { food: '皇帝豆', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '皇帝豆跟紅豆綠豆一樣，雖然叫「豆」但主要成分是澱粉 😄', category: 'starch-disguise' },
  { food: '珍珠（粉圓）', optA: '油脂', optB: '澱粉', correct: '澱粉', explain: '珍珠是樹薯粉做的純澱粉！一杯珍奶的珍珠就等於大半碗飯 😱', category: 'starch-disguise' },
  { food: '年糕', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '年糕是糯米做的澱粉！過年吃一塊兩塊可以，不要當零食吃 😄', category: 'starch-disguise' },
  { food: '意麵', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '意麵是油炸過的麵條，澱粉+油脂雙重炸彈，少吃為妙 😮', category: 'starch-disguise' },
  { food: '河粉', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '河粉是米漿做的，純澱粉！炒河粉又再加一堆油 😄', category: 'starch-disguise' },
  { food: '甜不辣', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '甜不辣主要是麵粉+魚漿做的，澱粉含量很高，不能當蛋白質 😮', category: 'starch-disguise' },
  { food: '蘿蔔糕', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '蘿蔔糕是在來米漿做的，蘿蔔只是點綴，主體是澱粉 😄', category: 'starch-disguise' },
  { food: '肉圓', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '肉圓的皮是番薯粉做的澱粉，再加上油炸，熱量爆表 😮', category: 'starch-disguise' },
  { food: '水餃皮', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '水餃皮是麵粉做的澱粉！10 顆水餃的皮就超過一碗飯了 😮', category: 'starch-disguise' },
  { food: '蛋餅皮', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '蛋餅皮是麵粉做的，不要因為有「蛋」就以為是蛋白質 😄', category: 'starch-disguise' },
  { food: '吐司', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '吐司就是精製澱粉，兩片吐司 ≈ 一碗白飯的澱粉量 😄', category: 'starch-disguise' },
  { food: '燕麥', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '燕麥是好的原型澱粉，但它就是澱粉，不是蛋白質。份量要控制 😄', category: 'starch-disguise' },
  { food: '玉米片', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '玉米片就是加工過的玉米澱粉，通常還加了糖和油 😄', category: 'starch-disguise' },

  // ============================================================
  // 蛋白質系列 — 真的蛋白質 vs 偽裝的
  // ============================================================

  // --- 原有蛋白質題 ---
  { food: '毛豆', optA: '蔬菜', optB: '蛋白質', correct: '蛋白質', explain: '毛豆是非常好的植物性蛋白質來源 💪', category: 'protein' },
  { food: '豆皮', optA: '蛋白質', optB: '油脂', correct: '蛋白質', explain: '豆皮（生豆皮）是很好的蛋白質來源，但炸豆皮就變油脂了 😄', category: 'protein' },
  { food: '蛋豆腐', optA: '蛋白質', optB: '油脂', correct: '蛋白質', explain: '蛋豆腐是蛋+豆漿做的，是好的蛋白質來源 😄（但日式炸蛋豆腐就不同了）', category: 'protein' },
  { food: '豆漿', optA: '蛋白質', optB: '澱粉', correct: '蛋白質', explain: '無糖豆漿是很好的蛋白質來源！記得選無糖的，加糖會讓胰島素飆升 😄', category: 'protein' },
  { food: '千張', optA: '澱粉', optB: '蛋白質', correct: '蛋白質', explain: '千張是豆製品，屬於蛋白質！拿來包菜包肉是很棒的低碳替代品 💪', category: 'protein' },

  // --- 新增蛋白質題 ---
  { food: '鮭魚', optA: '蛋白質', optB: '油脂', correct: '蛋白質', explain: '鮭魚主要是蛋白質，雖然含 Omega-3 好油，但歸類在蛋白質 😄', category: 'protein' },
  { food: '鮪魚罐頭', optA: '蛋白質', optB: '油脂', correct: '蛋白質', explain: '水煮鮪魚罐頭是方便的蛋白質來源，選水煮的，不要選油漬的 😄', category: 'protein' },
  { food: '豆干', optA: '澱粉', optB: '蛋白質', correct: '蛋白質', explain: '豆干是豆製品，蛋白質含量高，是素食者的好朋友 💪', category: 'protein' },
  { food: '豆花', optA: '澱粉', optB: '蛋白質', correct: '蛋白質', explain: '豆花本身是蛋白質，但加糖水加配料就變成糖分炸彈了 😄', category: 'protein' },
  { food: '黑豆', optA: '澱粉', optB: '蛋白質', correct: '蛋白質', explain: '黑豆跟黃豆一樣是蛋白質，不要跟紅豆綠豆搞混了 💪', category: 'protein' },
  { food: '天貝', optA: '澱粉', optB: '蛋白質', correct: '蛋白質', explain: '天貝是發酵黃豆做的，蛋白質豐富，是很棒的植物性蛋白 💪', category: 'protein' },
  { food: '希臘優格', optA: '蛋白質', optB: '油脂', correct: '蛋白質', explain: '希臘優格的蛋白質是一般優格的兩倍，選無糖的最好 💪', category: 'protein' },
  { food: '無糖優格', optA: '蛋白質', optB: '澱粉', correct: '蛋白質', explain: '無糖優格是蛋白質+益生菌的好選擇，但加了果醬就不同了 😄', category: 'protein' },
  { food: '起司', optA: '蛋白質', optB: '油脂', correct: '蛋白質', explain: '起司主要是蛋白質+鈣質，但加工起司片油脂偏高，選天然起司較好 😄', category: 'protein' },
  { food: '嫩豆腐', optA: '蛋白質', optB: '油脂', correct: '蛋白質', explain: '嫩豆腐是好的蛋白質來源，熱量低，跟百頁豆腐完全不同 💪', category: 'protein' },

  // ============================================================
  // 油脂系列 — 真的油脂 + 偽裝成蛋白質/水果的油脂
  // ============================================================

  // --- 原有油脂題 ---
  { food: '百頁豆腐', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '百頁豆腐在製程中加了很多油，熱量是嫩豆腐的 3 倍 😱', category: 'fat' },
  { food: '花生', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '花生雖然叫「豆」但主要成分是油脂，一小把就好 😄', category: 'fat' },
  { food: '腰果', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '所有堅果（腰果、杏仁、核桃）都是油脂類，一天一小把就夠了 😄', category: 'fat' },
  { food: '培根', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '培根大部分熱量來自脂肪，算油脂類。想吃肉選雞胸、里肌更好 💪', category: 'fat' },
  { food: '貢丸', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '貢丸是加工品，裡面加了很多油和澱粉，蛋白質含量其實不高 😮', category: 'fat' },
  { food: '熱狗', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '熱狗是加工肉品，脂肪含量很高，選原型肉類比較好 😄', category: 'fat' },
  { food: '酪梨', optA: '水果', optB: '油脂', correct: '油脂', explain: '酪梨雖然是水果，但主要成分是好的油脂，算在油脂類 😄', category: 'fat' },
  { food: '椰子', optA: '水果', optB: '油脂', correct: '油脂', explain: '椰子肉和椰奶的脂肪含量很高，算油脂類。椰子水倒是低熱量 😄', category: 'fat' },
  { food: '奇亞籽', optA: '蔬菜', optB: '油脂', correct: '油脂', explain: '奇亞籽是堅果種子類，屬於油脂！很多人以為是纖維，其實要算在油脂裡 😄', category: 'fat' },
  { food: '蘇打餅', optA: '澱粉', optB: '油脂', correct: '澱粉', explain: '蘇打餅主要原料是麵粉，是澱粉類。而且油脂含量比你想的高不少，少量當零食還行 😮', category: 'fat' },
  { food: '鍋貼', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '鍋貼的餡料是高油絞肉，皮又吸油煎炸，油脂量很驚人。最多5個，配燙青菜 😄', category: 'fat' },

  // --- 新增油脂題 ---
  { food: '核桃', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '核桃是好的油脂來源，富含 Omega-3，但一天一小把就夠 😄', category: 'fat' },
  { food: '杏仁', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '杏仁是油脂類的堅果，營養豐富但熱量也高，控制份量 😄', category: 'fat' },
  { food: '芝麻', optA: '蔬菜', optB: '油脂', correct: '油脂', explain: '芝麻是油脂類！黑芝麻粉、芝麻醬都是在吃油，要算份量 😄', category: 'fat' },
  { food: '亞麻仁籽', optA: '蔬菜', optB: '油脂', correct: '油脂', explain: '亞麻仁籽富含 Omega-3，是好油脂，但熱量不低 😄', category: 'fat' },
  { food: '南瓜籽', optA: '蔬菜', optB: '油脂', correct: '油脂', explain: '南瓜籽是堅果種子類，屬於油脂，不要跟南瓜搞混了 😄', category: 'fat' },
  { food: '橄欖', optA: '蔬菜', optB: '油脂', correct: '油脂', explain: '橄欖的主要成分是好的油脂，吃起來像配菜但要算油脂份量 😄', category: 'fat' },
  { food: '美乃滋', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '美乃滋是蛋黃+油打出來的，一大匙熱量就超過 100 大卡 😮', category: 'fat' },
  { food: '沙拉醬', optA: '蔬菜', optB: '油脂', correct: '油脂', explain: '沙拉醬的主成分是油！沙拉淋太多醬，熱量可能比炒飯還高 😮', category: 'fat' },
  { food: '花生醬', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '花生醬的主成分是油脂，兩大匙就超過 200 大卡 😮', category: 'fat' },
  { food: '芝麻醬', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '芝麻醬就是液態的油脂！拌麵淋一大匙熱量爆增 😮', category: 'fat' },
  { food: '鮮奶油', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '鮮奶油幾乎是純油脂，蛋糕上的奶油花一朵就很高熱量 😮', category: 'fat' },
  { food: '奶精', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '奶精根本不含奶！是植物油+糖做的，純油脂+糖的組合 😱', category: 'fat' },
  { food: '炸雞皮', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '雞皮本身就是脂肪，再裹粉油炸，油脂含量超驚人 😮', category: 'fat' },
  { food: '五花肉', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '五花肉的油脂比蛋白質還多，偶爾吃可以但不能當主要蛋白質來源 😄', category: 'fat' },
  { food: '香腸', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '香腸是高油高糖的加工肉品，脂肪含量非常高 😮', category: 'fat' },
  { food: '獅子頭', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '獅子頭用的是高油絞肉，油炸後更是油脂炸彈 😮', category: 'fat' },
  { food: '炸豆腐', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '豆腐一油炸，豆腐的孔洞全部吸滿油，熱量翻好幾倍 😮', category: 'fat' },
  { food: '油條', optA: '澱粉', optB: '油脂', correct: '油脂', explain: '油條是油炸過的麵粉，油脂含量驚人，配豆漿也救不了 😮', category: 'fat' },
  { food: '奶油', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '奶油就是純油脂，塗吐司一小塊就快 100 大卡了 😄', category: 'fat' },

  // ============================================================
  // 蔬菜系列 — 真蔬菜 + 容易搞混的
  // ============================================================

  // --- 原有蔬菜題 ---
  { food: '蘿蔔', optA: '蔬菜', optB: '澱粉', correct: '蔬菜', explain: '白蘿蔔是蔬菜，熱量低纖維高，煮湯滷味都很好 😄', category: 'vegetable' },
  { food: '玉米筍', optA: '蔬菜', optB: '澱粉', correct: '蔬菜', explain: '玉米筍跟玉米不一樣！玉米筍是蔬菜，可以放心吃 😄', category: 'vegetable' },
  { food: '蒟蒻', optA: '澱粉', optB: '蔬菜', correct: '蔬菜', explain: '蒟蒻幾乎零熱量，算蔬菜/纖維類，嘴饞的好朋友 😄', category: 'vegetable' },
  { food: '秋葵', optA: '蔬菜', optB: '澱粉', correct: '蔬菜', explain: '秋葵是蔬菜，而且黏液對腸胃很好，安心吃 😄', category: 'vegetable' },
  { food: '大番茄', optA: '蔬菜', optB: '水果', correct: '蔬菜', explain: '大番茄是蔬菜，可以放心吃！但小番茄是水果，要注意份量 😄', category: 'vegetable' },

  // --- 新增蔬菜題 ---
  { food: '青花菜', optA: '蔬菜', optB: '蛋白質', correct: '蔬菜', explain: '青花菜是蔬菜，蛋白質含量在蔬菜中算高的，營養超好 💪', category: 'vegetable' },
  { food: '地瓜葉', optA: '蔬菜', optB: '澱粉', correct: '蔬菜', explain: '地瓜葉是蔬菜！不要跟地瓜搞混了，地瓜才是澱粉 😄', category: 'vegetable' },
  { food: '茄子', optA: '蔬菜', optB: '澱粉', correct: '蔬菜', explain: '茄子是蔬菜，但很會吸油，烹調方式很重要 😄', category: 'vegetable' },
  { food: '甜椒', optA: '蔬菜', optB: '水果', correct: '蔬菜', explain: '甜椒是蔬菜，維生素 C 比很多水果還高 💪', category: 'vegetable' },
  { food: '木耳', optA: '蔬菜', optB: '澱粉', correct: '蔬菜', explain: '木耳是蔬菜/菇類，低熱量高纖維，涼拌木耳是好選擇 😄', category: 'vegetable' },
  { food: '金針菇', optA: '蔬菜', optB: '澱粉', correct: '蔬菜', explain: '金針菇是蔬菜/菇類，火鍋放多一些可以增加飽足感 😄', category: 'vegetable' },
  { food: '杏鮑菇', optA: '蔬菜', optB: '蛋白質', correct: '蔬菜', explain: '杏鮑菇是蔬菜/菇類，口感像肉但熱量超低 😄', category: 'vegetable' },
  { food: '香菇', optA: '蔬菜', optB: '蛋白質', correct: '蔬菜', explain: '香菇是蔬菜/菇類，營養豐富又增添風味 😄', category: 'vegetable' },
  { food: '海帶', optA: '蔬菜', optB: '澱粉', correct: '蔬菜', explain: '海帶是蔬菜，富含碘和纖維，滷海帶是好選擇 😄', category: 'vegetable' },
  { food: '紫菜', optA: '蔬菜', optB: '蛋白質', correct: '蔬菜', explain: '紫菜是蔬菜類的海藻，紫菜蛋花湯熱量很低 😄', category: 'vegetable' },
  { food: '豆芽菜', optA: '蔬菜', optB: '蛋白質', correct: '蔬菜', explain: '豆芽菜是蔬菜，雖然從豆子發芽，但營養歸類在蔬菜 😄', category: 'vegetable' },
  { food: '筊白筍', optA: '蔬菜', optB: '澱粉', correct: '蔬菜', explain: '筊白筍是蔬菜，口感像筍但更嫩，低卡又好吃 😄', category: 'vegetable' },

  // ============================================================
  // 水果系列
  // ============================================================

  // --- 原有水果題 ---
  { food: '小番茄', optA: '蔬菜', optB: '水果', correct: '水果', explain: '小番茄是水果喔！一拳頭就是一份水果的量，別當蔬菜無限吃 😄', category: 'fruit' },

  // --- 新增水果題 ---
  { food: '香蕉', optA: '水果', optB: '澱粉', correct: '水果', explain: '香蕉是水果但糖分偏高，運動前後吃不錯，平時一根就好 😄', category: 'fruit' },
  { food: '芒果', optA: '水果', optB: '澱粉', correct: '水果', explain: '芒果是水果，但糖分很高！切好一碗就超過兩份水果了 😮', category: 'fruit' },
  { food: '荔枝', optA: '水果', optB: '澱粉', correct: '水果', explain: '荔枝糖分超高，「一顆荔枝三把火」不是說假的，一次不要超過 5-6 顆 😄', category: 'fruit' },
  { food: '龍眼', optA: '水果', optB: '澱粉', correct: '水果', explain: '龍眼跟荔枝一樣糖分很高，容易一把接一把停不下來 😄', category: 'fruit' },
  { food: '葡萄', optA: '水果', optB: '澱粉', correct: '水果', explain: '葡萄是水果，但一串吃下來糖分不少，控制在 10-15 顆 😄', category: 'fruit' },
  { food: '芭樂', optA: '水果', optB: '蔬菜', correct: '水果', explain: '芭樂是低糖高纖水果，減脂期水果首選！但還是要控制份量 💪', category: 'fruit' },
  { food: '奇異果', optA: '水果', optB: '蔬菜', correct: '水果', explain: '奇異果維生素 C 超高，是好的水果選擇 😄', category: 'fruit' },
  { food: '西瓜', optA: '水果', optB: '蔬菜', correct: '水果', explain: '西瓜含水量高但 GI 值也高，吃一片兩片就好 😄', category: 'fruit' },
  { food: '木瓜', optA: '水果', optB: '蔬菜', correct: '水果', explain: '木瓜是水果，酵素幫助消化，但糖分也不低 😄', category: 'fruit' },
  { food: '榴槤', optA: '水果', optB: '油脂', correct: '水果', explain: '榴槤是水果但熱量超高！糖分+油脂都高，一小塊就好 😮', category: 'fruit' },

  // ============================================================
  // 飲品系列
  // ============================================================
  { food: '燕麥奶', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '燕麥奶是燕麥做的，主成分是澱粉不是蛋白質，名字有「奶」但不是奶 😮', category: 'beverage' },
  { food: '杏仁奶', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '杏仁奶主要是水+少量杏仁，杏仁是油脂類，蛋白質含量很低 😄', category: 'beverage' },
  { food: '有糖豆漿', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '加了糖的豆漿，糖的影響不能忽略。盡量選無糖的才是好的蛋白質來源 😄', category: 'beverage' },
  { food: '拿鐵', optA: '蛋白質', optB: '油脂', correct: '蛋白質', explain: '無糖拿鐵主要是牛奶+咖啡，算蛋白質+少許油脂 😄', category: 'beverage' },
  { food: '珍珠奶茶', optA: '澱粉', optB: '油脂', correct: '澱粉', explain: '珍珠是澱粉+奶精是油脂+糖，一杯熱量等於一個便當 😱', category: 'beverage' },
  { food: '養樂多', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '養樂多含大量糖分，主要熱量來自糖（澱粉類），益生菌是附帶的 😄', category: 'beverage' },
  { food: '運動飲料', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '運動飲料含大量糖分，沒有大量運動流汗的話喝水就好 😄', category: 'beverage' },
  { food: '果汁', optA: '水果', optB: '澱粉', correct: '澱粉', explain: '果汁去掉了纖維只留糖分，一杯柳丁汁要 5-6 顆柳丁的糖 😮', category: 'beverage' },
  { food: '椰子水', optA: '油脂', optB: '水果', correct: '水果', explain: '椰子水跟椰子肉不同！椰子水熱量低糖分也不太高，算水果類 😄', category: 'beverage' },
  { food: '味噌湯', optA: '蛋白質', optB: '蔬菜', correct: '蛋白質', explain: '味噌是黃豆發酵的，算蛋白質類。熱量低又暖胃 😄', category: 'beverage' },
  { food: '玉米濃湯', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '玉米濃湯 = 玉米澱粉+奶油+勾芡，一碗熱量不低 😮', category: 'beverage' },
  { food: '保久乳', optA: '蛋白質', optB: '澱粉', correct: '蛋白質', explain: '保久乳跟鮮奶營養差不多，都是蛋白質，只是殺菌方式不同 😄', category: 'beverage' },

  // ============================================================
  // 加工食品/外食系列
  // ============================================================
  { food: '滷肉飯', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '滷肉飯主角是那碗白飯！滷肉的油脂也不少，偶爾吃就好 😄', category: 'processed' },
  { food: '雞排', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '雞排裹粉油炸，油脂含量驚人，一片超過 500 大卡 😮', category: 'processed' },
  { food: '鹽酥雞', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '鹽酥雞裹粉油炸，不管炸什麼都變成油脂炸彈 😮', category: 'processed' },
  { food: '臭豆腐', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '炸臭豆腐吸飽了油，一塊就很多油脂。清蒸臭豆腐比較好 😄', category: 'processed' },
  { food: '蚵仔煎', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '蚵仔煎的太白粉漿才是主角，蚵仔只是點綴，再加上甜辣醬超多糖 😮', category: 'processed' },
  { food: '水煎包', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '水煎包的麵皮就是澱粉，底部還煎到吸油，澱粉+油脂 😄', category: 'processed' },
  { food: '小籠包', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '小籠包皮是澱粉，餡是高油絞肉，一次吃 10 個熱量超高 😮', category: 'processed' },
  { food: '蔥抓餅', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '蔥抓餅是麵粉+油做的，蔥只是提味，主體是澱粉和油 😄', category: 'processed' },
  { food: '潤餅', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '潤餅皮是澱粉，裡面的花生粉也是油脂，看起來健康但熱量不低 😄', category: 'processed' },
  { food: '刈包', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '刈包的皮是饅頭（澱粉），加上肥肉和花生粉，熱量爆表 😮', category: 'processed' },
  { food: '肉粽', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '肉粽主角是糯米（澱粉），再加上油脂豐富的餡料，一顆就超過一餐 😮', category: 'processed' },
  { food: '便當白飯', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '便當白飯通常都裝太多，一盒等於兩碗飯，可以請老闆飯少一點 😄', category: 'processed' },
  { food: '便當配菜（炒青菜）', optA: '蔬菜', optB: '油脂', correct: '蔬菜', explain: '便當炒青菜算蔬菜，但有些店用很多油炒，菜底都是油 😄', category: 'processed' },
  { food: '燒賣', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '燒賣用的是高油絞肉+蝦仁，脂肪含量偏高 😄', category: 'processed' },

  // ============================================================
  // 調味料/醬料系列
  // ============================================================
  { food: '沙茶醬', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '沙茶醬含大量油脂，火鍋沾一點就好，不要整碗泡 😄', category: 'sauce' },
  { food: '番茄醬', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '番茄醬含大量糖分，一大匙就有一匙糖的量 😮', category: 'sauce' },
  { food: '甜辣醬', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '甜辣醬的「甜」來自大量糖分，少沾為妙 😄', category: 'sauce' },
  { food: '蜂蜜', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '蜂蜜就是糖！天然的糖還是糖，對胰島素的影響跟砂糖差不多 😮', category: 'sauce' },
  { food: '黑糖', optA: '澱粉', optB: '蔬菜', correct: '澱粉', explain: '黑糖就是糖！礦物質含量微乎其微，不要被「養生」標籤騙了 😮', category: 'sauce' },
  { food: '果糖（糖漿）', optA: '水果', optB: '澱粉', correct: '澱粉', explain: '手搖飲的果糖是玉米糖漿，跟水果完全無關，對肝臟負擔很大 😮', category: 'sauce' },
  { food: '楓糖漿', optA: '蔬菜', optB: '澱粉', correct: '澱粉', explain: '楓糖漿就是糖！天然來源不代表不是糖，對血糖影響一樣大 😮', category: 'sauce' },
  { food: '味醂', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '味醂是日式料理常用的調味料，含大量糖分，要注意用量 😄', category: 'sauce' },
  { food: '烤肉醬', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '烤肉醬含大量糖和醬油，刷一層就多很多糖分，少用為妙 😄', category: 'sauce' },

  // ============================================================
  // 補充題 — 加工食品/外食
  // ============================================================
  { food: '關東煮蘿蔔', optA: '蔬菜', optB: '澱粉', correct: '蔬菜', explain: '關東煮的蘿蔔是蔬菜，但關東煮的米血糕和甜不辣是澱粉 😄', category: 'processed' },
  { food: '米血糕', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '米血糕主要是糯米做的澱粉，豬血只是小部分 😄', category: 'processed' },
  { food: '蔥花蛋', optA: '蛋白質', optB: '油脂', correct: '蛋白質', explain: '蔥花蛋主要是蛋的蛋白質，自己煎少用點油就是好選擇 💪', category: 'processed' },
  { food: '豬血湯', optA: '蛋白質', optB: '油脂', correct: '蛋白質', explain: '豬血是蛋白質，豬血湯熱量很低又有飽足感，是平價好選擇 💪', category: 'processed' },
  { food: '魚丸', optA: '蛋白質', optB: '澱粉', correct: '澱粉', explain: '魚丸加了很多澱粉和調味料，魚的含量其實不高 😮', category: 'processed' },
  { food: '蛋捲', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '蛋捲主要成分是麵粉+糖+油，蛋只是點綴，不要被名字騙了 😮', category: 'processed' },
  { food: '蘿蔔乾', optA: '蔬菜', optB: '澱粉', correct: '蔬菜', explain: '蘿蔔乾是蔬菜醃漬的，但鈉含量很高要注意 😄', category: 'processed' },

  // ============================================================
  // 補充題 — 飲品
  // ============================================================
  { food: '可樂', optA: '水果', optB: '澱粉', correct: '澱粉', explain: '一罐可樂含 35 克糖，等於 7 顆方糖，全是空熱量 😮', category: 'beverage' },
  { food: '牛肉湯', optA: '蛋白質', optB: '油脂', correct: '蛋白質', explain: '清燉牛肉湯有蛋白質，但如果浮油很多就要注意油脂 😄', category: 'beverage' },

  // ============================================================
  // 補充題 — 油脂
  // ============================================================
  { food: '椰子油', optA: '蔬菜', optB: '油脂', correct: '油脂', explain: '椰子油就是純油脂，中鏈脂肪酸的好處不代表可以無限吃 😄', category: 'fat' },
  { food: '豬油', optA: '蛋白質', optB: '油脂', correct: '油脂', explain: '豬油是純油脂，拌飯拌麵一小匙就超過 100 大卡 😄', category: 'fat' },
];
