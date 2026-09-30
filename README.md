# Intakeroute

Een gedeeld bord voor het bewindvoeringsteam. Per dossier zie je hoe ver de intake is, van de beschikking van de rechtbank tot een draaiend budgetplan.

- **Hosting:** GitHub Pages. Daar staat alleen de code, geen cliëntgegevens.
- **Gegevens en inloggen:** Supabase, in de EU (regio Ierland).

## Bestanden

| Bestand | Wat | Op GitHub zetten? |
|---|---|---|
| `index.html` | De pagina met de opmaak | Ja |
| `app.js` | De werking van de pagina | Ja |
| `config.js` | Koppeling met Supabase (URL en publishable key) | Ja |
| `supabase/schema.sql` | Database en beveiliging, eenmalig uitvoeren in Supabase | Mag, bevat niets gevoeligs |
| `README.md` | Deze uitleg | Mag |

**Zet nooit cliëntgegevens, exports of wachtwoorden in de repository.** Met een gratis GitHub-account is de repository openbaar.

## 1. Supabase inrichten

1. Maak een nieuw project aan (bijvoorbeeld `intakeroute`) in een EU-regio, bijvoorbeeld **Central EU (Frankfurt)** of **West EU (Ireland)**. Gebruik hiervoor niet een project waar andere gegevens in staan.
2. Open **SQL Editor**, plak de inhoud van `supabase/schema.sql` en klik op **Run**.
3. Ga naar **Authentication > Sign In / Providers**:
   - Zet **Allow new users to sign up** uit. Dan kan niemand zelf een account aanmaken.
   - Laat **Email** als inlogmethode aanstaan.
4. Voeg per collega een account toe via **Authentication > Users > Add user > Create new user**. Vul het e-mailadres en een tijdelijk wachtwoord in en zet **Auto Confirm User** aan.
5. Zet elke collega ook op de teamlijst. Doe dit in de **SQL Editor** en schrijf het e-mailadres in kleine letters:
   ```sql
   insert into public.teamleden (email, naam) values ('collega@voorbeeld.nl', 'Voornaam');
   ```
   Wie een account heeft maar niet op deze lijst staat, ziet niets.
6. Kopieer onder **Project Settings > API Keys** de **Project URL** en de **publishable key** naar `config.js`.
7. Gebruik je de pagina voor echte cliënten, sluit dan de verwerkersovereenkomst (DPA) met Supabase af. Die vind je via supabase.com/legal/dpa.

Laat een collega na de eerste keer inloggen het tijdelijke wachtwoord wijzigen via **Wachtwoord wijzigen** bovenaan de pagina.

## 2. GitHub Pages

1. Maak een GitHub-account met een neutrale naam. Die naam komt in de URL te staan.
2. Zet onder **Settings > Emails** de optie **Keep my email addresses private** aan.
3. Maak een nieuwe **public** repository, bijvoorbeeld `intakeroute`.
4. Klik op **Add file > Upload files**, sleep `index.html`, `app.js` en `config.js` erin en klik op **Commit changes**.
5. Ga naar **Settings > Pages** en kies bij **Source**: *Deploy from a branch*, branch `main`, map `/ (root)`. Klik op **Save**.
6. Na ongeveer een minuut staat de pagina op `https://<accountnaam>.github.io/intakeroute/`.

Om later iets aan te passen, open je het bestand op GitHub, klik je op het potlood en daarna op **Commit changes**. Het stappenplan zelf pas je aan in de app, via de knop **Stappenplan**.

## Goed om te weten

- Een gratis Supabase-project pauzeert na 7 dagen zonder gebruik. Je zet het weer aan via het Supabase-dashboard. Bij wekelijks gebruik gebeurt dit niet.
- De publishable key in `config.js` mag openbaar zijn. De beveiliging zit in de database: alleen ingelogde teamleden kunnen lezen en schrijven.
- Een collega uit het team halen: verwijder de regel in `teamleden` en het account onder **Authentication > Users**.
