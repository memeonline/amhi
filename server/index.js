const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();

const siteRoot = path.join(__dirname, '..');
const dataFile = path.join(siteRoot, 'data', 'articles.json');
const articulosDir = path.join(siteRoot, 'articulos');
const baseTemplatePath = path.join(siteRoot, 'Información-y-Salud.html');
const uploadsDir = path.join(siteRoot, 'images', 'articles');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'CHANGE_ME';

const PORT = process.env.PORT || 8000;

function readArticles() {
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeArticles(articles) {
  fs.writeFileSync(dataFile, JSON.stringify(articles, null, 2), 'utf8');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatArticleDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Accept `YYYY-MM-DD` and ISO strings.
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    try {
      return new Intl.DateTimeFormat('es-MX', { year: 'numeric', month: 'short', day: '2-digit' }).format(d);
    } catch {
      // Fallback below.
    }
  }

  // Fallback: keep the first 10 chars (YYYY-MM-DD).
  return raw.slice(0, 10);
}

function articleSlotHtml(article) {
  const slug = escapeHtml(article.slug || '');
  const title = escapeHtml(article.title || '');
  const imageSrc = escapeHtml(article.imageSrc || '');
  const imageAlt = escapeHtml(article.imageAlt || article.title || '');
  const dateDisplay = formatArticleDate(article.updatedAt || article.date);
  const dateHtml = dateDisplay
    ? `<p class="text-xs text-gray-500 dark:text-gray-400 font-body mt-2">${escapeHtml(dateDisplay)}</p>`
    : '';

  const content = String(article.content || '');
  const paragraphs = content
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replaceAll('\n', '<br/>')}</p>`)
    .join('');

  return `
            <article class="bg-white dark:bg-white/80 rounded-2xl shadow-lg hover:shadow-neon transition-all duration-300 p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6 border border-gray-100 dark:border-white/5 group">
                <div class="w-48 h-48 flex-shrink-0 bg-gray-50 dark:bg-white/5 rounded-xl flex items-center justify-center p-4">
                    <img src="${imageSrc}" alt="${imageAlt}" loading="lazy" decoding="async" class="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform duration-300">
                </div>
                <div class="flex-1 text-center sm:text-left flex flex-col justify-center">
                    <h1 class="text-3xl font-title font-bold text-amhi-dark dark:text-amhi-dark mb-4 group-hover:text-amhi-teal transition-colors">
                        ${title}
                    </h1>
                    ${dateHtml}
                    <div class="text-gray-600 dark:text-black font-body text-sm leading-relaxed space-y-4">
                        ${paragraphs}
                    </div>
                </div>
            </article>
  `.replaceAll('\t', ' ');
}

function regenerateArticlePages(articles) {
  if (!fs.existsSync(baseTemplatePath)) {
    throw new Error('Base template not found: ' + baseTemplatePath);
  }
  if (!fs.existsSync(articulosDir)) {
    fs.mkdirSync(articulosDir, { recursive: true });
  }

  const baseHtml = fs.readFileSync(baseTemplatePath, 'utf8');
  const startToken = '<!-- ARTICLES_SLOT_START -->';
  const endToken = '<!-- ARTICLES_SLOT_END -->';

  const startIdx = baseHtml.indexOf(startToken);
  const endIdx = baseHtml.indexOf(endToken);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error('Could not find ARTICLES_SLOT markers in base template.');
  }

  const before = baseHtml.slice(0, startIdx + startToken.length);
  const after = baseHtml.slice(endIdx);

  const keepSlugs = new Set(
    (articles || [])
      .map((a) => String(a?.slug || '').trim())
      .filter(Boolean)
  );

  // Delete stale article pages for removed articles.
  try {
    if (fs.existsSync(articulosDir)) {
      const existingFiles = fs.readdirSync(articulosDir);
      for (const file of existingFiles) {
        if (!file.endsWith('.html')) continue;
        const slug = file.slice(0, -'.html'.length);
        if (!keepSlugs.has(slug)) {
          fs.unlinkSync(path.join(articulosDir, file));
        }
      }
    }
  } catch {
    // Non-fatal: regeneration below will re-create known pages.
  }

  for (const article of articles) {
    const slug = String(article.slug || '').trim();
    if (!slug) continue;

    const pageHtml = before + '\n' + articleSlotHtml(article) + '\n' + after;
    const outPath = path.join(articulosDir, `${slug}.html`);
    fs.writeFileSync(outPath, pageHtml, 'utf8');
  }
}

function basicAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="AMHI Admin"');
    return res.status(401).send('Authentication required.');
  }

  const base64 = header.slice('Basic '.length);
  const decoded = Buffer.from(base64, 'base64').toString('utf8');
  const [user, pass] = decoded.split(':');

  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="AMHI Admin"');
    return res.status(401).send('Invalid credentials.');
  }

  return next();
}

app.use(express.json({ limit: '2mb' }));

// Public: the cards on Información-y-Salud.html need this.
app.get('/api/articles', (req, res) => {
  const articles = readArticles();
  res.json(articles);
});

// Protected: image uploader used by the admin UI.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    const safeExt = ext.match(/^\.[a-z0-9]+$/i) ? ext : '.png';
    const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const isImage = /^image\//.test(file.mimetype || '');
    cb(isImage ? null : new Error('Only image uploads are allowed.'), isImage);
  },
});

app.post('/api/upload', basicAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const relSrc = path.join('images', 'articles', req.file.filename).replaceAll('\\', '/');
  return res.json({ imageSrc: relSrc });
});

// Admin UI: protected page.
app.get('/admin-articulos.html', basicAuth, (req, res) => {
  res.sendFile(path.join(siteRoot, 'admin-articulos.html'));
});

// Admin save: protected.
app.post('/api/articles', basicAuth, (req, res) => {
  const body = req.body;
  const articles = Array.isArray(body) ? body : body?.articles;
  if (!Array.isArray(articles)) {
    return res.status(400).json({ error: 'Invalid payload. Expected an array or { articles: [] }.' });
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const a of articles) {
    if (!a || typeof a !== 'object') continue;
    if (!a.updatedAt) a.updatedAt = today;
  }

  writeArticles(articles);
  regenerateArticlePages(articles);
  res.json({ ok: true, count: articles.length });
});

// Initial regeneration so article pages match the JSON on first run.
try {
  const articles = readArticles();
  regenerateArticlePages(articles);
} catch (e) {
  // Avoid crashing dev server due to template issues; admin will fix via save later.
  console.error('Initial article regeneration failed:', e?.message || e);
}

// Static site hosting (after API routes so they don't conflict).
app.use(express.static(siteRoot));

app.listen(PORT, () => {
  console.log(`AMHI articles server running on http://localhost:${PORT}`);
});

