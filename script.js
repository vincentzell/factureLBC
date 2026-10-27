document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (!el || value === null || value === undefined || value === '') return;
    if (el.tagName === 'SELECT') {
      let option = Array.from(el.options).find(o => o.value === value);
      if (!option) {
        option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        el.appendChild(option);
      }
    }
    el.value = value;
  }

  function decodeQuotedPrintable(str) {
    str = str.replace(/=\r?\n/g, '');
    str = str.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    return str;
  }

  function htmlToText(html) {
    let text = html;
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/(p|div|tr|li|td|h\d|table)>/gi, '\n');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&euro;/gi, '€');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&apos;/gi, "'");
    text = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text;
  }

  function parseEmailDate(text) {
    const m = text.match(/^Date:\s*(.+)$/mi);
    if (!m) return '';
    const dateStr = m[1].trim();
    const dayM = dateStr.match(/(\d{1,2})\s+[A-Za-z]{3}/);
    const monthM = dateStr.match(/\d{1,2}\s+([A-Za-z]{3})/);
    const yearM = dateStr.match(/\s(\d{4})/);
    if (!dayM || !monthM || !yearM) return '';
    const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const month = months[monthM[1]];
    if (!month) return '';
    return `${yearM[1]}-${month}-${dayM[1].padStart(2, '0')}`;
  }

  function cleanNumber(value) {
    if (!value) return '';
    return value.replace(/\s/g, '').replace(',', '.');
  }

  function parseLeboncoin(raw) {
    const decoded = decodeQuotedPrintable(raw);
    const text = htmlToText(decoded);
    const result = {};

    const buyerM = text.match(/Bonjour\s+([^,\n]+),/i);
    if (buyerM) result.buyerName = buyerM[1].trim();
    const buyerLabel = text.match(/(?:acheteur|client|nom)\s*[:\-]\s*([^\n]+)/i);
    if (!result.buyerName && buyerLabel) result.buyerName = buyerLabel[1].trim();

    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    const allPrices = [...text.matchAll(/(\d[\d\s.,]*)\s*€/g)].map(m => cleanNumber(m[1]));

    const txM = text.match(/(?:numéro|numero|n°)?\s*de\s*transaction\s*[:\-]?\s*(\d{6,})/i)
      || text.match(/transaction\s*(?:n°|numéro|numero|#)?\s*[:\-]?\s*(\d{6,})/i)
      || text.match(/(?:commande|référence|reference)\s*(?:n°|numéro|numero|#)?\s*[:\-]?\s*(\d{6,})/i);
    if (txM) result.transactionId = txM[1].trim();
    if (!result.transactionId) {
      const longNum = text.match(/\b(\d{8,})\b/);
      if (longNum) result.transactionId = longNum[1];
    }

    const itemM = text.match(/([A-Za-zÀ-ÿ0-9][^\n€]{2,}?)\s+(\d[\d\s.,]*)\s*€/);
    if (itemM) {
      result.itemTitle = itemM[1].trim();
      result.itemPrice = cleanNumber(itemM[2]);
    }

    if (!result.itemTitle) {
      for (let i = 0; i < lines.length; i++) {
        if (/\d[\d\s.,]*\s*€/.test(lines[i]) && !/frais|livraison|total|transaction/i.test(lines[i])) {
          if (i > 0 && !/€/.test(lines[i - 1])) {
            result.itemTitle = lines[i - 1];
          } else {
            const beforePrice = lines[i].replace(/\d[\d\s.,]*\s*€.*$/, '').trim();
            if (beforePrice.length > 2) result.itemTitle = beforePrice;
          }
          if (!result.itemPrice) {
            const pm = lines[i].match(/(\d[\d\s.,]*)\s*€/);
            if (pm) result.itemPrice = cleanNumber(pm[1]);
          }
          break;
        }
      }
    }

    const shipM = text.match(/frais de livraison[^\n€]*?(\d[\d\s.,]*)\s*€/i);
    if (shipM) result.shippingFee = cleanNumber(shipM[1]);
    const lbcM = text.match(/frais de (?:transaction|commission|leboncoin|sécurisée)[^\n€]*?(\d[\d\s.,]*)\s*€/i);
    if (lbcM) result.lbcFee = cleanNumber(lbcM[1]);
    const totalM = text.match(/total (?:payé|paye|total)[^\n€]*?(\d[\d\s.,]*)\s*€/i);
    if (totalM) result.totalPrice = cleanNumber(totalM[1]);

    if (!result.totalPrice && result.itemPrice && (result.shippingFee || result.lbcFee)) {
      const sum = (parseFloat(result.itemPrice) || 0) + (parseFloat(result.shippingFee) || 0) + (parseFloat(result.lbcFee) || 0);
      if (sum > 0) result.totalPrice = sum.toFixed(2);
    }

    if (!result.itemPrice && allPrices.length) {
      const feeValues = [result.shippingFee, result.lbcFee, result.totalPrice].filter(Boolean);
      const candidate = allPrices.find(p => !feeValues.includes(p));
      if (candidate) result.itemPrice = candidate;
    }

    const addrM = text.match(/adresse suivante\s*:\s*(.+?)(?:Voir le point|Merci|L['’]équipe|$)/is);
    if (addrM) {
      result.buyerAddress = addrM[1].replace(/\s+/g, ' ').trim();
    } else {
      const postalM = text.match(/([A-Z][A-Z\s]{5,})\s+(\d{5})\s+([A-Z][A-Z\s]+)/);
      if (postalM) result.buyerAddress = `${postalM[1].trim()} ${postalM[2]} ${postalM[3].trim()}`.replace(/\s+/g, ' ');
    }

    const saleDate = parseEmailDate(decoded);
    if (saleDate) result.saleDate = saleDate;

    if (/transaction s[ée]curis[ée]e/i.test(text)) {
      result.paymentMethod = 'Transaction sécurisée Leboncoin';
    }

    const lineMatch = (label) => {
      const re = new RegExp(label + '\\s*[:\\-]\\s*(.+)', 'i');
      const m = text.match(re);
      return m ? m[1].trim() : '';
    };
    if (!result.sellerName) result.sellerName = lineMatch('vendeur') || lineMatch('vendu par');
    if (!result.itemTitle) result.itemTitle = lineMatch('objet') || lineMatch('article') || lineMatch('annonce') || lineMatch('produit') || lineMatch('désignation');
    if (!result.itemDescription) result.itemDescription = lineMatch('description') || lineMatch('détails');
    if (!result.itemPrice) {
      const priceM = text.match(/(?:prix|montant|price)\s*[:\-]?\s*([\d\s.,]+)\s*€?/i);
      if (priceM) result.itemPrice = cleanNumber(priceM[1]);
    }
    if (!result.transactionId) {
      const txM2 = text.match(/(?:commande|référence|reference|transaction|n°\s*annonce|annonce)\s*(?:n°|numéro|numero|#)?\s*[:\-]?\s*([A-Za-z0-9\-]+)/i);
      if (txM2) result.transactionId = txM2[1].trim();
    }
    if (!result.saleDate) {
      const dateM = text.match(/date\s*[:\-]?\s*(\d{1,2}[\/\-\.\\s]\d{1,2}[\/\-\.\\s]\d{2,4})/i);
      if (dateM) {
        const parts = dateM[1].trim().split(/[\/\-\.\\s]+/);
        if (parts.length === 3) {
          let [d, m, y] = parts;
          if (y.length === 2) y = '20' + y;
          result.saleDate = `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
      }
    }
    const sellerAddr = lineMatch('adresse vendeur') || lineMatch('adresse du vendeur');
    if (sellerAddr) result.sellerAddress = sellerAddr;
    const buyerAddr2 = lineMatch('adresse acheteur') || lineMatch('adresse de l.acheteur') || lineMatch('adresse de livraison');
    if (buyerAddr2 && !result.buyerAddress) result.buyerAddress = buyerAddr2;

    return result;
  }

  const pdfInput = document.getElementById('pdfInput');
  const pdfStatus = document.getElementById('pdfStatus');
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  async function extractPdfText(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map(item => item.str);
      fullText += strings.join(' ') + '\n';
    }
    return fullText;
  }

  if (pdfInput) {
    pdfInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      pdfStatus.textContent = 'Lecture du PDF...';
      try {
        const text = await extractPdfText(file);
        console.log('PDF text:', text);
        const data = parseLeboncoin(text);
        console.log('Parsed data:', data);
        Object.keys(data).forEach(k => setValue(k, data[k]));
        const filled = Object.keys(data).length;
        pdfStatus.textContent = filled ? `PDF analysé : ${filled} champ(s) rempli(s).` : 'Aucun champ reconnu dans le PDF.';
      } catch (err) {
        pdfStatus.textContent = 'Erreur lors de la lecture du PDF.';
        console.error(err);
      }
    });
  }

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
    document.getElementById('cShip').textContent = g('shippingFee') || '0';
    document.getElementById('cLbc').textContent = g('lbcFee') || '0';
    document.getElementById('cTotal').textContent = g('totalPrice') || '0';
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
    cert.classList.add('hidden');
    if (pdfStatus) pdfStatus.textContent = '';
  });
});