# 02 — Uygulama planı

Her adım: **ne yapılır → nasıl doğrulanır**. Bir adım yeşil olmadan sonraki başlamaz.
Durum: ⬜ bekliyor · 🔄 sürüyor · ✅ bitti

---

## ⬜ Adım 1 — Tailwind v4 + token köprüsü

- `@tailwindcss/vite` eklenir, `vite.config.ts`'e plugin olarak girer.
- `src/styles/theme.css`: `@import "tailwindcss"` + `@theme inline` köprüsü.
  Preflight **kapalı** başlar (mevcut base kuralları korunsun).
- `src/main.tsx` bu dosyayı import eder.
- Hiçbir ekran değişmez; sadece araç hazır hale gelir.

**Doğrulama:** `npm test` + `npm run typecheck` temiz · `npm run build` temiz ·
`dist/*.html` içinde inline `<script>` yok · tarayıcıda desk ve landing
**görsel olarak birebir aynı** · konsolda CSP ihlali yok.

## ⬜ Adım 2 — Tek giriş + React Router

- `index.html` tek Vite girişi olur (`otc.html`'in içeriği taşınır).
- `react-router` eklenir; `/`, `/desk/new|incoming|sent|rfq` rotaları kurulur.
- `src/App.tsx`'teki `tab` state'i URL'e taşınır. **`data-panel` değerleri aynen kalır**
  (`create`/`incoming`/`sent`) — `intent.css` onlara bağlı.
- `vercel.json`: SPA fallback + eski adres yönlendirmeleri (`/hero`, `/otc`, `/intent`).
- Landing bu adımda hâlâ eski statik sayfa; `/` ona bağlanır.

**Doğrulama:** 4 bölüm de URL'den açılıyor · geri/ileri tuşu çalışıyor · yenilemede
bölüm korunuyor · `/otc` ve `/intent` eskisi gibi desk'e düşüyor · `useSettlement`
grep'i **tam 3 satır** · testler + typecheck yeşil.

## ⬜ Adım 3 — Landing React'e taşınır

- `hero.html` markup'ı bileşenlere bölünür (`Nav`, `Hero`, `Problem`, `HowItWorks`,
  `Security`, `Cta`, `Footer`).
- `hero.js` → `useReveal` / `useTypewriter` / `useParallax` hook'ları.
- `hero.css` **aynen korunur**; `.lp-` sınıfları değişmez.

**Doğrulama:** landing'in eski ve yeni hali yan yana **görsel olarak aynı** ·
`prefers-reduced-motion: reduce` ile animasyonlar kapanıyor · blur panelleri boş/siyah
değil (transform + backdrop-filter aynı elemanda) · testler yeşil.

## ⬜ Adım 4 — Eski statik landing emekli

- `public/hero.html` + `hero.js` kaldırılır (`hero.css` kalır, React landing onu kullanıyor).
- `vercel.json` sadeleşir.

**Doğrulama:** build çıktısında artık `hero.html` yok · `/` React landing'i açıyor ·
eski adresler yönlendiriyor.

## ⬜ Adım 5 — Yeni görsel dil (K-05)

Yapı oturduktan sonra ayrıca karar verilecek.
