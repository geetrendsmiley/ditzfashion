import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, LoaderCircle, LogOut, Plus, ShieldCheck } from 'lucide-react';
import './account.css';

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
  return payload;
}

function Field({ label, ...props }) {
  return (
    <label className="account-field">
      <span>{label}</span>
      <input required {...props} />
    </label>
  );
}

function AddressForm({ onSaved, onCancel }) {
  const [form, setForm] = useState({
    label: 'Shipping',
    recipient: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    country: 'NG',
    isDefault: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/api/account/addresses', { method: 'POST', body: JSON.stringify(form) });
      await onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <form className="account-form address-form" onSubmit={submit}>
      <Field label="RECIPIENT NAME" name="recipient" autoComplete="name" value={form.recipient} onChange={update} />
      <Field label="PHONE NUMBER" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={update} />
      <Field label="STREET ADDRESS" name="address" autoComplete="street-address" value={form.address} onChange={update} />
      <div className="account-form-row">
        <Field label="CITY" name="city" autoComplete="address-level2" value={form.city} onChange={update} />
        <Field label="STATE / REGION" name="state" autoComplete="address-level1" value={form.state} onChange={update} />
      </div>
      <label className="account-field">
        <span>COUNTRY</span>
        <select name="country" value={form.country} onChange={update}>
          <option value="NG">Nigeria</option>
          <option value="GH">Ghana</option>
          <option value="KE">Kenya</option>
          <option value="GB">United Kingdom</option>
          <option value="US">United States</option>
          <option value="ZA">South Africa</option>
        </select>
      </label>
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="account-form-actions">
        {onCancel && <button className="account-secondary-button" type="button" onClick={onCancel}>CANCEL</button>}
        <button className="account-primary-button" type="submit" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
          SAVE SHIPPING ADDRESS
        </button>
      </div>
    </form>
  );
}

function LoginScreen({ onSignedIn, initialMode = 'signup' }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ email: '', username: '', password: '', login: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = isSignup
        ? { email: form.email.trim(), username: form.username.trim(), password: form.password }
        : { login: form.login.trim(), password: form.password };
      const result = await api(`/api/auth/${isSignup ? 'signup' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onSignedIn(result.user);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-auth-card">
      <a className="account-back" href="/"><ArrowLeft size={15} /> BACK TO THE STORE</a>
      <span className="eyebrow"><span className="eyebrow-rule" /> YOUR DITZ ACCOUNT</span>
      <h1>{isSignup ? 'Come on in.' : 'Good to have you back.'}</h1>
      <p className="account-intro">
        {isSignup
          ? 'A quick sign-up keeps your details and orders together for next time.'
          : 'Sign in to find your details, delivery addresses, and orders.'}
      </p>
      <form className="account-form" onSubmit={submit}>
        {isSignup ? (
          <>
            <Field label="EMAIL ADDRESS" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <Field label="USERNAME" autoComplete="username" minLength={3} maxLength={32} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          </>
        ) : (
          <Field label="EMAIL OR USERNAME" autoComplete="username" value={form.login} onChange={(event) => setForm({ ...form, login: event.target.value })} />
        )}
        <Field
          label="PASSWORD"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          minLength={isSignup ? 10 : 1}
          maxLength={128}
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />
        {isSignup && <p className="account-hint">Use at least 10 characters. We never store your password in plain text.</p>}
        {error && <p className="account-error" role="alert">{error}</p>}
        <button className="account-primary-button account-submit" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={17} /> : null}
          {isSignup ? 'CREATE YOUR ACCOUNT' : 'SIGN IN'} <ArrowRight size={16} />
        </button>
      </form>
      <p className="account-switch">
        {isSignup ? 'Already part of DITZ?' : 'New around here?'}{' '}
        <button
          type="button"
          onClick={() => {
            setMode(isSignup ? 'signin' : 'signup');
            setError('');
          }}
        >
          {isSignup ? 'Sign in' : 'Create an account'}
        </button>
      </p>
      <p className="account-privacy"><ShieldCheck size={14} /> Your account details are kept securely and used to fulfil your orders.</p>
    </section>
  );
}

function CustomerAccount({ user, onSignOut }) {
  const [addresses, setAddresses] = useState([]);
  const [orders, setOrders] = useState([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadAccount() {
    setError('');
    try {
      const [addressResult, orderResult] = await Promise.all([
        api('/api/account/addresses'),
        api('/api/account/orders'),
      ]);
      setAddresses(addressResult.addresses);
      setOrders(orderResult.orders);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAccount(); }, []);

  return (
    <main className="account-page">
      <header className="account-topbar">
        <a className="wordmark" href="/">DITZ<span className="wordmark-period">.</span></a>
        <button type="button" className="account-secondary-button" onClick={onSignOut}><LogOut size={15} /> SIGN OUT</button>
      </header>
      <div className="account-content">
        <a className="account-back" href="/"><ArrowLeft size={15} /> BACK TO THE STORE</a>
        <span className="eyebrow"><span className="eyebrow-rule" /> YOUR DITZ ACCOUNT</span>
        <div className="account-welcome">
          <div>
            <h1>Welcome back, {user.username}.</h1>
            <p>{user.email}</p>
          </div>
        </div>
        {error && <p className="account-error" role="alert">{error}</p>}
        <section className="account-panel">
          <div className="account-panel-heading">
            <div><span className="eyebrow">DELIVERY DETAILS</span><h2>Your addresses</h2></div>
            <button className="account-secondary-button" type="button" onClick={() => setShowAddressForm((open) => !open)}>
              <Plus size={15} /> ADD ADDRESS
            </button>
          </div>
          {showAddressForm && <AddressForm onSaved={async () => { setShowAddressForm(false); await loadAccount(); }} onCancel={() => setShowAddressForm(false)} />}
          {!loading && addresses.length === 0 && !showAddressForm && (
            <div className="account-empty">
              <p>Add a shipping address once — it will be ready next time you shop.</p>
              <button type="button" className="text-link" onClick={() => setShowAddressForm(true)}>ADD YOUR FIRST ADDRESS <ArrowRight size={15} /></button>
            </div>
          )}
          {addresses.map((address) => (
            <article className="saved-address" key={address.id}>
              <div><h3>{address.recipient} {address.isDefault && <span>DEFAULT</span>}</h3><p>{address.address}, {address.city}, {address.state}, {address.country}</p><p>{address.phone}</p></div>
              {!address.isDefault && (
                <button type="button" className="text-link" onClick={async () => { await api(`/api/account/addresses/${address.id}/default`, { method: 'PATCH' }); await loadAccount(); }}>
                  MAKE DEFAULT
                </button>
              )}
            </article>
          ))}
        </section>
        <section className="account-panel">
          <div className="account-panel-heading">
            <div><span className="eyebrow">YOUR DITZ ORDERS</span><h2>Order history</h2></div>
          </div>
          {loading ? <p className="account-loading"><LoaderCircle className="spin" size={17} /> Loading your orders…</p> : orders.length ? (
            <div className="order-history">
              {orders.map((order) => (
                <article className="saved-order" key={order.orderNumber}>
                  <div><h3>{order.orderNumber}</h3><p>{new Date(order.createdAt).toLocaleDateString()} · {order.paymentMethod} · {order.paymentStatus}</p></div>
                  <span>{new Intl.NumberFormat(undefined, { style: 'currency', currency: order.currency }).format(order.subtotalMinor / 100)}</span>
                </article>
              ))}
            </div>
          ) : <p className="account-empty">Your orders will show up here.</p>}
        </section>
        {user.role === 'ADMIN' && <a className="account-primary-button" href="/admin">OPEN THE DITZ STUDIO <ArrowRight size={16} /></a>}
      </div>
    </main>
  );
}

export function AccountPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isAdminPage = window.location.pathname.startsWith('/admin');

  useEffect(() => {
    api('/api/auth/me')
      .then((result) => setUser(result.user))
      .catch((loadError) => {
        if (loadError.message !== 'Please sign in to continue.' && loadError.message !== 'Your session expired. Please sign in again.') {
          setError(loadError.message);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function signOut() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (signOutError) {
      setError(signOutError.message);
    }
  }

  if (loading) return <main className="account-loading full-page"><LoaderCircle className="spin" size={20} /> Loading your account…</main>;
  if (error) return <main className="account-page"><div className="account-error-card" role="alert">{error}<a href="/">Back to the store</a></div></main>;

  if (isAdminPage) {
    return user?.role === 'ADMIN' ? (
      <AdminDashboard user={user} onSignOut={signOut} />
    ) : (
      <main className="account-page">
        <LoginScreen initialMode="signin" onSignedIn={(signedInUser) => setUser(signedInUser)} />
        <p className="account-admin-note">Administrator access is only available to accounts created with the secure admin setup command.</p>
      </main>
    );
  }
  return user ? <CustomerAccount user={user} onSignOut={signOut} /> : <main className="account-page"><LoginScreen onSignedIn={setUser} /></main>;
}

const emptyProduct = {
  name: '',
  description: '',
  category: 'T-shirts',
  color: '',
  colorCode: '#dedbd2',
  image: '',
  imageAlt: '',
  sizes: 'XS, S, M, L, XL',
  price: '',
  compareAtPrice: '',
  stock: 0,
  tag: 'NEW ARRIVAL',
  isNewArrival: true,
  isActive: true,
  countryPrices: [],
};

function AdminDashboard({ user, onSignOut }) {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(emptyProduct);
  const [editingId, setEditingId] = useState(null);
  const [editingPrices, setEditingPrices] = useState({ US: '', GB: '', GH: '', KE: '', ZA: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadStudio() {
    try {
      const [productResult, orderResult] = await Promise.all([
        api('/api/admin/products'),
        api('/api/admin/orders'),
      ]);
      setProducts(productResult.products);
      setOrders(orderResult.orders);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  useEffect(() => { loadStudio(); }, []);

  function editProduct(product) {
    const priceByCountry = Object.fromEntries((product.countryPrices || []).map((entry) => [entry.countryCode, entry.amountMinor / 100]));
    setForm({
      ...product,
      sizes: product.sizes.join(', '),
      price: product.priceMinor / 100,
      compareAtPrice: product.compareAtMinor ? product.compareAtMinor / 100 : '',
    });
    setEditingPrices({ US: priceByCountry.US ?? '', GB: priceByCountry.GB ?? '', GH: priceByCountry.GH ?? '', KE: priceByCountry.KE ?? '', ZA: priceByCountry.ZA ?? '' });
    setEditingId(product.id);
    document.getElementById('product-editor')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function saveProduct(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    const payload = {
      ...form,
      price: Number(form.price),
      compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
      stock: Number(form.stock),
      sizes: form.sizes.split(',').map((size) => size.trim()).filter(Boolean),
      countryPrices: Object.entries(editingPrices)
        .filter(([, price]) => price !== '' && Number(price) > 0)
        .map(([countryCode, price]) => ({ countryCode, price: Number(price) })),
    };
    try {
      await api(editingId ? `/api/admin/products/${editingId}` : '/api/admin/products', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setSuccess(editingId ? 'Product updated — your changes are now live.' : 'New arrival published to the store.');
      setForm(emptyProduct);
      setEditingPrices({ US: '', GB: '', GH: '', KE: '', ZA: '' });
      setEditingId(null);
      await loadStudio();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function archiveProduct(product) {
    if (!window.confirm(`Remove "${product.name}" from the storefront? Past orders will be kept.`)) return;
    try {
      await api(`/api/admin/products/${product.id}`, { method: 'DELETE' });
      setSuccess(`${product.name} has been removed from the storefront.`);
      await loadStudio();
    } catch (archiveError) {
      setError(archiveError.message);
    }
  }

  async function updateStatus(order, status) {
    try {
      await api(`/api/admin/orders/${order.orderNumber}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setSuccess(`Order ${order.orderNumber} updated.`);
      await loadStudio();
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  function setField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }

  return (
    <main className="account-page studio-page">
      <header className="account-topbar">
        <a className="wordmark" href="/">DITZ<span className="wordmark-period">.</span></a>
        <div className="studio-topbar-actions"><a href="/" className="account-secondary-button"><ArrowLeft size={15} /> STORE</a><button className="account-secondary-button" type="button" onClick={onSignOut}><LogOut size={15} /> SIGN OUT</button></div>
      </header>
      <div className="studio-content">
        <div className="studio-heading">
          <div><span className="eyebrow"><span className="eyebrow-rule" /> THE DITZ STUDIO</span><h1>Good morning, {user.username}.</h1><p>Your products, prices, and new arrivals — all in one place.</p></div>
          <a href="#product-editor" className="account-primary-button"><Plus size={16} /> ADD NEW ARRIVAL</a>
        </div>
        {error && <p className="account-error studio-alert" role="alert">{error}</p>}
        {success && <p className="account-success studio-alert" role="status"><Check size={15} /> {success}</p>}

        <div className="studio-stats">
          <div><span>LIVE PRODUCTS</span><strong>{products.filter((product) => product.isActive).length}</strong></div>
          <div><span>NEW ARRIVALS</span><strong>{products.filter((product) => product.isActive && product.isNewArrival).length}</strong></div>
          <div><span>OPEN ORDERS</span><strong>{orders.filter((order) => !['DELIVERED', 'CANCELLED'].includes(order.status)).length}</strong></div>
        </div>

        <section className="studio-panel" id="product-editor">
          <div className="studio-panel-title"><div><span className="eyebrow">PRODUCT MANAGEMENT</span><h2>{editingId ? 'Update a piece' : 'Add a new arrival'}</h2></div>{editingId && <button className="account-secondary-button" type="button" onClick={() => { setForm(emptyProduct); setEditingId(null); }}>CANCEL EDIT</button>}</div>
          <form className="studio-form" onSubmit={saveProduct}>
            <label className="account-field"><span>PRODUCT NAME</span><input required name="name" value={form.name} onChange={setField} maxLength="160" /></label>
            <div className="account-form-row">
              <label className="account-field"><span>CATEGORY</span><input required name="category" value={form.category} onChange={setField} /></label>
              <label className="account-field"><span>BASE PRICE (NGN)</span><input required type="number" min="1" step="1" name="price" value={form.price} onChange={setField} /></label>
              <label className="account-field"><span>COMPARE-AT PRICE (OPTIONAL)</span><input type="number" min="1" step="1" name="compareAtPrice" value={form.compareAtPrice} onChange={setField} /></label>
            </div>
            <label className="account-field"><span>DESCRIPTION</span><textarea required name="description" value={form.description} onChange={setField} rows="3" /></label>
            <div className="account-form-row studio-grid-three">
              <label className="account-field"><span>COLOUR NAME</span><input required name="color" value={form.color} onChange={setField} /></label>
              <label className="account-field"><span>COLOUR SWATCH</span><input required type="color" name="colorCode" value={form.colorCode} onChange={setField} /></label>
              <label className="account-field"><span>IMAGE URL</span><input required type="url" name="image" value={form.image} onChange={setField} placeholder="https://" /></label>
            </div>
            <div className="account-form-row">
              <label className="account-field"><span>IMAGE DESCRIPTION</span><input name="imageAlt" value={form.imageAlt} onChange={setField} maxLength="240" /></label>
              <label className="account-field"><span>SIZES (COMMA SEPARATED)</span><input required name="sizes" value={form.sizes} onChange={setField} placeholder="XS, S, M, L, XL" /></label>
              <label className="account-field"><span>STOCK QUANTITY</span><input required type="number" min="0" name="stock" value={form.stock} onChange={setField} /></label>
            </div>
            <div className="country-price-editor">
              <div><strong>COUNTRY PRICES — OPTIONAL</strong><p>Leave blank to show the NGN base price in that country. Paystack currently accepts NGN orders only.</p></div>
              <div className="account-form-row studio-grid-three">
                {Object.entries({ US: 'UNITED STATES · USD', GB: 'UNITED KINGDOM · GBP', GH: 'GHANA · GHS', KE: 'KENYA · KES', ZA: 'SOUTH AFRICA · ZAR' }).map(([code, label]) => (
                  <label className="account-field" key={code}><span>{label}</span><input type="number" min="0" step="0.01" placeholder="Use NGN base price" value={editingPrices[code]} onChange={(event) => setEditingPrices({ ...editingPrices, [code]: event.target.value })} /></label>
                ))}
              </div>
            </div>
            <div className="studio-checks">
              <label><input type="checkbox" name="isNewArrival" checked={form.isNewArrival} onChange={setField} /> Show as a new arrival</label>
              <label><input type="checkbox" name="isActive" checked={form.isActive} onChange={setField} /> Publish to storefront</label>
            </div>
            <button type="submit" className="account-primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{editingId ? 'SAVE PRODUCT CHANGES' : 'PUBLISH NEW ARRIVAL'}</button>
          </form>
        </section>

        <section className="studio-panel">
          <div className="studio-panel-title"><div><span className="eyebrow">YOUR COLLECTION</span><h2>Products &amp; prices</h2></div></div>
          <div className="studio-product-list">
            {products.map((product) => (
              <article className={`studio-product-row ${!product.isActive ? 'is-archived' : ''}`} key={product.id}>
                <img src={product.image} alt="" />
                <div className="studio-product-name"><strong>{product.name}</strong><span>{product.category} · {product.color} · {product.stock} in stock</span>{product.isNewArrival && <span className="studio-new-tag">NEW ARRIVAL</span>}</div>
                <strong className="studio-price">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(product.priceMinor / 100)}</strong>
                <button className="account-secondary-button" type="button" onClick={() => editProduct(product)}>EDIT</button>
                {product.isActive && <button className="account-secondary-button studio-remove" type="button" onClick={() => archiveProduct(product)}>HIDE</button>}
              </article>
            ))}
          </div>
        </section>

        <section className="studio-panel">
          <div className="studio-panel-title"><div><span className="eyebrow">CUSTOMER ORDERS</span><h2>Recent orders</h2></div></div>
          {orders.length === 0 ? <p className="account-empty">Customer orders will appear here after checkout.</p> : (
            <div className="studio-product-list">
              {orders.map((order) => (
                <article className="studio-order-row" key={order.id}>
                  <div><strong>{order.orderNumber}</strong><span>{order.customerName} · {order.customerEmail} · {order.paymentMethod}</span><span>{order.status} / {order.paymentStatus}</span></div>
                  <strong>{new Intl.NumberFormat(undefined, { style: 'currency', currency: order.currency }).format(order.subtotalMinor / 100)}</strong>
                  {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && (
                    <select value={order.status} aria-label={`Update ${order.orderNumber} status`} onChange={(event) => updateStatus(order, event.target.value)}>
                      <option value="CONFIRMED">CONFIRMED</option><option value="PROCESSING">PROCESSING</option><option value="SHIPPED">SHIPPED</option><option value="DELIVERED">DELIVERED</option><option value="CANCELLED">CANCELLED</option>
                    </select>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
        <footer className="studio-footer">SIGNED IN AS {user.email} · CUSTOMER DETAILS ARE ONLY SHOWN TO STORE ADMINISTRATORS</footer>
      </div>
    </main>
  );
}
