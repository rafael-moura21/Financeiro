// ============================================================
// CONFIGURAÇÃO — preencha com seus dados após criar o projeto
// no Google Cloud Console (veja README.md)
// ============================================================
const CONFIG = {
  CLIENT_ID: '75059835538-8j6hih1r8r0h508cnfa8et440ga814gb.apps.googleusercontent.com',        // Google OAuth Client ID
  API_KEY: 'AIzaSyDtZiz6oN6ey_O1Oe3TxBpFniCxtN3FwN4',            // Google API Key
  SHEET_ID: '1BnvbHIM6vFIONsHvPCvtQyHXlhIYqBrgV8cnneyzN8E',                            // Preenchido automaticamente ao criar
  DISCOVERY_DOCS: [
    'https://sheets.googleapis.com/$discovery/rest?version=v4'
  ],
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'
};

// ============================================================
// ESTADO GLOBAL
// ============================================================
const state = {
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  anualYear: new Date().getFullYear(),
  lancamentos: [],
  tipoSelecionado: 'debito',
  sheetId: localStorage.getItem('sheetId') || '',
  isSignedIn: false
};

const CATEGORIAS = [
  { nome: 'Alimentação',           icon: '🍽️', cor: '#FAECE7', corVal: '#993C1D', corBar: '#D85A30', tipo: 'debito' },
  { nome: 'Transporte',            icon: '🚗', cor: '#E6F1FB', corVal: '#185FA5', corBar: '#378ADD', tipo: 'debito' },
  { nome: 'Saúde',                 icon: '💊', cor: '#EAF3DE', corVal: '#3B6D11', corBar: '#639922', tipo: 'debito' },
  { nome: 'Lazer',                 icon: '🎮', cor: '#FBEAF0', corVal: '#993556', corBar: '#D4537E', tipo: 'debito' },
  { nome: 'Moradia',               icon: '🏠', cor: '#FEF3E2', corVal: '#92520A', corBar: '#D4820A', tipo: 'debito' },
  { nome: 'Salário',               icon: '💰', cor: '#E1F5EE', corVal: '#0F6E56', corBar: '#1D9E75', tipo: 'credito' },
  { nome: 'Reembolso',             icon: '↩️', cor: '#E1F5EE', corVal: '#0F6E56', corBar: '#1D9E75', tipo: 'credito' },
  { nome: 'Ajuste Caixa',          icon: '⚖️', cor: '#E1F5EE', corVal: '#0F6E56', corBar: '#1D9E75', tipo: 'credito' },
  { nome: 'Saldo M-1',             icon: '📅', cor: '#E1F5EE', corVal: '#0F6E56', corBar: '#1D9E75', tipo: 'credito' },
  { nome: 'Investimento',          icon: '📈', cor: '#EEEDFE', corVal: '#534AB7', corBar: '#7F77DD', tipo: 'transferencia' },
  { nome: 'Reserva de Emergência', icon: '🛡️', cor: '#E1F5EE', corVal: '#0F6E56', corBar: '#5DCAA5', tipo: 'transferencia' },
];

// Categorias filtradas por tipo
const CATS_POR_TIPO = {
  debito:       CATEGORIAS.filter(c => c.tipo === 'debito'),
  credito:      CATEGORIAS.filter(c => c.tipo === 'credito'),
  transferencia: CATEGORIAS.filter(c => c.tipo === 'transferencia'),
};

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const MESES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

// ============================================================
// UTILITÁRIOS
// ============================================================
function fmt(val) {
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtCompact(val) {
  const n = Number(val);
  if (n >= 1000) return 'R$ ' + (n/1000).toFixed(1).replace('.',',') + 'k';
  return 'R$ ' + Math.round(n).toLocaleString('pt-BR');
}

function showLoading(msg = 'Carregando...') {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.className = 'loading-overlay';
    el.innerHTML = `<div class="spinner"></div><span>${msg}</span>`;
    document.body.appendChild(el);
  } else {
    el.querySelector('span').textContent = msg;
    el.classList.remove('hidden');
  }
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.add('hidden');
}

// ============================================================
// GOOGLE AUTH
// ============================================================
function initGoogleAPI() {
  // Carrega a biblioteca do Google Identity Services
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.onload = () => initOAuth();
  document.head.appendChild(script);

  // Carrega a biblioteca gapi para Sheets
  const gapiScript = document.createElement('script');
  gapiScript.src = 'https://apis.google.com/js/api.js';
  gapiScript.onload = () => {
    gapi.load('client', async () => {
      await gapi.client.init({
        apiKey: CONFIG.API_KEY,
        discoveryDocs: CONFIG.DISCOVERY_DOCS,
      });
    });
  };
  document.head.appendChild(gapiScript);
}

let tokenClient;

function initOAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: async (response) => {
      if (response.error) return;
      state.isSignedIn = true;
      localStorage.setItem('gToken', response.access_token);
      await onSignIn();
    }
  });

  // Verifica se tem token salvo
  const savedToken = localStorage.getItem('gToken');
  if (savedToken) {
    gapi.client.setToken({ access_token: savedToken });
    state.isSignedIn = true;
    onSignIn();
  }
}

function handleLogin() {
  if (CONFIG.CLIENT_ID === 'SEU_CLIENT_ID_AQUI') {
    alert('⚠️ Configure seu CLIENT_ID e API_KEY no arquivo app.js antes de usar.\n\nVeja o README.md para instruções.');
    return;
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

async function onSignIn() {
  document.getElementById('auth-screen').classList.add('hidden');
  state.sheetId = CONFIG.SHEET_ID || localStorage.getItem('sheetId') || '';

  if (!state.sheetId) {
    document.getElementById('setup-screen').classList.remove('hidden');
  } else {
    await loadAndShowApp();
  }
}

// ============================================================
// GOOGLE SHEETS — SETUP
// ============================================================
async function createSheet() {
  document.getElementById('setup-loading').classList.remove('hidden');

  try {
    // Cria a planilha
    const res = await gapi.client.sheets.spreadsheets.create({
      resource: {
        properties: { title: 'Meu Financeiro - Controle' },
        sheets: [
          { properties: { title: 'Lançamentos' } },
          { properties: { title: 'Categorias' } },
          { properties: { title: 'Contas' } },
        ]
      }
    });

    const sheetId = res.result.spreadsheetId;
    localStorage.setItem('sheetId', sheetId);
    state.sheetId = sheetId;

    // Cria cabeçalhos
    await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      resource: {
        valueInputOption: 'RAW',
        data: [
          {
            range: 'Lançamentos!A1:F1',
            values: [['Data', 'Descrição', 'Valor', 'Tipo', 'Categoria', 'Conta']]
          },
          {
            range: 'Categorias!A1:A7',
            values: [['Alimentação'],['Transporte'],['Saúde'],['Lazer'],['Salário'],['Investimento'],['Reserva de Emergência']]
          },
          {
            range: 'Contas!A1:A1',
            values: [['PicPay']]
          }
        ]
      }
    });

    document.getElementById('setup-step-1').classList.add('hidden');
    document.getElementById('setup-step-2').classList.remove('hidden');

  } catch (err) {
    console.error(err);
    alert('Erro ao criar planilha. Verifique as configurações e tente novamente.');
    document.getElementById('setup-loading').classList.add('hidden');
  }
}

async function loadAndShowApp() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  showLoading('Carregando seus dados...');
  await loadLancamentos();
  hideLoading();
  renderAll();
}

// ============================================================
// GOOGLE SHEETS — LEITURA
// ============================================================
async function loadLancamentos() {
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.sheetId,
      range: 'Lançamentos!A2:F'
    });

    const rows = res.result.values || [];
    state.lancamentos = rows.map((r, i) => ({
      id: i,
      data: r[0] || '',
      descricao: r[1] || '',
      valor: parseFloat(r[2]) || 0,
      tipo: r[3] || 'debito',
      categoria: r[4] || '',
      conta: r[5] || 'PicPay',
    }));
  } catch (err) {
    console.error('Erro ao carregar:', err);
    // Token expirou — força novo login
    if (err.status === 401) {
      localStorage.removeItem('gToken');
      location.reload();
    }
  }
}

// ============================================================
// GOOGLE SHEETS — ESCRITA
// ============================================================
async function saveLancamento(lanc) {
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: state.sheetId,
    range: 'Lançamentos!A:F',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [[
        lanc.data,
        lanc.descricao,
        lanc.valor,
        lanc.tipo,
        lanc.categoria,
        lanc.conta
      ]]
    }
  });
}

async function deleteLancamento(rowIndex) {
  // rowIndex é 0-based na nossa array; na planilha é linha rowIndex+2 (cabeçalho na linha 1)
  const sheetRowIndex = rowIndex + 1; // 0-based para API

  // Primeiro precisamos obter o sheetId interno da aba Lançamentos
  const meta = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: state.sheetId,
    fields: 'sheets.properties'
  });

  const sheetTabId = meta.result.sheets.find(s => s.properties.title === 'Lançamentos').properties.sheetId;

  await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: state.sheetId,
    resource: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheetTabId,
            dimension: 'ROWS',
            startIndex: sheetRowIndex,
            endIndex: sheetRowIndex + 1
          }
        }
      }]
    }
  });
}

// ============================================================
// FILTROS POR MÊS
// ============================================================
function getLancamentosMes(month, year) {
  return state.lancamentos.filter(l => {
    if (!l.data) return false;
    const [d, m, y] = l.data.split('/').map(Number);
    return m === month + 1 && y === year;
  });
}

function getLancamentosAno(year) {
  return state.lancamentos.filter(l => {
    if (!l.data) return false;
    const parts = l.data.split('/');
    return parseInt(parts[2]) === year;
  });
}

// ============================================================
// RENDER HOME
// ============================================================
function renderHome() {
  const m = state.currentMonth, y = state.currentYear;
  document.getElementById('home-month-label').textContent = `${MESES[m]} ${y}`;

  const lancs = getLancamentosMes(m, y);

  let entradas = 0, saidas = 0, guardado = 0;
  lancs.forEach(l => {
    if (l.tipo === 'credito') entradas += l.valor;
    else if (l.tipo === 'transferencia') guardado += l.valor;
    else saidas += l.valor;
  });

  const saldo = entradas - saidas - guardado;
  document.getElementById('home-saldo').textContent = fmt(saldo);
  document.getElementById('home-entradas').textContent = fmtCompact(entradas);
  document.getElementById('home-saidas').textContent = fmtCompact(saidas);
  document.getElementById('home-guardado').textContent = fmtCompact(guardado);

  // Categorias
  const catEl = document.getElementById('home-categorias');
  const despesas = lancs.filter(l => l.tipo === 'debito');
  const totalDespesas = despesas.reduce((a,b) => a + b.valor, 0);

  if (despesas.length === 0) {
    catEl.innerHTML = '<div class="empty-state">Nenhuma despesa ainda</div>';
  } else {
    const porCat = {};
    despesas.forEach(l => { porCat[l.categoria] = (porCat[l.categoria] || 0) + l.valor; });
    const sorted = Object.entries(porCat).sort((a,b) => b[1]-a[1]);

    catEl.innerHTML = sorted.map(([cat, val]) => {
      const info = CATEGORIAS.find(c => c.nome === cat) || { icon: '📦', cor: '#f0f0f0', corVal: '#333', corBar: '#888' };
      const pct = totalDespesas > 0 ? Math.round((val/totalDespesas)*100) : 0;
      return `<div class="categoria-item">
        <div class="cat-icon" style="background:${info.cor}">${info.icon}</div>
        <div class="cat-info">
          <div class="cat-nome">${cat}</div>
          <div class="cat-bar-bg"><div class="cat-bar" style="width:${pct}%;background:${info.corBar}"></div></div>
        </div>
        <div class="cat-val" style="color:${info.corVal}">${fmtCompact(val)}</div>
      </div>`;
    }).join('');
  }

  // Últimos lançamentos
  const ultimosEl = document.getElementById('home-ultimos');
  const ultimos = [...lancs].reverse().slice(0, 5);
  if (ultimos.length === 0) {
    ultimosEl.innerHTML = '<div class="empty-state">Nenhum lançamento ainda</div>';
  } else {
    ultimosEl.innerHTML = ultimos.map(l => renderLancamentoItem(l)).join('');
  }
}

// ============================================================
// RENDER LANÇAMENTOS
// ============================================================
function renderLancamentos() {
  const m = state.currentMonth, y = state.currentYear;
  document.getElementById('lanc-month-label').textContent = `${MESES[m]} ${y}`;

  let lancs = getLancamentosMes(m, y);

  // Filtros
  const catF = document.getElementById('filter-categoria').value;
  const tipoF = document.getElementById('filter-tipo').value;
  if (catF) lancs = lancs.filter(l => l.categoria === catF);
  if (tipoF) lancs = lancs.filter(l => l.tipo === tipoF);

  const el = document.getElementById('lista-lancamentos');
  if (lancs.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhum lançamento encontrado</div>';
    return;
  }

  el.innerHTML = [...lancs].reverse().map(l => renderLancamentoItem(l, true)).join('');

  // Attach delete handlers
  el.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este lançamento?')) return;
      const idx = parseInt(btn.dataset.idx);
      showLoading('Excluindo...');
      try {
        await deleteLancamento(idx);
        await loadLancamentos();
        renderAll();
      } catch(e) {
        console.error(e);
        alert('Erro ao excluir.');
      }
      hideLoading();
    });
  });
}

function renderLancamentoItem(l, showDelete = false) {
  const isCredito = l.tipo === 'credito';
  const isTransf = l.tipo === 'transferencia';
  const sinal = isCredito ? '+' : '-';
  const cor = isCredito ? '#E1F5EE' : isTransf ? '#EEEDFE' : '#FAECE7';
  const icone = isCredito ? '↓' : isTransf ? '⇄' : '↑';
  const iconeCor = isCredito ? '#0F6E56' : isTransf ? '#534AB7' : '#993C1D';
  const valClass = l.tipo;

  return `<div class="lancamento-item">
    <div class="lanc-icon" style="background:${cor};color:${iconeCor}">${icone}</div>
    <div class="lanc-info">
      <div class="lanc-desc">${l.descricao || l.categoria}</div>
      <div class="lanc-meta">${l.categoria} · ${l.conta} · ${l.data}</div>
    </div>
    <div class="lanc-val ${valClass}">${sinal}${fmtCompact(l.valor)}</div>
    ${showDelete ? `<button class="btn-delete" data-idx="${l.id}" title="Excluir">✕</button>` : ''}
  </div>`;
}

// ============================================================
// RENDER RESUMO
// ============================================================
function renderResumo() {
  const m = state.currentMonth, y = state.currentYear;
  document.getElementById('res-month-label').textContent = `${MESES[m]} ${y}`;

  const lancs = getLancamentosMes(m, y);

  // Saldo PicPay do mês
  let entradas = 0, saidas = 0, guardado = 0;
  lancs.forEach(l => {
    if (l.tipo === 'credito') entradas += l.valor;
    else if (l.tipo === 'transferencia') guardado += l.valor;
    else saidas += l.valor;
  });
  const saldoPicPay = entradas - saidas - guardado;

  document.getElementById('resumo-contas').innerHTML = `
    <div class="resumo-item">
      <div class="res-icon" style="background:#E1F5EE">💳</div>
      <div class="res-info">
        <div class="res-nome">PicPay</div>
        <div class="res-sub">Conta digital</div>
      </div>
      <div class="res-val">${fmt(saldoPicPay)}</div>
    </div>`;

  // Guardado acumulado (todo o histórico)
  let totalInvest = 0, totalReserva = 0;
  state.lancamentos.forEach(l => {
    if (l.tipo === 'transferencia') {
      if (l.categoria === 'Investimento') totalInvest += l.valor;
      if (l.categoria === 'Reserva de Emergência') totalReserva += l.valor;
    }
  });

  document.getElementById('resumo-guardado').innerHTML = `
    <div class="resumo-item">
      <div class="res-icon" style="background:#EEEDFE">📈</div>
      <div class="res-info">
        <div class="res-nome">Investimentos</div>
        <div class="res-sub">acumulado total</div>
      </div>
      <div class="res-val">${fmt(totalInvest)}</div>
    </div>
    <div class="resumo-item">
      <div class="res-icon" style="background:#E1F5EE">🛡️</div>
      <div class="res-info">
        <div class="res-nome">Reserva de Emergência</div>
        <div class="res-sub">acumulado total</div>
      </div>
      <div class="res-val">${fmt(totalReserva)}</div>
    </div>`;

  const patrimonio = saldoPicPay + totalInvest + totalReserva;
  document.getElementById('resumo-patrimonio').textContent = fmt(patrimonio);
}

// ============================================================
// RENDER ANUAL
// ============================================================
let chartInstance = null;

function renderAnual() {
  const y = state.anualYear;
  document.getElementById('anual-year-label').textContent = y;

  const lancs = getLancamentosAno(y);
  let totalEnt = 0, totalSai = 0, totalGua = 0;
  lancs.forEach(l => {
    if (l.tipo === 'credito') totalEnt += l.valor;
    else if (l.tipo === 'transferencia') totalGua += l.valor;
    else totalSai += l.valor;
  });

  document.getElementById('anual-entradas').textContent = fmtCompact(totalEnt);
  document.getElementById('anual-saidas').textContent = fmtCompact(totalSai);
  document.getElementById('anual-guardado').textContent = fmtCompact(totalGua);
  document.getElementById('anual-sobra').textContent = fmtCompact(totalEnt - totalSai - totalGua);

  // Dados por mês para o gráfico
  const entMes = Array(12).fill(0);
  const saiMes = Array(12).fill(0);
  lancs.forEach(l => {
    const mes = parseInt(l.data.split('/')[1]) - 1;
    if (isNaN(mes)) return;
    if (l.tipo === 'credito') entMes[mes] += l.valor;
    else if (l.tipo === 'debito') saiMes[mes] += l.valor;
  });

  // Gráfico com canvas
  const canvas = document.getElementById('chart-anual');
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 300;
  const H = 120;
  canvas.width = W;
  canvas.height = H;

  ctx.clearRect(0,0,W,H);

  const maxVal = Math.max(...entMes, ...saiMes, 1);
  const barW = (W / 12) * 0.35;
  const gap = (W / 12) * 0.08;
  const chartH = H - 20;

  MESES_ABREV.forEach((mes, i) => {
    const x = (W / 12) * i + (W / 24);
    const hEnt = (entMes[i] / maxVal) * chartH;
    const hSai = (saiMes[i] / maxVal) * chartH;
    const isFuture = (i > new Date().getMonth() && y === new Date().getFullYear());
    const alpha = isFuture ? 0.25 : 1;

    ctx.globalAlpha = alpha;

    // Barra entrada
    ctx.fillStyle = '#1D9E75';
    ctx.beginPath();
    ctx.roundRect(x - barW - gap, chartH - hEnt, barW, hEnt, [3,3,0,0]);
    ctx.fill();

    // Barra saída
    ctx.fillStyle = '#F0997B';
    ctx.beginPath();
    ctx.roundRect(x + gap, chartH - hSai, barW, hSai, [3,3,0,0]);
    ctx.fill();

    ctx.globalAlpha = 1;

    // Label
    ctx.fillStyle = '#8a9390';
    ctx.font = '9px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mes, x, H - 3);
  });

  // Destaques
  const maisGasto = saiMes.indexOf(Math.max(...saiMes));
  const maisSobra = entMes.map((e,i) => e - saiMes[i]).indexOf(Math.max(...entMes.map((e,i) => e - saiMes[i])));

  // Categoria mais gasta no ano
  const porCat = {};
  lancs.filter(l => l.tipo === 'debito').forEach(l => {
    porCat[l.categoria] = (porCat[l.categoria] || 0) + l.valor;
  });
  const catMaisGasta = Object.entries(porCat).sort((a,b)=>b[1]-a[1])[0];

  document.getElementById('anual-destaques').innerHTML = `
    <div class="destaque-item">
      <div>
        <div class="dest-label">mês com mais gastos</div>
        <div class="dest-val">${saiMes[maisGasto] > 0 ? MESES[maisGasto] : '—'}</div>
      </div>
      ${saiMes[maisGasto] > 0 ? `<span class="dest-badge red">${fmtCompact(saiMes[maisGasto])}</span>` : ''}
    </div>
    <div class="destaque-item">
      <div>
        <div class="dest-label">mês com maior sobra</div>
        <div class="dest-val">${entMes[maisSobra] > 0 ? MESES[maisSobra] : '—'}</div>
      </div>
      ${entMes[maisSobra] > 0 ? `<span class="dest-badge green">${fmtCompact(entMes[maisSobra]-saiMes[maisSobra])}</span>` : ''}
    </div>
    <div class="destaque-item">
      <div>
        <div class="dest-label">categoria mais gasta</div>
        <div class="dest-val">${catMaisGasta ? catMaisGasta[0] : '—'}</div>
      </div>
      ${catMaisGasta ? `<span class="dest-badge red">${fmtCompact(catMaisGasta[1])}</span>` : ''}
    </div>`;
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll() {
  renderHome();
  renderLancamentos();
  renderResumo();
  renderAnual();
}

// ============================================================
// FORMULÁRIO — NOVO LANÇAMENTO
// ============================================================
function setupForm() {
  // Atualiza categorias conforme o tipo selecionado
  function atualizarCategorias(tipo) {
    const sel = document.getElementById('novo-categoria');
    const cats = CATS_POR_TIPO[tipo] || [];
    sel.innerHTML = cats.map(c => `<option value="${c.nome}">${c.icon} ${c.nome}</option>`).join('');
  }

  // Tipo selector
  document.querySelectorAll('.tipo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tipoSelecionado = btn.dataset.tipo;
      atualizarCategorias(btn.dataset.tipo);
    });
  });

  // Inicializa categorias com o tipo padrão (débito)
  atualizarCategorias(state.tipoSelecionado);

  // Máscara de valor
  const valorInput = document.getElementById('novo-valor');
  valorInput.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g,'');
    if (!v) { e.target.value = ''; return; }
    v = (parseInt(v) / 100).toFixed(2);
    e.target.value = 'R$ ' + parseFloat(v).toLocaleString('pt-BR', {minimumFractionDigits:2});
  });

  // Data padrão hoje
  const hoje = new Date();
  document.getElementById('novo-data').value = hoje.toISOString().split('T')[0];

  // Salvar
  document.getElementById('btn-salvar').addEventListener('click', async () => {
    const valorStr = document.getElementById('novo-valor').value.replace(/[^\d,]/g,'').replace(',','.');
    const valor = parseFloat(valorStr);
    const desc = document.getElementById('novo-desc').value.trim();
    const cat = document.getElementById('novo-categoria').value;
    const dataRaw = document.getElementById('novo-data').value;
    const conta = document.getElementById('novo-conta').value;

    if (!valor || valor <= 0) { showFeedback('Informe um valor válido', 'error'); return; }
    if (!dataRaw) { showFeedback('Informe a data', 'error'); return; }

    const [yy, mm, dd] = dataRaw.split('-');
    const dataFmt = `${dd}/${mm}/${yy}`;

    const lanc = {
      data: dataFmt,
      descricao: desc || cat,
      valor,
      tipo: state.tipoSelecionado,
      categoria: cat,
      conta
    };

    document.getElementById('btn-salvar-text').textContent = 'salvando...';
    document.getElementById('btn-salvar').disabled = true;

    try {
      await saveLancamento(lanc);
      await loadLancamentos();
      renderAll();
      showFeedback('Lançamento salvo! ✓', 'success');
      // Reset form
      document.getElementById('novo-valor').value = '';
      document.getElementById('novo-desc').value = '';
      document.getElementById('novo-data').value = hoje.toISOString().split('T')[0];
    } catch(e) {
      console.error(e);
      showFeedback('Erro ao salvar. Tente novamente.', 'error');
    }

    document.getElementById('btn-salvar-text').textContent = 'salvar lançamento';
    document.getElementById('btn-salvar').disabled = false;
  });
}

function showFeedback(msg, type) {
  const el = document.getElementById('form-feedback');
  el.textContent = msg;
  el.className = `form-feedback ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ============================================================
// NAVEGAÇÃO
// ============================================================
function setupNav() {
  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.screen;
      if (!screen) return;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById(`screen-${screen}`).classList.add('active');
    });
  });

  // Navegação de mês
  function navMes(delta, labelId, monthKey, yearKey, renderFn) {
    document.getElementById(`${labelId}-prev`).addEventListener('click', () => {
      state[monthKey] -= 1;
      if (state[monthKey] < 0) { state[monthKey] = 11; state[yearKey] -= 1; }
      renderFn();
    });
    document.getElementById(`${labelId}-next`).addEventListener('click', () => {
      state[monthKey] += 1;
      if (state[monthKey] > 11) { state[monthKey] = 0; state[yearKey] += 1; }
      renderFn();
    });
  }

  navMes(1,'home','currentMonth','currentYear', renderHome);
  navMes(1,'lanc','currentMonth','currentYear', renderLancamentos);
  navMes(1,'res','currentMonth','currentYear', renderResumo);

  // Navegação de ano
  document.getElementById('anual-prev').addEventListener('click', () => { state.anualYear--; renderAnual(); });
  document.getElementById('anual-next').addEventListener('click', () => { state.anualYear++; renderAnual(); });

  // Filtros
  document.getElementById('filter-categoria').addEventListener('change', renderLancamentos);
  document.getElementById('filter-tipo').addEventListener('change', renderLancamentos);

  // Popula filtro de categorias
  const sel = document.getElementById('filter-categoria');
  CATEGORIAS.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.nome;
    opt.textContent = c.nome;
    sel.appendChild(opt);
  });
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.getElementById('btn-google-login').addEventListener('click', handleLogin);
document.getElementById('btn-create-sheet').addEventListener('click', createSheet);
document.getElementById('btn-go-app').addEventListener('click', loadAndShowApp);

setupNav();
setupForm();
initGoogleAPI();
