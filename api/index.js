const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const DB_PATH = path.join(__dirname, "db.json");

// utilitário simples para ler o "banco"
function readDB() {
  const data = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(data);
}

// utilitário para salvar
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// =======================
// HEALTH CHECK
// =======================
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "dupan-api" });
});

// =======================
// POST /orders
// =======================
app.post("/orders", (req, res) => {
  const { customerId, items } = req.body;

  if (!customerId || !items || !items.length) {
    return res.status(400).json({
      error: "customerId e items são obrigatórios",
    });
  }

  const db = readDB();

  const customer = db.customers.find(c => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ error: "Cliente não encontrado" });
  }

  let total = 0;

  const orderItems = items.map(item => {
    const product = db.products.find(p => p.id === item.productId);

    if (!product || !product.active) {
      throw new Error("Produto inválido");
    }

    const price = product.prices[customer.pricetable];
    total += price * item.quantity;

    return {
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPrice: price,
      subtotal: price * item.quantity,
    };
  });

  const order = {
    id: `o_${Date.now()}`,
    customerId,
    items: orderItems,
    total,
    status: "created",
    createdAt: new Date().toISOString(),
  };

  if (!db.orders) db.orders = [];
  db.orders.push(order);

  writeDB(db);

  res.status(201).json(order);
});

// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("API DUPAN rodando na porta", PORT);
});
