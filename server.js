// backend/server.js
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { db } from './config/firebase.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Collections
const keysCollection = db.collection('api_keys');
const usageCollection = db.collection('daily_usage');

// 🔑 Generate unique prefix
async function generateUniquePrefix() {
  const prefix = `sk_free_${crypto.randomBytes(4).toString('hex')}`;
  const existing = await keysCollection.where('keyPrefix', '==', prefix).get();
  if (existing.empty) return prefix;
  return generateUniquePrefix(); // retry if exists
}

// 🎯 Home Page - Form to get key
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Free AI API - 10 Requests/Day</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .container { background: #f5f5f5; padding: 30px; border-radius: 10px; }
        input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
        button { background: #28a745; color: white; padding: 12px 30px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
        button:hover { background: #218838; }
        .limit-badge { background: #ffc107; padding: 10px; border-radius: 5px; text-align: center; }
        pre { background: #333; color: white; padding: 15px; border-radius: 5px; overflow-x: auto; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 Free AI API</h1>
        <div class="limit-badge">
          <strong>📊 10 requests per day - Free Forever!</strong>
        </div>
        
        <h2>🔑 Get Your API Key</h2>
        <form action="/get-key" method="POST">
          <input type="email" name="email" placeholder="Your Email" required>
          <input type="text" name="name" placeholder="Key Name (optional)">
          <button type="submit">Generate Free Key →</button>
        </form>

        <h3>📝 How to Use:</h3>
        <pre>
# 1. Get your key from form above
# 2. Use in your requests:

curl -X POST https://ai-sqcn.onrender.com/generate \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"Hello AI"}'
        </pre>
      </div>
    </body>
    </html>
  `);
});

// 🔑 Generate API Key
app.post('/get-key', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    if (!email) {
      return res.status(400).send('Email required');
    }

    // Generate key
    const prefix = await generateUniquePrefix();
    const randomKey = crypto.randomBytes(32).toString('base64').replace(/[+/=]/g, '').substring(0, 32);
    const apiKey = `${prefix}_${randomKey}`;
    
    // Hash for storage
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Store in Firestore
    await keysCollection.add({
      keyPrefix: prefix,
      keyHash: hash,
      email: email,
      name: name || 'My API Key',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUsedAt: null,
      isActive: true,
      dailyLimit: 10
    });

    // Show key to user (only once!)
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Your API Key Generated</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .warning { background: #fff3cd; border: 2px solid #ffc107; padding: 20px; border-radius: 10px; }
          .key-box { background: #000; color: #0f0; padding: 20px; border-radius: 5px; font-family: monospace; word-break: break-all; }
          .btn { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="warning">
          <h1 style="color: #856404;">⚠️ IMPORTANT - Copy Now!</h1>
          <p>Your API Key (10 requests/day):</p>
          <div class="key-box">${apiKey}</div>
          <p style="color: red; font-weight: bold;">This key will NEVER be shown again!</p>
          <p>📊 Limit: 10 requests per day (resets at midnight)</p>
        </div>
        
        <a href="/" class="btn">← Back to Home</a>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error generating key');
  }
});

// 🔐 Middleware to validate API key
async function validateApiKey(req, res, next) {
  // Public endpoints
  if (req.path === '/' || req.path === '/get-key' || req.path === '/health') {
    return next();
  }

  const apiKey = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'API key required',
      message: 'Get free key at /get-key (10 requests/day)'
    });
  }

  const [prefix, key] = apiKey.split('_', 2);
  
  try {
    // Find key by prefix
    const keysSnapshot = await keysCollection
      .where('keyPrefix', '==', prefix)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (keysSnapshot.empty) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const keyDoc = keysSnapshot.docs[0];
    const keyData = keyDoc.data();

    // Verify hash
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
    if (keyData.keyHash !== hash) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Check daily limit
    const today = new Date().toISOString().split('T')[0];
    const usageRef = usageCollection.doc(`${keyDoc.id}_${today}`);
    const usageDoc = await usageRef.get();
    
    const todayUsage = usageDoc.exists ? usageDoc.data().count : 0;
    
    if (todayUsage >= 10) {
      return res.status(429).json({
        error: 'Daily limit exceeded',
        message: 'You have used all 10 requests for today. Try again tomorrow!',
        limit: 10,
        used: todayUsage,
        reset: 'midnight'
      });
    }

    // Update usage
    await usageRef.set({
      keyId: keyDoc.id,
      keyPrefix: prefix,
      date: today,
      count: todayUsage + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Update key's last used
    await keyDoc.ref.update({
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Attach to request
    req.apiKey = {
      keyId: keyDoc.id,
      email: keyData.email,
      usage: {
        today: todayUsage + 1,
        limit: 10,
        remaining: 9 - todayUsage
      }
    };

    // Add headers
    res.setHeader('X-RateLimit-Limit', 10);
    res.setHeader('X-RateLimit-Remaining', req.apiKey.usage.remaining);
    
    next();

  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// 🤖 Protected AI endpoint
app.post('/generate', validateApiKey, async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt required' });
    }

    // Your AI logic here
    const response = `AI response for: ${prompt}`;
    
    res.json({
      success: true,
      data: response,
      usage: req.apiKey.usage,
      message: `${req.apiKey.usage.remaining} requests left today`
    });

  } catch (error) {
    console.error('AI error:', error);
    res.status(500).json({ error: 'AI generation failed' });
  }
});

// 📊 Check usage endpoint
app.get('/usage', validateApiKey, async (req, res) => {
  res.json({
    success: true,
    email: req.apiKey.email,
    usage: req.apiKey.usage
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Get your key: http://localhost:${PORT}/`);
});
