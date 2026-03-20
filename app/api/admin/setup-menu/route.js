/**
 * Rich Menu 設定 API
 *
 * POST /api/admin/setup-menu — 建立 + 上傳圖片 + 設為預設
 * DELETE /api/admin/setup-menu — 刪除所有 Rich Menu
 *
 * 需要 ADMIN_API_KEY 驗證
 */

import { createRichMenu, uploadRichMenuImage, setDefaultRichMenu, listRichMenus, deleteRichMenu } from '@/lib/line';
import { NextResponse } from 'next/server';

function checkAuth(request) {
  const key = request.headers.get('x-admin-key');
  return key === process.env.ADMIN_API_KEY;
}

// Rich Menu 定義：2500×1686 (full)，3×2 六格
const MENU_CONFIG = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: '休校長小幫手選單 v3',
  chatBarText: '📋 選單',
  areas: [
    // 上排：左 → 中 → 右
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: 'message', label: '下一餐吃什麼', text: '下一餐吃什麼' },
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: { type: 'message', label: '這個能吃嗎', text: '這個能吃嗎' },
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: 'message', label: '考考我', text: '考考我食物分類' },
    },
    // 下排：左 → 中 → 右
    {
      bounds: { x: 0, y: 843, width: 833, height: 843 },
      action: { type: 'message', label: '我的進步', text: '我的進步' },
    },
    {
      bounds: { x: 833, y: 843, width: 834, height: 843 },
      action: { type: 'message', label: '肚子餓了', text: '肚子餓了' },
    },
    {
      bounds: { x: 1667, y: 843, width: 833, height: 843 },
      action: { type: 'message', label: '跟小幫手聊聊', text: '跟小幫手聊聊' },
    },
  ],
};

/**
 * 用 SVG 產生選單圖片（2500×843，4 欄彩色方塊 + 文字）
 */
async function generateMenuImage() {
  const sharp = (await import('sharp')).default;

  const buttons = [
    { emoji: '🍱', line1: '下一餐', line2: '吃什麼', bg: '#E8734A' },
    { emoji: '🔍', line1: '這個', line2: '能吃嗎', bg: '#4AAD8E' },
    { emoji: '😋', line1: '肚子', line2: '餓了', bg: '#4A8FCC' },
    { emoji: '🌸', line1: '經期', line2: '怎麼吃', bg: '#CC6B8E' },
  ];

  const colW = 625;
  const h = 843;

  // 組合 SVG
  const rects = buttons.map((b, i) => `
    <rect x="${i * colW}" y="0" width="${colW}" height="${h}" fill="${b.bg}"/>
    <text x="${i * colW + colW / 2}" y="${h * 0.35}" text-anchor="middle" font-size="120">${b.emoji}</text>
    <text x="${i * colW + colW / 2}" y="${h * 0.60}" text-anchor="middle" fill="white" font-size="72" font-weight="bold" font-family="Noto Sans TC, Noto Sans CJK TC, PingFang TC, Heiti TC, sans-serif">${b.line1}</text>
    <text x="${i * colW + colW / 2}" y="${h * 0.78}" text-anchor="middle" fill="white" font-size="72" font-weight="bold" font-family="Noto Sans TC, Noto Sans CJK TC, PingFang TC, Heiti TC, sans-serif">${b.line2}</text>
  `).join('');

  const svg = `<svg width="2500" height="843" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;

  try {
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return buffer;
  } catch (err) {
    console.error('[Menu] SVG render failed, using fallback solid blocks:', err.message);
    // Fallback: 純色方塊（沒有文字），至少能用
    const fallbackSvg = `<svg width="2500" height="843" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="625" height="843" fill="#E8734A"/>
      <rect x="625" y="0" width="625" height="843" fill="#4AAD8E"/>
      <rect x="1250" y="0" width="625" height="843" fill="#4A8FCC"/>
      <rect x="1875" y="0" width="625" height="843" fill="#CC6B8E"/>
    </svg>`;
    return await sharp(Buffer.from(fallbackSvg)).png().toBuffer();
  }
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. 刪除舊的 Rich Menu
    const existing = await listRichMenus();
    for (const menu of existing) {
      console.log(`[Menu] Deleting old menu: ${menu.richMenuId}`);
      await deleteRichMenu(menu.richMenuId);
    }

    // 2. 建立新的 Rich Menu
    const { richMenuId } = await createRichMenu(MENU_CONFIG);
    console.log(`[Menu] Created: ${richMenuId}`);

    // 3. 產生並上傳圖片（skipImage=1 時跳過，等 PUT 上傳自訂圖片）
    const url = new URL(request.url);
    const skipImage = url.searchParams.get('skipImage') === '1';

    if (!skipImage) {
      const imageBuffer = await generateMenuImage();
      console.log(`[Menu] Image generated: ${imageBuffer.length} bytes`);
      await uploadRichMenuImage(richMenuId, imageBuffer);
      console.log(`[Menu] Image uploaded`);
    } else {
      console.log(`[Menu] Skipping image (waiting for PUT upload)`);
    }

    // 4. 設為預設
    await setDefaultRichMenu(richMenuId);
    console.log(`[Menu] Set as default`);

    return NextResponse.json({
      ok: true,
      richMenuId,
      imageUploaded: !skipImage,
      buttons: MENU_CONFIG.areas.map(a => a.action.label),
    });
  } catch (err) {
    console.error('[Menu] Setup error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PUT — 上傳自訂選單圖片（替換 SVG 產生的版本）
 * Body: 圖片 binary (JPG/PNG)
 * Query: ?menuId=richmenu-xxx（可選，預設用最新的）
 */
export async function PUT(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    let menuId = url.searchParams.get('menuId');

    if (!menuId) {
      const menus = await listRichMenus();
      if (menus.length === 0) {
        return NextResponse.json({ error: 'No rich menu found. POST first.' }, { status: 404 });
      }
      menuId = menus[0].richMenuId;
    }

    const imageBuffer = Buffer.from(await request.arrayBuffer());
    const contentType = request.headers.get('content-type') || 'image/jpeg';

    console.log(`[Menu] Uploading custom image: ${imageBuffer.length} bytes, type: ${contentType}`);
    await uploadRichMenuImage(menuId, imageBuffer);

    // 上傳完自動設為預設
    await setDefaultRichMenu(menuId);
    console.log(`[Menu] Set as default: ${menuId}`);

    return NextResponse.json({ ok: true, menuId, imageSize: imageBuffer.length, setAsDefault: true });
  } catch (err) {
    console.error('[Menu] Upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const existing = await listRichMenus();
    for (const menu of existing) {
      await deleteRichMenu(menu.richMenuId);
    }
    return NextResponse.json({ ok: true, deleted: existing.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
