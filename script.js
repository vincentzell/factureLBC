document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  const parseBtn = document.getElementById('parseBtn');
  const clearPasteBtn = document.getElementById('clearPasteBtn');
  const pasteInput = document.getElementById('pasteInput');
  const parseStatus = document.getElementById('parseStatus');

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el && value) el.value = value;
  }

  function parseLeboncoin(text) {
    const result = {};
    const lineMatch = (label) => {
      const re = new RegExp(label + '\\s*[:\\-]\\s*(.+)', 'i');
      const m = text.match(re);
      return m ? m[1].trim() : '';
    };

    result.sellerName = lineMatch('vendeur') || lineMatch('vendu par');
    result.buyerName = lineMatch('acheteur') || lineMatch('acheté par');
    result.itemTitle = lineMatch('objet') || lineMatch('article') || lineMatch('annonce') || lineMatch('produit');
    result.itemDescription = lineMatch('description') || lineMatch('détails');

    const priceM = text.match(/(?:prix|montant|total)\s*[:\-]?\s*([\d\s.,]+)\s*€?/i);
    if (priceM) {
      result.itemPrice = priceM[1].replace(/\s/g, '').replace(',', '.');
    }

    const txM = text.match(/(?:commande|référence|transaction|n°\s*annonce|annonce)\s*(?:n°|numéro|#)?\s*[:\-]?\s*([A-Za-z0-9\-]+)/i);
    if (txM) result.transactionId = txM[1].trim();

    const dateM = text.match(/date\s*[:\-]?\s*(\d{1,2}[\/\-\.\\s]\d{1,2}[\/\-\.\\s]\d{2,4})/i);
    if (dateM) {
      const parts = dateM[1].trim().split(/[\/\-\.\\s]+/);
      if (parts.length === 3) {
        let [d, m, y] = parts;
        if (y.length === 2) y = '20' + y;
        result.saleDate = `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }

    const payM = text.match(/(?:paiement|mode de paiement)\s*[:\-]?\s*(.+)/i);
    if (payM) {
      const pay = payM[1].trim();
      const select = document.getElementById('paymentMethod');
      const option = Array.from(select.options).find(o => o.value.toLowerCase() === pay.toLowerCase());
      if (option) result.paymentMethod = option.value;
      else result.paymentMethod = pay;
    }

    const sellerAddr = lineMatch('adresse vendeur') || lineMatch('adresse du vendeur');
    if (sellerAddr) result.sellerAddress = sellerAddr;
    const buyerAddr = lineMatch('adresse acheteur') || lineMatch('adresse de l.acheteur');
    if (buyerAddr) result.buyerAddress = buyerAddr;

    return result;
  }

  parseBtn.addEventListener('click', () => {
    const text = pasteInput.value.trim();
    if (!text) {
      parseStatus.textContent = 'Colle d\'abord une confirmation.';
      return;
    }
    const data = parseLeboncoin(text);
    Object.keys(data).forEach(k => setValue(k, data[k]));
    const filled = Object.keys(data).length;
    parseStatus.textContent = filled ? `${filled} champ(s) rempli(s) automatiquement. Vérifie et complète.` : 'Aucun champ reconnu. Remplis manuellement.';
  });

  clearPasteBtn.addEventListener('click', () => {
    pasteInput.value = '';
    parseStatus.textContent = '';
  });

  const generateBtn = document.getElementById('generateBtn');
  const printBtn = document.getElementById('printBtn');
  const resetBtn = document.getElementById('resetBtn');
  const cert = document.getElementById('certificate');

  function formatDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }

  generateBtn.addEventListener('click', () => {
    const form = document.getElementById('saleForm');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const g = (id) => document.getElementById(id).value.trim();
    document.getElementById('cSeller').textContent = g('sellerName');
    document.getElementById('cSellerAddr').textContent = g('sellerAddress') || '—';
    document.getElementById('cBuyer').textContent = g('buyerName');
    document.getElementById('cBuyerAddr').textContent = g('buyerAddress') || '—';
    document.getElementById('cItem').textContent = g('itemTitle');
    document.getElementById('cDesc').textContent = g('itemDescription') || '—';
    document.getElementById('cPrice').textContent = g('itemPrice');
    document.getElementById('cDate').textContent = formatDate(g('saleDate'));
    document.getElementById('cPay').textContent = g('paymentMethod') || '—';
    document.getElementById('cTx').textContent = g('transactionId') || '—';
    document.getElementById('cToday').textContent = new Date().toLocaleDateString('fr-FR');
    cert.classList.remove('hidden');
    cert.scrollIntoView({ behavior: 'smooth' });
  });

  printBtn.addEventListener('click', () => {
    if (cert.classList.contains('hidden')) {
      generateBtn.click();
    }
    setTimeout(() => window.print(), 200);
  });

  resetBtn.addEventListener('click', () => {
    document.getElementById('saleForm').reset();
    pasteInput.value = '';
    parseStatus.textContent = '';
    cert.classList.add('hidden');
  });
});