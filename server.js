require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exiftool } = require('exiftool-vendored');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const { verifyPassword } = require('./db');
const rateLimit = require('express-rate-limit');

const app = express();

// === Paths ===
const uploadDir = path.resolve('\\\\SNAS\\home\\Images\\meta-set');
const tempDir = path.resolve('./temp');

// === Ensure directories exist ===
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// === Multer Storage: Final (preserve original filename) ===
const storageFinal = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, file.originalname)
});

const uploadFinal = multer({ storage: storageFinal });

// === Multer Storage: Temp for Preview ===
const uploadTemp = multer({ dest: tempDir });

// === Middleware ===
// Optional trust proxy for reverse proxies (e.g., Synology)
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Prevent direct access to index.html before auth
app.get('/index.html', (req, res) => res.redirect('/'));

app.use(express.static('public', { index: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sessions
const sessionSecret = process.env.SESSION_SECRET || 'change-me-in-prod';
const cookieSecure = process.env.COOKIE_SECURE === '1';
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.db', dir: path.resolve('./db') }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure, // set true if behind HTTPS
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

// Attempt to migrate old sessions DB from ./temp to ./db if it exists
try {
  const fs = require('fs');
  const oldSess = path.resolve('./temp/sessions.db');
  const newSessDir = path.resolve('./db');
  const newSess = path.join(newSessDir, 'sessions.db');
  if (!fs.existsSync(newSessDir)) fs.mkdirSync(newSessDir, { recursive: true });
  if (fs.existsSync(oldSess) && !fs.existsSync(newSess)) {
    fs.renameSync(oldSess, newSess);
  }
} catch (e) {
  console.warn('Session DB migration warning:', e.message || e);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  // If browser, redirect to login; if API, 401 JSON
  const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
  if (acceptsHtml) return res.redirect('/login.html');
  return res.status(401).json({ error: 'unauthorized' });
}

// Protect root app page
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health endpoint (no auth), useful for reverse proxy checks
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes
const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_WINDOW_MS || 15 * 60 * 1000), // 15 minutes
  max: Number(process.env.LOGIN_MAX_ATTEMPTS || 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const u = (req.body && req.body.username) ? String(req.body.username).toLowerCase() : '';
    return u || req.ip;
  },
});

app.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const result = await verifyPassword(username, password);
    if (!result.ok) return res.status(401).send('Invalid username or password');
    req.session.user = result.user;
    res.redirect('/');
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).send('Login failed');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login.html');
  });
});

// === Upload and Save Metadata Route ===
app.post('/upload', requireAuth, uploadFinal.single('image'), async (req, res) => {
  const { dateTaken, latitude, longitude } = req.body;
  const filePath = path.join(uploadDir, req.file.originalname);

  try {
    await exiftool.write(filePath, {
      DateTimeOriginal: dateTaken,
      GPSLatitude: parseFloat(latitude),
      GPSLongitude: parseFloat(longitude),
      GPSLatitudeRef: parseFloat(latitude) >= 0 ? 'N' : 'S',
      GPSLongitudeRef: parseFloat(longitude) >= 0 ? 'E' : 'W',
    });

    res.send('✅ Metadata updated successfully.');
  } catch (error) {
    console.error('❌ Error writing metadata:', error);
    res.status(500).send('Failed to update metadata.');
  }
});

// === Preview Metadata Route ===
app.post('/metadata', requireAuth, uploadTemp.single('image'), async (req, res) => {
  const filePath = req.file.path;

  try {
    const metadata = await exiftool.read(filePath);
    fs.unlinkSync(filePath); // Cleanup temp file
    res.json(metadata);
  } catch (err) {
    console.error('❌ Error reading metadata:', err);
    res.status(500).send('Metadata read failed');
  }
});

// === Start Server ===
app.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
});
