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
    const { url, time, testId } = req.body;
    
    // Validate input
    if (!url || !time || !['before', 'after'].includes(time)) {
      return res.status(400).json({ error: 'Missing url or invalid time (must be "before" or "after")' });
    }

    if (!testId) {
      return res.status(400).json({ error: 'testId is required' });
    }

    // Create organized directory structure
    const baseDir = path.join(__dirname, 'uploads');
    const timeDir = path.join(baseDir, time);
    const diffDir = path.join(baseDir, 'diff');
    
    // Ensure directories exist
    [baseDir, timeDir, diffDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    // Generate consistent filename
    const filename = `${testId}.png`; // Now just using testId.png
    const filepath = path.join(timeDir, filename);

    // Capture screenshot
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--single-process'
    ]
    });
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.screenshot({
      path: filepath,
      fullPage: true,
      captureBeyondViewport: true
    });

    await browser.close();

    res.json({
      success: true,
      imagePath: `/uploads/${time}/${filename}`,
      time,
      testId,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Capture error:', error);
    res.status(500).json({ 
      error: 'Failed to capture screenshot',
      details: error.message
    });
  }
});

// Comparison endpoint
app.post('/api/compare', async (req, res) => {
  try {
    const { testId } = req.body;
    
    if (!testId) {
      return res.status(400).json({ error: 'testId is required' });
    }

    const baseDir = path.join(__dirname, 'uploads');
    const beforePath = path.join(baseDir, 'before', `${testId}.png`);
    const afterPath = path.join(baseDir, 'after', `${testId}.png`);
    const diffPath = path.join(baseDir, 'diff', `${testId}.png`);

    // Verify files exist
    if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) {
      return res.status(404).json({
        error: 'Before/after images not found',
        details: {
          testId,
          beforeExists: fs.existsSync(beforePath),
          afterExists: fs.existsSync(afterPath)
        }
      });
    }

    // Compare images
    const img1 = PNG.sync.read(fs.readFileSync(beforePath));
    const img2 = PNG.sync.read(fs.readFileSync(afterPath));

    if (img1.width !== img2.width || img1.height !== img2.height) {
      return res.status(400).json({ 
        error: 'Image dimensions do not match',
        details: {
          before: { width: img1.width, height: img1.height },
          after: { width: img2.width, height: img2.height }
        }
      });
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
      diffUrl: `/uploads/diff/${testId}.png`,
      beforeUrl: `/uploads/before/${testId}.png`,
      afterUrl: `/uploads/after/${testId}.png`,
      diffPercentage,
      testId
    });

  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({ 
      error: 'Failed to compare images',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.listen(port, () => {
    console.log(`API server running on port ${port}`);
});