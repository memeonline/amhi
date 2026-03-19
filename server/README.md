# AMHI Articles CMS (Local Dev)

This project includes a small Node/Express backend to power:

- `GET /api/articles` (public list)
- `POST /api/articles` (admin save; regenerates `articulos/<slug>.html`)
- `admin-articulos.html` (admin UI; Basic Auth protected)

## 1) Stop the current static server

If you’re using the Python server on port `8000`, stop it first.

## 2) Start the Node server

From `server/`:

```bash
# Windows (PowerShell)
$env:ADMIN_USER="admin"
$env:ADMIN_PASS="CHANGE_ME"
node index.js
```

By default, the server listens on:

- `http://localhost:8000`

## 3) View the public page

- `http://localhost:8000/Información-y-Salud.html`

It will display only the articles with `published: true`.

## 4) Edit articles (admin)

- `http://localhost:8000/admin-articulos.html`

Use the same Basic Auth credentials (`ADMIN_USER` / `ADMIN_PASS`).

After saving, the backend regenerates:

- `articulos/<slug>.html`

## Notes

- The admin UI posts the full `articles` array to `POST /api/articles`.
- The backend regenerates article pages using the `ARTICLES_SLOT` markers in `Información-y-Salud.html`.

