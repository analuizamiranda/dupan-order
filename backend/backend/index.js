const express = require('express');

const app = express();
app.use(express.json());

// Health check (Railway / Vercel usam isso)
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'dupan-backend' });
});

// Endpoint inicial (teste)
app.get('/', (req, res) => {
  res.send('DUPAN ORDER API rodando');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend DUPAN rodando na porta ${PORT}`);
});
