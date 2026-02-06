const express = require("express");
const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "dupan-api" });
});

app.get("/", (req, res) => {
  res.send("DUPAN ORDER API rodando");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API DUPAN rodando na porta ${PORT}`);
});
