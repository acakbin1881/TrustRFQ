# 00 — Devraldığımız yapı

Tarih: 2026-09-19 · Dal: `tuneay` (base: `main` @ `f1537b1`)
Doğrulandı: `npm test` → 13 dosya / 192 test yeşil, `npm run typecheck` temiz.

## 1. Bugün kaç "sayfa" var?

Teknik olarak **iki ayrı HTML**, ve ikisi tamamen farklı dünyalar:

| Sayfa | Dosya | Teknoloji | Stil sistemi |
|-------|-------|-----------|--------------|
| Landing | `public/hero.html` + `hero.js` (242 sat.) | **El yazımı statik HTML + vanilla JS** — Vite'a hiç girmiyor, `dist/`e aynen kopyalanıyor | `public/hero.css` (1613 sat.), tüm seçiciler `.lp-` önekli |
| Desk | `otc.html` → `src/main.tsx` | **React 19 + TS + Vite** (tek entry) | `public/styles.css` (1604) + `public/intent.css` (691) |

Desk kendi içinde tek sayfa; 4 bölüm `useState` ile değişiyor (`src/App.tsx:38`):
`create` (New offer) · `incoming` · `sent` · `rfq`.

**Bunun sonucu:** bölümler URL'de yok. Linki paylaşamıyorsun, tarayıcı geri tuşu
bölüm değiştirmiyor, sayfa yenilenince her zaman "New offer"a düşüyorsun.

## 2. Yönlendirme bugün nerede yapılıyor

Router yok. Yönlendirmenin tamamı **`vercel.json`'da**, yani deploy katmanında:

- `cleanUrls: true`
- `/` → `/hero` (rewrite)
- `/intent` → `/otc` (redirect, kalıcı değil)
- Desk içi bölümler: sadece React state.

## 3. Ekranların bugünkü hali (yerelde gezildi)

- **Landing:** açık/beyaz tema, scroll-reveal + daktilo efekti + fare parallax'ı.
  Toparlı görünüyor. `hero.js` bunları elle yapıyor: IntersectionObserver, pointermove →
  CSS custom property, sticky topbar, `prefers-reduced-motion` kontrolü.
- **New offer:** en cilalı ekran. Çift kollu takas bileti, fair-price geri okuması,
  karşı taraf adresi opsiyonel (boş = broadcast).
- **Incoming:** boş durumda iki kutu yan yana duruyor ve düzen dengesiz — sol sütun dar,
  sağdaki boş-durum kutusu geniş.
- **Sent:** tek bir boş-durum kutusu.
- **RFQ:** görsel olarak **en ham ekran**. "SELL / BUY" etiketleri, düz input, gri buton;
  diğer üç panelin tasarım diliyle oturmamış. (Sınıflar CSS'te tanımlı, ama bütün olarak
  bitmemiş duruyor.) **Takımın aktif çalıştığı yer burası.**
- **Cüzdan bağlama modalı** uygulamanın değil, `stellar-wallets-kit`'in kendi modalı:
  koyu tema, uygulamanın açık temasına hiç uymuyor.

## 4. Uyulması zorunlu kısıtlar

Bunlar keyfi değil; ihlal edilince **sessizce** kırılıyorlar.

1. **CSP (`vercel.json`) bir allow-list.**
   - `script-src 'self' 'wasm-unsafe-eval'` → **inline script yasak.** Bu yüzden
     `vite.config.ts`'te `modulePreload.polyfill: false` duruyor. Build sonrası
     `dist/*.html` içinde `<script>` bloğu çıkmamalı.
   - `style-src 'self' 'unsafe-inline' + fonts.googleapis.com` → **inline stil serbest.**
     Yani Tailwind / CSS Modules / CSS-in-JS / Framer Motion hepsi CSP açısından geçerli.
   - Yeni bir dış origin (font, CDN, API) eklenirse CSP'ye de eklenmeli, yoksa tarayıcı
     sessizce bloklar.
2. **`otc.html` önce `styles.css`, sonra `intent.css` yükler ve sıra taşıyıcı.**
   `.counter-form input` ile `input[type="text"]` aynı özgüllükte; sırayı değiştirirsen
   counter-form inputları kendi zemininde görünmez oluyor. (Bu hata bir kez yayına çıkmış.)
3. **`styles.css`'teki token isimleri ve seçiciler bir sözleşme.** `intent.css` ve JSX
   bunları sabit yazıyor. **Değer değiştir, isim değiştirme/silme.** Not: `--gold*` ailesi
   altın değil, mürekkep aksanı.
4. **`intent.css`'teki `[data-panel="..."]` kuralları bölüm adlarını takip ediyor**
   (`create`/`incoming`/`sent`). Bölüm adı değişirse hata vermez, sadece boşluklar bozulur.
   Yeniden adlandırma sonrası `src/App.tsx` + `public/intent.css` ikisinde birden grep şart.
5. **`src/App.tsx` asla `useSettlement` çağırmamalı.** `txBusy` bir `useRef`, yani örnek
   başına. Kilit `ThreadView`'da modül kapsamında. İkinci bir örnek = iki cüzdan istemi,
   iki gönderim. Değişmez: `grep -rn "useSettlement" src/` → tam 3 satır.
6. **`public/*-config.js` bilerek bundle edilmiyor** (`window.*`). Testnet sıfırlaması
   tek dosya düzenlemesi olsun diye. `src/config.ts` bunları tipli okuyan tek modül.

## 5. Çakışma riski (takım kimin neresinde)

`main` + `feat/rfq-milestone` üzerinde son 30 günün dokunulma sayısı:

| Alan | Dokunulma | Bizim için |
|------|-----------|------------|
| `src/ui/RfqPanel.tsx` | 6 | 🔴 **sıcak** — dokunmadan önce fetch |
| `contracts/rfq_registry/`, `tools/e2e/` | 10+ | 🔴 bizim alanımız değil |
| `README.md`, planlama notları | 18+ | 🟡 dokunma gereksiz |
| `public/hero.html` / `hero.css` / `hero.js` | **0** (son dokunuş çok eski) | 🟢 **serbest** |
| `public/styles.css` / `intent.css` / `otc.html` | **0** | 🟢 **serbest** |
| `src/ui/` (RfqPanel hariç) | 0 | 🟢 serbest |

**Okuma:** arayüz katmanı fiilen boşta. Landing ve desk stilleri bizim; tek hassas nokta
`RfqPanel.tsx`.

## 6. Dallar

| Dal | Durum |
|-----|-------|
| `main` | `f1537b1` — entegrasyon dalı |
| `feat/rfq-milestone` | main'in 5 commit önünde (demo deploy + doküman) |
| `yigit` | main ile aynı noktada, henüz commit yok |
| `tuneay` | **bizim dalımız**, main'den açıldı, push edildi |

## 7. Yerel geliştirme

```bash
npm install
npm run dev     # → http://localhost:5173/otc.html  (landing: /hero.html)
npm test        # 192 test
npm run typecheck
```

Cüzdan olmadan desk'i görmek için: repoda `tools/e2e/freighter-mock.mjs` var; E2E sürücüsü
sayfaya sahte bir Freighter enjekte ediyor. Aynı numara tarayıcı konsolundan da çalışıyor
(sadece görüntüleme amaçlı — imza atmaz).
