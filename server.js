// server.js
const express = require('express');
const puppeteer = require('puppeteer');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure storage for uploaded screenshots
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Screenshot endpoint
app.post('/api/capture', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Get full page height
    const bodyHandle = await page.$('body');
    const { height } = await bodyHandle.boundingBox();
    await bodyHandle.dispose();

    // Generate filename
    const filename = `screenshot-${Date.now()}.png`;
    const filepath = path.join(__dirname, 'uploads', filename);

    await page.screenshot({
      path: filepath,
      fullPage: true,
      captureBeyondViewport: true
    });

    await browser.close();

    res.json({
      success: true,
      filename,
      filepath: `/uploads/${filename}`
    });

  } catch (error) {
    console.error('Capture error:', error);
    res.status(500).json({ error: 'Failed to capture screenshot' });
  }
});

// Comparison endpoint
app.post('/api/compare', upload.fields([
  { name: 'before', maxCount: 1 },
  { name: 'after', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files.before || !req.files.after) {
      return res.status(400).json({ error: 'Both before and after images are required' });
    }

    const beforePath = req.files.before[0].path;
    const afterPath = req.files.after[0].path;
    const diffFilename = `diff-${Date.now()}.png`;
    const diffPath = path.join(__dirname, 'uploads', diffFilename);

    const img1 = PNG.sync.read(fs.readFileSync(beforePath));
    const img2 = PNG.sync.read(fs.readFileSync(afterPath));

    if (img1.width !== img2.width || img1.height !== img2.height) {
      return res.status(400).json({ error: 'Image dimensions do not match' });
    }

    const diff = new PNG({ width: img1.width, height: img1.height });
    const diffPixels = pixelmatch(
      img1.data, img2.data, diff.data,
      img1.width, img1.height,
      { threshold: 0.1 }
    );

    fs.writeFileSync(diffPath, PNG.sync.write(diff));

    const diffPercentage = (diffPixels / (img1.width * img1.height) * 100).toFixed(2);

    res.json({
      success: true,
      diffPixels,
      diffPercentage,
      diffFilename,
      diffUrl: `/uploads/${diffFilename}`
    });

  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({ error: 'Failed to compare images' });
  }
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});