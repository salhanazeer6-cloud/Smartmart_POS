/* global process */
import dotenv from "dotenv";
import path from "path";
import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";

dotenv.config({
  path: path.resolve(process.cwd(), "frontend/src/backend/.env"),
});

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.send("SmartMart POS Backend is running!");
});

// MySQL connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: process.env.DB_PASSWORD,
  database: "smartmart_pos",
});

db.connect((err) => {
  if (err) {
    console.log("MySQL connection failed:", err.message);
  } else {
    console.log("MySQL connected successfully!");
  }
});

// Get all products
app.get("/api/products", (req, res) => {
  db.query("SELECT * FROM products", (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(results);
  });
});

// Add a product
app.post("/api/products", (req, res) => {
  const { name, price, quantity } = req.body;

  if (
    typeof name !== "string" ||
    !name.trim() ||
    !Number.isFinite(Number(price)) ||
    Number(price) < 0 ||
    !Number.isInteger(Number(quantity)) ||
    Number(quantity) < 0
  ) {
    return res.status(400).json({
      error: "Please enter valid product details.",
    });
  }

  const sql = "INSERT INTO products (name, price, quantity) VALUES (?, ?, ?)";

  db.query(
    sql,
    [name.trim(), Number(price), Number(quantity)],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.status(201).json({
        id: result.insertId,
        name: name.trim(),
        price: Number(price),
        quantity: Number(quantity),
      });
    },
  );
});

// Complete a sale with multiple products
app.post("/api/sales", (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: "Cart is empty. Please add products first.",
    });
  }

  const normalizedItems = items.map((item) => ({
    productId: Number(item?.productId ?? item?.id),
    quantity: Number(item?.quantity),
  }));

  const validItems = normalizedItems.every(
    (item) =>
      Number.isSafeInteger(item.productId) &&
      item.productId > 0 &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity > 0,
  );

  if (!validItems) {
    return res.status(400).json({
      error: "Invalid product or quantity.",
    });
  }

  // One unique bill ID for this entire sale
  const billId = randomUUID();

  db.beginTransaction((err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const soldItems = [];
    let grandTotal = 0;
    let index = 0;

    function rollbackSale(statusCode, message) {
      db.rollback(() => {
        if (!res.headersSent) {
          res.status(statusCode).json({ error: message });
        }
      });
    }

    function processNextItem() {
      if (index >= normalizedItems.length) {
        return db.commit((err) => {
          if (err) {
            return rollbackSale(500, err.message);
          }

          return res.status(201).json({
            message: "Sale completed successfully!",
            billId,
            items: soldItems,
            grandTotal: Number(grandTotal.toFixed(2)),
          });
        });
      }

      const item = normalizedItems[index];

      db.query(
        "SELECT * FROM products WHERE id = ? FOR UPDATE",
        [item.productId],
        (err, rows) => {
          if (err) {
            return rollbackSale(500, err.message);
          }

          if (!rows || rows.length === 0) {
            return rollbackSale(
              404,
              `Product with ID ${item.productId} was not found.`,
            );
          }

          const product = rows[0];
          const quantity = item.quantity;
          const availableStock = Number(product.quantity);
          const unitPrice = Number(product.price);

          if (!Number.isFinite(availableStock) || !Number.isFinite(unitPrice)) {
            return rollbackSale(
              500,
              `Invalid stock or price for ${product.name}.`,
            );
          }

          if (availableStock < quantity) {
            return rollbackSale(
              400,
              `Not enough stock for ${product.name}. Available: ${availableStock}.`,
            );
          }

          const total = Number((unitPrice * quantity).toFixed(2));
          const remainingStock = availableStock - quantity;

          db.query(
            `INSERT INTO sales
              (bill_id, product_id, quantity, unit_price, total)
             VALUES (?, ?, ?, ?, ?)`,
            [billId, product.id, quantity, unitPrice, total],
            (err, result) => {
              if (err) {
                return rollbackSale(500, err.message);
              }

              db.query(
                "UPDATE products SET quantity = quantity - ? WHERE id = ?",
                [quantity, product.id],
                (err) => {
                  if (err) {
                    return rollbackSale(500, err.message);
                  }

                  soldItems.push({
                    saleId: result.insertId,
                    billId,
                    productId: Number(product.id),
                    name: product.name,
                    quantity,
                    unitPrice,
                    total,
                    remainingStock,
                  });

                  grandTotal += total;
                  index += 1;

                  processNextItem();
                },
              );
            },
          );
        },
      );
    }

    processNextItem();
  });
});
// Get sales / transaction history
app.get("/api/sales", (req, res) => {
  const sql = `
    SELECT
      sales.id,
      sales.bill_id AS billId,
      products.name,
      sales.quantity,
      sales.unit_price AS unitPrice,
      sales.total,
      sales.sale_date AS saleDate
    FROM sales
    JOIN products ON sales.product_id = products.id
    ORDER BY sales.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(rows);
  });
});

// Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: "Username and password are required.",
    });
  }

  db.query(
    "SELECT PasswordHash AS passwordHash FROM Users WHERE Username = ?",
    [username],
    async (err, rows) => {
      if (err) {
        return res.status(500).json({
          error: "Database error.",
        });
      }

      if (rows.length === 0) {
        return res.status(401).json({
          error: "Invalid username or password.",
        });
      }

      try {
        const validPassword = await bcrypt.compare(
          password,
          rows[0].passwordHash,
        );

        if (!validPassword) {
          return res.status(401).json({
            error: "Invalid username or password.",
          });
        }

        return res.json({
          message: "Login successful",
        });
      } catch {
        return res.status(500).json({
          error: "Login could not be completed.",
        });
      }
    },
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
