const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// carregar "banco"
const dbPath = path.join(__dirname, "db.json");
const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

// ======================
// HEALTH CHECK
// ======================
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "dupan-api" });
});

// ======================
// AUTH LOGIN
// ======================
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body;

  const user = db.customers.find(
    (c) => c.email === email && c.password === password
  );

  if (!user) {
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  // token simples (mock)
  const token = Buffer.from(`${user.id}:${user.email}`).toString("base64");

  res.json({
    token,
    customer: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
});

// ======================
app.listen(PORT, () => {
  console.log(`API DUPAN rodando na porta ${PORT}`);
});

