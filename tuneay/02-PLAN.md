# 02 — Uygulama planı

Her adım: **ne yapılır → nasıl doğrulanır**. Bir adım yeşil olmadan sonraki başlamaz.
Durum: ⬜ bekliyor · 🔄 sürüyor · ✅ bitti

---

## ✅ Adım 1 — Tailwind v4 + token köprüsü

- `@tailwindcss/vite` eklenir, `vite.config.ts`'e plugin olarak girer.
- `src/styles/theme.css`: `@import "tailwindcss"` + `@theme inline` köprüsü.
  Preflight **kapalı** başlar (mevcut base kuralları korunsun).
- `src/main.tsx` bu dosyayı import eder.
- Hiçbir ekran değişmez; sadece araç hazır hale gelir.

**Doğrulama:** `npm test` + `npm run typecheck` temiz · `npm run build` temiz ·
`dist/*.html` içinde inline `<script>` yok · tarayıcıda desk ve landing
**görsel olarak birebir aynı** · konsolda CSP ihlali yok.

## ✅ Adım 2 — Tek giriş + React Router

- `index.html` tek Vite girişi olur (`otc.html`'in içeriği taşınır).
- `react-router` eklenir; `/`, `/desk/new|incoming|sent|rfq` rotaları kurulur.
- `src/App.tsx`'teki `tab` state'i URL'e taşınır. **`data-panel` değerleri aynen kalır**
  (`create`/`incoming`/`sent`) — `intent.css` onlara bağlı.
- `vercel.json`: SPA fallback + eski adres yönlendirmeleri (`/hero`, `/otc`, `/intent`).
- Landing bu adımda hâlâ eski statik sayfa; `/` ona bağlanır.

**Doğrulama:** 4 bölüm de URL'den açılıyor · geri/ileri tuşu çalışıyor · yenilemede
bölüm korunuyor · `/otc` ve `/intent` eskisi gibi desk'e düşüyor · `useSettlement`
grep'i **tam 3 satır** · testler + typecheck yeşil.

## ✅ Adım 3+4 — Landing React'e taşındı, eski statik sayfa emekli

Tek adımda yapıldı: `hero.css` bundle'a girmek zorundaydı ve bir süre iki kopya
CSS tutmak (biri `public/`, biri `src/`) sessizce ayrışma riski taşıyordu.

- `public/hero.html` markup'ı → `src/landing/Landing.tsx`
- İçerik → `src/landing/content.ts` (tipli veri; asıl "dinamikleştirme" bu:
  bilet yığını, merdiven satırları, slab kolonları, adımlar, güvenlik hücreleri
  artık dizi — satır eklemek veri eklemek)
- `public/hero.js` → `src/landing/motion.ts` (`useStickyNav`, `useParallax`,
  `useLandingMotion`); her listener/observer/timer unmount'ta temizleniyor,
  çünkü StrictMode effect'leri iki kez çalıştırıyor ve `tools/dev-smoke.mjs`
  tam da bunu ölçüyor
- `public/hero.css` → `src/landing/hero.css`; **global kuralları
  `:where(.lp-body)` ile kapsandı**. Landing artık desk ile aynı belgeyi
  paylaşıyor ve iki dosya da `body`/`a`/`svg`/scrollbar iddia ediyordu.
  `:where()` specificity eklemediği için hero.css'in kendi iç sıralaması aynen
  korundu. Sınıfı `motion.ts` mount'ta takıp unmount'ta çıkarıyor.
- Landing `React.lazy` ile ayrı chunk: `/desk` açan kişi landing'in 23 kB
  CSS'ini hiç indirmiyor.
- `vercel.json`: `/` → `/hero` rewrite kalktı, `/hero` → `/` redirect eklendi.

**Doğrulandı:** landing eski haliyle görsel olarak aynı · konsol temiz ·
landing↔desk SPA geçişinde gövde stilleri doğru devrediyor (`lp-body` takılıp
çıkıyor, desk kendi zeminine dönüyor) · sayfa değişiminde kaydırma sıfırlanıyor,
bölüm değişiminde korunuyor · 196 test + typecheck yeşil · `dist/*.html` inline
script içermiyor.

### Açık kalan

- `README.md`'deki dosya ağacı hâlâ `otc.html`'i tek giriş, `public/hero.html`'i
  landing olarak anlatıyor. **Bilerek dokunulmadı:** README son 30 günde 18 kez
  değişti, merge çakışması riski yüksek. main'e birleşirken düzeltilmeli.
- `tools/e2e/lib.mjs`, `tools/e2e/rfq-driver.mjs`, `tools/dev-smoke.mjs` hâlâ
  `/otc.html`'e bakıyor. `otc.html` uyumluluk girişi olarak duruyor ve router
  onu `/desk/new`'e yönlendiriyor, yani araçlar çalışıyor. Takım hazır olunca
  bu üç dosya `/desk`'e çevrilip `otc.html` silinebilir.

## ⬜ Adım 5 — Yeni görsel dil (K-05)

Yapı oturduktan sonra ayrıca karar verilecek.
