const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const puppeteer = require('puppeteer');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File upload configuration
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

// Puppeteer configuration
const getBrowser = async () => {
  return await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process'
    ],
    timeout: 30000
  });
};

// API Endpoints
app.post('/api/capture', async (req, res) => {
  try {
    const { url, time, testId } = req.body;

    // Validation
    if (!url || !time || !['before', 'after'].includes(time)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    if (!testId) return res.status(400).json({ error: 'testId required' });

    // Setup directories
    const baseDir = path.join(__dirname, 'uploads');
    const timeDir = path.join(baseDir, time);
    if (!fs.existsSync(timeDir)) fs.mkdirSync(timeDir, { recursive: true });

    const filepath = path.join(timeDir, `${testId}.png`);
    const browser = await getBrowser();

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.screenshot({ path: filepath, fullPage: true });
      
      res.json({
        success: true,
        imagePath: `/uploads/${time}/${testId}.png`,
        testId
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error('Capture error:', error);
    res.status(500).json({ 
      error: 'Capture failed',
      details: error.message 
    });
  }
});

app.post('/api/compare', async (req, res) => {
  try {
    const { testId } = req.body;
    if (!testId) return res.status(400).json({ error: 'testId required' });

    const baseDir = path.join(__dirname, 'uploads');
    const beforePath = path.join(baseDir, 'before', `${testId}.png`);
    const afterPath = path.join(baseDir, 'after', `${testId}.png`);
    const diffPath = path.join(baseDir, 'diff', `${testId}.png`);

    if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) {
      return res.status(404).json({ error: 'Images not found' });
    }

    const img1 = PNG.sync.read(fs.readFileSync(beforePath));
    const img2 = PNG.sync.read(fs.readFileSync(afterPath));

    if (img1.width !== img2.width || img1.height !== img2.height) {
      return res.status(400).json({ error: 'Image size mismatch' });
    }

    const diff = new PNG({ width: img1.width, height: img1.height });
    const diffPixels = pixelmatch(
      img1.data, img2.data, diff.data,
      img1.width, img1.height,
      { threshold: 0.1 }
    );

    if (!fs.existsSync(path.dirname(diffPath))) {
      fs.mkdirSync(path.dirname(diffPath), { recursive: true });
    }
    fs.writeFileSync(diffPath, PNG.sync.write(diff));

    res.json({
      success: true,
      diffPercentage: (diffPixels / (img1.width * img1.height) * 100).toFixed(2),
      diffUrl: `/uploads/diff/${testId}.png`,
      beforeUrl: `/uploads/before/${testId}.png`,
      afterUrl: `/uploads/after/${testId}.png`
    });
  } catch (error) {
    console.error('Compare error:', error);
    res.status(500).json({ 
      error: 'Comparison failed',
      details: error.message 
    });
  }
});

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});