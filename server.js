const express = require('express');
const path = require('path');
const app = express();

// Ключ Groq
const GROQ_API_KEY = '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';

app.use(express.json());
app.use(express.static(__dirname)); // Раздает твои html/css/js файлы

// Наш прокси-сервер для Groq (решает проблему с телефонами и CORS)
app.post('/api/chat', async (req, res) => {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен! Открой http://localhost:${PORT}`);
});