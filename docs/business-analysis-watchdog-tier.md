# Business analýza: premium DD Watchdog tier pro cz-agents.dev

**Status:** návrh, ne plán implementace. Vstupy: konverzace 2026-04-27, technická ověření zdrojů, public competitor scan.
**Důležité varování pro čtenáře:** dokument popisuje *hypotézu* o trhu. Žádný platící zákazník to dnes nepotvrdil. Cílem analýzy je strukturovaně rozhodnout *zda* a *jak* investovat do dalšího tieru, ne tvrdit že trh je doložený.

---

## TL;DR — doporučení

1. **DD Watchdog za €299/mo a Enterprise Monitor za €999/mo** dávají strategický smysl jako upsell nad existující DD Agency (€199). Rozdíl mezi nimi je *objem watch-listu + retence audit logu + SLA*, ne odlišný feature set.
2. **Stavět ne všechny 4 funkce najednou.** Pořadí dle ROI/effort: **(1) Nespolehlivý plátce DPH → (2) Watch list / monitoring → (3) Audit log → (4) Sbírka listin parser.** Funkce 1+2+3 jsou pro 2 měsíce práce a tvoří MVP Watchdog tieru. Funkce 4 je samostatný investiční projekt na další 1–2 měsíce a může být pay-per-use (€2–5 za firmu) místo fixní součásti tieru.
3. **Žádný launch dokud není jeden zákazník zaplacený na existujícím tieru.** Stavět premium tier bez baseline validation = klasická Czech-startup chyba (overengineer před PMF).
4. **Riziko č. 1: závislost na Justice.cz a Sbírce listin.** Bez API je všechno scraping s OCR — křehké, právně šedé pro masivní automatizaci, vyžaduje fallback strategie.

---

## A) Byznys pohled

### Cílové persony a co každá z nich reálně potřebuje

| Persona | Hlavní bolest | Co z toho použije | Co ji udělá platící |
|---|---|---|---|
| **Compliance officer ve fintechu / bance / e-money instituci** | ČNB audit vyžaduje doložit *kdy* a *jak* byl klient screenován; periodický rescreening je povinnost | Watch list + Audit log | Compliance proof export (PDF s časovými razítky) — bez něj musí ČNB audit dělat ručně přes Excel |
| **Advokát na obchodní právo** | Před uzavřením smlouvy ověřit nejen aktuální stav, ale i historii (změny statutáře, přejmenování, sídla) | Sbírka listin financials + Watch list | Klient mu zaplatí za *expertízu*, on chce nástroj co mu ušetří hodiny ručního klikání |
| **M&A / corporate finance poradce** | DD na akviziční target trvá týden, hodně z toho je rešerše | Sbírka listin parser + statutory chain | Trend analýza tržeb 5 let za 3 minuty místo 3 hodin ruční práce v Excelu |
| **Účetní / daňový poradce** | Měsíční ověření dodavatelů — nespolehlivý plátce, exekuce, insolvence, sankce | Bulk check nespolehlivý plátce + Watch list pro top 50 dodavatelů | Časová úspora vs. ruční checking 50 IČO přes ARES + Daňový portál + ISIR |
| **Solo OSVČ / malá firma** | Jednorázové ověření 1–3 firem před fakturou nad 100k | DD pay-per-report (existující) | Nezajímá se o premium tier |

**Klíčový insight:** DD Watchdog **nedává smysl** pro single-shot uživatele. Je to *recurring monitoring* produkt. Cílovka je každý kdo má *portfolio dodavatelů/klientů* (>20 IČO) a *povinnost je periodicky kontrolovat*.

### Vztah mezi 4 funkcemi v balíčku

Není to 4 nezávislé features. **Watch list je lepidlo**, ostatní 3 funkce jsou jeho pluginy:

```
┌─────────────────────────────────────────────────────────────┐
│              WATCH LIST (core: seznam IČO + cron)           │
│                                                             │
│  ├── ARES kontrola (statutáři, sídlo, název, DPH)          │
│  ├── ISIR kontrola (insolvence)                            │
│  ├── Sankce (EU FSF + OFAC)                                │
│  ├── Nespolehlivý plátce DPH (ADIS)            ← funkce 2  │
│  └── Sbírka listin diff (nová účetní závěrka)  ← funkce 3  │
│                                                             │
│  → AUDIT LOG (každá kontrola loggovaná)        ← funkce 4  │
└─────────────────────────────────────────────────────────────┘
```

Watch list **bez** audit logu je jen alerting tool — má hodnotu, ale ne pro regulovaný sektor. Watch list **s** audit logem je compliance-proof produkt → fintech persona za to platí výrazně víc. Proto **balení audit logu jen do vyšších tierů** je legitimní pricing diferenciace.

### Cenotvorba — návrh

| Tier | Cena/měs | Watch list size | Audit log retence | Sbírka listin | Pro koho |
|---|---|---|---|---|---|
| DD Pro (existující) | €49 | — | — | — | jednotlivý DD report on-demand |
| DD Agency (existující) | €199 | — | — | — | účetní firmy, on-demand bulk |
| **DD Watchdog (NEW)** | **€299** | 100 IČO | 12 měsíců | pay-per-use €3 | účetní firmy, advokáti, M&A |
| **Enterprise Monitor (NEW)** | **€999** | 1 000 IČO | 7 let (regulátorní min.) | 50 dotazů/měs zdarma | fintech compliance, banky |
| Enterprise (existující, custom) | €X | unlimited | unlimited | bulk | custom SLA, dedikovaný kontakt |

**Proč €299, ne €399?** Cribis a Bisnode mají non-public ceny ale anekdotálně začínají kolem 5 000–15 000 Kč/měsíc (€200–600). Náš pricing chce být **mírně pod střední Cribis nabídkou** aby positioning byl *„API-first, transparent pricing alternative to Cribis"*. €299 je psychologický bod *„dvojnásobek Agency tieru, ne 5× víc"*.

**Proč €999, ne €1499?** Fintech compliance budget je často €5k–15k/měs na vendor tooling. €999 je *„individual budget approval"* — jeden compliance manager to schválí sám. Nad €1500 vyžaduje obvykle CFO sign-off → delší sales cycle.

### Anti-kanibalizace stávajících tierů

| Riziko | Odpověď |
|---|---|
| DD Pro (€49) → DD Watchdog (€299) přechod | Watchdog má *recurring* hodnotu (denní crony), Pro je *on-demand*. Jiná persona, jiný use case. Pro pay-per-report user: Watchdog nedává smysl — neukládá si IČOčka. |
| DD Agency (€199) → Watchdog (€299) přechod | Agency je positioning *„unlimited on-demand reports for our 50 clients"*, Watchdog je *„automatický monitoring 100 firem"*. Komplementární, ne nahrazující. Lze je mít oba (Agency + Watchdog = €498/mo, dává smysl pro středně-velkou účetní). |
| Enterprise (custom) → Enterprise Monitor (€999) | Enterprise je upper-bound s custom SLA. Monitor je *self-serve* upper-tier. Klienti kteří potřebují >1000 IČO nebo >7 let retence stejně přejdou do Enterprise. |

**Důležité: musíme to monitorovat.** První 3 měsíce po launchi sledovat conversion path Pro → Watchdog. Pokud >50% Watchdog zákazníků přijde z Pro (ne new), je to kanibalizace a tier nefunguje.

### Konkurence v ČR

| Hráč | Pozice | Pricing | Naše odlišení |
|---|---|---|---|
| **Cribis (Dun & Bradstreet ČR)** | Market leader pro firemní reporting | Non-public, anekdotálně 5–15k Kč/měs | API-first / MCP-native pro AI agenty; transparent pricing; open-source |
| **Bisnode** | Sloučeno do D&B/Cribis | viz Cribis | totéž |
| **ČEKIA / Bonitní hodnocení** | Tradiční, slabší tech, focus na bonitu | Mid-tier | Nemáme bonitní skóre — tam nesoutěžíme |
| **Hlídač státu (Hlídač shopu)** | Free, zaměřený na transparentnost veřejné správy | Free | Komplementární, ne konkurenční (jiné use case) |
| **InsolvenceCheck.cz a další** | Single-purpose nástroje | Per-query | Jsme aggregator, ne single-source |

**Naše hlavní moat:** Cribis i Bisnode mají *web UI* a *XML SOAP* z roku 2010. **Žádný z nich nemá MCP integraci** — nelze je použít přímo z Claude/Cursor/Continue. Naše nika je **„Claude-native KYC pro malé až střední české firmy"**. To je dnes 0 hráčů.

**Pozor:** Tahle nika je dnes malá. Trh AI-first kupců v ČR čítá odhadem stovky firem (ne tisíce). To stojí za vědomé pojmenování — neskačeme do velkého trhu, jen do specifického segmentu.

### Reálná cena pro klienty (orientačně)

| Co dnes klient platí | Komu | Kolik |
|---|---|---|
| Cribis základní monitoring | Účetní/poradce | 3 000–8 000 Kč/měs |
| Cribis enterprise dashboard | Banka/fintech | 30 000–80 000 Kč/měs |
| Hlídač shopu pro firmu | SME | 1 000–3 000 Kč/měs |
| Manuální screening (placený externista) | Cokoli | 800–2 000 Kč za 1 IČO |
| Compliance officer interní práce | Banka/fintech | ~600 Kč/h × 10 h měsíčně rescreening = 6 000 Kč |

Náš €299 = ~7 200 Kč. To je **2–3× pod Cribis základním tierem**. €999 = ~24 000 Kč, je výrazně pod Cribis enterprise. **Pricing je defensive, ne aggressive** — máme prostor zvedat časem podle adopce.

---

## B) Technický pohled

### Datové zdroje a jejich realita (ověřeno 2026-04-27)

| Zdroj | Endpoint | Dostupnost | Formát | Limit / autentizace | Realita |
|---|---|---|---|---|---|
| ARES | `https://ares.gov.cz/ekonomicke-subjekty-v-be/...` | 200 OK ✓ | JSON REST | Public, ~rate limit ale velkorysý | Already integrated |
| ISIR PublicWS / CuzkWS | `isir.justice.cz:8443/isir_*` | reachable ✓ | SOAP/XML | Public, generous | Already integrated |
| EU FSF + OFAC SDN | `webgate.ec.europa.eu`, `treasury.gov` | reachable ✓ | XML bulk | Free | Already integrated |
| **ADIS Nespolehlivý plátce DPH** | `adisrws.mfcr.cz/adistc/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP` | 200 OK ✓ | **SOAP**, batch ≤100 DIČ | Public, free | **Snadná integrace, 1–2 dny práce** |
| **Justice.cz Sbírka listin** | `or.justice.cz/ias/ui/vypis-sl-firma` | 200 OK ✓ | **HTML scraping → PDF/scan** | Public, žádné API | **Náročné — OCR + parsing, právně šedé pro masivní download** |
| dataor.justice.cz OpenData | `dataor.justice.cz` | reachable | XML bulk dumps | Public | Bulk OR data, žádná účetka |

### Sbírka listin — proč je to nejtěžší

Sbírka listin neobsahuje strukturovaná data. Obsahuje **scany PDF** (často naskenované z papírových archivů, špatná kvalita). Účetní závěrku tedy nelze prostě „vytáhnout" — musí se:

1. Stáhnout HTML stránku firmy → najít odkaz na nejnovější účetní závěrku
2. Stáhnout PDF (často 10–100 MB)
3. **OCR** pokud je to scan (vyžadováno pro firmy starší ~2018)
4. **LLM extrakci** strukturovaných dat (revenue, EBITDA, vlastní kapitál) — Anthropic vision API nebo Gemini je dnes nejlepší
5. Validace (čísla musí summovat, audit poznámky musí být extracted explicitly)

**Realistický cost per query (Sbírka listin):**
- Bandwidth: zanedbatelný
- LLM extrakce (Claude Sonnet 4.6 vision, ~50k tokens per filing): ~$0.20–0.50
- Storage extracted JSON: zanedbatelný
- **Hard floor: $0.30/query** → cena $3 (= €3) per dotaz dává marži cca 90%

**Doporučení:** *Nedávat to do tieru flat*. Pay-per-use €3 (free tier 5/měs pro Watchdog, 50/měs pro Enterprise). Tím odložíš celý risk na spotřebu — pokud klient nepoužívá, neplatíš LLM cost.

### Architektura watch listu

```
┌─────────────┐    ┌──────────────┐    ┌────────────────┐
│  Customer   │───▶│ POST /watch  │───▶│ watchlist DB   │
│  uploads    │    │ /api         │    │ (SQLite per    │
│  CSV/JSON   │    │              │    │  customer)     │
└─────────────┘    └──────────────┘    └────────────────┘
                                                │
                          ┌─────────────────────┘
                          ▼
                   ┌──────────────────┐
                   │ Daily cron 03:00 │
                   │ (per customer)   │
                   └──────────────────┘
                          │
                          ▼
        ┌─────────────────┴───────────────────────────┐
        ▼               ▼                ▼            ▼
   ┌────────┐     ┌──────────┐    ┌──────────┐   ┌────────┐
   │ ARES   │     │ ISIR     │    │ Sankce   │   │ ADIS   │
   │ diff   │     │ diff     │    │ match    │   │ DPH    │
   └────────┘     └──────────┘    └──────────┘   └────────┘
        │               │                │            │
        └───────────────┴────────┬───────┴────────────┘
                                 ▼
                          ┌─────────────┐
                          │ change      │
                          │ detection   │
                          │ (snapshot   │
                          │  diff)      │
                          └─────────────┘
                                 │
                ┌────────────────┼─────────────────┐
                ▼                ▼                 ▼
          ┌─────────┐      ┌──────────┐      ┌──────────┐
          │ Audit   │      │ Email    │      │ Webhook  │
          │ log     │      │ Telegram │      │ (Slack/  │
          │ (sig'd) │      │          │      │  custom) │
          └─────────┘      └──────────┘      └──────────┘
```

**Klíčové technické rozhodnutí: snapshot store.** Pro detekci změn musíme držet *historický stav každého IČO*. Pro 1000 IČO × 365 dní × všechny endpointy → ~50–200 MB SQLite per customer. Sumárně pro 20 zákazníků (cíl Y1) → 1–4 GB. Trivial.

### Storage požadavky

| Data | Per customer | 100 customers | Retence | Total |
|---|---|---|---|---|
| Watch list metadata | <1 MB | <100 MB | bez expirace | <100 MB |
| Daily snapshots (1000 IČO) | ~100 MB | 10 GB | 90 dní rolling | 10 GB |
| Audit log | ~50 MB/rok | 5 GB/rok | **7 let pro Enterprise** | **35 GB** |
| Sbírka listin extrakce (cache) | ~10 MB/rok | 1 GB/rok | bez expirace | 1 GB |

**Total Y3:** ~50 GB. Hetzner CPX22 má 80 GB SSD → upgrade na CPX32 (160 GB) dříve než dosáhneš 60 % naplnění. Nice-to-have: dedikovaný volume pro audit log s read-only snapshots.

### Performance: 1000+ IČO denně

ARES rate limit (anekdotálně) ~10 req/s. 1000 IČO × 5 endpointů = 5000 req per customer per day = ~10 minut sériově. **Souběžné customers**: pool 20 customers × 1000 IČO = 100 000 req/day ≈ 1.2 req/s průměrně. **Zvládne to existující CPX22 bez problémů.** Bottleneck nebude HW, ale ARES rate limiting → potřeba per-source backoff a cache (ARES data se mění zřídka, denně stačí).

### Právní / GDPR aspekty

| Funkce | Riziko | Legal basis | Mitigation |
|---|---|---|---|
| Watch list IČO firem | Nízké | Art. 6(1)(f) — veřejný registr | Standardní |
| Watch list **statutářů jmen** | Středně | Art. 6(1)(f), ale GDPR ano | Subjekt může požádat o export svých dat / smazání. **Implementovat data subject access endpoint.** |
| Audit log | Nízké | Art. 6(1)(c) — splnění právní povinnosti regulátora (pro fintech) | Retence povinně 5–7 let dle ZoBP |
| **Sbírka listin scraping** | **VYSOKÉ** | Art. 6(1)(f), ale Justice.cz může změnit ToS | **Respect robots.txt, throttle agresivně, fallback na manuální download** |
| Nespolehlivý plátce | Nízké | Public ADIS endpoint | Žádný |

**Hlavní právní open question:** Sbírka listin je *veřejná*, ale *masivní automatizovaný download* může spadnout pod *„úprava databáze"* dle § 90 autorského zákona. **Před launchem konzultovat s advokátem na IT právo.** Náklad: 5–15 000 Kč jednorázově za consult.

---

## C) Roadmap (prioritizovaná dle ROI / effort)

### Fáze 1: MVP Watchdog (2 měsíce práce)

| # | Funkce | Effort | Value | Pořadí |
|---|---|---|---|---|
| **1** | **Nespolehlivý plátce DPH** (SOAP klient + MCP tool + DD report integrace) | **2–3 dny** | **Vysoké** — ihned přidává hodnotu existujícímu DD reportu, žádný nový tier nepotřeba | 🥇 first |
| **2** | **Watch list + cron + email/Telegram alerty** (ARES + ISIR + sankce diff) | **2 týdny** | **Nejvyšší** — core hodnota nového tieru | 🥈 second |
| **3** | **Audit log s timestampy** (append-only SQLite + signed exports) | **1 týden** | Vysoké pro compliance personu | 🥉 third |
| **4** | **Watch list UI** (statická HTML + CSV upload, Stripe-gated) | **1 týden** | Středně-vysoké, nutno kvůli onboardingu | 4 |

**Po fázi 1 launchnuto:** DD Watchdog €299/mo s funkcemi 1+2+3+4.

### Fáze 2: Enterprise Monitor (1 měsíc práce)

| # | Funkce | Effort | Pořadí |
|---|---|---|---|
| 5 | Webhook delivery (kromě emailu/Telegramu) | 2 dny | 5 |
| 6 | Audit log signed exports (PDF s digitálním podpisem) | 1 týden | 6 |
| 7 | Bulk import od 1000+ IČO + správa segmentů | 3 dny | 7 |
| 8 | SLA + dedikovaný kontakt + onboarding call | 0 dní (operace, ne kód) | 8 |

**Po fázi 2 launchnuto:** Enterprise Monitor €999/mo.

### Fáze 3: Sbírka listin (1–2 měsíce práce, oddělené rozhodnutí)

| # | Funkce | Effort | Pořadí |
|---|---|---|---|
| 9 | HTML scraping Justice.cz + PDF download per IČO | 2 týdny | 9 |
| 10 | LLM-based extrakce (Anthropic vision) | 1 týden | 10 |
| 11 | Trend analýza (5 let YoY) | 1 týden | 11 |
| 12 | Right-of-access endpoint (GDPR Art. 15) pro statutáře | 3 dny | 12 |

**Doporučení:** Sbírka listin pustit **AŽ POTÉ** co Watchdog tier má alespoň 5 platících zákazníků. Risk je vysoký (právní + technický), reward je nejistý (fancy demo, ale unclear demand). Pay-per-use €3/dotaz nezavazuje k feature, který nemusí mít trh.

### Závislosti

```
Nespolehlivý plátce DPH ────────────────► DD report
                                           │
                                           ▼
                       Watch list ─────► Audit log
                          │
                          ▼
                    Watch list UI
                          │
                          ▼
                    [WATCHDOG LAUNCH]
                          │
                          ▼
              Webhook + Signed exports + Bulk
                          │
                          ▼
                 [ENTERPRISE LAUNCH]
                          │
                          ▼
              [trigger: 5 paying customers?]
                          │
                          ▼
              Sbírka listin scraping → LLM extrakce → Trend
```

### Co lze pustit za 2 týdny vs 2 měsíce

- **2 týdny:** *Just* nespolehlivý plátce DPH + DD report integrace. Žádný nový tier, jen value-add do existujícího DD Pro/Agency. **Tohle je doporučené udělat hned bez ohledu na zbytek analýzy.**
- **2 měsíce:** Plný Watchdog launch (fáze 1).

---

## D) GTM (Go to Market)

### Messaging per persona

| Persona | Hook | Demo scénář | CTA |
|---|---|---|---|
| **Compliance officer** | *„ČNB audit za 3 měsíce. Máte dnes per-klient log s časovým razítkem že proběhl rescreening?"* | Live: nahraj 50 IČO, ukaž že po 24h přišel email s changes a každá změna je v audit logu se signed timestamp | „Schedule a 30-min audit-readiness review" |
| **Advokát na obchodní právo** | *„Před každým podpisem klienta proklikáváš ARES, ISIR, sankce. Co kdyby ti to dělal Claude přímo z chatu?"* | Live: v Claude.ai napiš *„Proveď DD na klienta XYZ"* → kompletní report | „Vyzkoušej DD Pro za €49 — pokud rozšiřuješ na monitoring, Watchdog €299" |
| **M&A poradce** | *„DD na akviziční target — 3 dny → 30 minut. S tím samým rozsahem informací, jen automaticky agregované."* | Live: statutory chain depth=3 + financials trend + sankce screening v jednom volání | „Pilot na další 3 deals zdarma, pak €299/mo" |
| **Účetní firma 5–50 lidí** | *„Měsíčně kontroluješ 50 klientů na nespolehlivý plátce. Watchdog ti to udělá denně automaticky."* | Live: bulk CSV upload 100 dodavatelů → email summary po 24h | „První měsíc free, pak €299/mo" |

### LinkedIn post koncept (pro launch po MVP)

**Tonalita: nikoliv hype, ale konkrétní bolest.**

> Před půl rokem jsem si stěžoval, že před každým novým neznámým partnerem proklikávám ARES, ISIR a sankce přes pět různých webů. Postavil jsem si k tomu MCP server. Teď s Watchdog tierem to dělá automaticky — každý den, pro celou listinu IČO, audit log pro regulátora.
>
> Pokud děláš compliance / účetnictví / M&A pro české firmy a tohle ti zní povědomě, dej vědět.

**Důležité podle pravidla z dnešního memory `feedback_no_unverified_claims.md`:**
- Žádné *„klienti potvrdili"* / *„z reálné poptávky vznikl"* dokud to nebude pravda.
- Pokud dnes není zákazník, je upřímnější říct *„postavil jsem si na vlastní bolest, dnes to zkouším otevřít komukoliv komu to dává smysl"*.

### Demo scénáře

**Pro advokáta:**
1. Otevři Claude.ai s konektorem `dd.cz-agents.dev/mcp`
2. Prompt: *„Run DD on IČO X, walk statutory chain to depth 2"*
3. Ukázat: kompletní report v 5 vteřinách, červené vlajky highlighted

**Pro compliance:**
1. Otevři dashboard Watchdog
2. Upload CSV s 50 IČO klientů
3. Forward o 24h: ukázat email s changes + audit log entry s timestamp

**Pro účetní:**
1. Bulk CSV upload 100 dodavatelů
2. Ukázat dashboard "5 changes za týden" — 2 nové insolvence, 1 změna sídla, 2 nespolehliví plátci
3. CSV export pro klienta

### Early adopter program

**Návrh:** prvních 10 paying zákazníků DD Watchdog dostane **2× sleva** (€149/mo místo €299/mo) na **6 měsíců**, výměnou za:
- Veřejnou referenci (s jejich svolením)
- Měsíční 30 min feedback call
- Right of first refusal pro Enterprise upgrade

**Cíl:** nikoli revenue, ale *case studies* a *lock-in*. 10 zákazníků × €149 × 6 měs = €8 940 navíc revenue, ale 10 case studies = neocenitelné pro další sales.

**Risk:** pokud po slevě nebude commit zaplatit normální cenu, máš drahé „zákazníky". Mitigation: explicit cancellation clause po 6 měsících + automatický rollover na full price (s opt-out).

---

## E) Rizika a jejich mitigace

| Riziko | Pravděpodobnost | Dopad | Mitigation |
|---|---|---|---|
| **Justice.cz změní formát Sbírky listin** | Středně | Vysoký pro feature 4 | Pay-per-use model (ne flat fee) → můžeš feature pozastavit bez SLA breach |
| **ADIS SOAP service deprecated nebo změna formátu** | Nízká (státní servis) | Středně | Fallback na manuální HTML scrape `adisspr.mfcr.cz/dpr/adis/idpr_pub/izdr/izdr.faces` |
| **ARES rate limit přitvrdí** | Nízká | Vysoký | Implementovat per-customer cache (24h TTL) + batched queries + monitorovat 429s |
| **GDPR žaloba od statutáře** | Nízká | Vysoký (PR + právní cost) | Right-of-access endpoint + advokátní review před launch (5–15k Kč) |
| **Cribis sníží ceny / vydá MCP server** | Střední (1–2 roky) | Střední | Naše moat = open source + transparent pricing + AI-native UX. Cribis je 20-let starý player, MCP nepředpokládám u nich do roku 2027. |
| **Žádný klient nezaplatí Watchdog** | **Vysoká, dnes** | Existential | **Launchnout MVP s 1–2 zákazníky podepsanými předem (LOI nebo first-month-free)**, ne vacuum |
| **Audit log corruption / loss** | Nízká | Existential pro fintech zákazníky | Synology backup nightly + Hetzner snapshot + read-only volume mounts |
| **Self-hosting nestačí (1 VPS down)** | Nízká | Středně | Hetzner CPX má 99.9% SLA. Nice-to-have: read replica na druhém poskytovateli pro Enterprise tier. |
| **Sbírka listin OCR cost přesáhne €3 cenu** | Středně | Středně | Cap usage; pokud cost > €1.50/query, zvednout cenu na €5 nebo přidat k Enterprise jako "10 dotazů zdarma" |
| **Telegram bot ban / Stripe webhook chybí** | Nízká | Středně | Multi-channel delivery (email = baseline, Telegram = bonus) |

### Konkurenční reakce — co kdyby Cribis snížil cenu?

**Realistický scénář:** Cribis je legacy hráč s pomalou inovací. Pravděpodobnost agresivní reakce na malého konkurenta = nízká. Pokud by k ní došlo, naše odpověď není soutěžit cenou (nemůžeme — oni mají větší tým a sales), ale **utlumit positioning na „tools-for-developers, ne tools-for-procurement"**. Cribis cílí na CFO/procurement, my na compliance officer + dev.

---

## Prioritizovaná doporučení (1-2-3)

1. **TENTO TÝDEN:** Postavit `@czagents/adis` MCP server pro nespolehlivý plátce DPH. 2–3 dny práce, integrovat do existujícího `@czagents/dd` jako další red flag. **Žádný nový tier**, jen value-add do existujícího DD Pro/Agency. Měřitelný okamžitý zisk: zvýšená retence DD Pro zákazníků.

2. **PŘÍŠTÍCH 6 TÝDNŮ (jen pokud aspoň 1 zákazník zaplatil DD Pro nebo Agency):** Postavit MVP Watchdog tier — watch list + cron diff + audit log + email/Telegram alerts + minimal UI. Launch na **closed beta** pro 5 vybraných lidí (compliance officer + advokát + 2 účetní + 1 M&A) **zdarma za feedback**, ne hned platebně.

3. **PO BETA FEEDBACKU (~3 měsíce od teď):** Otevřít Watchdog veřejně za €299/mo s early-adopter slevou €149 pro prvních 10. **TEPRVE TADY** dělat LinkedIn post — protože budou skutečné případy doložené reálnými uživateli. Sbírka listin parser odložit na fázi 3 (Q3 2026) jako pay-per-use add-on.

---

## Nedoporučené kroky

1. **Nedělat všechny 4 funkce paralelně.** Sériově.
2. **Nelaunchnout Watchdog dokud není betatester ochoten zaplatit.** *Free-month-conversion-rate* je dnes signál č. 1.
3. **Nezmiňovat klienty / case studies, pokud neexistují.** Princip z `feedback_no_unverified_claims.md`.
4. **Nestavět vlastní bonitní hodnocení.** ČEKIA má 30 let dat, neutkvátíme. Naše moat je agregace + AI-native UX, ne credit scoring.
5. **Neslibovat 99.9% SLA u Watchdogu €299.** Realistická SLA pro tento tier: 99.5% (3.6 hodin downtime/měs), což CPX22 + Hetzner zvládá. Vyšší SLA jen v Enterprise.

---

## Otevřené otázky pro Martina

1. **Existuje dnes alespoň 1 platící zákazník na DD Pro nebo Agency tier?** Bez něj má Watchdog příliš vysoký risk.
2. **Máš v kontaktech compliance officer / advokát co by udělal beta-test ZA RECENZI**, ne za peníze? 5 lidí stačí.
3. **Je akceptovatelné dělat HTML scraping Justice.cz s rizikem změny ToS?** Pokud ne, fáze 3 (Sbírka listin) odpadá úplně a navrhované Enterprise pricing klesá k €699/mo.
4. **Pojištění odpovědnosti za škodu** — pokud Watchdog miss-ne sankci a zákazník fakturuje rizikové firmě a je sankcionován, je naše odpovědnost? Standard EULA má disclaimer, ale fintech kupec to čte. **Nutno mít právní review před Enterprise tierem.**

---

*Dokument zpracován 2026-04-27 v rámci konverzace s Claude. Vstupy: ověřené datové zdroje (ARES, ISIR, ADIS SOAP, Justice.cz), competitor scan (Cribis, Bisnode, ČEKIA), znalost stávající architektury cz-agents.dev. Doporučení jsou *hypotézy* — žádný platící zákazník výše uvedené persony dnes nepotvrdil. Před implementací validovat alespoň 2 personami v rozhovoru.*

---

## ADDENDUM (2026-04-27): revize po odpovědích Martina + tvrdých právních zjištěních

Po analýze otevřených otázek se ukázaly tři skutečnosti, které *významně* mění předchozí doporučení:

### A) Stav: 0 platících zákazníků na žádném tieru

To znamená, že **Watchdog tier (€299) ani Enterprise Monitor (€999) dnes nestavět**. Postavit premium tier bez ověřeného základního tieru = klasická nadbytečná investice. Prioritou je dostat alespoň *jednoho* platícího klienta na existující DD Pro/Agency, tím validovat základní hypotézu trhu.

**Revidované doporučení:** Watchdog *plán existuje*, ale *není v sekvenci*. Spustí se až po prvních 3–5 platících na DD Pro/Agency, a po 1–2 explicitních dotazech *„umíte to monitorovat"* od reálných uživatelů. Bez toho je to overengineering.

### B) Sbírka listin parser — vyloučit úplně z roadmapy

**Tvrdé zjištění:** `https://or.justice.cz/robots.txt` explicitně obsahuje `Disallow: /ias/` — což je *přesně* cesta Sbírky listin (`/ias/ui/vypis-sl-firma`). Justice.cz nás jako roboty veřejně a explicitně **zakazuje**.

K tomu **autorský zákon § 88–92** dává pořizovateli (státu) sui generis ochranu nad databází. § 36 omezuje uživatele na *„přístup k obsahu a běžné využívání"*. **Elektronická kopie celé databáze není dovolena.** Komerční reuse podstatné části = porušení.

To není *„šedá zóna na advokátní konzultaci"*. Je to *„explicitně proti veřejně publikovaným pravidlům + porušení autorského zákona"*. **Insurance to nepokryje** — úmyslné porušení je standardní výluka z většiny PI pojištění.

Cribis a ostatní legacy hráči mají přístup ke Sbírce listin **smluvně** (partnership s MSp / CDIA). Pro solo provoz dnes ne realistická cesta.

**Alternativa která je 100% legálně čistá:**

> Uživatel nahraje vlastní PDF účetní závěrky → my zparsujeme přes Claude vision → vrátíme structured JSON.

Uživatel dělá legitimní download (sám si stahuje veřejné dokumenty pro vlastní zpracování), my jsme jen *processing layer* nad jeho vlastními daty. UX je horší (manual upload místo *„zadej IČO"*), ale legálně bez problému. To je jediná verze této feature, která stojí za úvahu — a ne dříve než po validaci tržního zájmu.

### C) Pojištění místo právní analýzy — akceptovatelné, ale pro správný typ rizika

Nemáš domluveného advokáta a chceš místo toho zvažovat pojištění. To dává smysl pro **provozní rizika** (chyba ve výpočtu skóre, false positive sankce, miss-ne insolvence), ne pro **úmyslné porušení** (scraping proti robots.txt).

**Konkrétně:**
- **Professional Indemnity / E&O pojištění** v ČR: 8–25 000 Kč/rok pro solo provoz, kryje *neúmyslné chyby a opomenutí*. **Doporučeno před launchem Enterprise tieru** (kdy klient platí €999/mo a očekává odpovědnost).
- **Pro DD Pro / Agency tier (€49–199):** dnes pravděpodobně zbytečné. EULA s disclaimer ("data jsou poskytována as-is, neodpovídáme za rozhodnutí učiněná na jejich základě") + transparent pricing = standardní ochrana pro tento price-point.
- **Žádné pojištění nepokryje** scraping Sbírky listin proti robots.txt — to je úmyslné, vědomé porušení z mého dnešního vyhodnocení.

**Doporučení:** *Není to ani nebo* — pojištění *doplňuje*, ne nahrazuje právní review. Pro Enterprise tier udělej obojí: insurance (low effort, jednorázová roční platba) + advokátní review EULA + privacy/terms (5–15 000 Kč jednorázově). Před tím dnes nemusíš dělat ani jedno — DD Pro/Agency je dostatečně malé riziko že standardní disclaimer stačí.

---

## Finální revidovaná sekvence (po addendu)

1. **TENTO TÝDEN:** `@czagents/adis` (nespolehlivý plátce DPH SOAP klient → integrace do `@czagents/dd`). 2–3 dny. Bez nového tieru, bez nové stránky, bez marketingového oznámení. Jen tichý value-add do existujícího DD reportu. **Z tohoto plánu zůstává jediný no-regret krok pro tento týden.**

2. **PŘÍŠTÍ 1–3 MĚSÍCE — ne stavět feature, ale validovat trh:**
   - **Cíl: 1 platící zákazník** na DD Pro nebo Agency. Bez něj je celá další roadmapa hypotetická.
   - Cesty k tomuto cíli: dev.to update už běží (passive); čekat na Anthropic Connectors approval (passive); přímo poslat 5 lidem (advokát/účetní/M&A) z vlastní sítě nabídku zdarma vyzkoušet → konverze na placený tier.
   - **Pokud po 3 měsících 0 platících:** trh hypotézu vyvrátil. Watchdog tier je bezpředmětný. Buď pivot k jiné personě, nebo tier never built.
   - **Pokud 1–3 platící:** validovaná baseline, můžeme jít k bodu 3.

3. **PO PRVNÍCH 3 PLATÍCÍCH (pokud nastane):**
   - **Watch list MVP** (4–6 týdnů): cron + ARES/ISIR/sankce/ADIS diff + email alerts. Bez UI v první iteraci — JSON config + email digest.
   - **Audit log** (1 týden): append-only SQLite + signed timestamps.
   - Launch jako **closed beta zdarma** pro 5 z těch 3 platících + 2 jejich kontaktů → *real validation of monitoring need*.
   - Bez Sbírky listin, bez fancy UI, bez Enterprise Monitor tieru.

4. **PO 5 BETA UŽIVATELÍCH (pokud nastane):**
   - **Pricing test:** prvních 3 zákazníků za €149/mo (50% sleva) na 6 měsíců + reference. Validuj že lidé jsou ochotní platit.
   - **Pokud konverze >40%:** otevři Watchdog veřejně za €299/mo.
   - **Pokud konverze <20%:** pricing je špatně. Buď příliš drahé pro segment, nebo Watch list není to co chtějí. Reflect.

5. **NIKDY (na základě dnešních zjištění):**
   - Sbírka listin scraping přes or.justice.cz/ias/. *Pouze* user-upload-PDF varianta a *pouze* po validovaném zájmu.
   - Enterprise Monitor (€999) bez insurance + EULA review.
   - Marketing co tvrdí *„clients use this for X"* bez doložení — princip z `feedback_no_unverified_claims.md`.

---

## Akční kroky pro Martina pro **tento týden** (post-addendum)

1. **Není potřeba implementovat Watchdog tier.** Místo toho:
2. **Postavit `@czagents/adis`** (2–3 dny práce, no-regret hodnota do existujícího DD reportu). Pokud chceš, řekni *„udělej to"* a začnu hned.
3. **Nestavět Sbírku listin parser.** Justice.cz robots.txt + AutZ § 36/88 ji uzavírají; user-upload varianta dává smysl jen po validaci trhu.
4. **Pro DD Pro/Agency tier je insurance dnes nice-to-have, ne must-have.** Standardní EULA disclaimer (*„data as-is, no liability"*) stačí pro pricing pod €200/mo. Pro Enterprise je potřebné — ale to dnes nestavíme.
5. **Hlavní task týdnu zůstává:** dostat 1 platícího zákazníka na existující tier. Bez něj je všechno ostatní teorie.

*Sources tohoto addenda: `or.justice.cz/robots.txt` 2026-04-27, [Autorský zákon § 88-92 — Wikipedie](https://cs.wikipedia.org/wiki/Autorsk%C3%BD_z%C3%A1kon_(%C4%8Cesko,_2000)), [SOOM forum o legalitě scrapingu](https://www.soom.cz/hack-forum/52780--Legalita-web-scrapingu).*
