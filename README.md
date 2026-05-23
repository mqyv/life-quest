# Life Quest

App de développement personnel : rituels quotidiens (salat, salle, lecture, sommeil, hydratation), objectifs, suivi fitness (séances, nutrition, compléments, poids), statistiques, succès, hadith du jour.

## Local

```bash
npm install
npm start
```

Ouvre http://localhost:3000

## Données

Toutes les données (utilisateur, rituels, séances, nutrition, poids…) sont stockées dans des fichiers JSON dans le dossier `data/`. Ce dossier est ta "base de données".

- En local : `./data/`
- En prod : monté sur un volume persistant (`/data` par défaut, configurable via `DATA_DIR`)

## Mettre en ligne

### Étape 1 — Pousser sur GitHub

```bash
git init
git add .
git commit -m "Initial commit"
# Crée un repo sur https://github.com/new (privé recommandé)
git remote add origin https://github.com/<TON-USER>/life-quest.git
git branch -M main
git push -u origin main
```

### Étape 2 — Déployer (choisis UNE option)

#### Option A — Fly.io (recommandé : free tier, volume persistant)

Free tier : 3 VMs partagées + 3 Go de volume. Requiert une carte (pas de prélèvement tant que tu restes dans la limite).

1. Installer flyctl :
   - Windows PowerShell : `iwr https://fly.io/install.ps1 -useb | iex`
   - macOS : `brew install flyctl`
2. Créer un compte : `fly auth signup`
3. Dans le dossier du projet :
   ```bash
   fly launch --no-deploy
   # Quand il demande "Use existing fly.toml?" → Yes
   # Quand il demande "Use a Postgres DB?" → No
   # Quand il demande "Deploy now?" → No
   ```
4. Créer le volume persistant :
   ```bash
   fly volumes create lifequest_data --size 1 --region cdg
   ```
5. Déployer :
   ```bash
   fly deploy
   ```
6. Ouvrir l'URL : `fly open`

URL finale du type `https://life-quest-xxxx.fly.dev` — accessible depuis ton téléphone à la salle.

#### Option B — Render.com (sans carte, mais sans persistance gratuite)

Free tier : web service gratuit mais le disque est volatile (perdu à chaque redéploiement). Pour persister, faut une base de données externe payante après 90 jours. Pas idéal pour ce projet sauf migration vers PostgreSQL.

1. Crée un compte sur https://render.com
2. New → Web Service → connecte ton repo GitHub
3. Build command : `npm install`
4. Start command : `node server.js`
5. Deploy

Note : avec Render free, tes données seront perdues à chaque redéploiement. À utiliser uniquement pour tester l'app.

#### Option C — Railway.app (essai gratuit ~5$)

1. https://railway.app → New project from GitHub
2. Sélectionne ton repo
3. Add volume → mount `/data`
4. Set env var `DATA_DIR=/data`
5. Deploy

## Variables d'environnement

| Variable    | Défaut                  | Description                           |
|-------------|-------------------------|---------------------------------------|
| `PORT`      | `3000`                  | Port d'écoute                         |
| `DATA_DIR`  | `<projet>/data`         | Dossier des données persistantes      |

## Stack

- Node.js + Express
- Stockage JSON (data/) — peut être migré vers SQLite/Postgres plus tard
- Frontend : HTML/CSS/JS vanilla + Chart.js + Marked

## Migration vers SQL plus tard

Si l'app grossit, on peut basculer sur SQLite (`better-sqlite3`) avec une migration one-shot des JSON existants. Pour l'instant les fichiers JSON font le job.
