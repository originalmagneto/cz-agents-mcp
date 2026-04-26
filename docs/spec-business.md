# cz-agents — funkční specifikace pro byznys

> Pro netechnické publikum: účetní, advokáty, fintech compliance, B2B sales, M&A poradce, manažery, zakladatele.
> Co projekt umí, co řeší, kdo to potřebuje, kolik to stojí.

## Co cz-agents je (jednou větou)

**Otevřený soubor nástrojů, které umožní jakémukoli AI asistentovi (Claude Desktop, Cursor, ChatGPT s MCP, vlastní firemní agent) automaticky pracovat s českými firemními a vládními daty — během rozhovoru, bez nutnosti otvírat 6 tabů a klikat.**

Místo otázky *„najdi mi prosím kontakt na firmu IČO 12345678"* a 5 minut manuálního hledání → AI asistent **sám pochopí**, že to znamená *„podívej do ARES"*, dotáhne plnou kartu, ověří DPH status, prověří jednatele proti sankcím a insolvenci, a vrátí to v odpovědi.

## Co konkrétně to umí

### 1. Vyhledat firmu v Obchodním rejstříku
Vstup: IČO **nebo** část jména firmy **nebo** adresa **nebo** obor (NACE).
Výstup:
- Plná legální karta (název, sídlo, právní forma, datum vzniku)
- Statutární orgány (jednatelé, představenstvo) s daty zápisu
- DPH status + finanční úřad
- Transparentní bankovní účty (povinnost § 96a ZDPH)
- Historie změn (předchozí jména, předchozí adresy)
- DIČ validace s MOD11 checksumem

**Použití:** Před vystavením faktury, před uzavřením smlouvy, při hledání kontaktu, při ověření identity protistrany.

### 2. Spočítat měnové kurzy přes ČNB
Vstup: částka + výchozí měna + cílová měna (volitelně i historické datum).
Výstup: aktuální nebo historický oficiální kurz ČNB, převedená částka.

**Použití:** Účetnictví, fakturace v cizí měně, daňové přiznání DPH, FX přepočty pro nadnárodní transakce.

### 3. Prověřit osobu nebo firmu na sankčních seznamech
Vstup: jméno + datum narození **nebo** IČO **nebo** název firmy.
Výstup:
- Match na **EU sankčním seznamu** (denně aktualizovaný)
- Match na **americkém OFAC SDN** (denně aktualizovaný)
- Confidence skóre 0–100 % (kvůli překlepům, transliteracím cyrilice/arabštiny)
- Kontext: jaký sankční režim, datum zařazení, důvod

**Použití:** Povinný KYC/AML screening pro banky, fintech, payment institutions, crypto burzy. Dále pro advokáty (compliance check klienta) a pro mezinárodní obchod (hrozba US correspondent banking blokace).

### 4. Ověřit insolvenci v ISIRu
Vstup: IČO firmy **nebo** jméno+datum narození osoby.
Výstup:
- Aktivní insolvenční řízení (ano/ne)
- Spisová značka, soud, fáze řízení (návrh / konkurz / oddlužení / reorganizace)
- Pro osoby: osobní bankrot / oddlužení (zákonný blokátor pro výkon funkce statutára dle § 13 ZSVR)

**Použití:**
- **Účetní** před fakturou na nového klienta — pokud je v insolvenci, dostat se k pohledávce po prohlášení konkurzu = velmi obtížné
- **Advokát při M&A** — DD na cíl
- **Faktoring** — odmítnout pohledávku na insolventního dlužníka
- **Banky** — onboarding compliance

### 5. Due-diligence report — komplet vetting jediným voláním
Vstup: IČO.
Výstup: **Strukturovaný report**, který vznikne automatickým paralelním zpracováním všech předchozích služeb plus:
- **Detekce „bílého koně"** — varovné znaky nominálního statutára:
  - Bydliště evidováno na úřadu (typický indikátor po exekuci)
  - Předchozí firmy spojené s jednatelem ve stavu konkurzu
  - Osobní insolvence jednatele
  - Více změn statutára v krátkém čase
- **Virtuální adresa** — sídlo sdílené 50+ firmami
- **DPH bez transparentního účtu** — porušení § 96a
- **Risk score 0–100** s klasifikací low/medium/high
- **Vysvětlitelné red flags** — každý bod na skóre má rule kód, váhu, popis a důkaz

**Použití:**
- Advokátní DD na protistranu před uzavřením smlouvy
- Compliance pipeline pro banky/fintech při onboardingu
- B2B sales — pre-call lead enrichment
- Zákon č. 134/2016 Sb. — povinné vetting účastníků veřejných zakázek
- Faktoring — risk před nákupem pohledávek

## Komu to konkrétně pomáhá

### Účetním firmám (~10 000 v ČR)
**Problém dnes:** Pět minut manuálního klikání pro každou novou faktura: ARES → DPH ověření → bank account check → ISIR check insolvence.
**S cz-agents:** Jeden AI prompt, výsledek za 5 sekund. Ušetří desítky hodin měsíčně na firmě se 100+ klienty.

### Advokátním kancelářím (commercial / M&A)
**Problém dnes:** DD na cílovou firmu pro klienta = 2–4 hodiny právního koncipienta. Drahé, opakované, manuální.
**S cz-agents:** AI asistent sestaví draft DD reportu během 15 sekund. Koncipient ho ověří a rozšíří, místo aby ho stavěl od nuly.

### Fintech compliance týmům
**Problém dnes:** Onboarding nového klienta vyžaduje kombinaci ARES + sankcí + insolvence + statutary chain. Dnes to dělají buď vlastní integrace (drahé) nebo manuálně klikání (špatně škáluje).
**S cz-agents:** Standardní MCP integrace do compliance pipeline. Rychlejší onboarding, méně lidských chyb, auditovatelná stopa každého kroku.

### B2B sales týmům
**Problém dnes:** Lead enrichment — sales člověk před call vždy zkontroluje protistranu na webu.
**S cz-agents:** AI asistent v CRM (Salesforce, Pipedrive, HubSpot) automaticky obohatí každý lead o ARES data + insolvency check + risk score. Sales mluví s informovanou protistranou.

### Faktoringovým / cash-flow finance firmám
**Problém dnes:** Před nákupem pohledávky je nutný credit check dlužníka. Ručně přes Cribis / Bisnode dáno, vlastní integrace levnější.
**S cz-agents:** API call → real-time risk score → automatizované rozhodnutí discount %.

### M&A poradenství / private equity
**Problém dnes:** DD na cíl + dodavatelské řetězce + management background = týdny práce.
**S cz-agents:** Statutární řetězec (UBO walk) + per-osobní insolvenční history dotáhne stroj. Lidský poradce pak rozhoduje.

### Konzultantům veřejných zakázek
**Problém dnes:** § 7 ZZVZ vyžaduje vetting všech účastníků tendru. Dnes ruční práce.
**S cz-agents:** Bulk processing, automatizovaný compliance proof.

## Co cz-agents NEDĚLÁ (a proč)

### Necháváme záměrně nezpřístupněné

**Centrální evidence exekucí (CEE) — placená Exekutorskou komorou.**
Důvod: Exekuce jsou výkon státní/soudní moci. Informace o nich patří státu, ne profesní komoře. Současný model placené komorou (60 Kč/dotaz, ~180M Kč ročně rentu) považujeme za regulatory capture a nechceme se na něm podílet. Místo toho nabízíme **alternativní indikátory finančního distresu** osoby z **bezplatných** zdrojů (ISIR osobní insolvence, bydliště na úřadu, historie statutáře).

**Komerční datasety třetích stran (Cribis, Bisnode, ČEKIA bonita).**
Důvod: Tyto firmy data nakupují z veřejných zdrojů (a od EKČR) a draze přeprodávají. Stejnou kvalitu sestavíme přímo z primárních veřejných registrů.

**Trestní rejstřík.**
Důvod: GDPR + zákon o ochraně osobních údajů. Trestní záznam není veřejný a publikovat ho v reportu třetí straně by bylo v rozporu s GDPR Article 6.

**Adverse media / negative news scanning.**
Důvod: Jiná kategorie produktu, vyžaduje agregátor (jako Refinitiv World-Check). Možné v budoucnu, ale ne v jádře.

**PEP screening (politicky exponované osoby).**
Důvod: Vyžaduje placený dataset (OpenSanctions Pro, Refinitiv ~$300/měs). Ne v MVP, zvážit při větším objemu.

## Cenotvorba

**Free tier (bez registrace, bez tokenu):**
- ARES, ČNB neomezeně
- Sanctions, ISIR, DD basic — denní limit per IP

**Sanctions Starter (€19/měs):** 5 000 sankčních lookupů/měs, hostovaný endpoint, denní refresh.
**Sanctions Pro (€99/měs):** 50 000 lookupů/měs, webhook alerty na sledovaná IČO.
**DD Pay-per-report (€0,50/report, balík min 100 = €50):** plný report bez závazku, kredity nevyprší.
**DD Pro (€49/měs):** 200 reportů/měs, plný depth, monitoring 1 IČO.
**DD Agency (€199/měs):** 1 500 reportů/měs, bulk CSV, alerty, prioritní podpora.

**Enterprise (custom):** white-label, on-premise, custom flagy, SLA. Domluva přes martin.havel@gmail.com.

## Jak to vypadá z pohledu uživatele

### Scénář 1: Účetní v Pohodě/Money

```
Účetní:    Vystavujem fakturu na 350 000 Kč firmě ABC Distribuce s.r.o.,
           IČO 12345678. Můžeš mi to projet?

AI:        ✅ ABC Distribuce s.r.o. existuje, založena 2015, plátce DPH
           ✅ Transparentní účet 123456/0100 zveřejněný 2024-01-15
           ✅ Statutární orgán: Jan Novák (jednatel od 2020), bez sankcí
           ✅ ISIR: žádné insolvenční řízení
           ⚠️ Risk score: 8/100 — drobný flag, statutární změna před 25 dny
           
           Doporučení: faktura OK, ale 25-denní změna statutára stojí
           za pozornost. Vyžadovat osobní podpis případně ověřit
           autorizaci u sídla firmy.
```

### Scénář 2: Compliance v fintech onboardingu

```
Compliance: Onboardujeme firmu XY z.s., IČO 99999999, jednatel
            má rusky znějící jméno. Plný KYC.

AI:         🚨 Risk score: 65/100 (HIGH)
            
            Důvody:
            - STATUTORY_PERSONAL_INSOLVENCY (50 b): jednatel
              v aktivním oddlužení (KSPH 60 INS 1234/2025) — § 13 ZSVR
              ho diskvalifikuje pro funkci jednatele
            - STATUTORY_REGISTERED_AT_GOVT_OFFICE (25 b): bydliště
              evidováno na ÚMČ Praha 3 (Havlíčkovo nám. 9)
            
            Doporučení: NEONBOARDOVAT. Posloupnost flagů indikuje
            nominálního statutára pro shell entitu.
```

### Scénář 3: Advokát při DD pro M&A

```
Advokát:   Kupujeme XYZ Holding s.r.o. za 50M. DD na cíl + dodavatele.

AI:        Vygenerováno 12 reportů (cíl + 11 dodavatelů z ARES VR statutární
           chain, hloubka 2). Souhrn:
           
           XYZ Holding s.r.o. — risk 18/100 (LOW)
              ✅ Žádné kritické flagy
              ⚠️ NACE 7 oborů (typické pro holdingovou struktura)
           
           Dodavatel #4: ABC Trading s.r.o. — risk 72/100 (HIGH)
              🚨 STATUTORY_PRIOR_BANKRUPT_COMPANY (jednatel byl
                statutářem v firmě, která je v aktivní insolvenci)
              🚨 RECENT_STATUTORY_CHANGE (před 12 dny)
           
           Doporučení k cíli: pokračovat. Hlubší DD na dodavatele #4
           před schválením transakce — možný problémový vendor.
```

## Bezpečnost a compliance

- **Auth:** Bearer tokeny pro placené tiery, anonymous pro free tier
- **Data:** Žádná personal data nehostujeme my — vždy primární zdroj (ARES, ISIR atd.) v reálném čase nebo s 24h cache
- **GDPR:** Zpracování osobních dat z veřejných registrů na základě právního zájmu (Art. 6.1.f), s explicitní policy
- **Audit trail:** Každý report obsahuje seznam triggered flagů s váhou, popisem a důkazem (zdroj + raw data)
- **SLA:** Free tier best-effort. Placené tiery uptime 99,5 %, response time p95 < 500 ms
- **Hosting:** Servery v EU (Hetzner Falkenstein), GDPR adequate. Data nikdy neopouští EU.

## Roadmap

**Hotovo (Q2 2026):**
- ARES, ČNB, Sankce, ISIR, DD agregátor live
- Bílý-kůň detekce (úřad bydliště, historie konkurzů)
- Stripe billing, hostované endpointy, npm + MCP registry

**Plánováno (Q3 2026, závisí na poptávce):**
- `@czagents/smlouvy` — Registr smluv (smlouvy.gov.cz) pro B2G intel
- `@czagents/cedr` — registr dotací (CEDR3)
- `@czagents/cuzk` — kataster nemovitostí (omezený rozsah, free part)
- ISIR daily snapshot do indexu pro rychlejší batch lookups
- Stripe Customer Portal pro self-service změny

**Neplánováno (principiálně):**
- Centrální evidence exekucí (vysvětleno výše)
- Komerční resellerové datasety
- Trestní rejstřík (GDPR)

## Reference & technologie

- **MCP standard** (Model Context Protocol, Linux Foundation 2025) — vendor-neutral, kompatibilní s Claude, ChatGPT, Cursor, Continue, vlastními agenty
- **Open source MIT** — kód, recipe pro billing, vše veřejné na github.com/martinhavel/cz-agents-mcp
- **TypeScript / Node.js 20+** — production stack, Docker containerization
- **Hosted endpoints:** ares/cnb/sanctions/isir/dd .cz-agents.dev (HTTPS, Apache reverse proxy)
- **npm:** všech 6 packages publikováno (`@czagents/*`)
- **MCP registry:** `dev.cz-agents/*` verifikované DNS TXT na cz-agents.dev

## Kontakt

- **Web:** https://cz-agents.dev
- **GitHub:** github.com/martinhavel/cz-agents-mcp
- **Email:** martin.havel@gmail.com
- **Custom plán / on-premise / faktura na firmu:** napište

---

*Dokument k 2026-04-26. Projekt je aktivně udržovaný a rozvíjený.*
