const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

// ✅ Supabase via variáveis do Render
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ Falta SUPABASE_URL ou SUPABASE_ANON_KEY nas variáveis de ambiente.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =======================
// HEALTH CHECK
// =======================
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "dupan-api" });
});

// =======================
// POST /orders
// Body esperado:
// {
//   "customerId": "c1",
//   "items": [
//     { "productId": "p1", "quantity": 1 },
//     { "productId": "p2", "quantity": 2 }
//   ]
// }
// =======================
app.post("/orders", async (req, res) => {
  try {
    const { customerId, items } = req.body;

    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "customerId e items são obrigatórios",
      });
    }

    // 1) Buscar cliente
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, pricetable, blocked")
      .eq("id", customerId)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    if (customer.blocked) {
      return res.status(403).json({ error: "Cliente bloqueado" });
    }

    // 2) Montar itens e calcular total
    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const productId = item.productId;
      const quantity = Number(item.quantity);

      if (!productId || !quantity || quantity <= 0) {
        return res.status(400).json({ error: "Itens inválidos (productId/quantity)" });
      }

      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, name, active, price_a, price_b, price_c")
        .eq("id", productId)
        .single();

      if (productError || !product) {
        return res.status(404).json({ error: `Produto ${productId} não encontrado` });
      }

      if (!product.active) {
        return res.status(400).json({ error: `Produto ${productId} está inativo` });
      }

      let unitPrice = null;
      if (customer.pricetable === "A") unitPrice = product.price_a;
      else if (customer.pricetable === "B") unitPrice = product.price_b;
      else if (customer.pricetable === "C") unitPrice = product.price_c;

      if (unitPrice === null || unitPrice === undefined) {
        return res.status(400).json({ error: `Preço não encontrado para tabela ${customer.pricetable}` });
      }

      const subtotal = Number(unitPrice) * quantity;
      total += subtotal;

      orderItems.push({
        productId: product.id,
        name: product.name,
        quantity,
        unitPrice: Number(unitPrice),
        subtotal,
      });
    }

    // 3) Criar pedido (orders)
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          customer_id: customerId,
          total,
          status: "created",
        },
      ])
      .select("id, customer_id, total, status, created_at")
      .single();

    if (orderError || !order) {
      console.error(orderError);
      return res.status(500).json({ error: "Erro ao criar pedido (orders)" });
    }

    // 4) Criar itens do pedido (order_items)
    const itemsToInsert = orderItems.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      subtotal: i.subtotal,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(itemsToInsert);

    if (itemsError) {
      console.error(itemsError);
      return res.status(500).json({ error: "Erro ao criar itens do pedido (order_items)" });
    }

    // ✅ Resposta final
    return res.status(201).json({
      orderId: order.id,
      customerId: order.customer_id,
      items: orderItems,
      total: order.total,
      status: order.status,
      createdAt: order.created_at,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro interno", details: String(err.message || err) });
  }
});

// =======================
// START
// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("✅ API DUPAN rodando na porta", PORT);
});
