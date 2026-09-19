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

## K-05 · Görsel dil: Carbon & Lime ✅

**Karar.** Koyu karbon zemin + tek lime aksan, Space Grotesk, Apple tarzı
yerleşen hareket. Referans: Uniswap (app.uniswap.org) — hem Mobbin arşivinden
hem canlı siteden incelendi.

### Palet

| Token | Değer | Ne için |
|-------|-------|---------|
| `--color-carbon` | `#101310` | zemin |
| `--color-carbon-deep` | `#0A0C0A` | kuyular, iç alanlar |
| `--color-carbon-card` | `#171B16` | varsayılan kart |
| `--color-carbon-hi` | `#1E231D` | hover, kart üstü kart |
| `--color-carbon-line` | `#252B24` | iki karbon arası saç teli |
| `--color-lime` | `#D2FF3A` | **tek aksan** |
| `--color-snow` | `#F2F5EF` | başlıklar |
| `--color-ash` | `#A8AFA4` | gövde metni |
| `--color-slate` | `#8A9186` | etiketler, en sessiz kademe |

**Lime bir kuraldır, süs değil.** Ekranda *eyleme geçen* tek şeyi işaretler:
birincil aksiyon, canlı rakam, içinde bulunulan adım. Dekoratif kullanılırsa
sinyal olmaktan çıkar. Lime karbon üzerinde ~14:1 — yani lime bir **zemindir**
(üstüne koyu metin), küçük puntoda metin rengi değil.

### Uniswap'ten alınan yapı

- Hero ürünü **anlatmaz, gösterir**: sayfanın merkezinde dolu bir bilet durur.
- Arkada bulanık renk alanları, fareyle yavaşça sürüklenir.
- Altındaki her şey karbon üzerinde kart ızgarası.
- Rakamlar geldiklerinde sayarak yerleşir.

Uniswap'ten alınmayan: onların her kartı kendi renginde. Bizde tek aksan —
daha disiplinli ve lime'ın anlamını korur.

### Hareket

İki eğri yetiyor:
- `--ease-glide` `cubic-bezier(0.16, 1, 0.3, 1)` — hızlı çıkış, uzun yavaşlayan
  kuyruk, taşma yok. Kuyruk karakterin kendisi; kısaltılırsa sayfa "snap"
  etmeye başlar.
- `--ease-spring` `cubic-bezier(0.34, 1.56, 0.64, 1)` — tıklamaya cevap veren
  kontroller için, az miktarda taşma.

Açılış hareketi **blur içerir**: içerik kayarak değil, **odağa gelerek** belirir
(`blur(6px) → 0`, 900ms). Sakin duran şey bu.

### Uygulama notları (sessizce kıran türden)

- **Tailwind utilities bilerek katmansız.** `public/styles.css` HTML'den
  `<link>` ile geliyor, yani katmansız yazar CSS'i — ve cascade'de katman
  sırası specificity'den ÖNCE gelir. Utilities `layer(utilities)` içindeyken
  `styles.css`'in sade `a { color: inherit }` kuralı `text-carbon`'u eziyordu
  ve her lime butonun yazısı görünmez render oluyordu.
- **Preflight kapalı** olduğu için tarayıcı varsayılanları yaşıyor: link altı
  çizgisi, liste işaretleri. `theme.css` bunları `:where(.tr-dark)` altında
  sıfırlıyor.
- **Landing `<body>`'yi devralır** (`tr-dark`). Kapsayıcının arka planı scroll
  bounce'ı ve son bölümden sonrasını kaplamaz; gövdeninki kaplar. Unmount'ta
  bırakılıyor, yoksa desk siyah sayfayı miras alıyor.

### Jenerik olanı ayıklama kuralları

İlk geçişte sayfa "şablon" gibi duruyordu. Çıkan üç kural:

1. **Bulanık renk küreleri yasak.** İnternetteki her şablonun varsayılan
   görünümü ve sayfanın ne işe yaradığı hakkında hiçbir şey söylemiyor. Yerine
   **ölçüm gridi** (72px, kenarlara doğru maskeli) + **film grain** + fareyi
   uzaktan izleyen **tek yumuşak ışık**. Grid "enstrüman" der, küre "şablon".
2. **Hover'da hiçbir şey parlamaz.** `box-shadow` ile lime glow bir bildirim
   gibi okunuyordu, cevap gibi değil. Butonlar **etiketlerini takas ederek**
   cevap verir (üstteki yukarı çıkar, yenisi alttan gelir) ve ok öne kayar.
   Kartlar sadece yüzeylerini ve kenarlarını değiştirir.
3. **Çubuk (pill) enflasyonu yok.** Navbar'da yan yana duran üçüncü bir
   "Testnet" pili, barı parçalardan kurulmuş gösteriyordu. Testnet bir
   **navigasyon öğesi değil, eylemin niteliği** — bu yüzden artık nitelediği
   butonun üstünde küçük bir rozet. CTA'da tekrar edilmiyor; orada zaten
   "Connect a Testnet wallet" yazıyor.

**İkonlar:** Lucide, `strokeWidth={1.5}`. Varsayılandan ince, çünkü Space
Grotesk'in yanında bağırmak yerine durmalı. Her çözüm kartı, her adım ve her
güvenlik maddesi kendi ikonunu taşıyor; ikon anahtarları `content.ts`'te düz
string, bileşene `Landing.tsx` çeviriyor — içerik dosyası React'ten uzak kalsın.

### Arka plan düz (2026-09-19, ikinci revizyon)

Grid, grain ve imleci takip eden ışık **kaldırıldı**. Sayfayı süslüyorlardı,
ayırt etmiyorlardı — ve imleci kovalayan bir glow, koyu bir landing'in
yapabileceği en "şablon" hareket. Zemin artık düz karbon.

**Farklılaşma nereden geliyor:** düzenden, sıralamadan ve bölümlerin ne
söylediğinden. Bölüm listesi ve her birinin neden orada olduğu:

| Bölüm | İşi | Düzen |
|-------|-----|-------|
| Hero | Ürünün kendisi, doldurulmuş halde | Merkezi, dar |
| Ticker | İki yoğun bölüm arasında ritim | Tam genişlik şerit |
| Problem | Mevcut durumun maliyeti, sayarak | Asimetrik 2 sütun |
| **Difference** | Emir defteri vs masa, iddia iddia | Tablo, 2 eşit sütun |
| Solution | Üç iddia | 3 kart |
| **Mechanism** | Üç adım, **okuyucunun sürdüğü** | Ray + panel |
| **Evidence** | Kayıtlı zincir çalışması | Asimetrik + veri |
| Security | Garantiler | 2 sütun + 2×2 |
| **Questions** | Karşı tarafın sorduğu şeyler | Tek sütun, dar |

Kalın olanlar bu turda eklendi.

**Difference bölümünde sol sütun kasıtlı olarak sağlam.** Her satır, düzgün
çalışan bir emir defteri için doğru. İddia bu zaten: sorun mekanizmanın
kendisi, kötü bir uygulaması değil. Çürük adam kurmak argümanı zayıflatırdı.

**Mechanism scroll'a bağlı değil, sekmeli.** Scroll'u ele geçiren bir sekans
sayfayı okuyandan alır ve trackpad'de istediğin adıma inmek neredeyse
imkânsız. Sekme, ikinci adımı yukarı kaydırmadan tekrar okumaya izin veriyor.

**Evidence hiçbir şablonun taşıyamayacağı bölüm.** Rakamlar
`docs/evidence/live-rfq-run.json`'dan geliyor — 2026-09-14'te
`npm run e2e:rfq:live` ile alınmış iki yönlü gerçek Testnet çalışması. İşlem
hash'leri explorer'a bağlı; çözülemeyen bir hash dekordur, bölümün tüm amacı
bunların doğrulanabilir olması.

**Bir tuzak daha:** preflight kapalı olduğu için `<button>` tarayıcının
`ButtonFace` zeminini alıyor — karbon üzerinde açık gri panel, yani görünmez
yazı. SSS bir an bunu yayınladı. `theme.css` artık `:where(.tr-dark) button`
ile preflight'ın bu parçasını landing kapsamında yapıyor.

### Nesneler ve gerçek marka varlıkları (üçüncü revizyon)

**Kural: marka varlığı asla yeniden çizilmez.** Sattığı varlığın logosunu kendi
yorumuyla çizen bir masa, kendi maketi gibi okunur. XLM, USDC ve Stellar
işaretleri `@web3icons/react` (MIT) üzerinden geliyor — Stellar'ın ve Circle'ın
kendi SVG'leri. Bizim olan sadece altlarındaki disk; logoya dokunulmuyor,
yalnızca çerçeveleniyor.

**Kaldırılanlar:**
- Hero'daki `XLM / USDC · live on Stellar Testnet` pili — hazır bileşen gibi
  duruyordu ve Testnet bilgisi zaten nav rozetinde.
- Kayan iddia şeridi (ticker) — ritim içindi, o işi artık hero'daki nesneler
  yapıyor.

**Hero nesneleri:** üç gerçek işaret + bir dönen madeni para, metin sütununun
dışında konumlanmış — başlığı çerçeveliyorlar, onunla yarışmıyorlar. Her biri
kendi uzun döngüsünde ve **kasıtlı olarak faz dışı** sürükleniyor; aynı fazda
birlikte nabız atıp tek bir mekanizma gibi okunuyorlar. `lg` altında
gizleniyorlar: o genişlikte ya başlığı sıkıştırır ya da kenarda boş dururlar.

**Morph = madeni para çevirme.** `SwapDisc` gerçek bir Y ekseninde dönüyor:
XLM yüzü çekiliyor, USDC yüzü geliyor. Çapraz geçiş "iki resim" der, dönüş
"aynı paranın öbür yüzü" der — ki bu masanın yaptığı takasın ta kendisi.
Her yüz okunacak kadar duruyor (`tr-flip`'te %40/%90 bekleme), yoksa fırıldak
gibi okunur.

**Derinlik üç düzlemde.** Tek boyutta, eşit aralıklı dört disk köşelere
yapıştırılmış dekor gibi okunuyordu. Mesafe verilince alan oluyor:

| Düzlem | Boyut | Efekt | Sürüklenme |
|--------|-------|-------|------------|
| near | 80px | net, tam opak | 15s (en hızlı) |
| mid | 56px | `blur(2px)`, %70 | 19s |
| far | 44px | `blur(5px)`, %45 | 26s (en yavaş) |

Yakın olan en hızlı sürükleniyor — parallax: sana yakın şeyler daha çok
hareket eder. Bu mercek davranışı olduğu için göz açıklama istemeden kabul
ediyor.

**Konum dört köşe değil, iki küme.** Başlık `max-w-3xl` ile sınırlı; nesneler
onun bıraktığı iki yan boşlukta toplanıyor, her tarafta bir yakın nesne ve
ardına düşen daha küçük, daha bulanık yoldaşları. Göz uzaktan bir grup
okuyor, eşit aralıklı bir ikon halkası değil. Bütün x değerleri 1440'ta metin
sütununun başladığı ~%23'ün dışında.

**Kendi mührümüz disk almıyor.** `BrandMark` zaten bir mühür; mührü diskin
içine koymak çerçeve içinde çerçeve olurdu. Diskin çapında çiziliyor, böylece
çevresindekilerle aynı boyut ritminde duruyor.

**Giriş hareketi:** nesneler kayarak değil, **odağa gelerek** yerleşiyor
(`tr-settle`: scale + blur birlikte çözülüyor). Sayfanın geri kalanındaki
reveal ile aynı dil.

### Başlık ve kaydırma işareti (dördüncü revizyon)

**Başlık satır satır kendi maskesinden çıkıyor.** Kelime kelime değil: bu
puntoda kelime bazlı kademe, metni yazan bir makine gibi okunuyor. Satır ise
cümlenin gerçekten yazıldığı birim — okuyucu tek seferde bütün bir cümlecik
alıyor. 0 / 130 / 260ms kademe, 1150ms `--ease-glide`, blur ile.

⚠️ **Maskenin descender payı taşıyıcı.** "you agreed on." içindeki y ve g
taban çizgisinin altına iniyor; düz bir `overflow: hidden` onları kesiyor.
`pb-[0.16em]` payı açıyor, `-mb-[0.16em]` aynı payı düzenden geri alıyor —
satır aralığı maske hiç yokmuş gibi kalıyor.

Bu bilerek `.tr-reveal` **değil**: o bir observer bekliyor, bu başlık ise
sayfa açılırken zaten ekranda. Mount'ta çalışıyor.

**Kaydırma işareti ok değil, akış.** Ok "kaydır" der; saç teli boyunca aşağı
düşen bir iz, sayfanın kıvrımın altında devam ettiğini gösterir — aynı bilgi,
emir kipi olmadan. Bir bağlantı, yani tıklanınca da çalışıyor.

**Başlıkta üç işaretli kelime, ama eşit değil — sıralı.**

| Kelime | Ne | Hareket | Rütbe |
|--------|-----|---------|-------|
| `Move` | fiil | imleç öne kayar, kelime onu daha kısa mesafede takip eder | 2 |
| `price` | söz | dönen para + altına çizilen lime çizgi | **1 (en yüksek sesli)** |
| `agreed` | mühür | eğik ve soluktan düz ve parlağa oturur | 3 |

Sıralama işin kendisi. Aynı ağırlıkta tekrarlanan vurgu harcanmış vurgudur;
tek cümlede üç eşit süs bir araç çubuğu gibi okunur. `price` en yüksek sesli
olan çünkü bu masanın var olma sebebi olan söz: size masaya getirdiğin şey,
price ise masanın kıpırdatmayacağına söz verdiği şey.

`Move` için imleç metaforu birebir fiili canlandırıyor: imleç öncülük ediyor,
kelime peşinden sürükleniyor. `agreed` için mühür dönmüyor, **oturuyor** —
damganın inişi gibi.

- Kelime `content.ts`'te `markedWord` olarak duruyor ve satırda **string
  eşleşmesiyle** bulunuyor — metin okunabilir bir cümle olarak kalsın diye.
  Eşleşme bir gün tutmazsa satır düz render ediliyor; sessizce kaybolan bir
  süs, yanlış yerde beliren bir süsten iyidir.
- Hover hedefi **kelime**, madeni para değil: para `0.72em`, kimsenin bilerek
  bulamayacağı bir isabet alanı. `tabIndex` + `focus-visible` ile klavyeden de
  çalışıyor.
- Para `em` ile ölçekleniyor, başlığın `clamp()`'iyle birlikte büyüyüp
  küçülüyor. `align-[-0.1em]` optik taban çizgisi için: gerçek taban çizgisine
  oturtulan bir daire metnin üstünde yüzüyormuş gibi duruyor.
- Çizgi başlığın descender payının içinde yaşıyor — maske onu bu yüzden
  kesmiyor.

### Bölümlerin hover dili (beşinci revizyon)

Başlıktaki üç işaretin dili bir rütbe aşağıda bölümlere taşındı. Kural: **ne
hover alır, neden alır.**

| Öğe | Ne yapıyor | Hover'ı neden var |
|-----|-----------|-------------------|
| Solution kartı | okunur, tıklanmaz | **onay**: üstünden lime bir çizgi geçer, ikon büyür, numara lime olur |
| Security kartı | okunur, tıklanmaz | aynı dil ama **daha sessiz** — garanti bir olgudur, bakınca gösteri yapmaz |
| Difference satırı | sol-sağ karşılaştırılır | **navigasyon**: iki hücre birlikte aydınlanır, satır tek bant olur |
| Merdiven satırı | okunur | satır vurgusu + bar tam lime'a çıkar |

**Difference satırı neden farklı:** orada solu sağa karşı okuyorsun ve satırı
kaybetmek argümanı kaybetmek demek. O yüzden hover dekor değil, yön bulma.

**Kart ikonları pasifte nefes alıyor** (`tr-breathe`), başlıktakilerden daha
küçük genlikle — ekranda aynı anda birkaç tane var ve toplamları titreşime
dönüşmemeli. `nth-child` ile kademeli gecikme: üçlü bir raf asla aynı anda
nabız atmıyor. Hover'da duruyor, niyetli hareket kareyi devralıyor.

**Hiçbiri parlamıyor.** İmlecin altında açan bir ışık bildirim gibi okunur;
bunlar cevap.

### Kaydırma işareti: ok değil, el

Ok işaret eder; **el çeker**. Sayfa, kıvrımın üstünden yukarı sürüklediğin bir
şey, dolayısıyla işaret gerçekten yapacağın hareketi gösteriyor: macOS'un
kendi açık-el/kapalı-el çifti. Haritayı sürüklemiş olan herkes öğrenmeden
okuyor. Pasifte aşağı süzülüyor (çekiştiriyor), hover'da avuç kapanıyor ve
bütün öğe birkaç piksel aşağı oturuyor — tuttun.

### Merdiven kartı bir ölçeğe dönüştü

Üç renkli şeritten okunabilir bir grafiğe:

- **Tick'ler** track'in kendi arka planında (`tr-track`), her **üçte bir** —
  çeyrekte olunca dört eksen etiketi (0/20/40/60) çizgilerin *yanına*
  düşüyordu; hata gibi görünecek kadar yakın, okunacak kadar değil.
- **Bar'ın ucunda başlık**: göz değerin *bittiği* yere iniyor, bildirilen sayı
  o. Arkasındaki şerit bağlam.
- **Eksen aşağıda ve satırların grid'inde**, başlıkta çıplak bir aralık olarak
  değil.
- Her iki sayı sütunu **sabit genişlikte**: sayarak dolan bir rakam kendi
  sütununu boyutlandırırsa sayarken düzeni sürüklüyor.

⚠️ **İki hizalama tuzağı** (ikisi de yaşandı):
1. Eksenin hayalet sütunu gerçek sütunun **yapısını** taklit etmeli, tahmini
   genişliğini değil. Sabit bir `rem` 9px şaşırdı.
2. Satırlar hover bandı için `-mx-3 px-3` ile taşıyor; bu, `1fr` track'in
   ölçüldüğü kutuyu genişletiyor. Eksende aynı taşma yoksa track 24px dar
   kalıyor ve her etiket adını verdiği tick'in soluna düşüyor.

`lg` kırılımında bölüm oranı da değişti (`0.9/1.1` → `0.82/1.18`, gap 20→14):
1024px'de sayı sütunları track'i 82px'e eziyordu.

### Desk carbon/lime'a geçti (altıncı revizyon)

**Tek panel.** New offer / Incoming / Sent kalktı; kalan RFQ. Protokol ürünün
kendisi, üç başka odaya kapı açan bir nav bunun tersini söylüyor.
`Ticket`, `OfferList`, `BroadcastList`, `PairsPanel` **silinmedi** — `src/ui`'da
duruyor ve derleniyor, sadece hiçbir yerden import edilmiyor (tree-shake).
*Göstermeyi bırakmak* ile *silmek* ayrı kararlar.

Bununla birlikte kabuğun Supabase abonelikleri de gitti (`useOrders`,
`useBroadcasts`). ⚠️ Ama paket hâlâ `@supabase/supabase-js` taşıyor, çünkü
RfqPanel kendi importlarıyla getiriyor — onu tamamen dışarıda tutan giriş
`RfqDemo.tsx` ve `tools/build-rfq-demo.mjs` bunu test ediyor. Bu o değil.

**Tam sayfa, iki sütun.** Panel dar tek sütundu ve ikiden fazla maker cevap
verince cevap kıvrımın altına düşüyordu. Şimdi sol = istek, sağ = gelen
teklifler; istek ekranda kalıyor, ki teklifleri ona karşı okuyorsun.

**Nav:** marka · Testnet · bakiyeler (gerçek token işaretleriyle) ··· cüzdan.
**Disconnect adresin yanında bir ikon**, arkasında etiketli bir buton değil:
adres *üzerinde* işlem yapıyor, dolayısıyla ona ait. Erişilebilir adı ve
tooltip'i var; bardaki tek kırmızıya çalan şey ve kendini hover'da ilan ediyor.

⚠️ **`public/styles.css` hâlâ yükleniyor** (RfqPanel dışındaki paylaşılan
bileşenler ve RfqDemo için). Attribute seçicisiyle yazılmış `input[type="text"]`
kuralı, sade bir utility sınıfını **specificity'de yeniyor** — tutar alanı bu
yüzden eski temanın soluk dolgusuyla render oluyordu. O alandaki `!` bu yüzden
taşıyıcı.

**Dokunulmayanlar:** `src/ui/Gate.tsx`, `BalanceStrip.tsx`, `TokenSelect.tsx` ve
`RfqDemo.tsx`. Hepsi RfqDemo ile paylaşılıyor; o deploy eski stil sayfasını
bilerek taşıyor, dolayısıyla yerinde yeniden stillemek bu dalın sahip olmadığı
bir yayını boyardı. Desk kendi `Balances`, `WalletChip`, `DeskGate` ve
`TokenPicker`'ını yerelde çiziyor.

### Masada kalanlar (kullanıcı bu turda seçmedi)

- **Canlı Testnet nabzı**: Supabase'den "şu an N taker bu çifti izliyor".
  Gerçek veri, dinamik import ile ilk boyamayı geciktirmeden. Landing paketi
  ~12KB → ~45KB (gzip).
- **Bilet canlansın**: rakamlar sayarak dolsun + maker/taker imza mühürleri.
  Sıfır paket maliyeti.
- **Son mutabakat kanıtı**: Evidence'daki tx satırını hero'ya taşımak.

### Şu an nerede

Landing bu dille yeniden yapıldı. **Desk henüz eski açık temada** — token
isimleri sözleşme olduğu için oraya geçiş ayrı ve dikkatli bir adım (bkz. K-02).
Bugün ikisi aynı belgeyi paylaşıyor ve birbirine hiç karışmıyor; doğrulandı.
