# FPL Scout

En dansk FPL-scouting-side, der hjælper dig med at finde spillere, hvis underliggende tal ligner andre spilleres, men som endnu har færre point pr. 90 minutter. Den viser xG, xA og xGI pr. 90, filtre for minutter, pris, ejerskab, næste kamp og position samt en analyse af holdenes hjemme-/udebaneform og indbyrdes resultater. Siden er ren HTML, CSS og JavaScript uden build-trin eller betalte tjenester.

## Opdater et eksisterende repository

Hvis du allerede har lagt første version på GitHub, så pak den nye ZIP-fil ud og upload **indholdet** af `fpl-scout`-mappen i repositoryets rod via **Code → Add file → Upload files**. Bevar mapperne `site/` og `scripts/`, og bekræft at de eksisterende filer erstattes. Den nye fil `site/analysis.js` skal med. Workflowet i `.github/workflows/pages.yml` er det samme som før; hvis det allerede findes på GitHub, behøver du ikke uploade den skjulte mappe igen. Efter commit skal **Update FPL data and publish site** køre under **Actions**. Har du allerede sat Pages til GitHub Actions, bliver den nye version udgivet automatisk.

## Sådan lægger du den på GitHub Pages

1. Opret et **nyt, tomt offentligt repository** på GitHub, fx `fpl-scout`. Undlad at tilføje en README i oprettelsesformularen.
2. Pak projektets ZIP-fil ud. Åbn en terminal **inde i mappen `fpl-scout`**, hvor `README.md`, `site` og `.github` ligger.
3. Kør kommandoerne nedenfor og udskift `DIT-BRUGERNAVN` med dit GitHub-brugernavn. GitHub kan bede dig om at logge ind.

   ```bash
   git init -b main
   git add .
   git commit -m "Start FPL Scout"
   git remote add origin https://github.com/DIT-BRUGERNAVN/fpl-scout.git
   git push -u origin main
   ```

4. Åbn repositoryts **Settings → Pages → Build and deployment → Source** og vælg **GitHub Actions**.
5. Åbn fanen **Actions**. Workflowet **Update FPL data and publish site** henter FPL-data og udgiver siden ved push. Hvis det første workflow blev sprunget over, vælg **Run workflow**. Når jobbet er grønt, finder du adressen under **Settings → Pages**, typisk `https://DIT-BRUGERNAVN.github.io/fpl-scout/`.

Workflowet kører også kl. **05:23 og 17:23 UTC** hver dag. GitHub kan forsinke planlagte kørsler. Datoen på siden viser præcis, hvornår det viste udtræk blev hentet. Hvis API'et fejler under opdatering, fejler jobbet, og den senest publicerede side bliver liggende.

## Sådan virker det

`scripts/fetch_fpl.py` henter de offentlige FPL-endpoints `bootstrap-static/` og `fixtures/`, normaliserer data og skriver `site/data/fpl.json`. Derudover henter den de tre foregående sæsoners Premier League-resultater fra [OpenFootball](https://github.com/openfootball/football.json), hvis JSON-datasæt er udgivet som CC0. Denne sæsons resultater kommer fra FPL. Hvis en historisk sæson ikke kan hentes, viser siden stadig de tilgængelige data og en advarsel.

GitHub Actions publicerer kun `site/` som statisk hjemmeside. Browseren henter JSON-filen fra samme domæne, fordi FPL's API normalt blokerer direkte browserkald fra andre domæner (CORS).

Dataudtrækket har en `schemaVersion` og spillerens officielle FPL-`id`, så flere kilder senere kan kobles på. Projektet har ingen FotMob-afhængighed nu. FotMob-lignende kampmålinger kan tilføjes, når adgang, brugsvilkår og pålidelig spiller-mapping er på plads.

### Sådan beregnes “sammenligningsgab”

- Kun spillere med mindst **270 minutter** indgår i sammenligningen. Hver spiller sammenlignes med op til fem andre på **samme position**.
- Ligheden beregnes med xG/90 og xA/90 for midtbanespillere/angribere; forsvarsspillere sammenlignes også på xGC/90 og defensive bidrag/90; målmænd på redninger/90 og xGC/90.
- Gabet er **gennemsnitlige point/90 hos de nærmeste sammenlignelige spillere minus spillerens egne point/90**. Der kræves mindst tre rimeligt lignende spillere. Et positivt gab er en idé til nærmere undersøgelse, ikke forventede fremtidige point.
- “xGI-gab/90” er xGI/90 minus faktiske mål og assists/90. Det siger noget om hidtidig afslutning/udbytte, men FPL-assists og xA er ikke identiske målinger.
- Holdkortene viser de **seneste op til 10 kampe på hver bane** i datasættet og de **seneste op til seks indbyrdes Premier League-opgør**. Antal kampe vises altid. Oprykkede hold kan have mindre datagrundlag, og historiske resultater kan være fra andre spillertrupper.

### Projektstruktur

```text
.github/workflows/pages.yml  Hent data og udgiv GitHub Pages
scripts/fetch_fpl.py        FPL-data til et statisk JSON-udtræk
site/index.html             Sideindhold
site/styles.css             Design
site/analysis.js            Sammenligning og kamphistorik
site/app.js                 Filtre, sortering og spilleranalyse
site/data/fpl.json          Medfølgende udtræk; fornyes ved hver udgivelse
tests/test_fetch_fpl.py     Test af dataudtrækket
tests/test_analysis.js      Test af scoutingberegninger
```

## Lokal udvikling

```bash
python3 scripts/fetch_fpl.py
python3 -m http.server 8000 -d site
```

Åbn `http://localhost:8000/`. Datahentning kræver internetadgang; HTML-filen skal åbnes via en lokal webserver og ikke som `file://`. Kør testene med `python3 -m unittest discover -s tests` og `node tests/test_analysis.js`.

FPL er en uofficielt dokumenteret offentlig datakilde; felter og tilgængelighed kan ændres. Pris vises i £m, og xGI/90 beregnes kun for spillere med mindst 90 minutter. Det medfølgende dataudtræk kan bruges til lokal forhåndsvisning, men skal opdateres af workflowet, før siden regnes for aktuel. Dette projekt er uafhængigt af Premier League.
