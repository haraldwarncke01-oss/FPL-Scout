# FPL Scout · version 4

En dansk GitHub Pages-side til FPL-scouting og holdplanlægning. Den viser tre anbefalinger på hver position, spilletid, lighed med topscorere, pointprognoser, lovlige 11/15-mandshold og betingede transfer- og chip-råd. Vælg denne GW, de næste 3 GW eller de næste 5 GW.

## Upload opdateringen til dit eksisterende GitHub-repository

Version 4 gør dit eget FPL-hold og samlede transferplaner til en central del af siden. Har du allerede workflowet fra version 3, er det uændret: upload blot de nye projektfiler. Hvis du opgraderer fra en ældre version, skal workflowet installere SciPy som vist i `.github/workflows/pages.yml`.

1. Pak `fpl-scout-v4-opdatering.zip` ud. Åbn den indre `fpl-scout`-mappe.
2. Gå til repositoryets **Code → Add file → Upload files**. Upload indholdet: mapperne `site`, `scripts`, `tests` samt filerne `requirements.txt` og `README.md`. Upload ikke den ydre `fpl-scout`-mappe, da filerne så havner et niveau for dybt. Bevar mappestrukturen og commit ændringerne.
3. Har du allerede workflowet fra version 3, skal det ikke ændres. Hvis du opgraderer fra en ældre version: åbn **`.github` → `workflows` → `pages.yml` → Edit** på GitHub, og erstat indholdet med workflowet fra ZIP-filens `.github/workflows/pages.yml`. Den skjulte mappe kan vises med `Cmd + Shift + .` på Mac.
4. Hvis `.github/workflows` endnu ikke findes: **Code → Add file → Create new file**. Skriv `.github/workflows/pages.yml` i filnavnet, kopier workflowets indhold ind og commit. Der er ingen nye afhængigheder i forhold til version 3.
5. Under **Settings → Pages** skal **Source** være **GitHub Actions**. Åbn **Actions → Update FPL data and publish site**. Den seneste kørsel skal blive grøn; brug **Run workflow**, hvis nødvendigt.
6. Find den udgivne adresse under **Settings → Pages**. Genindlæs siden, hvis browseren stadig viser den tidligere version.

Den første kørsel efter trin 2 kan fejle, hvis workflowet fra trin 3 endnu ikke er opdateret. Vurder den seneste kørsel efter begge ændringer. Workflowet henter data og publicerer ved push til `main` og kl. 05:23 og 17:23 UTC dagligt. Planlagte GitHub-kørsler kan være forsinkede. Siden viser udtrækkets tidspunkt. En mislykket opdatering erstatter ikke den tidligere udgivelse.

## Funktioner

- **12 kandidater:** op til tre målmænd, forsvarere, midtbanespillere og angribere. Anbefalingerne genberegnes ved hver dataopdatering og reagerer på den valgte tidshorisont.
- **Minutter:** gennemsnit når spilleren får spilletid, gennemsnit inklusive kampe med 0 minutter og minutter i de seneste tre afsluttede kampe. Nyeste kamp står først. Ukendte data vises som `—`, ikke 0.
- **Forklarlig lighed:** konkret tabel med spillerens tal og op til tre statistisk nærliggende topscorere på samme position. Afstand, point/90, udvælgelse og skalaer vises.
- **Pointprognose:** bidrag fra spilletid, mål, assists, clean sheets, bonus, defensive bidrag, redninger og fradrag for hver af de næste fem GW.
- **Holdforslag:** et komplet £100m-hold med 2 GKP, 5 DEF, 5 MID og 3 FWD, højst tre pr. klub og lovlig startformation. Se start-11, alle 15, kaptajn, vice og bænk. 3/5-GW-planerne beholder samme trup og roterer opstillingen.
- **Bench Boost-hold:** særskilt optimering af alle 15 spilleres point i den kommende GW.
- **Mit FPL-hold:** indtast dine faktiske 15 spillere fordelt på positioner, bank, salgsværdier og 0–5 gratis transfers. Vælg en selvstændig 1/3/5-GW-periode til transfers. Dit hold og dine valg huskes i browseren, også når du genindlæser. Eksempelhold markeres som eksempler.
- **Samlede transferplaner:** vurderer 0 til dit antal gratis transfers i den kommende GW, inklusive udskiftninger der frigør budget til en opgradering andetsteds. Du kan aktivt vælge at afprøve én ekstra transfer med 4 point i fradrag. Se konkrete spillere ud/ind, bank efter, netto-pointgevinst, kaptajn og effekten i hver GW. Sammenlign den bedste afprøvede plan ved forskellige antal transfers.
- **Chips:** Triple Captain, Bench Boost, Wildcard og Free Hit med synlige betingelser. Et personligt råd kræver et komplet hold og markering af en ubrugt chip i det aktuelle sæsonvindue. Højst én chip prioriteres pr. GW.
- **Dataexplorer:** søgning, sortering efter prognose/minutter og filtre for pris, position, klub, ejerskab, xG/xA/xGI, defensive bidrag og næste kamp.
- **Holdhistorik:** clean sheets hjemme/ude, mål for/imod og op til seks indbyrdes opgør med stikprøvestørrelse og sæsoner.

## Brug dit faktiske hold

1. Åbn **Mit FPL-hold & transfers** øverst på siden.
2. Søg efter dine spillere. Positionsfilter og tællere hjælper dig med at vælge 2 målmænd, 5 forsvarere, 5 midtbane og 3 angribere. Samme spiller kan kun vælges én gang, og der tillades højst tre fra en klub.
3. Skriv bank i £m, fx `1.5`, og hvor mange gratis transfers du faktisk har tilbage. Vælg, om spillere skal vurderes over denne GW, de næste 3 eller de næste 5 GW.
4. Sæt spillernes **salgsværdier fra FPL** i felterne ved holdet. Tomme felter bruger købsprisen som estimat. Salgsværdien kan være lavere end købsprisen, så den er nødvendig for præcis økonomi.
5. Tryk **Find transferforslag**. Planen viser ændringer i kommende GW og forventet effekt over din valgte periode. Vælg et andet antal transfers i resultatets sammenligning for at se alternativer.
6. Gennemfør selv de samlede transfers i FPL og opdatér derefter dit hold her. Siden foretager ingen ændringer på din FPL-konto.

Forslagene genberegnes, når du trykker på knappen. Ændrer du hold, økonomi eller periode, fjernes de gamle forslag. Dit hold gemmes lokalt; chips markeres særskilt og kan være et alternativ til almindelige transfers.

### Hvordan transferplanen beregnes

Kandidater skal have mindst 50 forventede min/kamp og 75% tilgængelighed. Pr. position bruges op til 20 med høj prognose, 8 med godt forhold mellem prognose og pris og 4 billige muligheder; overlap fjernes. En begrænset beam search beholder op til 28 lovende kombinationer på hvert trin. Søgetiden er normalt kort, og beregningen kører i en web worker, så siden fortsat kan bruges.

Vi afprøver både enkeltstående udskiftninger og kombinationer. En mellemregning må kræve en ekstra salgshandel for at frigøre penge eller plads i klubkvoten; hver færdig plan skal være betalelig samlet og overholde positioner, spillerunikhed og højst tre pr. klub. Alle udskiftninger sker i samme kommende GW. Spillerpriser og bank regnes i tiendedele af £m for at undgå afrundingsfejl.

For hver plan vælger vi en lovlig start-11 og kaptajn i hver GW i perioden. Nettogevinst = nye holdpoint − holdpoint uden transfers − 4 × antal transfers ud over de gratis. Fradraget trækkes én gang i kommende GW. Ved under 2 forventede point i nettogevinst anbefales 0 transfers. De bedste afprøvede planer med 0, 1, 2 osv. vises som alternativer; algoritmen garanterer ikke en globalt optimal løsning.

Gratis transfers spares ikke automatisk for deres fremtidige værdi i modellen. Priser holdes faste, og der simuleres ingen fremtidige transfers eller autosubs. Planen beregner normal FPL-scoring med dobbelt kaptajn; chips vurderes i deres egen sektion. Tidligere data og pointprognoser er usikre, og skadesoplysninger bør kontrolleres tæt på deadline.

## Datakilder

`scripts/fetch_fpl.py` henter de offentlige FPL-endpoints:

- `https://fantasy.premierleague.com/api/bootstrap-static/`
- `https://fantasy.premierleague.com/api/fixtures/`
- `https://fantasy.premierleague.com/api/event/{GW}/live/` for afsluttede kampuger, herunder point og minutter pr. kamp.

De tre tidligere sæsoners Premier League-resultater hentes fra [OpenFootball](https://github.com/openfootball/football.json), hvis datasæt er CC0. Denne sæsons resultater kommer fra FPL. Historik, der ikke kan hentes, markeres på siden. FPL- og minutdata skal kunne hentes, før en ny version udgives.

GitHub publicerer kun `site/`. Browseren henter JSON fra samme domæne, så den ikke behøver at kalde FPL direkte. FotMob er ikke koblet på; nye kilder kan senere tilføjes gennem stabile spiller-/hold-id'er. Projektet er uafhængigt af Premier League.

## Beregninger

### Spilletid

De seneste tre afsluttede kampe vægtes 50/30/20, nyeste først. Prognosen bruger 75% af dette gennemsnit og 25% af sæsongennemsnittet inklusive kampe med 0 minutter, og ganger med FPL's aktuelle tilgængelighed. Ved færre kendte kampe normaliseres vægtene. Spillere uden kendte minutter indgår ikke i holdforslaget.

Kampe før spillerens registrerede ankomst til nuværende klub regnes ikke som 0. Registrerede optrædener for tidligere klubber medtages, men kampe uden spilletid i en tidligere klub kan mangle. Derfor vises antal kendte kampe. Skaders sikre returdatoer mangler, så samme tilgængelighed bruges i hele perioden. Den viste prognose er pr. kamp; et dobbelt-GW kan have op til 180 forventede minutter.

### Lignende spillere og de 12 kandidater

Spillere med mindst 270 minutter sammenlignes kun med samme position. Afstand er kvadratroden af gennemsnittet af de kvadrerede, skalerede forskelle pr. 90. Hver skaleret forskel begrænses til 5. Skalaer:

| Position | Målinger og skalaer |
| --- | --- |
| GKP | Redninger 1,8; xGC 1,0 |
| DEF | xG 0,12; xA 0,14; xGC 1,0; defensive bidrag 3,0 |
| MID | xG 0,32; xA 0,28 |
| FWD | xG 0,45; xA 0,24 |

Gabet er gennemsnitlige point/90 hos op til fem nærmeste spillere inden for afstand 2,25 minus spillerens egne point/90. Mindst tre sammenligninger kræves. Topscorere er øverste fjerdedel i point/90 med mindst 270 minutter; op til tre af dem vises med afstand højst 2,25. Afstand er ikke en procentchance, og skalaerne er heuristiske.

Kandidatkort kræver mindst 270 sæsonminutter, 50 forventede minutter pr. kamp og 75% tilgængelighed. Positive gab prioriteres; inden for gruppen rangeres på periodens pointprognose + `0,5 × min(3, positivt gab) / (1 + nærmeste topscorers afstand)`. Uden tæt topscorer er tillægget 0. Mangler der tre positive gab, suppleres med høje prognoser, tydeligt markeret. Ved utilstrækkelige data kan en position have færre end tre anbefalinger.

### Point og hold

Spillerens xG/xA pr. 90 trækkes mod positionens gennemsnit med 450 minutters vægt. For mål/assists justeres for eget holds hjemme-/udebaneangreb og modstanderens mål imod. Holdenes seneste op til ti kampe på den relevante bane trækkes mod ligaens gennemsnit med fem gennemsnitskampe. Clean-sheet-estimatet er `exp(-forventede mål imod)`; bonus, redninger og defensive point bruger historiske, omtrentlige gennemsnit. Straf for mål imod og kort medtages. Straffesparksredninger, selvmål og missede straffespark modelleres ikke særskilt.

FPL-pointreglerne følger den aktuelle 2026/27-sæson, inklusive 10 point for mål fra en målmand. Regler og chip-vinduer kan ændres mellem sæsoner og skal kontrolleres ved sæsonskift. Se [FPL-reglerne](https://fantasy.premierleague.com/help/rules).

SciPy MILP vælger trup, opstilling og kaptajn samlet. Målet er startpoint + en ekstra kaptajns point + 15% af bænkpoint, som en reservebuffer. Bænkbufferen indgår ikke i den viste normale pointprognose. Bench Boost vægter alle 15 fuldt. Solverens tilladte margin er 0,5%; faktisk margin vises. De fleste hold løses inden for 30 sekunder pr. plan; ved tidsgrænsen kan et lovligt, men ikke færdigoptimeret hold vises.

Modellen er ikke valideret på fremtidige resultater og maksimerer et skøn over point, ikke en bevist sandsynlighed for at score højest. Autosubs, vicekaptajn ved kaptajnfravær og fremtidige transfers indgår ikke. Indbyrdes historik er kontekst, ikke input til pointprognosen. Blank-GW giver 0; dobbelte GW summerer kampene.

### Chip-råd

Tærsklerne er åbne tommelfingerregler:

| Chip | Hvornår modellen foreslår at overveje den |
| --- | --- |
| Triple Captain | Kaptajnen har mindst 6 forventede point, mindst 75 forventede min/kamp og mindst 95% af periodens bedste kaptajnprognose. |
| Bench Boost | Bænken har mindst 12 forventede point, mindst 90% af periodens bedste bænk, og alle fire har en kamp og mindst 55 forventede min/kamp. |
| Wildcard | Mindst 4 problemspillere, mindst 20 forventede point i forbedring over perioden og færre gratis transfers end problemer. |
| Free Hit | Mindst 3 startere under 30 forventede minutter, mindst 12 point i forbedring nu, mindst 10 point/GW i efterfølgende bedring og for få gratis transfers. |

Wildcard/Free Hit sammenlignes med £100m-holdet før gratis transfers/pointfradrag. De foreslås kun, hvis salgsværdier + bank mindst er £100m. Det er en grov reference og optimerer ikke din præcise individuelle økonomi. En afprøvet gratis transfer kan reducere behovet for en chip. Flere egnede chips reduceres til ét prioriteret forslag ud fra størst modelleret ekstra bidrag; Wildcard vurderes over flere GW, de andre i denne GW. Perioder uden for de næste fem GW indgår ikke, og senere dobbelt-GW kan være bedre. Aktuelle FPL-vinduer bruges; chip-markeringer nulstilles ved sæsonhalvdelsskift.

## Projektstruktur og lokal udvikling

```text
.github/workflows/pages.yml   Python, data, tests og GitHub Pages
requirements.txt             SciPy og dens NumPy-afhængighed
scripts/fetch_fpl.py          Data og kampminutter
scripts/planning.py           Prognoser og MILP-holdplaner
site/index.html               Sideindhold
site/styles.css               Design og mobilvisning
site/analysis.js              Lighed og kamphistorik
site/planner.js               Opstillinger, transfers og chip-regler
site/planning-ui.js           Dit hold, transfers og holdplanlægning
site/transfer-worker.js        Transferkombinationer i baggrunden
site/app.js                   Filtre, sortering og spilleranalyse
site/data/fpl.json            Dataudtræk med schemaVersion 3
```

```bash
pip install -r requirements.txt
python scripts/fetch_fpl.py
python -m unittest discover -s tests
node tests/test_analysis.js
node tests/test_planner.js
python -m http.server 8000 -d site
```

Åbn `http://localhost:8000/`. HTML skal åbnes gennem en webserver. Datahentning kræver internetadgang. FPL-API'et er uofficielt dokumenteret, og felter kan ændres. Kontrollér altid udtrækkets tidspunkt før et valg.
