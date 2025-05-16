const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exiftool } = require('exiftool-vendored');

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
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// === Upload and Save Metadata Route ===
app.post('/upload', uploadFinal.single('image'), async (req, res) => {
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
app.post('/metadata', uploadTemp.single('image'), async (req, res) => {
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
