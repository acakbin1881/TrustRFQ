# Tarif — İşaretli başlık (marked headline)

Bir hero başlığındaki **belirli kelimelere** küçük bir ikon ve kendine ait bir
hareket vermek. Kelime okunur kalır; ikon onun noktalaması olur.

Bu dosya kendi başına yeterlidir — başka bir projeye taşırken tek ihtiyacın
buradaki CSS ve bileşen. TrustRFQ'ya özgü olan tek şey seçilen ikonlar.

---

## 1. Ne zaman işe yarar, ne zaman yaramaz

**Yarar:** başlık bir *iddia* içeriyorsa ve o iddianın bir iki kelimesi
diğerlerinden gerçekten daha önemliyse. İkon o kelimenin anlamını fiziksel
olarak canlandırabiliyorsa.

**Yaramaz:** başlık zaten kısa ve tek vurguluysa; ya da ikon kelimeyle
ilgisizse. İlgisiz ikon süs olur, süs de dikkati iddiadan çalar.

---

## 2. Altın kural: SIRALA, eşitleme

Bir cümlede birden fazla işaret varsa **aynı ağırlıkta olmamalılar.**

> Aynı ağırlıkta tekrarlanan vurgu, harcanmış vurgudur.
> Tek cümlede üç eşit süs bir araç çubuğu gibi okunur.

TrustRFQ'daki sıralama:

| Kelime | Rolü | Hareket | Rütbe |
|--------|------|---------|-------|
| `price` | verilen söz | dönen madeni para + altına çizilen aksan çizgisi | **1** |
| `Move` | fiil | imleç öne kayar, kelime onu daha kısa mesafede takip eder | 2 |
| `agreed` | mühür | eğik+soluktan düz+parlağa oturur | 3 |

Rütbe 1 aksan rengini kullanır (bizde lime) ve iki katmanlı harekete sahiptir.
Rütbe 2–3 sessiz renkte durur, aksan rengini **yalnızca hover'da** alır.

**İkon metaforu fiili canlandırmalı.** `Move` için imleç öncülük eder, kelime
sürüklenir — sürüklenmenin görüntüsü budur. `agreed` için mühür *dönmez*,
**oturur**: damganın inişi gibi. Dönen bir mühür damga değil, çıkartma olur.

---

## 3. Anatomi: üç katman, üst üste

Hareketin üçe bölünmesi keyfi değil — **aynı `transform` özelliğini üç farklı
şey istiyor** ve tek elemanda animasyon, transition'ı sessizce ezer.

```
<span class="mark">              ← hover hedefi (KELİME), odaklanabilir
  <span class="idle-x">          ← pasif döngü: animation
    <span class="hover-x">       ← niyetli hareket: transition
      <ikon />
```

Tek elemanda toplarsan: `animation` kazanır, hover **hiç render edilmez**.
Debug etmesi zor, çünkü CSS geçerli, sadece etkisiz.

---

## 4. CSS

```css
/* --- hover: the deliberate gesture ------------------------------------- */

/* rank 1 — the rule wipes in left to right, not fades: it reads as being
   ruled under rather than lit up */
.mark-rule {
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 620ms cubic-bezier(0.16, 1, 0.3, 1);
}
.mark:hover .mark-rule,
.mark:focus-visible .mark-rule { transform: scaleX(1); }

/* rank 1 — the coin turns on a real Y axis. A cross-fade says "two pictures";
   a rotation says "the same object, its other side". */
.mark-coin {
  transform-style: preserve-3d;
  transition: transform 760ms cubic-bezier(0.16, 1, 0.3, 1);
}
.mark:hover .mark-coin,
.mark:focus-visible .mark-coin { transform: rotateY(180deg); }
.mark-face { backface-visibility: hidden; }
.mark-face--back { transform: rotateY(180deg); }

/* rank 2 — the glyph leads, the word follows a SHORTER distance behind it.
   Equal distances read as two things sliding; unequal reads as a drag. */
.drag,
.mark-cursor { transition: transform 620ms cubic-bezier(0.16, 1, 0.3, 1),
                           color 620ms cubic-bezier(0.16, 1, 0.3, 1); }
.mark:hover .drag { transform: translateX(0.1em); }
.mark:hover .mark-cursor { transform: translate(0.26em, 0.12em); }

/* rank 3 — settles rather than spins */
.mark-seal {
  transform: rotate(-12deg) scale(0.92);
  opacity: 0.55;
  transition: transform 620ms cubic-bezier(0.16, 1, 0.3, 1),
              opacity 620ms cubic-bezier(0.16, 1, 0.3, 1);
}
.mark:hover .mark-seal { transform: rotate(0deg) scale(1); opacity: 1; }

/* --- idle: alive, but not watchable ------------------------------------ */
/* Amplitudes are tiny on purpose. A headline is READ, not watched — if you can
   point at the movement while reading the sentence, it is too much. Different
   periods, so they never sync into a single pulse. */

@keyframes idle-coin   { 0%,100% { transform: rotateY(0deg); }  50% { transform: rotateY(7deg); } }
@keyframes idle-cursor { 0%,100% { transform: translate(0,0); } 50% { transform: translate(0.03em,-0.05em); } }
@keyframes idle-seal   { 0%,100% { transform: rotate(0deg); }   50% { transform: rotate(2.5deg); } }

.idle-coin   { animation: idle-coin   9s   ease-in-out infinite; }
.idle-cursor { animation: idle-cursor 5.5s ease-in-out infinite; }
.idle-seal   { animation: idle-seal   7.5s ease-in-out infinite; }

/* Hover hands the word over to the deliberate gesture. PAUSE, don't cancel:
   pausing leaves it where it stands, so there is no jump at the handover. */
.mark:hover [class*='idle-'],
.mark:focus-visible [class*='idle-'] { animation-play-state: paused; }

@media (prefers-reduced-motion: reduce) {
  [class*='idle-'] { animation: none; }
  .mark-rule { transform: scaleX(1); transition: none; }
  .mark-coin, .drag, .mark-cursor, .mark-seal { transition: none; }
  .mark-seal { transform: none; opacity: 1; }
}
```

---

## 5. React

İçeriği koddan ayrı tut: işaretlenecek kelimeler **veri**, bileşen onları
satırda string eşleşmesiyle bulur. Böylece metin okunabilir bir cümle olarak
kalır.

```tsx
// content.ts — ranked, not equal. See §2.
export const MARKS = [
  { word: 'Move',   kind: 'cursor' },
  { word: 'price',  kind: 'coin'   },
  { word: 'agreed', kind: 'seal'   },
] as const;

type Kind = (typeof MARKS)[number]['kind'];
```

```tsx
function MarkedWord({ word, kind }: { word: string; kind: Kind }) {
  // The hover target is always the WORD. The glyphs run 0.4–0.7em, which is a
  // hit area nobody finds on purpose. tabIndex + focus-visible give the
  // keyboard the same gestures.
  const shell = 'mark relative inline-block cursor-default rounded-sm outline-none ' +
                'focus-visible:ring-2 focus-visible:ring-[--accent]/40';

  if (kind === 'coin') {
    const face = 'absolute inset-0 flex items-center justify-center rounded-full mark-face';
    return (
      <span tabIndex={0} className={shell}>
        <span className="text-[--fg-strong]">{word}</span>

        {/* em-sized, so it scales with the headline's clamp() instead of being
            pinned to one viewport. align-[-0.1em] is the OPTICAL baseline: a
            circle centred on the true baseline reads as floating. */}
        <span className="relative ml-[0.2em] inline-block align-[-0.1em]"
          style={{ width: '0.72em', height: '0.72em', perspective: '400px' }} aria-hidden="true">
          <span className="idle-coin block size-full">
            <span className="mark-coin relative block size-full">
              <span className={face}><IconA className="size-[58%]" /></span>
              <span className={`${face} mark-face--back`}><IconB className="size-[58%]" /></span>
            </span>
          </span>
        </span>

        {/* the rule marks the word; the coin is only its punctuation, so the
            rule stops at the word rather than running under the coin */}
        <span className="mark-rule absolute -bottom-[0.06em] left-0 block h-[0.055em]
          rounded-full bg-[--accent]" style={{ width: 'calc(100% - 0.92em)' }} aria-hidden="true" />
      </span>
    );
  }

  if (kind === 'cursor') {
    return (
      <span tabIndex={0} className={`${shell} group/mark`}>
        <span className="drag inline-block">{word}</span>
        <span className="idle-cursor ml-[0.12em] inline-block align-[0.34em]">
          <PointerIcon className="mark-cursor block size-[0.42em] fill-current
            text-[--fg-quiet] group-hover/mark:text-[--accent]" />
        </span>
      </span>
    );
  }

  return (
    <span tabIndex={0} className={`${shell} group/mark`}>
      {word}
      <span className="idle-seal ml-[0.16em] inline-block align-[0.02em]">
        <SealIcon className="mark-seal block size-[0.52em]
          text-[--fg-quiet] group-hover/mark:text-[--accent]" />
      </span>
    </span>
  );
}

/** One mark per line; first match wins, the rest of the line is left alone.
 *  If the match fails, the line renders plain — a flourish that silently goes
 *  missing beats one that renders in the wrong place. */
function HeadlineLine({ text }: { text: string }) {
  const mark = MARKS.find((m) => text.includes(m.word));
  if (!mark) return <>{text}</>;
  const at = text.indexOf(mark.word);
  return (
    <>
      {text.slice(0, at)}
      <MarkedWord word={mark.word} kind={mark.kind} />
      {text.slice(at + mark.word.length)}
    </>
  );
}
```

---

## 6. Tuzaklar

Hepsi bu projede bizzat yaşandı.

1. **Tek elemanda `animation` + `transition`** → animasyon kazanır, hover hiç
   görünmez. Katmanları ayır (§3).
2. **Satır maskesi kullanma.** (Bu tavsiye değişti — ilk sürümde maske
   öneriliyordu, sonra sahada yanlış olduğu görüldü.) Başlığı `overflow:
   hidden` bir kutuya kırpıp yukarı kaydırmak standart hamle ama metin
   **baştan kesilmiş gibi** okunuyor. İki sebep, ikincisi asıl olan:
   · `blur()` ile `overflow: hidden` kavga eder. Kırpma içindeki bulanık bir
     kenar, yumuşak piksellerden geçen **sert bir kesiktir** — satırın altı
     odak dışı değil, biçilmiş görünür.
   · Descender payıyla birlikte, yolun yarısı satır kutusundan ancak kısmen
     çıkmış hâlde geçer. O hâl, geçişin bir ânı olarak değil, tasarımın kendisi
     olarak okunacak kadar uzun ekranda kalır.
   **Maskesiz** aynı üç özellik (opacity + translateY + blur) aynı işi görür ve
   kırpılacak bir kenar yoktur. Descender derdi de kendiliğinden kalkar.
3. **İkona hover verme, kelimeye ver.** 0.4–0.7em bir isabet alanını kimse
   bilerek bulamaz.
4. **İkonu px ile boyutlandırma, `em` kullan.** Başlık `clamp()` ile
   ölçekleniyorsa px ikon tek ekran genişliğinde doğru, diğerlerinde yanlış
   durur.
5. **Optik taban çizgisi ≠ gerçek taban çizgisi.** Yuvarlak bir ikon gerçek
   baseline'a oturtulunca metnin üstünde yüzüyormuş gibi görünür. `-0.1em`
   civarı bir kaydırma gerekir; değeri gözle ayarla, hesapla değil.
6. **Hover'da pasif animasyonu iptal etme, duraklat.** İptal edersen sıfıra
   zıplar; duraklatırsan olduğu yerde kalır ve devir teslim pürüzsüz olur.
7. **Tipografi animasyonlarını webfont'a kapıla.** Font gelmeden başlarsa satır
   yedek yüzle animasyonlanır, sonra asıl font inince yeniden dizilir — okurun
   altında zıplar ve bu ikinci, daha çirkin bir animasyon gibi okunur.
   `document.fonts.ready` beklenir, **ama bir tavanla**: yüklenmeyen bir font
   bütün girişi götürmemeli. 900ms iyi bir tavan; yedek yüzle animasyon,
   animasyonsuzluktan iyidir.
8. **`prefers-reduced-motion` yalnızca "animasyon yok" demek değildir.**
   Gizli/eğik/soluk başlangıç durumlarını da **geri almalısın**, yoksa hareketi
   kapatan kullanıcı yarı görünmez bir ikonla kalır.

---

## 7. Kendi projene taşırken

- `--accent`, `--fg-strong`, `--fg-quiet` yerine kendi token'ların.
- Eğri: `cubic-bezier(0.16, 1, 0.3, 1)`. Hızlı çıkış, uzun yavaşlayan kuyruk,
  taşma yok. Kuyruğu kısaltırsan hareket "snap" etmeye başlar.
- İkon seti: burada Lucide (`strokeWidth={1.5}` — varsayılandan ince, metnin
  yanında bağırmasın diye) ve gerçek marka SVG'leri için `@web3icons/react`.
  **Marka logolarını asla yeniden çizme**; elle çizilmiş bir logo, ürünün
  kendi maketi gibi okunur.
- Kaç işaret? Bir cümlede **en fazla üç**. Dördüncüde hiyerarşi düzleşir ve
  hangisinin önemli olduğu anlaşılmaz olur.
