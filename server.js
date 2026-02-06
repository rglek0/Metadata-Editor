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
// Allow overriding the final output directory via environment variable OUTPUT_DIR.
// If not set, fall back to previous network path or a local ./uploads directory.
// NOTE: On Windows, an absolute path like C:\\Users\\rostg\\SynologyDrive\\Images\\meta-set can be provided.
const defaultOutput = process.platform === 'win32'
  ? 'C:/Users/rostg/SynologyDrive/Images/meta-set'
  : '/volume1/homes/Images/meta-set';
const uploadDir = path.resolve(process.env.OUTPUT_DIR || defaultOutput);
const tempDir = path.resolve('./temp');

// === Ensure directories exist ===
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// === Multer Storage: Final (choose available filename with (index) collision handling) ===
const storageFinal = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const base = path.basename(file.originalname).replace(/[\\/]+/g, '').trim();
    const safeName = base || 'image';
    const ext = path.extname(safeName);
    const nameOnly = path.basename(safeName, ext);
    let candidate = safeName;
    let candidatePath = path.join(uploadDir, candidate);
    const existsFile = () => {
      try {
        const st = fs.statSync(candidatePath);
        return st.isFile();
      } catch (e) {
        return false; // ENOENT
      }
    };
    if (existsFile()) {
      let i = 1;
      while (true) {
        candidate = `${nameOnly} (${i})${ext}`;
        candidatePath = path.join(uploadDir, candidate);
        try {
          const st = fs.statSync(candidatePath);
          if (!st.isFile()) break; // not a file -> ok to use
        } catch (e) {
          break; // ENOENT -> available
        }
        i++;
      }
    }
    console.log(`[multer] incoming="${file.originalname}", chosen="${candidate}", uploadDir="${uploadDir}"`);
    cb(null, candidate);
  }
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

// Session info (who am I?)
app.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ user: req.session.user });
  }
  res.status(401).json({ user: null });
});

// Auth routes
const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_WINDOW_MS || 15 * 60 * 1000), // 15 minutes
  max: Number(process.env.LOGIN_MAX_ATTEMPTS || 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const u = (req.body && req.body.username) ? String(req.body.username).toLowerCase() : 'anon';
    return `login:${u}`;
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

// Convenience: allow GET /logout (e.g., from a link/button)
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login.html');
  });
});

// Helper: convert HTML datetime-local (YYYY-MM-DDTHH:MM[:SS]) to EXIF format (YYYY:MM:DD HH:MM:SS)
function toExifDate(local) {
  if (!local) return undefined;
  const s = String(local);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return s; // pass through if unexpected
  return `${m[1]}:${m[2]}:${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}`;
}

// === Upload and Save Metadata Route ===
app.post('/upload', requireAuth, uploadFinal.single('image'), async (req, res) => {
  const { dateTaken, latitude, longitude, repairExif, preferXmp } = req.body;
  // Multer has already chosen an available filename using (index) logic
  const savedName = (req.file && (req.file.filename || req.file.originalname)) || 'image';
  const targetPath = path.join(uploadDir, savedName);

  try {
    // Multer already saved to targetPath; no rename needed.

    const exifDate = toExifDate(dateTaken);
    const exifTags = {
      DateTimeOriginal: exifDate,
      GPSLatitude: parseFloat(latitude),
      GPSLongitude: parseFloat(longitude),
      GPSLatitudeRef: parseFloat(latitude) >= 0 ? 'N' : 'S',
      GPSLongitudeRef: parseFloat(longitude) >= 0 ? 'E' : 'W',
    };
    const xmpTags = {
      'XMP-exif:DateTimeOriginal': exifDate,
      'XMP-exif:GPSLatitude': parseFloat(latitude),
      'XMP-exif:GPSLongitude': parseFloat(longitude),
      'XMP-exif:GPSLatitudeRef': parseFloat(latitude) >= 0 ? 'N' : 'S',
      'XMP-exif:GPSLongitudeRef': parseFloat(longitude) >= 0 ? 'E' : 'W',
    };

    const doRepair = String(repairExif).toLowerCase() === 'on' || repairExif === '1' || String(repairExif).toLowerCase() === 'true';
    const useXmp = String(preferXmp).toLowerCase() === 'on' || preferXmp === '1' || String(preferXmp).toLowerCase() === 'true';

    try {
      if (useXmp) {
        await exiftool.write(targetPath, xmpTags, ['-m']);
      } else {
        if (doRepair) {
          await exiftool.write(targetPath, {}, ['-m', '-exif:all=']);
        }
        await exiftool.write(targetPath, exifTags, ['-m', '-IFD0:ApplicationNotes=']);
      }
    } catch (err) {
      const msg = String(err && err.message || err);
      const badOffset = /Bad IFD0 offset/i.test(msg) || /ApplicationNotes/i.test(msg);
      if (!useXmp && (badOffset || doRepair)) {
        // Attempt repair then exif write, otherwise fallback to XMP
        try {
          await exiftool.write(targetPath, {}, ['-m', '-exif:all=']);
          await exiftool.write(targetPath, exifTags, ['-m']);
        } catch (err2) {
          await exiftool.write(targetPath, xmpTags, ['-m']);
        }
      } else if (!useXmp) {
        // Non-repairable EXIF error: fallback to XMP as last resort
        await exiftool.write(targetPath, xmpTags, ['-m']);
      } else {
        throw err;
      }
    }
  const storedFilename = path.basename(targetPath);
    // Respect Accept header: if client requests JSON, return structured response
    if (req.accepts(['json', 'html', 'text']) === 'json') {
      return res.json({
        ok: true,
        message: 'Metadata updated successfully.',
        storedFilename,
        fullPath: targetPath
      });
    }
    res.send(`✅ Metadata updated successfully. Saved as ${storedFilename}`);
  } catch (error) {
    console.error('❌ Error writing metadata:', error);
    if (req.accepts(['json', 'html', 'text']) === 'json') {
      return res.status(500).json({ ok: false, error: 'Failed to update metadata.' });
    }
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

// === Path Info (predict final save path without writing) ===
app.get('/path-info', requireAuth, (req, res) => {
  const nameParam = req.query.name;
  if (!nameParam) return res.status(400).json({ error: 'name query param required' });
  const base = path.basename(String(nameParam)).replace(/[\\/]+/g, '').trim();
  const safeName = base || 'image';
  const ext = path.extname(safeName);
  const nameOnly = path.basename(safeName, ext);
  let candidate = path.join(uploadDir, safeName);
  const existsFile = (p) => {
    try { const st = fs.statSync(p); return st.isFile(); } catch (e) { return false; }
  };
  if (existsFile(candidate)) {
    let i = 1;
    while (true) {
      const alt = path.join(uploadDir, `${nameOnly} (${i})${ext}`);
      if (!existsFile(alt)) { candidate = alt; break; }
      i++;
    }
  }
  return res.json({ original: nameParam, storedFilename: path.basename(candidate), fullPath: candidate });
});

// === Start Server ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
