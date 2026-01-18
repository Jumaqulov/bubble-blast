## Bubble Blast

Bubble Blast - Phaser + TypeScript asosida yozilgan bubble-shooter o'yin prototipi.
Loyiha Yandex Games (HTML5) uchun tayyorlangan.

## Tez start

Talablar:
- Node.js 18+ (yoki 20+)
- npm

Ishga tushirish:
```bash
npm install
npm run dev
```

Brauzerda `http://localhost:5173` ochiladi.

Build:
```bash
npm run build
```

Preview:
```bash
npm run preview
```

## Boshqaruv

- Sichqoncha yoki touch bilan nishonga oling.
- Tap/click - bubble otish.

## Loyiha tuzilmasi

- `src/main.ts` - bootstrap va Phaser ishga tushirish
- `src/config/*` - konfiguratsiya, balans, ranglar
- `src/scenes/*` - Boot/Menu/Game sahnalari
- `src/systems/*` - gameplay tizimlari (grid, shooting, level)
- `src/ui/*` - UI komponentlari (HUD, Button, Popup)
- `src/services/*` - Yandex SDK, storage, security
- `src/state/*` - game state va persist logikasi

## Konfiguratsiya va balans

Asosiy balans parametrlari `src/config/constants.ts` faylida:
- Bubbles radius, speed, match count
- Level progression (rows/colors/shots)
- Economy/ads/daily bonus qoidalari

Ranglar `src/config/colors.ts` faylida saqlanadi.

## Yandex Games eslatmalari

- SDK `index.html` da `https://sdk.games.s3.yandex.net/sdk.js` orqali ulangan.
- Vite `base` parametri `./` bo'lib, zip ichida to'g'ri ishlashi uchun.
- Lokal dev muhitida SDK topilmasa, `src/services/YandexSDK.ts` stub rejimda ishlaydi.

## Maqsad

Minimal playable loop:
- Grid generatsiya
- Aim + shooting
- Collision, snap va match-3
- Win/lose holatlari (soddalashtirilgan)

## Keyingi qadamlar (ixtiyoriy)

- Gameplay logikani `src/systems` ga to'liq ko'chirish
- HUD/Popup ni boyitish
- Level JSON kontent
- Yandex SDK ads/rewarded to'liq integratsiyasi
