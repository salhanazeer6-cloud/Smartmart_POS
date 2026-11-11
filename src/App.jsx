import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [products, setProducts] = useState([]);
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [saleQuantity, setSaleQuantity] = useState("1");
  const [cart, setCart] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [completedSale, setCompletedSale] = useState(null);
  const [activePage, setActivePage] = useState("Dashboard");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    fetch("http://localhost:5000/api/products")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load products");
        return response.json();
      })
      .then((data) => setProducts(data))
      .catch((error) => console.error("Error loading products:", error));

    fetch("http://localhost:5000/api/sales")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load sales");
        return response.json();
      })
      .then((data) => {
        const savedSales = data.map((sale) => ({
          id: sale.id,
          billId: sale.billId ?? null,
          name: sale.name,
          quantity: Number(sale.quantity) || 0,
          unitPrice: Number(sale.unitPrice) || 0,
          total: Number(sale.total) || 0,
          date: sale.saleDate ? new Date(sale.saleDate).toLocaleString() : "",
        }));

        setTransactions(savedSales);

        if (savedSales.length > 0) {
          setCompletedSale(savedSales[0]);
        }
      })
      .catch((error) => console.error("Error loading sales:", error));
  }, []);

  const lowStock = products.filter((product) => Number(product.quantity) <= 5);
  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedProduct = products.find(
    (product) => String(product.id) === selectedProductId,
  );

  const billQuantity = Number(saleQuantity);

  const groupedTransactions = Object.values(
    transactions.reduce((groups, transaction) => {
      const key = transaction.billId || `sale-${transaction.id}`;

      if (!groups[key]) {
        groups[key] = {
          billId: transaction.billId || transaction.id,
          date: transaction.date ?? transaction.saleDate ?? "—",
          items: [],
          total: 0,
        };
      }

      groups[key].items.push(transaction);
      groups[key].total += Number(transaction.total) || 0;

      return groups;
    }, {}),
  );

  const billTotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );

  const totalRevenue = transactions.reduce(
    (total, transaction) => total + Number(transaction.total),
    0,
  );

  async function addProduct(e) {
    e.preventDefault();

    if (
      !productName.trim() ||
      price === "" ||
      quantity === "" ||
      !Number.isFinite(Number(price)) ||
      Number(price) <= 0 ||
      !Number.isInteger(Number(quantity)) ||
      Number(quantity) <= 0
    ) {
      alert("Enter a valid product name, price, and quantity.");
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productName.trim(),
          price: Number(price),
          quantity: Number(quantity),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to add product.");
      }

      setProducts((previous) => [...previous, data]);
      setProductName("");
      setPrice("");
      setQuantity("");

      alert("Product added successfully!");
    } catch (error) {
      console.error("Error adding product:", error);
      alert(error.message || "Product could not be saved.");
    }
  }

  function addToCart(e) {
    e.preventDefault();

    if (!selectedProduct) {
      alert("Please select a product.");
      return;
    }

    const qty = Number(saleQuantity);

    if (!Number.isInteger(qty) || qty <= 0) {
      alert("Enter a valid whole-number quantity.");
      return;
    }

    const existing = cart.find(
      (item) => Number(item.id) === Number(selectedProduct.id),
    );

    const newQty = qty + (existing ? existing.quantity : 0);

    if (newQty > Number(selectedProduct.quantity)) {
      alert(`Only ${selectedProduct.quantity} units are available.`);
      return;
    }

    setCart((previous) => {
      const found = previous.find(
        (item) => Number(item.id) === Number(selectedProduct.id),
      );

      if (found) {
        return previous.map((item) =>
          Number(item.id) === Number(selectedProduct.id)
            ? { ...item, quantity: item.quantity + qty }
            : item,
        );
      }

      return [
        ...previous,
        {
          id: selectedProduct.id,
          name: selectedProduct.name,
          price: Number(selectedProduct.price),
          quantity: qty,
        },
      ];
    });

    setSelectedProductId("");
    setSaleQuantity("1");
  }

  async function completeSale() {
    if (cart.length === 0) {
      alert("Please add products to the cart first.");
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: Number(item.id),
            quantity: item.quantity,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Sale failed.");
      }

      const date = new Date().toLocaleString();

      setProducts((previous) =>
        previous.map((product) => {
          const sold = data.items.find(
            (item) => Number(item.productId) === Number(product.id),
          );

          return sold
            ? { ...product, quantity: Number(sold.remainingStock) }
            : product;
        }),
      );

      const newTransactions = data.items.map((item) => ({
        id: item.saleId,
        billId: data.billId,
        name: item.name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
        date,
      }));

      setTransactions((previous) => [...newTransactions, ...previous]);

      setCompletedSale({
        id: data.items[0].saleId,
        items: data.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          total: Number(item.total),
        })),
        total: Number(data.grandTotal),
        date,
      });

      setCart([]);
      setSelectedProductId("");
      setSaleQuantity("1");

      alert("Sale completed successfully!");
    } catch (error) {
      console.error("Error completing sale:", error);
      alert(error.message || "Sale could not be completed.");
    }
  }

  const sales = [
    {
      title: "Total Revenue",
      value: `Rs. ${totalRevenue.toLocaleString()}`,
      note: `${transactions.length} completed sales`,
      icon: "↗",
      color: "pink",
    },
    {
      title: "Total Orders",
      value: String(transactions.length),
      note: "Completed sales",
      icon: "▤",
      color: "green",
    },
    {
      title: "Products in Stock",
      value: String(
        products.reduce(
          (total, product) => total + Number(product.quantity),
          0,
        ),
      ),
      note: `${products.length} different products`,
      icon: "▦",
      color: "purple",
    },
    {
      title: "Low Stock Items",
      value: String(lowStock.length),
      note: "Products with 5 or fewer units",
      icon: "!",
      color: "peach",
    },
  ];

  if (!isLoggedIn) {
    return (
      <div className="login-page">
        <form
          className="login-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoginError("");

            try {
              const response = await fetch("http://localhost:5000/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
              });

              const data = await response.json();

              if (response.ok) {
                setIsLoggedIn(true);
              } else {
                setLoginError(data.error || "Invalid username or password.");
              }
            } catch {
              setLoginError(
                "Unable to connect to the server. Please try again.",
              );
            }
          }}
        >
          <h1>SmartMart</h1>
          <p>Sign in to manage your store</p>
          {loginError && <p className="login-error">{loginError}</p>}

          <label>Email or Username</label>
          <input
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <label>Password</label>
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit">Login</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo-area">
          <div className="logo-icon">S</div>
          <div>
            <div className="logo-text">SmartMart</div>
            <div className="logo-subtitle">POINT OF SALE</div>
          </div>
        </div>

        <div className="menu-label">WORKSPACE</div>

        <nav className="nav-menu">
          <div
            className={
              activePage === "Dashboard" ? "nav-item active" : "nav-item"
            }
            onClick={() => setActivePage("Dashboard")}
          >
            <span className="nav-icon">▦</span> Dashboard
          </div>

          <div
            className={
              activePage === "New Sale" ? "nav-item active" : "nav-item"
            }
            onClick={() => setActivePage("New Sale")}
          >
            <span className="nav-icon">＋</span> New Sale
          </div>

          <div
            className={
              activePage === "Transactions" ? "nav-item active" : "nav-item"
            }
            onClick={() => setActivePage("Transactions")}
          >
            <span className="nav-icon">▤</span> Transactions
          </div>

          <div
            className={
              activePage === "Products" ? "nav-item active" : "nav-item"
            }
            onClick={() => setActivePage("Products")}
          >
            <span className="nav-icon">▧</span> Products
          </div>

          <div
            className={
              activePage === "Inventory" ? "nav-item active" : "nav-item"
            }
            onClick={() => setActivePage("Inventory")}
          >
            <span className="nav-icon">▥</span> Inventory
          </div>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-symbol">✦</span>
            <strong>Need some help?</strong>
            <p>Keep your store running smoothly with SmartMart.</p>
            <button
              className="help-button"
              onClick={() => window.alert("SmartMart help")}
            >
              View help centre ↗
            </button>
          </div>

          <div className="sidebar-user">
            <div className="profile-avatar">SM</div>
            <div>
              <strong>Store Manager</strong>
              <span>Administrator</span>
            </div>
            <span className="user-dots">•••</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              Workspace / <span>{activePage}</span>
            </div>
            <h1 className="page-title">
              {activePage === "Dashboard"
                ? "Dashboard Overview"
                : activePage === "New Sale"
                  ? "New Sale / Billing"
                  : activePage}
            </h1>
            <p className="page-subtitle">
              {activePage === "Dashboard"
                ? "Your store at a glance."
                : activePage === "New Sale"
                  ? "Add products and complete customer sales."
                  : activePage === "Transactions"
                    ? "View and monitor your sales history."
                    : activePage === "Products"
                      ? "Manage your products and prices."
                      : "Monitor stock levels and low-stock items."}
            </p>
          </div>

          <div className="topbar-right">
            <label className="search-box">
              <span>⌕</span>
              <input
                type="search"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="top-profile">
              <div className="profile-avatar">SM</div>
            </div>
          </div>
        </header>

        {activePage === "Dashboard" && (
          <section className="welcome-banner">
            <div className="welcome-copy">
              <span className="welcome-tag">YOUR STORE AT A GLANCE</span>
              <h2>
                Welcome to SmartMart! <span>✦</span>
              </h2>
              <p>
                Manage products, track stock, and keep your store organized.
              </p>
              <button
                className="primary-button"
                onClick={() => setActivePage("Products")}
              >
                ＋ Add a Product <span>→</span>
              </button>
            </div>

            <div className="welcome-art" aria-hidden="true">
              <div className="art-circle circle-one" />
              <div className="art-circle circle-two" />
              <div className="art-receipt">
                <span>SMARTMART</span>
                <b>STORE INVENTORY</b>
                <i />
                <i />
                <i />
                <strong>WELCOME!</strong>
              </div>
              <div className="art-sparkle sparkle-one">✦</div>
              <div className="art-sparkle sparkle-two">✧</div>
            </div>

            <div className="banner-bottom-note">
              <span className="live-dot" /> STORE STATUS: ACTIVE
            </div>
          </section>
        )}

        {activePage === "Dashboard" && (
          <section className="stats-section">
            <div className="section-heading">
              <div>
                <h2>Business Snapshot</h2>
                <p>Your current store information.</p>
              </div>
              <span className="date-pill">◷ &nbsp; Overview</span>
            </div>

            <div className="stats-grid">
              {sales.map((item) => (
                <article className={`stat-card ${item.color}`} key={item.title}>
                  <div className="stat-top">
                    <span className="stat-label">{item.title}</span>
                    <span className="stat-icon">{item.icon}</span>
                  </div>
                  <div className="stat-value">{item.value}</div>
                  <div className="stat-note">{item.note}</div>
                </article>
              ))}
            </div>
          </section>
        )}

        {(activePage === "Dashboard" || activePage === "Inventory") && (
          <section className="dashboard-grid">
            {activePage === "Inventory" && (
              <article className="panel inventory-panel" id="inventory">
                <div className="panel-heading">
                  <div>
                    <h2>Inventory Alerts</h2>
                    <p>Products with 5 or fewer units.</p>
                  </div>
                  <span className="alert-count">{lowStock.length}</span>
                </div>

                {lowStock.length === 0 ? (
                  <p style={{ padding: "20px 0" }}>
                    No low-stock products. All products have sufficient stock.
                  </p>
                ) : (
                  lowStock.map((product) => (
                    <div className="inventory-row" key={product.id}>
                      <span className="inventory-product-icon pink-bg">▧</span>
                      <div className="inventory-product">
                        <strong>{product.name}</strong>
                        <span>Store inventory</span>
                      </div>
                      <div className="stock-number">
                        <strong>{product.quantity} left</strong>
                        <span>Low stock</span>
                      </div>
                    </div>
                  ))
                )}
              </article>
            )}
          </section>
        )}

        {activePage === "Products" && (
          <section
            className="panel"
            style={{ padding: "24px", marginBottom: "24px" }}
          >
            <div className="panel-heading">
              <div>
                <h2>Product Management</h2>
                <p>Add products and manage your store inventory.</p>
              </div>
            </div>

            <form onSubmit={addProduct} style={{ marginTop: "20px" }}>
              <div
                style={{
                  display: "grid",
                  gap: "16px",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                }}
              >
                <label>
                  Product Name
                  <input
                    type="text"
                    placeholder="Enter product name"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    required
                  />
                </label>

                <label>
                  Price (Rs.)
                  <input
                    type="number"
                    placeholder="Enter price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>

                <label>
                  Quantity
                  <input
                    type="number"
                    placeholder="Enter quantity"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min="1"
                    step="1"
                    required
                  />
                </label>
              </div>

              <button
                type="submit"
                className="primary-button"
                style={{ marginTop: "16px" }}
              >
                + Add Product
              </button>
            </form>

            <div style={{ marginTop: "28px" }}>
              <h2>All Products ({filteredProducts.length})</h2>

              {filteredProducts.length === 0 ? (
                <p style={{ padding: "20px 0" }}>
                  No products found. Add a product using the form above.
                </p>
              ) : (
                <div style={{ overflowX: "auto", marginTop: "12px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "12px", textAlign: "left" }}>
                          ID
                        </th>
                        <th style={{ padding: "12px", textAlign: "left" }}>
                          Product
                        </th>
                        <th style={{ padding: "12px", textAlign: "left" }}>
                          Price
                        </th>
                        <th style={{ padding: "12px", textAlign: "left" }}>
                          Stock
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product) => (
                        <tr key={product.id}>
                          <td style={{ padding: "12px" }}>{product.id}</td>
                          <td style={{ padding: "12px" }}>{product.name}</td>
                          <td style={{ padding: "12px" }}>
                            Rs. {Number(product.price).toLocaleString()}
                          </td>
                          <td style={{ padding: "12px" }}>
                            {product.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activePage === "Transactions" && (
          <section
            className="panel"
            style={{ padding: "24px", marginBottom: "24px" }}
          >
            <div className="panel-heading">
              <div>
                <h2>Sales Transactions</h2>
                <p>Review completed sales and their totals.</p>
              </div>
            </div>

            {transactions.length === 0 ? (
              <p style={{ padding: "20px 0" }}>
                No transactions to display yet. Complete a sale first.
              </p>
            ) : (
              <div style={{ overflowX: "auto", marginTop: "20px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Sale ID
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Product
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Quantity
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Unit Price
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Total
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Date
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {groupedTransactions.map((bill) => (
                      <tr key={bill.billId}>
                        <td style={{ padding: "12px" }}>
                          {bill.items.map((item) => (
                            <div key={item.id}>Sale #{item.id}</div>
                          ))}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {bill.items.map((item, index) => (
                            <div key={`${item.id}-${index}`}>{item.name}</div>
                          ))}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {bill.items.map((item, index) => (
                            <div key={`${item.id}-${index}`}>
                              {item.quantity}
                            </div>
                          ))}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {bill.items.map((item, index) => (
                            <div key={`${item.id}-${index}`}>
                              Rs. {Number(item.unitPrice).toLocaleString()}
                            </div>
                          ))}
                        </td>
                        <td style={{ padding: "12px" }}>
                          Rs. {Number(bill.total ?? 0).toLocaleString()}
                        </td>
                        <td style={{ padding: "12px" }}>{bill.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activePage === "New Sale" && (
          <section
            className="panel"
            id="new-sale"
            style={{ padding: "24px", marginBottom: "24px" }}
          >
            <div className="panel-heading">
              <div>
                <h2>New Sale / Billing</h2>
                <p>Select products and calculate the customer bill.</p>
              </div>
            </div>

            <form
              onSubmit={addToCart}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                margin: "20px 0",
                alignItems: "center",
              }}
            >
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                style={{
                  padding: "12px",
                  flex: "2 1 200px",
                  minWidth: 0,
                }}
                required
              >
                <option value="">Select a product</option>
                {products
                  .filter((product) => Number(product.quantity) > 0)
                  .map((product) => (
                    <option key={product.id} value={String(product.id)}>
                      {product.name} — Rs. {product.price} ({product.quantity}{" "}
                      available)
                    </option>
                  ))}
              </select>

              <input
                type="number"
                min="1"
                step="1"
                value={saleQuantity}
                onChange={(e) => setSaleQuantity(e.target.value)}
                placeholder="Quantity"
                style={{
                  padding: "12px",
                  flex: "1 1 100px",
                  minWidth: 0,
                }}
                required
              />

              <button type="submit" className="primary-button">
                Add to Cart
              </button>
            </form>

            <div style={{ padding: "8px 0" }}>
              <p>
                Unit price:{" "}
                <strong>
                  Rs.{" "}
                  {selectedProduct
                    ? Number(selectedProduct.price).toLocaleString()
                    : "0"}
                </strong>
              </p>
            </div>

            <div style={{ padding: "8px 0" }}>
              <h3 style={{ marginBottom: "12px" }}>Cart Items</h3>

              {cart.length === 0 ? (
                <p>No products added yet.</p>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      flexWrap: "wrap",
                      padding: "12px 0",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    <span>
                      {item.name} × {item.quantity} — Rs.{" "}
                      {(item.price * item.quantity).toLocaleString()}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setCart((previous) =>
                          previous.filter(
                            (product) => Number(product.id) !== Number(item.id),
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <h2 style={{ marginTop: "16px" }}>
              Bill Total: Rs. {billTotal.toLocaleString()}
            </h2>

            {selectedProduct &&
              billQuantity > Number(selectedProduct.quantity) && (
                <p>
                  Available stock: {selectedProduct.quantity}. Reduce the
                  requested quantity to continue.
                </p>
              )}

            <button
              type="button"
              className="primary-button"
              onClick={completeSale}
              disabled={cart.length === 0}
              style={{ marginTop: "16px" }}
            >
              Complete Sale
            </button>

            {products.length === 0 && (
              <p style={{ padding: "12px 0" }}>
                Add products in Product Management before making a sale.
              </p>
            )}
          </section>
        )}
        {activePage === "New Sale" && completedSale && (
          <section
            className="panel receipt-panel"
            id="receipt"
            style={{
              padding: "28px",
              marginBottom: "24px",
              maxWidth: "620px",
              background: "#fff",
              color: "#222",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <h2 style={{ marginBottom: "6px" }}>SMARTMART</h2>
              <p>Customer Receipt</p>
              <p>Bill No: {completedSale.id}</p>
              <p>{completedSale.date}</p>
            </div>

            <hr />

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "10px 4px", textAlign: "left" }}>
                      Product
                    </th>
                    <th style={{ padding: "10px 4px" }}>Qty</th>
                    <th style={{ padding: "10px 4px", textAlign: "right" }}>
                      Price
                    </th>
                    <th style={{ padding: "10px 4px", textAlign: "right" }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(completedSale.items ?? [completedSale]).map(
                    (item, index) => (
                      <tr
                        key={`${item.saleId ?? item.id ?? item.name}-${index}`}
                      >
                        <td style={{ padding: "10px 4px" }}>{item.name}</td>
                        <td
                          style={{ padding: "10px 4px", textAlign: "center" }}
                        >
                          {item.quantity}
                        </td>
                        <td style={{ padding: "10px 4px", textAlign: "right" }}>
                          Rs. {Number(item.unitPrice).toLocaleString()}
                        </td>
                        <td style={{ padding: "10px 4px", textAlign: "right" }}>
                          Rs. {Number(item.total).toLocaleString()}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            <hr />

            <h3 style={{ textAlign: "right", marginTop: "18px" }}>
              Grand Total: Rs.{" "}
              {Number(
                completedSale.total ??
                  completedSale.totalAmount ??
                  completedSale.total,
              ).toLocaleString()}
            </h3>

            <p style={{ textAlign: "center", marginTop: "24px" }}>
              Thank you for shopping with SmartMart!
            </p>

            <button
              className="primary-button"
              onClick={() => window.print()}
              style={{ marginTop: "16px" }}
            >
              Print Receipt
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
export default App;
