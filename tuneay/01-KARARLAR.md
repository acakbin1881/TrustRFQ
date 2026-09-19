# 01 — Mimari kararlar

Her karar: **bağlam → seçenekler → karar → sonucu ne olur**.
Durum etiketleri: ✅ kabul edildi · 🔄 uygulanıyor · ⏳ sonraya

---

## K-01 · Tek SPA + gerçek yönlendirme ✅

**Bağlam.** Bugün iki kopuk dünya var: `public/hero.html` el yazımı statik HTML,
`otc.html` ise React. Desk'in 4 bölümü `useState` ile değişiyor, URL'de görünmüyor —
link paylaşılamıyor, geri tuşu çalışmıyor, yenilemede hep "New offer"a düşüyor.
Yönlendirmenin tamamı `vercel.json`'da, yani deploy katmanında.

**Seçenekler.** (a) Tek SPA + client router · (b) MPA: iki ayrı React girişi ·
(c) Landing statik kalsın, sadece desk bölümleri URL'e taşınsın.

**Karar: (a) — tek giriş `index.html`, React Router v8.**

Rota haritası:

| Rota | Ekran |
|------|-------|
| `/` | Landing |
| `/desk` | → `/desk/new` yönlendirmesi |
| `/desk/new` | Teklif oluşturma (bugünkü `create`) |
| `/desk/incoming` | Gelen teklifler |
| `/desk/sent` | Gönderilenler |
| `/desk/rfq` | RFQ paneli |

Eski adresler kırılmayacak: `/hero` → `/`, `/otc` → `/desk`, `/intent` → `/desk`.

**Sonucu.**
- `vite.config.ts`'teki `rollupOptions.input` `otc.html` → `index.html` olur.
- `vercel.json`: `/` → `/hero` rewrite'ı kalkar, yerine SPA fallback gelir; eski
  adresler redirect olarak kalır.
- Desk bölüm state'i `useState` yerine URL'den okunur.
- ⚠️ `intent.css`'teki `[data-panel="create|incoming|sent"]` kuralları bölüm adlarına
  bağlı. Rota adları (`new`) ile panel `data-panel` değerleri **ayrı tutulacak** —
  `data-panel` değerleri aynen korunur, yoksa boşluklar sessizce bozulur.

---

## K-02 · Tailwind v4 + token köprüsü ✅

**Bağlam.** Bugün 3.900 satır global CSS var (`styles.css` 1604 + `intent.css` 691 +
`hero.css` 1613) ve `public/` altında oldukları için Vite'a hiç girmiyorlar.
`styles.css`'in token isimleri ve seçicileri `intent.css` + JSX ile **sözleşme**:
değer değişebilir, isim değişemez. Yükleme sırası taşıyıcı.

**Seçenekler.** (a) Tailwind v4 · (b) CSS Modules · (c) düz CSS devam.

**Karar: (a) Tailwind v4 (`@tailwindcss/vite`), mevcut token'ların üzerine köprüyle.**

Köprü şöyle kurulur — Tailwind teması mevcut değişkenleri **kopyalamaz, referans verir**:

```css
@import "tailwindcss";

@theme inline {
  --color-canvas:  var(--bg);
  --color-surface: var(--bg-raised);
  --color-ink:     var(--text-1);
  --color-accent:  var(--gold);   /* isim yanıltıcı: mürekkep aksanı */
}
```

`@theme inline` olması şart: değerler `var()` referansı olarak kalsın, böylece
`styles.css`'teki bir token değiştiğinde Tailwind çıktısı da onunla değişsin. Tek
kaynak `styles.css` olmaya devam eder.

**Sonucu.**
- Yeni ekranlar Tailwind ile yazılır; eski CSS **bozulmadan yerinde kalır**, ekran ekran emekli edilir.
- CSP'ye dokunmak gerekmez: Tailwind build-time üretiyor, çıktı `'self'` bir CSS dosyası.
  (`style-src`'de zaten `'unsafe-inline'` de var.)
- Runtime maliyeti sıfır — CSS-in-JS değil.
- ⚠️ Tailwind'in `preflight`'ı (reset) mevcut `styles.css` tabanıyla çakışabilir.
  **Preflight kapatılarak başlanacak**; mevcut base kuralları korunur.

---

## K-03 · Landing React'e taşınır, `hero.css` korunur 🔄

**Bağlam.** `hero.js` (242 satır) elle şunları yapıyor: IntersectionObserver ile
scroll-reveal, daktilo efekti, fare parallax'ı (pointermove → CSS custom property),
sticky topbar, `prefers-reduced-motion` kontrolü.

**Karar.** Markup React bileşenlerine taşınır; `hero.js`'in davranışı **hook'lara**
çevrilir (`useReveal`, `useTypewriter`, `useParallax`). `hero.css` ilk aşamada
**aynen korunur** — görsel dil değişimi ayrı bir adım (K-05), taşıma sırasında
görüntü birebir aynı kalmalı ki regresyon görünür olsun.

⚠️ `hero.css`'in iki kuralı taşınırken korunmak zorunda:
- `transform` ile `backdrop-filter` **aynı elemanda** olmalı. Dönüştürülmüş bir üst
  eleman "backdrop root" oluyor ve altındaki blur hiçbir şey örneklemiyor → panel
  boş/siyah render ediliyor. Parallax'ın bir sarmalayıcıyı transform etmek yerine
  `--lp-mx`/`--lp-my` custom property'leriyle beslenmesinin sebebi bu.
- `prefers-reduced-motion` yolu korunacak: gizleme durumu ancak geri açılabiliyorsa
  kurulmalı (IntersectionObserver yoksa hiç gizleme yapma).

---

## K-04 · Kademeli geçiş, big-bang yok ✅

**Bağlam.** Hackathon. Takım aynı repoda RFQ protokolü üzerinde çalışıyor.

**Karar.** Her adım tek başına çalışır ve yeşil kalır durumda birleşir:

1. Tailwind kurulumu + token köprüsü — hiçbir ekranı değiştirmez
2. Tek giriş + router — desk bölümleri URL'e taşınır, görüntü aynı
3. Landing React'e taşınır — görüntü birebir aynı
4. Eski statik landing emekli edilir, `vercel.json` sadeleşir
5. Yeni görsel dil (K-05)

Her adımda `npm test` (192) + `npm run typecheck` temiz olmadan commit yok.

**Dokunmadığımız alanlar:** `src/core/`, `src/data/`, `src/wallet/`, `contracts/`, `tools/`.
`src/ui/RfqPanel.tsx` sıcak dosya — dokunmadan önce `git fetch`.

---

## K-05 · Yeni görsel dil ⏳

Yapı oturduktan sonra karar verilecek. Şu an netleşen tek şey: `styles.css`'teki token
**isimleri** korunacak (sözleşme), **değerleri** serbest. Yani yeni görsel dil, token
değerlerini değiştirerek ve yeni ekranları Tailwind ile yazarak gelecek.

Görsel dil kararına girdi olacak bugünkü sorunlar:
- RFQ paneli diğer üç panelle aynı dili konuşmuyor
- `stellar-wallets-kit`'in cüzdan modalı koyu temalı, uygulamaya hiç uymuyor
- Incoming'in boş durumu dengesiz (dar sol sütun + geniş boş kutu)
- Boş durumlar genel olarak zayıf: tek satır gri yazı
