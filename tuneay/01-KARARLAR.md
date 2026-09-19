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

### Desk kompozisyonu ve cüzdan menüsü (yedinci revizyon)

**Kimlik tek kontrolün arkasında.** Bar; adresi, iki bakiyeyi ve Disconnect
butonunu yan yana basıyordu — asıl iş olan panelle yarışan dört şey. Artık tek
bir disk var ve taşıdığı her şey altında açılıyor. Testnet rozeti de oraya
girdi: bağlantıyı niteliyor, ve yalnızca iki işi olan bir barda üçüncü pildi.

⚠️ **Kapalı hâl bir stil, unmount değil.** Unmount edilmiş bir popover dışarı
animasyon yapamaz, yarım kalan bir geçiş hiç olmamasından kötü okunur. Açılış
kendi üst kenarından, `scale(0.96)` + blur ile geliyor — kontrolün içinden
açılıyormuş gibi, sayfaya uçarak girmiş gibi değil.

Dinleyiciler **yalnızca açıkken** bağlı: sürekli yaşayan sayfa geneli bir
keydown, bir panelin başka bileşenlerin kısayollarını yemeye başlamasının yolu.

**Sayfa ortalandı.** Barın altına çivilenmiş tek panel, altında ölü bir karbon
sütunu bırakıyordu. `min-h-[calc(100vh-4rem)]` — yani gerçekten artakalan
alanın ortası — ile sayfa her yükseklikte tek bir kompozisyon olarak okunuyor.
Genişlik `max-w-6xl` → `max-w-5xl`.

**Paneller cam ve bir kez geliyor.** `tr-panel-in` mount'ta çalışıyor, scroll
gözlemcisiyle değil: burada kaydırılacak bir sayfa yok ve observer bekleyen bir
panel hiç belirmezdi.

### Desk'in cümlesi, cümle düzeni, alan cevabı (sekizinci revizyon)

**Panellerin üstünde tek satır:** *"Ask every maker at once, settle in one
signature."* Landing'in işaretli-kelime aygıtı gövde ölçeğinde, iki işaretli ve
yine **sıralı**: `one signature` yüksek sesli (iddia bu — tek cüzdan istemi
mutabakatı bitiriyor), `every maker` sessiz (oraya nasıl varıldığı).

⚠️ **Hareket mesafeleri de ölçekle birlikte küçülmeli.** İlk geçişte
`MarkedPhrase` başlığın `.tr-mark-*` sınıflarını kullanıyordu; `0.26em`'lik
kayma 4rem'de kendinden emin bir dürtüşken, gövde puntosunda glifin kendi
genişliğinin üçte biri oluyor ve ikon ait olduğu kelimeden **kaçıyormuş** gibi
okunuyordu. Artık kendi sınıfları var (`.tr-phrase-*`), mesafeler yaklaşık
yarısı, ve **kelime de ikonla birlikte hareket ediyor** — sadece daha az.
Yönlendirilmek buna benzer; terk edilmek ötekine.

`MarkedPhrase` **ayrı bir bileşen**, landing'inkiyle paylaşılan değil. Sebep
ölçek: landing'in sayıları 4rem'lik bir başlık için **gözle ölçülmüş** —
em boyutlu glifler, optik taban çizgisi kayması, 68px tipografinin altında
okunacak kalınlıkta bir çizgi. Hiçbiri 18px'e düşürülünce hayatta kalmıyor;
türetilmediler, ölçüldüler. Paylaşılan şey **dilbilgisi**, ve o
`tuneay/tarif-isaretli-baslik.md`'de yazılı.

**Uppercase kalktı** (desk). `YOU SELL` → `You sell`. Harf aralığı açılmış
büyük harf, bir etiketi *tabela* yapıyor; burada hepsi bir cümlenin parçası.
⚠️ Landing'deki bölüm etiketleri (`THE PROBLEM`) bilerek kaldı — orada
gerçekten tabela işi görüyorlar.

**Alan kendini çizerek cevap veriyor.** Odaklanınca altına soldan sağa bir
çizgi çekiliyor — işaretli kelimenin aynı hareketi. Renk değişimi değil,
**süpürme**: süpürmenin yönü var, ve yön onu "alan sana cevap veriyor" yapan
şey; sayfanın yeniden boyanması değil.
⚠️ Çizgi **sarmalayıcıda**, input'ta değil: input şeffaf ve kenarlıksız olmak
zorunda (`styles.css` specificity'si yüzünden `!` ile), dolayısıyla üstünde
çizilecek bir şey yok.

**GSAP eklenmedi.** Buradaki hareketlerin hepsi tek özellikli geçişler ve
anahtar kareler; CSS aynı eğriyi aynı akıcılıkta veriyor ve derleyici onları
compositor'a bırakıyor. GSAP'ın kazandırdığı şey — timeline'lar, sıralı
koreografi, scroll'a bağlı sahneler — burada yok. Öyle bir sahne çıkarsa
(örneğin teklif kartlarının sıralı girişi ve mutabakat sekansı birbirine
bağlanırsa) o zaman gerekçesi oluşur.

### TrustBot çubuğu (yer tutucu)

Cümlenin üstünde, arama alanı biçiminde bir kontrol: solda marka mührü,
*"Something off? Ask TrustBot"*, sağda ok. Arama alanı biçimi bilinçli —
"buraya bir soru yaz" için insanların zaten bildiği biçim o; soldaki mühür de
cevabın kimden geleceğini söylüyor, Uniswap'in büyüteci kendi alanının ne
yaptığını söylediği gibi.

**Sayfaya değil, sayfanın üstüne açılıyor.** Soru *bu sayfa hakkında* ve işlem
ortasında soruluyor; bir rota, soruyu sorulabilir kılan bağlamı çöpe atardı.

**Sayfa kaybolmuyor, odaktan çıkıyor.** Örtmek yerine bulanıklaştırmak "masa
hâlâ orada, sen hâlâ işlemin ortasındasın" der.
⚠️ `backdrop-filter` **içeriği örten elemanda** olmak zorunda. Panele
koyarsan perdeyi örnekler — perde düz bir yıkama olduğu için hiçbir şeye
bulanıklaşmaz.

⚠️ **Blur sıfırdan animasyonlanmalı**, sönen bir opaklığın arkasında son
değerinde bekletilmemeli. Şeffaf bir elemanda 18px'te tutulunca tarayıcının
backdrop katmanını eleman gerçekten görünene kadar kurmak için sebebi yok —
blur bir beat geç geliyordu ve sayfa, panel çoktan yerleştikten sonra odaktan
çıkıyordu. Filtrenin kendisini geçiş yaptırmak onu diğer her şeyle aynı saate
bağlıyor; `will-change` da katmanı baştan istiyor.

⚠️ **Bot uydurmuyor.** Yer tutucu bir asistanın mutabakat ya da trustline
hakkında kulağa makul gelen cevaplar üretmesi, hiç asistan olmamasından
kötüdür — insanlar bir masanın söylediğine göre hareket eder. Bot soruyu
alıyor, düşünüyor ve cevap veremeyeceğini dürüstçe söylüyor. Gerçek bir uç
nokta geldiğinde değişecek **tek fonksiyon** `reply()`.

### Yörüngedeki kenarlık

TrustBot çubuğunun etrafında dolanan bir ışık: sayfada bir yere **götüren** tek
kontrol, hâlâ hareket eden tek şey olsun diye.

**Nasıl:** başlangıç açısı animasyonlanan bir konik gradyan, padding kutusu
dışında her şey maskelenerek 1px'lik bir halkaya indirgeniyor.
⚠️ Açı **kayıtlı bir custom property** (`@property --tr-orbit`) olmak zorunda:
CSS bir gradyanın içindeki ham `from <angle>` değerini interpolate edemez,
yalnızca tiplenmiş olanı. `@property` olmadan animasyon hiç çalışmaz — ve
durağan bir gradyana düşer, ki düşülecek iyi bir yer.

Sürekli dönüyor ama sessiz (%55 opaklık, 7 saniyelik tur); hover'da tam güce
çıkıyor.

### Açılışlar (dokuzuncu revizyon)

**Landing başlığındaki maske kaldırıldı.** Her satırı kırpıp yukarı kaydırmak
standart hamleydi ama metin **baştan kesilmiş gibi** okunuyordu:
⚠️ `blur()` ile `overflow: hidden` kavga ediyor — kırpma içindeki bulanık bir
kenar, yumuşak piksellerden geçen sert bir kesik. Üstelik descender payıyla
birlikte yolun yarısı, satır kutusundan ancak kısmen çıkmış hâlde geçiyor ve o
hâl "geçişin bir ânı" değil "tasarım" olarak okunacak kadar uzun kalıyor.
Maskesiz aynı üç özellik aynı işi görüyor, kırpılacak kenar yok.

**Webfont kapısı denendi ve GERİ ALINDI.** Fikir şuydu: font gelmeden
başlayan satır yedek yüzle animasyonlanıp Space Grotesk inince yeniden
diziliyor. Doğru teşhis, yanlış ilaç:
⚠️ `animation-play-state: paused` + `fill-mode: both` ile duraklatılan durum
**ilk anahtar karedir** — yani `opacity: 0`. Sayfa yavaş bağlantıda yüzlerce
ms bomboş durup sonra her şeyi aynı anda getiriyordu. Hareket hâlindeki bir
satırdaki küçük yeniden dizilme neredeyse görünmez; boş sayfa değil.

**Desk kademesi okuma sırasına göre:** çubuk → cümle → sol panel → sağ panel
(0 / 150 / 300 / 420ms). İşin yapılış sırası da bu. Nav bilerek animasyonsuz:
chrome anında orada olmalı, insan cüzdanını görmek ister.

### 404

Önceden bilinmeyen her yol `/desk`'e yönlendiriliyordu. Kayıtlı bölüm linkleri
için doğruydu ama **yanlış yazılmış her adresi sessizce masaya götürmek**,
insanı gitmek istediği yere gittiğine inandırıyor.

Şimdi ikiye ayrılıyor:
- `/desk/*` → `/desk` (geçen hafta çalışan linkler kırılmasın)
- Diğer her şey → 404 sayfası

Sayfa **çıkış yolunu** veriyor, rakamı değil: iki yer var ve ikisi de bağlantılı.
Muhtemel sebebi de söylüyor — bu masanın yakın zamana kadar dört bölüm URL'i
vardı ve birinin kayıtlı `/desk/incoming` linki tam olarak buraya düşecek
türden bir şey.

⚠️ `vercel.json`'a genel SPA fallback eklendi; uzantısı olan yolları ve
`assets/` altını **hariç tutuyor**, yoksa eksik bir CSS dosyası 404 yerine
`index.html` döner ve hata sessizce kaybolur.

### Skeleton'lar

**Yalnızca gerçek bir bekleme olan ve gelecek şeyin biçimi bilinen yerlerde:**
maker'lar yoklanırken teklif satırları, Horizon cevap verirken bakiyeler.
Landing chunk'ına konmadı — bir kareden kısa sürede çözülüyor ve **flash eden
bir skeleton, yerini aldığı boşluktan kötüdür.**

⚠️ **Geometri birebir aynı olmalı.** Skeleton satırı gerçek satırın düzenini
taklit ediyor (solda etiket üstü tutar, sağda geri sayım ve seçim noktası).
Skeleton'ların tek gerçek başarısızlık biçimi bu: yanlış biçimli bir yer
tutucu, cevabın gelişini **zıplama** yapar.

**Nabız değil süpürme, ve soldan sağa** — alan çizgileri ve kart kenarlarıyla
aynı hareket. Nabız "burada bir şey var" der; süpürme "bir şey geliyor" der,
dürüst olan ikincisi.

Kontrast bilerek düşük: içinde durduğu panelle yarışan bir skeleton, beklemeyi
olaya çevirir.

### Açılış ikinci geçiş

**Blur alanla ölçeklenir.** Bir metin satırında "odağa gelme" gibi okunan
`blur(9px)`, 500px genişliğinde bir panelde **lekelenmiş bir levha** gibi
okunuyor. Paneller artık 3px blur, 10px yol, 700ms. Sayfa kurulurmuş gibi
değil, zaten oradaymış da yetişiyormuş gibi gelmeli.

**Kademe kısaldı:** 0 / 70 / 150 / 230ms. Öncesi 420ms'ye kadar gidiyordu ve
sayfa geçit töreni yapıyordu.

**Boş durum kutusu kalktı.** Kenarlıklı bir panelin içindeki kesikli
dikdörtgen, çerçeve içinde çerçeve — ve ekranın **içinde hiçbir şey olmayan**
bölgesine en belirgin çizgiyi çiziyordu. Ortalanmış tipografi aynı şeyi
söylüyor, çizgi eklemeden.

**Her panel kendini tarif ediyor.** Sol paneldeki alt başlık aslında sağdaki
panelin içeriğini anlatıyordu ("Firm, signed, and yours to accept or leave").
Sol artık "Set an amount. Every registered maker gets asked.", sağ o cümleyi
devraldı ve "Ranked by price" etiketi oraya katıldı — satır sayısı azaldı,
simetri oturdu.

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
