# tuneay/ — arayüz çalışma alanı

Bu klasör `tuneay` dalında yürüyen **arayüz (frontend) revizyonunun** çalışma defteri.
Kod değil, karar tutuyor: ne yapacağız, neden öyle yapacağız, neye dokunmayacağız.

Takımın geri kalanı şu anda **RFQ protokolü** üzerinde çalışıyor (`src/ui/RfqPanel.tsx`,
`contracts/rfq_registry/`, `tools/e2e/rfq-driver.mjs`). Bu klasördeki her karar, o işi
bozmamak üzerine kurulu.

## Dosyalar

| Dosya | Ne |
|-------|-----|
| [00-DURUM.md](00-DURUM.md) | Devraldığımız yapının analizi: sayfalar, stil sistemleri, kısıtlar, çakışma riski |
| [01-KARARLAR.md](01-KARARLAR.md) | Mimari kararlar (ADR). Her karar: bağlam → seçenekler → karar → sonuç |
| [02-PLAN.md](02-PLAN.md) | Kararların uygulama sırası ve her adımın doğrulama ölçütü |
| [tarif-isaretli-baslik.md](tarif-isaretli-baslik.md) | **Taşınabilir tarif:** hero başlığındaki işaretli kelime + ikon tekniği. Kendi başına yeterli, başka projeye kopyalanabilir |

## Çalışma kuralları (bu dal için)

1. **Dal:** `tuneay`, `main`'den açıldı. Takım pratiği bu (`yigit` dalı da öyle).
2. **Dokunma alanı:** `src/ui/`, `src/routes/`, `public/*.css`, `otc.html`/`index.html`.
   `src/core/`, `src/data/`, `src/wallet/`, `contracts/` **bizim alanımız değil** — orada
   RFQ işi yürüyor.
3. **`src/ui/RfqPanel.tsx` sıcak dosya.** Son 30 günde 6 kez değişti. Buraya dokunurken
   önce `git fetch && git log origin/main -- src/ui/RfqPanel.tsx` ile bak.
4. **Her adımda yeşil kal:** `npm test` (192 test) + `npm run typecheck` temiz olmadan commit yok.
5. **Sık senkron:** günde en az bir kez `git fetch origin && git rebase origin/main`.
   Hackathonda uzun yaşayan dal = birleştirme acısı.
6. Dil: bu klasör Türkçe (bizim defterimiz). **Kod, commit mesajı ve kod yorumları İngilizce** —
   repo öyle.
