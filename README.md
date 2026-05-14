# DayZ Workshop Monitor

Ten projekt sprawdza Steam Workshop co 15 minut przez GitHub Actions i wysyla wiadomosc na Discord webhook, gdy mod ma nowy update.

## Konfiguracja

1. W pliku `mods.json` wpisz swoje mody:

```json
[
  {
    "id": "1234567890",
    "name": "Nazwa moda"
  }
]
```

ID znajdziesz w linku Steam Workshop:

```text
https://steamcommunity.com/sharedfiles/filedetails/?id=1234567890
```

2. W repozytorium na GitHubie dodaj sekret:

```text
DISCORD_WEBHOOK_URL
```

3. Wejdz w zakladke Actions i uruchom `DayZ Workshop Monitor` recznie pierwszy raz.

Pierwsze uruchomienie zapisuje aktualny stan modow. Powiadomienia pojawia sie dopiero przy kolejnych zmianach na Workshopie.
