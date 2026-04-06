const express = require('express');
const app = express();
const port = 3000;

let orders = [];
app.use(express.json());

app.get('/orders', (req, res) => {
  res.json(orders);
});

app.post('/orders', (req, res) => {
  const order = req.body;
  orders.push(order);
  res.status(201).json(order);
});

app.patch('/orders/:id/packed', (req, res) => {
  const orderId = parseInt(req.params.id);
  const order = orders.find(o => o.id === orderId);
  if (order) {
    order.packed = true;
    res.json(order);
  } else {
    res.status(404).json({ message: 'Order not found' });
  }
});

app.patch('/orders/:id/shipped', (req, res) => {
  const orderId = parseInt(req.params.id);
  const order = orders.find(o => o.id === orderId);
  if (order) {
    order.shipped = true;
    res.json(order);
  } else {
    res.status(404).json({ message: 'Order not found' });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});