# FPL Scout

En enkel dansk hjemmeside til FPL-spillerdata. Den viser pris, samlede point, form, xGI pr. 90 minutter, ejerskab og næste modstander. Søg, filtrér på position/hold og sortér tabellen. Siden er ren HTML, CSS og JavaScript uden build-trin eller betalte tjenester.

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

`scripts/fetch_fpl.py` henter de offentlige FPL-endpoints `bootstrap-static/` og `fixtures/`, normaliserer data og skriver `site/data/fpl.json`. GitHub Actions publicerer derefter kun `site/` som statisk hjemmeside. Browseren henter JSON-filen fra samme domæne, fordi FPL's API normalt blokerer direkte browserkald fra andre domæner (CORS).

Dataudtrækket har en `schemaVersion` og spillerens officielle FPL-`id`, så flere kilder senere kan kobles på. Hvis vi senere tilføjer FotMob, bør vi først afklare adgang, licens og pålidelig spiller-mapping. Projektet har ingen FotMob-afhængighed nu.

### Projektstruktur

```text
.github/workflows/pages.yml  Hent data og udgiv GitHub Pages
scripts/fetch_fpl.py        FPL-data til et statisk JSON-udtræk
site/index.html             Sideindhold
site/styles.css             Design
site/app.js                 Filtre, sortering og tabel
site/data/fpl.json          Medfølgende udtræk; fornyes ved hver udgivelse
tests/test_fetch_fpl.py     Test af dataudtrækket
```

## Lokal udvikling

```bash
python3 scripts/fetch_fpl.py
python3 -m http.server 8000 -d site
```

Åbn `http://localhost:8000/`. Datahentning kræver internetadgang; HTML-filen skal åbnes via en lokal webserver og ikke som `file://`. Kør testen med `python3 -m unittest discover -s tests`.

FPL er en uofficielt dokumenteret offentlig datakilde; felter og tilgængelighed kan ændres. Pris vises i £m, og xGI/90 beregnes kun for spillere med mindst 90 minutter. Det medfølgende dataudtræk kan bruges til lokal forhåndsvisning, men skal opdateres af workflowet, før siden regnes for aktuel. Dette projekt er uafhængigt af Premier League.
