import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Heart,
  Instagram,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  UserRound,
  X,
} from 'lucide-react';
import { AccountPage } from './Account.jsx';
import { currencyByCountry, formatPrice, productPrice, supportedCountries } from './lib/pricing.js';

const whatsappPhone = (import.meta.env.VITE_WHATSAPP_PHONE || '2347030528292').replace(/\D/g, '');
const instagramUrl = import.meta.env.VITE_INSTAGRAM_URL;

const whatsappLink = (message = '', phone = whatsappPhone) =>
  `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ''}`;

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Something went wrong. Please try again.');
  return payload;
}

export default function App() {
  if (window.location.pathname === '/payment/return') {
    return <PaymentReturn />;
  }
  if (window.location.pathname === '/account' || window.location.pathname === '/admin') {
    return <AccountPage />;
  }
  return <Storefront />;
}

function PaymentReturn() {
  const [result, setResult] = useState({ pending: true, message: 'Verifying your payment securely…' });

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('reference');
    if (!reference) {
      setResult({ pending: false, message: 'We could not find a payment reference. Check your order in your account.' });
      return;
    }
    api('/api/payments/verify', {
      method: 'POST',
      body: JSON.stringify({ reference }),
    })
      .then((payment) => setResult({
        pending: false,
        message: `Payment confirmed for order ${payment.orderNumber}.`,
        success: true,
      }))
      .catch((error) => setResult({ pending: false, message: error.message }));
  }, []);

  return (
    <main className="account-page">
      <section className="account-auth-card payment-return">
        <a className="wordmark" href="/">DITZ<span className="wordmark-period">.</span></a>
        <span className="eyebrow"><span className="eyebrow-rule" /> SECURE PAYMENT</span>
        <h1>{result.pending ? 'One moment.' : result.success ? 'All sorted.' : 'Almost there.'}</h1>
        <p className={result.success ? 'account-success' : 'account-intro'} role={result.pending ? 'status' : 'alert'}>
          {result.pending && <span className="payment-spinner" />}
          {result.message}
        </p>
        {!result.pending && <a className="account-primary-button" href="/account">VIEW YOUR ACCOUNT <ArrowRight size={16} /></a>}
      </section>
    </main>
  );
}

function Storefront() {
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [user, setUser] = useState(null);
  const [countryCode, setCountryCode] = useState(() => {
    try {
      return localStorage.getItem('ditz-country') || 'NG';
    } catch (error) {
      console.error('Could not restore the selected country.', error);
      return 'NG';
    }
  });
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('WHATSAPP');
  const [orderLoading, setOrderLoading] = useState(false);
  const [countryDetected, setCountryDetected] = useState(false);
  const [productsRefresh, setProductsRefresh] = useState(0);

  const [cart, setCart] = useState(() => {
    try {
      const saved = window.localStorage.getItem('ditz-cart');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) && parsed.every((item) => item.productId && item.size && item.quantity)
        ? parsed
        : [];
    } catch (error) {
      console.error('Could not restore the saved cart.', error);
      return [];
    }
  });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('Everything');
  const [sortBy, setSortBy] = useState('Featured');
  const [notice, setNotice] = useState('');
  const [whatsappFallbackUrl, setWhatsappFallbackUrl] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  useEffect(() => {
    window.localStorage.setItem('ditz-cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    let active = true;
    api('/api/store/location')
      .then((location) => {
        if (!active) return;
        const savedCountry = localStorage.getItem('ditz-country');
        if (!savedCountry && location.defaultCountry) {
          setCountryCode(location.defaultCountry);
          setCountryDetected(Boolean(location.detectedCountry));
        }
      })
      .catch((error) => {
        console.error('Could not get the suggested country.', error);
      });
    api('/api/auth/me')
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch((error) => {
        if (error.message !== 'Please sign in to continue.' && error.message !== 'Your session expired. Please sign in again.') {
          console.error('Could not restore the customer session.', error);
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setProductsLoading(true);
    api(`/api/products?country=${encodeURIComponent(countryCode)}`)
      .then((result) => {
        if (!active) return;
        setProducts(result.products);
        setProductsError('');
      })
      .catch((error) => {
        if (active) {
          setProductsError(error.message);
          setProducts([]);
        }
      })
      .finally(() => {
        if (active) setProductsLoading(false);
      });
    return () => { active = false; };
  }, [countryCode, productsRefresh]);

  useEffect(() => {
    if (!user) {
      setAddresses([]);
      setSelectedAddressId('');
      return;
    }
    api('/api/account/addresses')
      .then((result) => {
        setAddresses(result.addresses);
        setSelectedAddressId(result.addresses.find((address) => address.isDefault)?.id || result.addresses[0]?.id || '');
      })
      .catch((error) => setNotice(error.message));
  }, [user]);

  useEffect(() => {
    if (!notice) {
      setWhatsappFallbackUrl('');
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      setNotice('');
      setWhatsappFallbackUrl('');
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const categories = ['Everything', ...new Set(products.map((product) => product.category))];
  const filteredProducts = useMemo(() => {
    const matching = products.filter((product) => {
      const matchesCategory =
        activeCategory === 'Everything' || product.category === activeCategory;
      const matchesSearch = `${product.name} ${product.category} ${product.color}`
        .toLowerCase()
        .includes(searchTerm.trim().toLowerCase());
      return matchesCategory && matchesSearch;
    });

    if (sortBy === 'Price: low to high') {
      return [...matching].sort((a, b) => productPrice(a, countryCode).minor - productPrice(b, countryCode).minor);
    }
    if (sortBy === 'Price: high to low') {
      return [...matching].sort((a, b) => productPrice(b, countryCode).minor - productPrice(a, countryCode).minor);
    }
    return matching;
  }, [activeCategory, countryCode, products, searchTerm, sortBy]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const activeAddress = addresses.find((address) => address.id === selectedAddressId);
  const priceCountryCode = checkoutOpen && activeAddress ? activeAddress.country : countryCode;
  const cartLines = cart.map((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    const price = product ? productPrice(product, priceCountryCode) : { minor: 0, currency: 'NGN' };
    return { ...item, product, priceMinor: price.minor, currency: price.currency };
  });
  const cartTotal = cartLines.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);
  const cartCurrency = cartLines[0]?.currency || 'NGN';

  function chooseCountry(event) {
    const nextCountry = event.target.value;
    setCountryCode(nextCountry);
    setCountryDetected(false);
    localStorage.setItem('ditz-country', nextCountry);
  }

  function addToCart(product, size) {
    if (!size) {
      setNotice('Choose a size first');
      return;
    }
    if (product.stock < 1) {
      setNotice('This piece is currently out of stock');
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id && item.size === size);
      if (existing) {
        if (existing.quantity >= product.stock) {
          setNotice(`Only ${product.stock} left in stock`);
          return current;
        }
        return current.map((item) =>
          item.productId === product.id && item.size === size
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          size,
          quantity: 1,
        },
      ];
    });
    setSelectedProduct(null);
    setSelectedSize('');
    setIsCartOpen(true);
  }

  function updateQuantity(id, size, change) {
    setCart((current) =>
      current
        .map((item) =>
          item.productId === id && item.size === size
            ? { ...item, quantity: Math.min(item.quantity + change, products.find((product) => product.id === id)?.stock || item.quantity) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  async function startCheckout(event) {
    event.preventDefault();
    if (!user) {
      window.location.href = '/account';
      return;
    }
    if (!activeAddress) {
      setNotice('Add a shipping address to your account first');
      return;
    }
    if (paymentMethod === 'PAYSTACK' && activeAddress?.country !== 'NG') {
      setNotice('Paystack online checkout is currently available in Nigeria only');
      return;
    }
    const whatsappWindow = paymentMethod === 'WHATSAPP'
      ? window.open('about:blank', '_blank')
      : null;
    setOrderLoading(true);
    try {
      const result = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          addressId: selectedAddressId,
          countryCode: activeAddress.country,
          paymentMethod,
          items: cart.map(({ productId, size, quantity }) => ({ productId, size, quantity })),
        }),
      });
      if (paymentMethod === 'PAYSTACK') {
        window.location.assign(result.authorizationUrl);
        return;
      }
      const orderLines = result.items.map((item, index) =>
        `${index + 1}. ${item.name}\n   ${item.variant} · Qty: ${item.quantity}\n   ${formatPrice(item.unitPriceMinor, result.order.currency)} each — ${formatPrice(item.unitPriceMinor * item.quantity, result.order.currency)}`,
      ).join('\n\n');
      const address = result.address;
      const message = [
        'Hello DITZ! I would like to place an order.',
        '',
        `Order reference: ${result.order.orderNumber}`,
        '',
        orderLines,
        '',
        `Subtotal: ${formatPrice(result.order.subtotalMinor, result.order.currency)}`,
        'Delivery: To be confirmed',
        `Customer: ${address.recipient}`,
        `Phone: ${address.phone}`,
        `Delivery address: ${address.address}, ${address.city}, ${address.state}, ${address.country}`,
        '',
        'Please confirm availability and delivery details. Thank you!',
      ].join('\n');
      setCart([]);
      setCheckoutOpen(false);
      setIsCartOpen(false);
      const orderWhatsappUrl = whatsappLink(message, result.whatsappPhone);
      if (whatsappWindow) {
        whatsappWindow.location.href = orderWhatsappUrl;
        setNotice('Order saved — press Send in WhatsApp to contact DITZ');
      } else {
        const chat = window.open(orderWhatsappUrl, '_blank', 'noopener,noreferrer');
        if (chat) {
          setNotice('Order saved — press Send in WhatsApp to contact DITZ');
        } else {
          setWhatsappFallbackUrl(orderWhatsappUrl);
          setNotice('Order saved. Your browser blocked the WhatsApp window.');
        }
      }
    } catch (error) {
      if (whatsappWindow) whatsappWindow.close();
      setNotice(error.message);
    } finally {
      setOrderLoading(false);
    }
  }

  function scrollToShop() {
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
    setIsMobileMenuOpen(false);
  }

  return (
    <div className="site-shell">
      <div className="announcement">
        <span>CONSIDERED EVERYDAY PIECES, MADE TO MOVE WITH YOU</span>
        <ArrowRight size={13} strokeWidth={1.6} aria-hidden="true" />
        <a href="#shop">SHOP THE COLLECTION</a>
      </div>

      <header className="site-header">
        <button
          className="icon-button mobile-menu-toggle"
          type="button"
          aria-label={isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setIsMobileMenuOpen((open) => !open)}
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <a href="#" className="wordmark" aria-label="DITZ home">
          DITZ<span className="wordmark-period">.</span>
        </a>

        <nav className={`main-nav ${isMobileMenuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
          <a href="#shop" onClick={() => setIsMobileMenuOpen(false)}>
            SHOP ALL
          </a>
          <a href="#shop" onClick={() => { setActiveCategory('Everything'); setSearchTerm(''); setIsMobileMenuOpen(false); }}>
            NEW ARRIVALS
          </a>
          <a href="#story" onClick={() => setIsMobileMenuOpen(false)}>
            OUR STORY
          </a>
          <a href="/account" onClick={() => setIsMobileMenuOpen(false)}>
            {user ? `MY ACCOUNT · ${user.username}` : 'SIGN IN / JOIN'}
          </a>
          {user?.role === 'ADMIN' && <a href="/admin" onClick={() => setIsMobileMenuOpen(false)}>DITZ STUDIO</a>}
        </nav>

        <div className="header-actions">
          <button
            className="icon-button search-toggle"
            type="button"
            aria-label="Search products"
            onClick={() => {
              setSearchOpen((open) => !open);
              window.setTimeout(() => document.getElementById('product-search')?.focus(), 0);
            }}
          >
            <Search size={20} strokeWidth={1.7} />
          </button>
          <button
            className="bag-button"
            type="button"
            aria-label={`Open bag, ${cartCount} items`}
            onClick={() => setIsCartOpen(true)}
          >
            <ShoppingBag size={19} strokeWidth={1.7} />
            <span className="bag-label">BAG</span>
            <span className="bag-count">{cartCount}</span>
          </button>
          <a href="/account" className="icon-button account-header-link" aria-label={user ? `My account, ${user.username}` : 'Sign in or create an account'}>
            <UserRound size={19} strokeWidth={1.7} />
          </a>
        </div>
      </header>

      {searchOpen && (
        <div className="search-bar">
          <Search size={17} aria-hidden="true" />
          <input
            id="product-search"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              scrollToShop();
            }}
            placeholder="Search the collection"
            aria-label="Search the collection"
          />
          <button
            className="icon-button"
            type="button"
            aria-label="Close search"
            onClick={() => {
              setSearchOpen(false);
              setSearchTerm('');
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-image" role="img" aria-label="Fashion model in a layered contemporary outfit" />
          <div className="hero-grain" aria-hidden="true" />
          <div className="hero-content">
            <span className="eyebrow hero-eyebrow">
              <span className="eyebrow-rule" />
              THE NEW EVERYDAY
            </span>
            <h1 id="hero-title">
              A little less
              <br />
              ordinary<span className="hero-period">.</span>
            </h1>
            <p>Considered pieces. Made to move with you.</p>
            <button className="button button-light hero-cta" type="button" onClick={scrollToShop}>
              DISCOVER THE COLLECTION <ArrowRight size={16} />
            </button>
            <span className="hero-edition">COLLECTION Nº 01 &nbsp;—&nbsp; DITZ STUDIO</span>
          </div>
          <button
            type="button"
            className="hero-scroll"
            onClick={scrollToShop}
            aria-label="Scroll to shop collection"
          >
            <span>SCROLL TO EXPLORE</span>
            <ArrowDown size={15} />
          </button>
          <span className="hero-index">01 / 03</span>
        </section>

        <section className="intro-strip">
          <p>MADE FOR YOUR EVERY DAY.</p>
          <span className="intro-separator">✳</span>
          <p>MADE TO FEEL LIKE YOU.</p>
          <span className="intro-separator">✳</span>
          <p>MADE TO GO PLACES.</p>
        </section>

        <section className="shop-section section-wrap" id="shop">
          <div className="section-heading">
            <div>
              <span className="eyebrow"><span className="eyebrow-rule" /> THE GOOD STUFF</span>
              <h2>Find your everyday.</h2>
            </div>
            <a className="text-link desktop-view-all" href="#shop">
              VIEW ALL PIECES <ArrowUpRight size={16} />
            </a>
          </div>

          <div className="country-pricing-control">
            <label>
              SHOPPING FROM
              <select value={countryCode} onChange={chooseCountry} aria-label="Choose your country">
                {supportedCountries.map((country) => <option value={country.code} key={country.code}>{country.name}</option>)}
              </select>
            </label>
            <p>{countryDetected ? 'Country suggested from your connection — change it anytime.' : 'Choose the country your order ships to.'} Prices without a country price use NGN.</p>
          </div>

          <div className="shop-controls">
            <div className="category-list" aria-label="Filter products by category">
              {categories.map((category) => (
                <button
                  className={`category-button ${activeCategory === category ? 'active' : ''}`}
                  type="button"
                  key={category}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
            <label className="sort-select">
              <span className="sr-only">Sort products</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option>Featured</option>
                <option>Price: low to high</option>
                <option>Price: high to low</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          </div>

          <p className="results-count">
            SHOWING {filteredProducts.length} OF {products.length} PIECES
          </p>

          {productsLoading ? (
            <div className="empty-results" role="status"><p>Finding your everyday…</p></div>
          ) : productsError ? (
            <div className="empty-results" role="alert">
              <p>{productsError}</p>
              <button className="text-link" type="button" onClick={() => setProductsRefresh((refresh) => refresh + 1)}>TRY AGAIN <ArrowRight size={15} /></button>
            </div>
          ) : filteredProducts.length ? (
            <div className="product-grid">
              {filteredProducts.map((product, index) => (
                <article
                  className={`product-card ${index === 1 || index === 6 ? 'product-card-offset' : ''}`}
                  key={product.id}
                >
                  <button
                    type="button"
                    className="product-image-button"
                    onClick={() => {
                      setSelectedProduct(product);
                      setSelectedSize('');
                    }}
                    aria-label={`View ${product.name}`}
                  >
                    <img
                      src={product.image}
                      alt={product.imageAlt}
                      loading="lazy"
                      className="product-image"
                    />
                    {product.tag && <span className="product-tag">{product.tag}</span>}
                    <span className="quick-add">
                      QUICK VIEW <ArrowUpRight size={14} />
                    </span>
                  </button>
                  <div className="product-info">
                    <div>
                      <h3>{product.name}</h3>
                      <p>{product.category} <span className="product-dot">·</span> {product.color}</p>
                    </div>
                    <span className="product-price">{formatPrice(productPrice(product, countryCode).minor, productPrice(product, countryCode).currency)}</span>
                  </div>
                  <div className="product-swatches" aria-label={`Colour: ${product.color}`}>
                    <span style={{ backgroundColor: product.colorCode }} />
                    <span className="swatch-caption">{product.color}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-results">
              <p>{products.length ? 'No pieces found just yet.' : 'Our next collection is on its way.'}</p>
              <button
                className="text-link"
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setActiveCategory('Everything');
                }}
              >
                CLEAR FILTERS <ArrowRight size={15} />
              </button>
            </div>
          )}
          <button className="button button-outline mobile-view-all" type="button" onClick={() => setActiveCategory('Everything')}>
            EXPLORE ALL PIECES <ArrowRight size={16} />
          </button>
        </section>

        <section className="story-section" id="story">
          <div className="story-image-wrap">
            <img
              src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1300&q=85"
              alt="Friends enjoying a slow afternoon together"
              loading="lazy"
            />
            <span className="story-image-label">GOOD THINGS, WORN OFTEN.</span>
          </div>
          <div className="story-copy">
            <span className="eyebrow"><span className="eyebrow-rule" /> A NOTE FROM US</span>
            <h2>Clothes should feel like <em>you.</em></h2>
            <p>
              Not more. Not louder. Just the pieces you reach for again and again — thoughtfully made,
              easy to live in, and always your own.
            </p>
            <p className="story-signoff">Made for wherever life takes you.</p>
            <a href="#shop" className="text-link">
              A LITTLE MORE ABOUT DITZ <ArrowUpRight size={16} />
            </a>
          </div>
          <span className="story-mark" aria-hidden="true">D.</span>
        </section>

        <section className="values-strip">
          <div>
            <span className="value-number">01</span>
            <h3>FEEL-GOOD FABRICS</h3>
            <p>Soft, considered, and made for real life.</p>
          </div>
          <div>
            <span className="value-number">02</span>
            <h3>MADE FOR EVERYONE</h3>
            <p>Unisex shapes. Your style, your way.</p>
          </div>
          <div>
            <span className="value-number">03</span>
            <h3>LESS, BUT BETTER</h3>
            <p>Pieces worth keeping in the rotation.</p>
          </div>
        </section>

        <section className="newsletter">
          <span className="eyebrow"><span className="eyebrow-rule" /> LET'S STAY IN TOUCH</span>
          <h2>A little help, <em>when you need it.</em></h2>
          <p>Questions about a piece, your order, or finding your fit? We’re here.</p>
          <a
            className="button button-dark"
            href={whatsappLink('Hello DITZ! I have a question about the collection.')}
            target="_blank"
            rel="noreferrer"
          >
            MESSAGE US ON WHATSAPP <ArrowUpRight size={16} />
          </a>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-main">
          <div className="footer-brand">
            <a href="#" className="wordmark footer-wordmark" aria-label="DITZ home">
              DITZ<span className="wordmark-period">.</span>
            </a>
            <p>A little less ordinary.<br />Made for everywhere.</p>
            {instagramUrl && (
              <a
                className="social-link"
                href={instagramUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Visit DITZ on Instagram"
              >
                <Instagram size={18} /> FOLLOW ALONG
              </a>
            )}
          </div>
          <div className="footer-column">
            <h3>COME ON IN</h3>
            <a href="#shop">Shop all</a>
            <a href="#shop">New arrivals</a>
            <a href="#story">Our story</a>
          </div>
          <div className="footer-column">
            <h3>THE SMALL PRINT</h3>
            <a href={whatsappLink('Hello DITZ! Could you share your shipping and delivery information?')} target="_blank" rel="noreferrer">Shipping &amp; delivery</a>
            <a href={whatsappLink('Hello DITZ! Could you share your returns and exchanges information?')} target="_blank" rel="noreferrer">Returns &amp; exchanges</a>
            <a href={whatsappLink('Hello DITZ! Could you share your privacy policy and terms?')} target="_blank" rel="noreferrer">Privacy &amp; terms</a>
          </div>
          <div className="footer-contact">
            <h3>NEED A HAND?</h3>
            <p>We’re just a message away.</p>
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              CHAT WITH US <ArrowUpRight size={15} />
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 DITZ. MADE WITH CARE.</span>
          <span>{supportedCountries.find((country) => country.code === countryCode)?.name.toUpperCase()} &nbsp; · &nbsp; {currencyByCountry[countryCode]}</span>
          <a href="#" className="back-to-top">BACK TO TOP ↑</a>
        </div>
      </footer>

      {notice && (
        <div className="toast" role="status">
          <Check size={17} /> {notice}
          {whatsappFallbackUrl && <a href={whatsappFallbackUrl} target="_blank" rel="noreferrer">OPEN WHATSAPP</a>}
        </div>
      )}

      {selectedProduct && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedProduct(null);
        }}>
          <section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <button className="icon-button modal-close" type="button" onClick={() => setSelectedProduct(null)} aria-label="Close product details">
              <X size={21} />
            </button>
            <div className="modal-image-wrap">
              <img src={selectedProduct.image} alt={selectedProduct.imageAlt} />
              {selectedProduct.tag && <span className="product-tag">{selectedProduct.tag}</span>}
            </div>
            <div className="modal-details">
              <span className="eyebrow"><span className="eyebrow-rule" /> {selectedProduct.category.toUpperCase()}</span>
              <h2 id="modal-title">{selectedProduct.name}</h2>
              <p className="modal-price">{formatPrice(productPrice(selectedProduct, countryCode).minor, productPrice(selectedProduct, countryCode).currency)}</p>
              <p className="modal-description">{selectedProduct.description}</p>
              <div className="modal-color">
                <span>COLOUR</span>
                <span className="modal-color-choice">
                  <i style={{ backgroundColor: selectedProduct.colorCode }} />
                  {selectedProduct.color}
                </span>
              </div>
              <div className="size-heading">
                <span>SELECT A SIZE</span>
                <button type="button" className="size-guide" onClick={() => setNotice('For fit help, message us on WhatsApp')}>
                  SIZE GUIDE
                </button>
              </div>
              <div className="size-options">
                {selectedProduct.sizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={selectedSize === size ? 'selected' : ''}
                    onClick={() => setSelectedSize(size)}
                    aria-pressed={selectedSize === size}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <button className="button button-dark add-to-bag" type="button" onClick={() => addToCart(selectedProduct, selectedSize)} disabled={selectedProduct.stock < 1}>
                {selectedProduct.stock < 1 ? 'CURRENTLY OUT OF STOCK' : `ADD TO BAG — ${formatPrice(productPrice(selectedProduct, countryCode).minor, productPrice(selectedProduct, countryCode).currency)}`} <ShoppingBag size={16} />
              </button>
              <p className="modal-footnote">Delivery details are confirmed with us over WhatsApp.</p>
            </div>
          </section>
        </div>
      )}

      {isCartOpen && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsCartOpen(false);
        }}>
          <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
            <div className="drawer-header">
              <div>
                <span className="eyebrow"><span className="eyebrow-rule" /> YOUR GOOD THINGS</span>
                <h2 id="cart-title">Your bag <span>({cartCount})</span></h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsCartOpen(false)} aria-label="Close bag">
                <X size={21} />
              </button>
            </div>

            {cart.length ? (
              <>
                <div className="cart-items">
                  {cartLines.map((item) => (
                    <article className="cart-item" key={`${item.productId}-${item.size}`}>
                      <img src={item.product?.image} alt="" />
                      <div className="cart-item-copy">
                        <h3>{item.product?.name || 'Product no longer available'}</h3>
                        <p>{item.product?.color} · {item.size}</p>
                        <div className="quantity-control">
                          <button type="button" aria-label={`Remove one ${item.product?.name || 'item'}`} onClick={() => updateQuantity(item.productId, item.size, -1)}>
                            <Minus size={13} />
                          </button>
                          <span>{item.quantity}</span>
                          <button type="button" aria-label={`Add one ${item.product?.name || 'item'}`} onClick={() => updateQuantity(item.productId, item.size, 1)}>
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                      <span className="cart-item-price">{formatPrice(item.priceMinor * item.quantity, item.currency)}</span>
                    </article>
                  ))}
                </div>
                <div className="cart-footer">
                  <div className="cart-subtotal">
                    <span>SUBTOTAL</span>
                    <strong>{formatPrice(cartTotal, cartCurrency)}</strong>
                  </div>
                  <p>Shipping details and delivery fees are confirmed before your order is finalized.</p>
                  {!checkoutOpen ? (
                    <button className="button button-dark checkout-button" type="button" onClick={() => setCheckoutOpen(true)}>
                      CONTINUE TO CHECKOUT <ArrowRight size={16} />
                    </button>
                  ) : !user ? (
                    <div className="checkout-account-prompt">
                      <p>Sign in or create a free account to save your shipping address and continue.</p>
                      <a className="button button-dark checkout-button" href="/account">SIGN IN OR CREATE ACCOUNT <ArrowRight size={16} /></a>
                    </div>
                  ) : addresses.length === 0 ? (
                    <div className="checkout-account-prompt">
                      <p>Add your shipping address once. You can use it for WhatsApp or online orders.</p>
                      <a className="button button-dark checkout-button" href="/account">ADD SHIPPING ADDRESS <ArrowRight size={16} /></a>
                    </div>
                  ) : (
                    <form className="checkout-form" onSubmit={startCheckout}>
                      <label className="checkout-address-select">
                        SHIPPING ADDRESS
                        <select value={selectedAddressId} onChange={(event) => setSelectedAddressId(event.target.value)} required>
                          {addresses.map((address) => <option key={address.id} value={address.id}>{address.recipient} · {address.city}, {address.state}</option>)}
                        </select>
                      </label>
                      <div className="checkout-methods" role="radiogroup" aria-label="Choose how to order">
                        <label className={paymentMethod === 'WHATSAPP' ? 'selected' : ''}>
                          <input type="radio" name="paymentMethod" value="WHATSAPP" checked={paymentMethod === 'WHATSAPP'} onChange={() => setPaymentMethod('WHATSAPP')} />
                          <span><strong>WhatsApp</strong><small>We confirm delivery with you</small></span>
                        </label>
                        <label className={`${paymentMethod === 'PAYSTACK' ? 'selected' : ''} ${activeAddress?.country !== 'NG' ? 'disabled' : ''}`}>
                          <input type="radio" name="paymentMethod" value="PAYSTACK" checked={paymentMethod === 'PAYSTACK'} onChange={() => setPaymentMethod('PAYSTACK')} disabled={activeAddress?.country !== 'NG'} />
                          <span><strong>Pay online</strong><small>{activeAddress?.country === 'NG' ? 'Secure Paystack checkout' : 'Available for Nigeria orders'}</small></span>
                        </label>
                      </div>
                      <button className="button button-dark checkout-button" type="submit" disabled={orderLoading}>
                        {orderLoading ? 'PREPARING YOUR ORDER…' : paymentMethod === 'PAYSTACK' ? 'CONTINUE TO SECURE PAYMENT' : 'SAVE ORDER & CONTINUE TO WHATSAPP'} <ArrowRight size={16} />
                      </button>
                      <p className="checkout-disclaimer">
                        {paymentMethod === 'WHATSAPP'
                          ? 'Your order is saved first. Press Send in WhatsApp to contact us.'
                          : 'Payment is confirmed by Paystack and DITZ’s server.'}
                      </p>
                      <button className="back-to-bag" type="button" onClick={() => setCheckoutOpen(false)}>
                        <ArrowLeft size={14} /> BACK TO BAG
                      </button>
                    </form>
                  )}
                  <span className="secure-note"><Heart size={13} /> A little less ordinary. Always.</span>
                </div>
              </>
            ) : (
              <div className="empty-cart">
                <ShoppingBag size={26} strokeWidth={1.3} />
                <h3>Nothing in here. Yet.</h3>
                <p>Your next everyday favourite might be waiting.</p>
                <button className="button button-dark" type="button" onClick={() => setIsCartOpen(false)}>
                  FIND YOUR EVERYDAY <ArrowRight size={15} />
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
