const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ✅ CORS simples (para o frontend em outro domínio)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const DB_PATH = path.join(__dirname, "db.json");

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}
function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}
function uuid() {
  return "id_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// Health
app.get("/health", (req, res) => res.json({ ok: true, service: "dupan-api" }));

// Login simples (MVP)
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const db = readDb();
  const customer = db.customers.find((c) => c.email === email && c.password === password);
  if (!customer) return res.status(401).json({ ok: false, message: "Credenciais inválidas" });
  if (customer.blocked) return res.status(403).json({ ok: false, message: "Cliente bloqueado" });

  const token = Buffer.from(`${customer.id}:${Date.now()}`).toString("base64");
  res.json({
    ok: true,
    token,
    customer: { id: customer.id, name: customer.name, priceTable: customer.priceTable }
  });
});

// Auth middleware (MVP)
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, message: "Sem token" });

  let decoded = "";
  try {
    decoded = Buffer.from(token, "base64").toString("utf-8");
  } catch {
    return res.status(401).json({ ok: false, message: "Token inválido" });
  }

  const customerId = decoded.split(":")[0];
  const db = readDb();
  const customer = db.customers.find((c) => c.id === customerId);
  if (!customer) return res.status(401).json({ ok: false, message: "Token inválido" });
  if (customer.blocked) return res.status(403).json({ ok: false, message: "Cliente bloqueado" });

  req.customer = customer;
  next();
}

// Catálogo com preço por tabela A/B/C
app.get("/catalog", requireAuth, (req, res) => {
  const db = readDb();
  const table = req.customer.priceTable || "A";
  const items = db.products
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: p.prices[table]
    }));
  res.json({ ok: true, table, items });
});

// Montar pedido novo
app.post("/orders", requireAuth, (req, res) => {
  const { items, delivery } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: "Items obrigatório" });
  }
  if (!delivery || !delivery.date || !delivery.window) {
    return res.status(400).json({ ok: false, message: "Entrega própria: date e window (MANHA/TARDE)" });
  }

  const db = readDb();

  const overdue = db.invoices.some((inv) => inv.customerId === req.customer.id && inv.status === "OVERDUE");
  if (overdue) return res.status(403).json({ ok: false, message: "Cliente com boleto vencido. Bloqueado para novos pedidos." });

  const table = req.customer.priceTable || "A";

  const normalized = items
    .map((it) => ({ productId: it.productId, qty: Number(it.qty || 0) }))
    .filter((it) => it.productId && it.qty > 0);

  if (normalized.length === 0) return res.status(400).json({ ok: false, message: "Items inválidos" });

  let total = 0;
  const lines = normalized
    .map((it) => {
      const p = db.products.find((x) => x.id === it.productId);
      if (!p) return null;
      const unit = p.prices[table];
      const lineTotal = unit * it.qty;
      total += lineTotal;
      return { productId: p.id, name: p.name, sku: p.sku, qty: it.qty, unitPrice: unit, lineTotal };
    })
    .filter(Boolean);

  const orderId = uuid();
  const order = {
    id: orderId,
    customerId: req.customer.id,
    createdAt: new Date().toISOString(),
    status: "CREATED",
    delivery: { type: "OWN", date: delivery.date, window: delivery.window },
    payment: { type: "BOLETO_FATURADO" },
    table,
    total: Math.round(total * 100) / 100,
    lines
  };

  db.orders.push(order);

  const invoiceId = uuid();
  db.invoices.push({
    id: invoiceId,
    orderId,
    customerId: req.customer.id,
    status: "OPEN",
    dueDate: delivery.date,
    amount: order.total
  });

  writeDb(db);
  res.status(201).json({ ok: true, order, invoiceId });
});

// Listar pedidos
app.get("/orders", requireAuth, (req, res) => {
  const db = readDb();
  const orders = db.orders.filter((o) => o.customerId === req.customer.id).slice().reverse();
  res.json({ ok: true, orders });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API DUPAN rodando na porta ${PORT}`));
