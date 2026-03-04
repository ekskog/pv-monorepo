const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Serve static HTML page
app.use(express.static('public'));

// Handle file upload
app.post('/upload', upload.array('images'), async (req, res) => {
  try {
    const directory = req.body.directory;
    const files = req.files;

    if (!directory) {
      return res.status(400).json({ error: 'Directory is required' });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files selected' });
    }

    // Create form data for the pv API
    const formData = new FormData();
    
    files.forEach(file => {
      formData.append('images', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype
      });
    });

    // Upload to pv
    const response = await fetch(`https://vault-api.ekskog.net/upload/${directory}`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    const result = await response.text();

    if (response.ok) {
      res.json({ 
        success: true, 
        message: `Successfully uploaded ${files.length} image(s) to ${directory}`,
        details: result
      });
    } else {
      res.status(response.status).json({ 
        error: 'Upload failed', 
        details: result 
      });
    }

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Photovault uploader running on http://localhost:${PORT}`);
});
