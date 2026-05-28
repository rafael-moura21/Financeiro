// ============================================================
// CONFIGURAÇÃO
// ============================================================
const CONFIG = {
  CLIENT_ID: '75059835538-8j6hih1r8r0h508cnfa8et440ga814gb.apps.googleusercontent.com',
  API_KEY: 'AIzaSyDtZiz6oN6ey_O1Oe3TxBpFniCxtN3FwN4',
  SHEET_ID: '1BnvbHIM6vFIONsHvPCvtQyHXlhIYqBrgV8cnneyzN8E',
  DISCOVERY_DOCS: [
    'https://sheets.googleapis.com/$discovery/rest?version=v4',
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
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
  { nome: 'Cartão de Crédito',     icon: '💳', cor: '#FAECE7', corVal: '#993C1D', corBar: '#D85A30', tipo: 'debito' },
  { nome: 'Salário',               icon: '💰', cor: '#E1F5EE', corVal: '#0F6E56', corBar: '#1D9E75', tipo: 'credito' },
  { nome: 'Reembolso',             icon: '↩️', cor: '#E1F5EE', corVal: '#0F6E56', corBar: '#1D9E75', tipo: 'credito' },
  { nome: 'Ajuste Caixa',          icon: '⚖️', cor: '#E1F5EE', corVal: '#0F6E56', corBar: '#1D9E75', tipo: 'credito' },
  { nome: 'Saldo M-1',             icon: '📅', cor: '#E1F5EE', corVal: '#0F6E56', corBar: '#1D9E75', tipo: 'credito' },
  { nome: 'Reserva M-1',           icon: '🛡️', cor: '#E1F5EE', corVal: '#0F6E56', corBar: '#1D9E75', tipo: 'credito' },
  { nome: 'Cartão M-1',            icon: '💳', cor: '#FEF3E2', corVal: '#92520A', corBar: '#D4820A', tipo: 'credito' },
];

const CATS_POR_TIPO = {
  debito:        CATEGORIAS.filter(c => c.tipo === 'debito'),
  credito:       CATEGORIAS.filter(c => c.tipo === 'credito'),
  transferencia: [],
};

const CAIXAS = ['PicPay', 'Crédito Caixa', 'Reserva de Emergência', 'Investimento'];

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
let tokenClient;
let gapiReady = false;
let gisReady = false;

function checkBothReady() {
  if (!gapiReady || !gisReady) return;

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

  const savedToken = localStorage.getItem('gToken');
  if (savedToken) {
    gapi.client.setToken({ access_token: savedToken });
    state.isSignedIn = true;
    onSignIn();
  }
}

// ============================================================
// GOOGLE DRIVE — CONFIG POR USUÁRIO
// ============================================================
const CONFIG_FILENAME = 'financeiro-config.json';

async function buscarConfigNoDrive() {
  try {
    // Busca o arquivo de config no Drive do usuário
    const res = await gapi.client.drive.files.list({
      q: "name='" + CONFIG_FILENAME + "' and trashed=false",
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    const files = res.result.files;
    if (files && files.length > 0) {
      // Encontrou o arquivo — lê o conteúdo
      const fileRes = await gapi.client.drive.files.get({
        fileId: files[0].id,
        alt: 'media'
      });
      const config = JSON.parse(fileRes.body);
      return config.sheetId || null;
    }
    return null;
  } catch(err) {
    console.error('Erro ao buscar config no Drive:', err);
    return null;
  }
}

async function salvarConfigNoDrive(sheetId) {
  try {
    const content = JSON.stringify({ sheetId });
    const blob = new Blob([content], { type: 'application/json' });

    // Verifica se já existe
    const res = await gapi.client.drive.files.list({
      q: "name='" + CONFIG_FILENAME + "' and trashed=false",
      fields: 'files(id)',
      spaces: 'drive'
    });

    const files = res.result.files;
    if (files && files.length > 0) {
      // Atualiza o existente
      await fetch('https://www.googleapis.com/upload/drive/v3/files/' + files[0].id + '?uploadType=media', {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + gapi.client.getToken().access_token,
          'Content-Type': 'application/json'
        },
        body: content
      });
    } else {
      // Cria novo
      const boundary = 'bound';
      const metadata = JSON.stringify({ name: CONFIG_FILENAME, mimeType: 'application/json' });
      const multipart = [
        '--' + boundary,
        'Content-Type: application/json',
        '',
        metadata,
        '--' + boundary,
        'Content-Type: application/json',
        '',
        content,
        '--' + boundary + '--'
      ].join('\r\n');

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + gapi.client.getToken().access_token,
          'Content-Type': 'multipart/related; boundary=' + boundary
        },
        body: multipart
      });
    }
  } catch(err) {
    console.error('Erro ao salvar config no Drive:', err);
  }
}

async function buscarPlanilhaExistente() {
  try {
    const res = await gapi.client.drive.files.list({
      q: "name='Meu Financeiro - Controle' and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name)',
      spaces: 'drive'
    });
    const files = res.result.files;
    if (files && files.length > 0) return files[0].id;
    return null;
  } catch(err) {
    console.error('Erro ao buscar planilha:', err);
    return null;
  }
}

function initGoogleAPI() {
  const gisScript = document.createElement('script');
  gisScript.src = 'https://accounts.google.com/gsi/client';
  gisScript.onload = () => { gisReady = true; checkBothReady(); };
  document.head.appendChild(gisScript);

  const gapiScript = document.createElement('script');
  gapiScript.src = 'https://apis.google.com/js/api.js';
  gapiScript.onload = () => {
    gapi.load('client', async () => {
      await gapi.client.init({ apiKey: CONFIG.API_KEY, discoveryDocs: CONFIG.DISCOVERY_DOCS });
      gapiReady = true;
      checkBothReady();
    });
  };
  document.head.appendChild(gapiScript);
}

function handleLogin() {
  if (CONFIG.CLIENT_ID === 'SEU_CLIENT_ID_AQUI') {
    alert('Configure seu CLIENT_ID e API_KEY no arquivo app.js antes de usar.');
    return;
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

async function onSignIn() {
  document.getElementById('auth-screen').classList.add('hidden');
  showLoading('Buscando seus dados...');

  // 1. Tenta buscar o SHEET_ID no Drive do usuário
  let sheetId = await buscarConfigNoDrive();

  // 2. Se não encontrou no Drive, tenta migrar do localStorage ou CONFIG
  if (!sheetId) {
    sheetId = CONFIG.SHEET_ID || localStorage.getItem('sheetId') || '';

    // Se encontrou via migração, salva no Drive para uso futuro
    if (sheetId) {
      await salvarConfigNoDrive(sheetId);
    }
  }

  // 3. Se ainda não encontrou, busca planilha existente no Drive pelo nome
  if (!sheetId) {
    sheetId = await buscarPlanilhaExistente();
    if (sheetId) await salvarConfigNoDrive(sheetId);
  }

  hideLoading();
  state.sheetId = sheetId;

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
    await salvarConfigNoDrive(sheetId);

    await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      resource: {
        valueInputOption: 'RAW',
        data: [
          { range: 'Lançamentos!A1:G1', values: [['Data','Descrição','Valor','Tipo','Categoria','Conta','Destino']] },
          { range: 'Categorias!A1:A6', values: [['Alimentação'],['Transporte'],['Saúde'],['Lazer'],['Moradia'],['Cartão de Crédito']] },
          { range: 'Contas!A1:A4',     values: [['PicPay'],['Crédito Caixa'],['Reserva de Emergência'],['Investimento']] }
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
      range: 'Lançamentos!A2:G'
    });
    const rows = res.result.values || [];
    state.lancamentos = rows.map((r, i) => ({
      id: i,
      data:      r[0] || '',
      descricao: r[1] || '',
      valor:     parseFloat(r[2]) || 0,
      tipo:      r[3] || 'debito',
      categoria: r[4] || '',
      conta:     r[5] || 'PicPay',
      destino:   r[6] || '',
    }));
  } catch (err) {
    console.error('Erro ao carregar:', err);
    if (err.status === 401) { localStorage.removeItem('gToken'); location.reload(); }
  }
}

// ============================================================
// GOOGLE SHEETS — ESCRITA
// ============================================================
async function saveLancamento(lanc) {
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: state.sheetId,
    range: 'Lançamentos!A:G',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: [[lanc.data, lanc.descricao, lanc.valor, lanc.tipo, lanc.categoria, lanc.conta, lanc.destino || '']] }
  });
}

async function deleteLancamento(rowIndex) {
  const sheetRowIndex = rowIndex + 1;
  const meta = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: state.sheetId, fields: 'sheets.properties'
  });
  const sheetTabId = meta.result.sheets.find(s => s.properties.title === 'Lançamentos').properties.sheetId;
  await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: state.sheetId,
    resource: { requests: [{ deleteDimension: { range: { sheetId: sheetTabId, dimension: 'ROWS', startIndex: sheetRowIndex, endIndex: sheetRowIndex + 1 } } }] }
  });
}

// ============================================================
// FILTROS POR MÊS / ANO
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
    return parseInt(l.data.split('/')[2]) === year;
  });
}

// ============================================================
// CÁLCULO DE SALDO DAS CAIXAS (histórico completo)
// ============================================================
function calcularSaldoCaixas() {
  const caixas = { 'PicPay': 0, 'Crédito Caixa': 0, 'Reserva de Emergência': 0, 'Investimento': 0 };
  state.lancamentos.forEach(l => {
    if (l.tipo === 'credito') {
      if (caixas.hasOwnProperty(l.conta)) caixas[l.conta] += l.valor;
    } else if (l.tipo === 'debito') {
      if (caixas.hasOwnProperty(l.conta)) caixas[l.conta] -= l.valor;
    } else if (l.tipo === 'transferencia') {
      if (caixas.hasOwnProperty(l.conta))    caixas[l.conta]    -= l.valor;
      if (l.destino && caixas.hasOwnProperty(l.destino)) caixas[l.destino] += l.valor;
    }
  });
  return caixas;
}

// ============================================================
// RENDER HOME
// ============================================================
function renderHome() {
  const m = state.currentMonth, y = state.currentYear;
  document.getElementById('home-month-label').textContent = `${MESES[m]} ${y}`;

  const lancs = getLancamentosMes(m, y);

  let entradas = 0, saidas = 0, reserva = 0, investimento = 0;
  lancs.forEach(l => {
    if (l.tipo === 'credito') entradas += l.valor;
    else if (l.tipo === 'debito') saidas += l.valor;
    else if (l.tipo === 'transferencia' && l.conta === 'PicPay') {
      if (l.destino === 'Reserva de Emergência') reserva += l.valor;
      else if (l.destino === 'Investimento') investimento += l.valor;
    }
  });

  const guardado = reserva + investimento;
  const saldo = entradas - saidas - guardado;

  document.getElementById('home-saldo').textContent = fmt(saldo);
  document.getElementById('home-entradas').textContent = fmtCompact(entradas);
  document.getElementById('home-saidas').textContent = fmtCompact(saidas);
  document.getElementById('home-reserva').textContent = fmtCompact(reserva);
  document.getElementById('home-investimento').textContent = fmtCompact(investimento);

  // Gastos por categoria
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
  const catF  = document.getElementById('filter-categoria').value;
  const tipoF = document.getElementById('filter-tipo').value;
  if (catF)  lancs = lancs.filter(l => l.categoria === catF);
  if (tipoF) lancs = lancs.filter(l => l.tipo === tipoF);

  const el = document.getElementById('lista-lancamentos');
  if (lancs.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhum lançamento encontrado</div>';
    return;
  }

  el.innerHTML = [...lancs].reverse().map(l => renderLancamentoItem(l, true)).join('');
  el.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este lançamento?')) return;
      const idx = parseInt(btn.dataset.idx);
      showLoading('Excluindo...');
      try {
        await deleteLancamento(idx);
        await loadLancamentos();
        renderAll();
      } catch(e) { console.error(e); alert('Erro ao excluir.'); }
      hideLoading();
    });
  });
}

function renderLancamentoItem(l, showDelete = false) {
  const isCredito = l.tipo === 'credito';
  const isTransf  = l.tipo === 'transferencia';
  const sinal     = isCredito ? '+' : '-';
  const cor       = isCredito ? '#E1F5EE' : isTransf ? '#EEEDFE' : '#FAECE7';
  const icone     = isCredito ? '↓' : isTransf ? '⇄' : '↑';
  const iconeCor  = isCredito ? '#0F6E56' : isTransf ? '#534AB7' : '#993C1D';
  const meta      = isTransf
    ? `${l.conta} → ${l.destino || '?'} · ${l.data}`
    : `${l.categoria} · ${l.conta} · ${l.data}`;

  return `<div class="lancamento-item">
    <div class="lanc-icon" style="background:${cor};color:${iconeCor}">${icone}</div>
    <div class="lanc-info">
      <div class="lanc-desc">${l.descricao || l.categoria}</div>
      <div class="lanc-meta">${meta}</div>
    </div>
    <div class="lanc-val ${l.tipo}">${sinal}${fmtCompact(l.valor)}</div>
    ${showDelete ? `<button class="btn-delete" data-idx="${l.id}" title="Excluir">✕</button>` : ''}
  </div>`;
}

// ============================================================
// RENDER RESUMO
// ============================================================
function renderResumo() {
  const m = state.currentMonth, y = state.currentYear;
  document.getElementById('res-month-label').textContent = `${MESES[m]} ${y}`;

  const caixas = calcularSaldoCaixas();

  document.getElementById('resumo-contas').innerHTML = `
    <div class="resumo-item">
      <div class="res-icon" style="background:#E1F5EE">💳</div>
      <div class="res-info"><div class="res-nome">PicPay</div><div class="res-sub">Conta digital</div></div>
      <div class="res-val">${fmt(caixas['PicPay'])}</div>
    </div>`;

  document.getElementById('resumo-guardado').innerHTML = `
    <div class="resumo-item">
      <div class="res-icon" style="background:#FEF3E2">💳</div>
      <div class="res-info"><div class="res-nome">Crédito Caixa</div><div class="res-sub">reserva para fatura</div></div>
      <div class="res-val">${fmt(caixas['Crédito Caixa'])}</div>
    </div>
    <div class="resumo-item">
      <div class="res-icon" style="background:#E1F5EE">🛡️</div>
      <div class="res-info"><div class="res-nome">Reserva de Emergência</div><div class="res-sub">acumulado total</div></div>
      <div class="res-val">${fmt(caixas['Reserva de Emergência'])}</div>
    </div>
    <div class="resumo-item">
      <div class="res-icon" style="background:#EEEDFE">📈</div>
      <div class="res-info"><div class="res-nome">Investimentos</div><div class="res-sub">acumulado total</div></div>
      <div class="res-val">${fmt(caixas['Investimento'])}</div>
    </div>`;

  const patrimonio = Object.values(caixas).reduce((a,b) => a+b, 0);
  document.getElementById('resumo-patrimonio').textContent = fmt(patrimonio);

  renderPizzaCategorias();
}

function renderPizzaCategorias() {
  const canvas = document.getElementById('chart-pizza');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 200;
  canvas.width = W;
  canvas.height = W;
  ctx.clearRect(0, 0, W, W);

  const despesas = state.lancamentos.filter(l => l.tipo === 'debito');
  const porCat = {};
  despesas.forEach(l => { porCat[l.categoria] = (porCat[l.categoria] || 0) + l.valor; });
  const total = Object.values(porCat).reduce((a,b) => a+b, 0);
  if (total === 0) return;

  const cores = ['#D85A30','#378ADD','#639922','#D4537E','#D4820A','#534AB7','#1D9E75'];
  const entries = Object.entries(porCat).sort((a,b) => b[1]-a[1]);
  const cx = W/2, cy = W/2, r = W*0.38, rInner = W*0.22;
  let angle = -Math.PI/2;

  entries.forEach(([cat, val], i) => {
    const slice = (val/total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = cores[i % cores.length];
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    angle += slice;
  });

  // Buraco donut
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI*2);
  ctx.fillStyle = 'white';
  ctx.fill();

  // Legenda
  const legEl = document.getElementById('pizza-legenda');
  if (legEl) {
    legEl.innerHTML = entries.map(([cat, val], i) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <div style="width:10px;height:10px;border-radius:2px;background:${cores[i%cores.length]};flex-shrink:0;"></div>
        <span style="font-size:0.78rem;color:var(--text2);flex:1;">${cat}</span>
        <span style="font-size:0.78rem;font-family:var(--font-mono);font-weight:500;">${fmtCompact(val)}</span>
        <span style="font-size:0.72rem;color:var(--text3);">${Math.round((val/total)*100)}%</span>
      </div>`).join('');
  }
}

// ============================================================
// RENDER ANUAL
// ============================================================
function renderAnual() {
  const y = state.anualYear;
  document.getElementById('anual-year-label').textContent = y;

  const lancs = getLancamentosAno(y);
  let totalEnt = 0, totalSai = 0, totalGua = 0;
  lancs.forEach(l => {
    if (l.tipo === 'credito') totalEnt += l.valor;
    else if (l.tipo === 'debito') totalSai += l.valor;
    else if (l.tipo === 'transferencia' && l.conta === 'PicPay') totalGua += l.valor;
  });

  document.getElementById('anual-entradas').textContent = fmtCompact(totalEnt);
  document.getElementById('anual-saidas').textContent   = fmtCompact(totalSai);
  document.getElementById('anual-guardado').textContent = fmtCompact(totalGua);
  document.getElementById('anual-sobra').textContent    = fmtCompact(totalEnt - totalSai - totalGua);

  const entMes = Array(12).fill(0);
  const saiMes = Array(12).fill(0);
  lancs.forEach(l => {
    const mes = parseInt(l.data.split('/')[1]) - 1;
    if (isNaN(mes)) return;
    if (l.tipo === 'credito') entMes[mes] += l.valor;
    else if (l.tipo === 'debito') saiMes[mes] += l.valor;
  });

  const canvas = document.getElementById('chart-anual');
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 300;
  const H = 120;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0,0,W,H);

  const maxVal = Math.max(...entMes, ...saiMes, 1);
  const barW   = (W/12)*0.35;
  const gap    = (W/12)*0.08;
  const chartH = H - 20;

  MESES_ABREV.forEach((mes, i) => {
    const x = (W/12)*i + (W/24);
    const hEnt = (entMes[i]/maxVal)*chartH;
    const hSai = (saiMes[i]/maxVal)*chartH;
    const isFuture = (i > new Date().getMonth() && y === new Date().getFullYear());
    ctx.globalAlpha = isFuture ? 0.25 : 1;
    ctx.fillStyle = '#1D9E75';
    ctx.beginPath(); ctx.roundRect(x-barW-gap, chartH-hEnt, barW, hEnt, [3,3,0,0]); ctx.fill();
    ctx.fillStyle = '#F0997B';
    ctx.beginPath(); ctx.roundRect(x+gap, chartH-hSai, barW, hSai, [3,3,0,0]); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#8a9390';
    ctx.font = '9px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mes, x, H-3);
  });

  const maisGasto  = saiMes.indexOf(Math.max(...saiMes));
  const maisSobra  = entMes.map((e,i) => e-saiMes[i]).indexOf(Math.max(...entMes.map((e,i) => e-saiMes[i])));
  const porCat     = {};
  lancs.filter(l => l.tipo === 'debito').forEach(l => { porCat[l.categoria] = (porCat[l.categoria]||0)+l.valor; });
  const catMaisGasta = Object.entries(porCat).sort((a,b)=>b[1]-a[1])[0];

  document.getElementById('anual-destaques').innerHTML = `
    <div class="destaque-item">
      <div><div class="dest-label">mês com mais gastos</div><div class="dest-val">${saiMes[maisGasto]>0?MESES[maisGasto]:'—'}</div></div>
      ${saiMes[maisGasto]>0?`<span class="dest-badge red">${fmtCompact(saiMes[maisGasto])}</span>`:''}
    </div>
    <div class="destaque-item">
      <div><div class="dest-label">mês com maior sobra</div><div class="dest-val">${entMes[maisSobra]>0?MESES[maisSobra]:'—'}</div></div>
      ${entMes[maisSobra]>0?`<span class="dest-badge green">${fmtCompact(entMes[maisSobra]-saiMes[maisSobra])}</span>`:''}
    </div>
    <div class="destaque-item">
      <div><div class="dest-label">categoria mais gasta</div><div class="dest-val">${catMaisGasta?catMaisGasta[0]:'—'}</div></div>
      ${catMaisGasta?`<span class="dest-badge red">${fmtCompact(catMaisGasta[1])}</span>`:''}
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

  function atualizarCategorias(tipo) {
    const sel = document.getElementById('novo-categoria');
    const cats = CATS_POR_TIPO[tipo] || [];
    sel.innerHTML = cats.map(c => `<option value="${c.nome}">${c.icon} ${c.nome}</option>`).join('');
  }

  function toggleDestino(tipo) {
    const destinoGroup = document.getElementById('novo-destino-group');
    const catGroup     = document.getElementById('novo-categoria').closest('.form-group');
    const contaLabel   = document.querySelector('#novo-conta-group label');
    const contaSel     = document.getElementById('novo-conta');

    if (tipo === 'transferencia') {
      destinoGroup.classList.remove('hidden');
      catGroup.classList.add('hidden');
      if (contaLabel) contaLabel.textContent = 'De (origem)';
      contaSel.innerHTML = CAIXAS.map(c => `<option value="${c}">${c}</option>`).join('');
    } else if (tipo === 'credito') {
      destinoGroup.classList.add('hidden');
      catGroup.classList.remove('hidden');
      if (contaLabel) contaLabel.textContent = 'Conta destino';
      contaSel.innerHTML = ['PicPay','Reserva de Emergência','Crédito Caixa']
        .map(c => `<option value="${c}">${c}</option>`).join('');
    } else {
      destinoGroup.classList.add('hidden');
      catGroup.classList.remove('hidden');
      if (contaLabel) contaLabel.textContent = 'Conta';
      contaSel.innerHTML = '<option value="PicPay">PicPay</option>';
    }
  }

  function atualizarOpcoesDestino() {
    const origem  = document.getElementById('novo-conta').value;
    const destSel = document.getElementById('novo-destino');
    destSel.innerHTML = CAIXAS.filter(c => c !== origem)
      .map(c => `<option value="${c}">${c}</option>`).join('');
  }

  document.querySelectorAll('.tipo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tipoSelecionado = btn.dataset.tipo;
      atualizarCategorias(btn.dataset.tipo);
      toggleDestino(btn.dataset.tipo);
      atualizarOpcoesDestino();
    });
  });

  document.getElementById('novo-conta').addEventListener('change', atualizarOpcoesDestino);

  atualizarCategorias(state.tipoSelecionado);
  toggleDestino(state.tipoSelecionado);
  atualizarOpcoesDestino();

  // Máscara de valor
  document.getElementById('novo-valor').addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g,'');
    if (!v) { e.target.value = ''; return; }
    v = (parseInt(v)/100).toFixed(2);
    e.target.value = 'R$ ' + parseFloat(v).toLocaleString('pt-BR', {minimumFractionDigits:2});
  });

  const hoje = new Date();
  document.getElementById('novo-data').value = hoje.toISOString().split('T')[0];

  document.getElementById('btn-salvar').addEventListener('click', async () => {
    const valorStr = document.getElementById('novo-valor').value.replace(/[^\d,]/g,'').replace(',','.');
    const valor    = parseFloat(valorStr);
    const desc     = document.getElementById('novo-desc').value.trim();
    const cat      = document.getElementById('novo-categoria').value;
    const dataRaw  = document.getElementById('novo-data').value;
    const conta    = document.getElementById('novo-conta').value;
    const destino  = state.tipoSelecionado === 'transferencia'
      ? document.getElementById('novo-destino').value : '';

    if (!valor || valor <= 0) { showFeedback('Informe um valor válido', 'error'); return; }
    if (!dataRaw) { showFeedback('Informe a data', 'error'); return; }

    const [yy, mm, dd] = dataRaw.split('-');
    const dataFmt = `${dd}/${mm}/${yy}`;

    const lanc = {
      data:      dataFmt,
      descricao: desc || (state.tipoSelecionado === 'transferencia' ? `${conta} → ${destino}` : cat),
      valor,
      tipo:      state.tipoSelecionado,
      categoria: state.tipoSelecionado === 'transferencia' ? 'Transferência' : cat,
      conta,
      destino
    };

    document.getElementById('btn-salvar-text').textContent = 'salvando...';
    document.getElementById('btn-salvar').disabled = true;

    try {
      await saveLancamento(lanc);
      await loadLancamentos();
      renderAll();
      showFeedback('Lançamento salvo! ✓', 'success');
      document.getElementById('novo-valor').value = '';
      document.getElementById('novo-desc').value  = '';
      document.getElementById('novo-data').value  = hoje.toISOString().split('T')[0];
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

  function navMes(labelId, renderFn) {
    document.getElementById(`${labelId}-prev`).addEventListener('click', () => {
      state.currentMonth -= 1;
      if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear -= 1; }
      renderFn();
    });
    document.getElementById(`${labelId}-next`).addEventListener('click', () => {
      state.currentMonth += 1;
      if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear += 1; }
      renderFn();
    });
  }

  navMes('home', renderHome);
  navMes('lanc', renderLancamentos);
  navMes('res',  renderResumo);

  document.getElementById('anual-prev').addEventListener('click', () => { state.anualYear--; renderAnual(); });
  document.getElementById('anual-next').addEventListener('click', () => { state.anualYear++; renderAnual(); });

  document.getElementById('filter-categoria').addEventListener('change', renderLancamentos);
  document.getElementById('filter-tipo').addEventListener('change', renderLancamentos);

  const sel = document.getElementById('filter-categoria');
  CATEGORIAS.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.nome; opt.textContent = c.nome;
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
