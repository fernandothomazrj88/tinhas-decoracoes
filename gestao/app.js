'use strict';

const TINHAS_VERSION = (window.TINHAS_CONFIG && window.TINHAS_CONFIG.APP_VERSION) || '1.1.2';
const STORAGE_TOKEN = 'tinhas_gestao_token';
const STORAGE_USER = 'tinhas_gestao_usuario';
const STATUS_PRODUCAO = ['Aguardando material', 'Em produção', 'Acabamento', 'Pronto', 'Entregue', 'Cancelado'];

let sessao = {
  token: localStorage.getItem(STORAGE_TOKEN),
  usuario: safeJSON(localStorage.getItem(STORAGE_USER))
};
let moduloAtual = null;
let clientesCache = [];
let orcamentosCache = [];
let pedidosCache = [];
let installPromptEvent = null;

const $ = id => document.getElementById(id);

function safeJSON(value) {
  try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
}
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function campo(obj, nomes, fallback = '') {
  for (const nome of nomes) {
    if (obj && obj[nome] !== undefined && obj[nome] !== null && obj[nome] !== '') return obj[nome];
  }
  return fallback;
}
function moeda(value) {
  return Number(value || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}
function dataBR(value) {
  if (!value) return '—';
  const raw = String(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('pt-BR');
}
function normalizarStatus(status) {
  return String(status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function badge(status) {
  const value = String(status || '—');
  const css = normalizarStatus(value);
  return `<span class="badge-status ${esc(css)}">${esc(value)}</span>`;
}
function apiUrl() {
  const url = String((window.TINHAS_CONFIG && window.TINHAS_CONFIG.API_URL) || '').trim();
  if (!url || url.includes('COLE_AQUI') || !/^https:\/\//i.test(url)) {
    throw new Error('A URL da API ainda não foi configurada no arquivo config.js.');
  }
  return url;
}
async function chamarApi(payload, usarSessao = true) {
  const body = Object.assign({}, payload);
  if (usarSessao && sessao.token && !body.token) body.token = sessao.token;
  const response = await fetch(apiUrl(), {
    method: 'POST',
    headers: {'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Falha de comunicação com a API (${response.status}).`);
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch (_) { throw new Error('A API retornou uma resposta inválida. Confira a URL da implantação.'); }
  if (!result || result.sucesso !== true) throw new Error((result && result.erro) || 'Não foi possível concluir a operação.');
  return result;
}
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('escondido');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.add('escondido'), 3000);
}
function mostrarTela(id) {
  ['tela-login','tela-home','tela-modulo'].forEach(tela => $(tela).classList.toggle('escondido', tela !== id));
  window.scrollTo(0, 0);
}
function salvarSessao(result) {
  sessao = {token: result.token, usuario: result.usuario};
  localStorage.setItem(STORAGE_TOKEN, sessao.token);
  localStorage.setItem(STORAGE_USER, JSON.stringify(sessao.usuario));
}
function limparSessao() {
  localStorage.removeItem(STORAGE_TOKEN);
  localStorage.removeItem(STORAGE_USER);
  sessao = {token:null, usuario:null};
}

let inicioAbertura = performance.now();
let percentualAberturaAtual = 0;

function atualizarAbertura(valor, mensagem) {
  const trilho = document.querySelector('.abertura-trilho');
  const barra = $('abertura-progresso');
  const status = $('abertura-status');
  const percentual = Math.max(0, Math.min(100, Number(valor) || 0));
  percentualAberturaAtual = percentual;
  if (barra) barra.style.width = `${percentual}%`;
  if (trilho) trilho.setAttribute('aria-valuenow', String(Math.round(percentual)));
  if (status && mensagem) status.textContent = mensagem;
}

function pausa(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function prepararAbertura() {
  atualizarAbertura(8, 'Carregando...');
  const imagem = $('imagem-abertura');
  if (imagem) {
    if (!imagem.complete) {
      await Promise.race([
        new Promise(resolve => {
          imagem.addEventListener('load', resolve, {once:true});
          imagem.addEventListener('error', resolve, {once:true});
        }),
        pausa(5000)
      ]);
    }
    if (typeof imagem.decode === 'function') {
      try { await imagem.decode(); } catch (_) {}
    }
  }
  atualizarAbertura(34, 'Carregando...');
  try { await Promise.race([document.fonts.ready, pausa(1200)]); } catch (_) {}
  atualizarAbertura(55, 'Carregando...');
}

async function animarProgressoAbertura(destino, duracao) {
  if (duracao <= 0) return;
  const inicio = performance.now();
  const valorInicial = percentualAberturaAtual;
  await new Promise(resolve => {
    const quadro = agora => {
      const fracao = Math.min(1, (agora - inicio) / duracao);
      const suave = fracao * (2 - fracao);
      atualizarAbertura(valorInicial + (destino - valorInicial) * suave, 'Preparando seu espaço...');
      if (fracao < 1) requestAnimationFrame(quadro);
      else resolve();
    };
    requestAnimationFrame(quadro);
  });
}

async function finalizarAbertura() {
  // Mantém a identidade visual da abertura por pelo menos 4,5 segundos.
  // Se a preparação/API demorar mais, a tela permanece até tudo estar pronto.
  const tempoMinimo = 4500;
  const tempoDecorrido = performance.now() - inicioAbertura;
  const tempoRestante = Math.max(0, tempoMinimo - tempoDecorrido);
  if (tempoRestante) await animarProgressoAbertura(97, tempoRestante);
  atualizarAbertura(100, 'Pronto!');
  await pausa(320);
  const abertura = $('tela-abertura');
  if (abertura) {
    abertura.classList.add('saindo');
    await pausa(500);
    abertura.classList.add('escondido');
  }
  const login = $('tela-login');
  if (login) { login.inert = false; login.setAttribute('aria-hidden','false'); }
}

async function iniciarApp() {
  inicioAbertura = performance.now();
  if ('serviceWorker' in navigator) {
    const registrarServiceWorker = () => navigator.serviceWorker.register('./service-worker.js')
      .catch(err => console.warn('PWA Service Worker:', err));
    if (document.readyState === 'complete') registrarServiceWorker();
    else window.addEventListener('load', registrarServiceWorker, {once:true});
  }
  await prepararAbertura();
  $('form-login').addEventListener('submit', entrar);
  $('btn-primeiro-acesso').addEventListener('click', abrirPrimeiroAcesso);
  $('btn-logout').addEventListener('click', sair);
  $('btn-logout-modulo').addEventListener('click', sair);
  $('btn-voltar').addEventListener('click', voltarInicio);
  $('btn-menu').addEventListener('click', abrirMenu);
  $('btn-fechar-menu').addEventListener('click', fecharMenu);
  $('drawer-backdrop').addEventListener('click', event => { if (event.target === $('drawer-backdrop')) fecharMenu(); });
  $('drawer-backdrop').querySelectorAll('[data-drawer]').forEach(button => button.addEventListener('click', () => {
    const target = button.dataset.drawer; fecharMenu();
    if (target === 'inicio') voltarInicio(); else abrirModulo(target);
  }));
  document.querySelectorAll('.modulo').forEach(button => button.addEventListener('click', () => abrirModulo(button.dataset.modulo)));
  $('btn-instalar-home').addEventListener('click', instalarApp);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPromptEvent = event; $('btn-instalar-home').classList.remove('escondido');
  });
  window.addEventListener('appinstalled', () => { installPromptEvent = null; $('btn-instalar-home').classList.add('escondido'); toast('Tinhas Gestão instalado!'); });

  if (sessao.token && sessao.usuario) {
    try {
      atualizarAbertura(76, 'Carregando...');
      const result = await chamarApi({action:'usuarioAtual'});
      sessao.usuario = result.dados.usuario;
      localStorage.setItem(STORAGE_USER, JSON.stringify(sessao.usuario));
      abrirHome();
      await carregarResumoHome();
      await finalizarAbertura();
      return;
    } catch (error) {
      limparSessao();
    }
  }
  mostrarTela('tela-login');
  await finalizarAbertura();
}

async function entrar(event) {
  event.preventDefault();
  const email = $('email').value.trim().toLowerCase();
  const senha = $('senha').value;
  const botao = $('btn-login');
  const mensagem = $('mensagem-login');
  mensagem.textContent = '';
  botao.disabled = true; botao.textContent = 'Entrando...';
  try {
    const result = await chamarApi({action:'login', email, senha}, false);
    salvarSessao(result.dados);
    $('senha').value = '';
    abrirHome();
    await carregarResumoHome();
  } catch (error) {
    mensagem.textContent = error.message;
  } finally {
    botao.disabled = false; botao.textContent = 'Entrar';
  }
}

function abrirPrimeiroAcesso() {
  const emailAtual = $('email').value.trim().toLowerCase();
  abrirModal('Primeiro acesso', `
    <form id="form-primeiro-acesso" class="formulario">
      <p style="font-size:13px;line-height:1.45;margin-bottom:12px;color:#51443A">Informe seu e-mail autorizado e o código individual de primeiro acesso. Depois, crie sua senha particular.</p>
      <div class="form-grid">
        <div class="form-grupo full"><label for="primeiro-email">E-mail cadastrado</label><input class="campo-form" id="primeiro-email" type="email" autocomplete="username" required></div>
        <div class="form-grupo full"><label for="primeiro-codigo">Código de primeiro acesso</label><input class="campo-form" id="primeiro-codigo" type="text" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required></div>
        <div class="form-grupo full"><label for="primeiro-senha">Nova senha (mínimo de 8 caracteres)</label><input class="campo-form" id="primeiro-senha" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></div>
        <div class="form-grupo full"><label for="primeiro-confirmacao">Confirme a nova senha</label><input class="campo-form" id="primeiro-confirmacao" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></div>
      </div>
      <p id="mensagem-primeiro-acesso" class="status error" style="display:none;margin-top:12px" role="alert"></p>
      <div class="form-acoes"><button type="button" class="botao-acao" data-fechar-modal>Cancelar</button><button type="submit" id="btn-salvar-primeiro-acesso" class="botao-acao destaque">Criar minha senha</button></div>
    </form>`);
  $('primeiro-email').value = emailAtual;
  $('modal-root').querySelector('[data-fechar-modal]').addEventListener('click', fecharModal);
  $('form-primeiro-acesso').addEventListener('submit', salvarPrimeiroAcesso);
}

async function salvarPrimeiroAcesso(event) {
  event.preventDefault();
  const email = $('primeiro-email').value.trim().toLowerCase();
  const codigo = $('primeiro-codigo').value.trim().toUpperCase();
  const senha = $('primeiro-senha').value;
  const confirmacao = $('primeiro-confirmacao').value;
  const botao = $('btn-salvar-primeiro-acesso');
  const mensagem = $('mensagem-primeiro-acesso');
  mensagem.style.display = 'none';
  if (senha.length < 8) { mensagem.textContent = 'Use pelo menos 8 caracteres.'; mensagem.style.display = 'block'; return; }
  if (senha !== confirmacao) { mensagem.textContent = 'As senhas não conferem.'; mensagem.style.display = 'block'; return; }
  botao.disabled = true; botao.textContent = 'Criando senha...';
  try {
    await chamarApi({action:'configurarSenhaInicial', email, codigo, senha, confirmacao}, false);
    fecharModal();
    $('email').value = email;
    $('senha').value = '';
    $('mensagem-login').textContent = 'Senha criada! Entre com seu e-mail e a senha que acabou de cadastrar.';
    $('senha').focus();
    toast('Senha criada com sucesso!');
  } catch (error) {
    mensagem.textContent = error.message || 'Não foi possível criar sua senha.';
    mensagem.style.display = 'block';
    botao.disabled = false; botao.textContent = 'Criar minha senha';
  }
}

async function sair() {
  try { if (sessao.token) await chamarApi({action:'logout'}); } catch (_) {}
  limparSessao();
  moduloAtual = null;
  $('senha').value = '';
  $('email').value = '';
  fecharMenu();
  mostrarTela('tela-login');
}

function abrirHome() {
  moduloAtual = null;
  const user = sessao.usuario || {};
  const nome = user.nome || user.email || 'Equipe Tinhas';
  $('nome-usuario').textContent = nome;
  const identificador = normalizarTexto(`${user.nome || ''} ${user.email || ''}`);
  const hero = $('hero-home');
  const imagem = $('hero-usuario');
  const frase = $('hero-frase');
  hero.classList.remove('fernando','leticia');
  if (identificador.includes('leticia') || identificador.includes('lele')) {
    hero.classList.add('leticia');
    imagem.src = 'assets/leticia-home.png';
    imagem.alt = 'Responsável pelo marketing e mídias sociais da Tinhas';
    frase.innerHTML = 'Comunicação hoje,<br><strong>marca forte sempre</strong> 🧡';
  } else if (identificador.includes('fernando') || identificador.includes('nandinho')) {
    hero.classList.add('fernando');
    imagem.src = 'assets/fernando-home.png';
    imagem.alt = 'Responsável pela marcenaria da Tinhas';
    frase.innerHTML = 'Trabalho bem feito,<br><strong>resultado duradouro</strong> 🧡';
  } else {
    imagem.src = 'assets/casal-login.png';
    imagem.alt = 'Equipe Tinhas Decorações';
    frase.innerHTML = 'Projetos bem feitos,<br><strong>gestão em dia</strong> 🧡';
  }
  mostrarTela('tela-home');
}

async function carregarResumoHome() {
  const ids = ['resumo-clientes','resumo-orcamentos','resumo-producao'];
  ids.forEach(id => $(id).textContent = '…');
  try {
    const [clientes, orcamentos, pedidos] = await Promise.all([
      chamarApi({action:'listarClientes'}),
      chamarApi({action:'listarOrcamentos'}),
      chamarApi({action:'listarPedidos'})
    ]);
    clientesCache = clientes.dados.clientes || [];
    orcamentosCache = orcamentos.dados.orcamentos || [];
    pedidosCache = pedidos.dados.pedidos || [];
    $('resumo-clientes').textContent = clientesCache.length;
    $('resumo-orcamentos').textContent = orcamentosCache.filter(x => String(campo(x,['status','Status'])) !== 'Cancelado').length;
    $('resumo-producao').textContent = pedidosCache.filter(x => !['Entregue','Cancelado'].includes(String(campo(x,['status','Status'])))).length;
  } catch (error) {
    ids.forEach(id => $(id).textContent = '—');
    console.warn('Resumo inicial:', error.message);
  }
}

function abrirMenu() { $('drawer-backdrop').classList.remove('escondido'); }
function fecharMenu() { $('drawer-backdrop').classList.add('escondido'); }
function voltarInicio() { moduloAtual = null; mostrarTela('tela-home'); }

const MODULOS = {
  clientes: {titulo:'Clientes',icone:'👥',descricao:'Cadastros e relacionamento com os clientes.'},
  orcamentos: {titulo:'Orçamentos',icone:'📄',descricao:'Projetos, valores, validade e aprovações.'},
  producao: {titulo:'Produção',icone:'🪚',descricao:'Acompanhe os pedidos e as etapas da fabricação.'},
  materiais: {titulo:'Materiais',icone:'🪵',descricao:'Madeira, metalon, ferragens e insumos.'},
  estoque: {titulo:'Estoque',icone:'📦',descricao:'Entradas, saídas e disponibilidade de materiais.'},
  financeiro: {titulo:'Financeiro',icone:'💰',descricao:'Receitas, despesas, pagamentos e saldo.'},
  agenda: {titulo:'Agenda',icone:'📅',descricao:'Prazos de fabricação, visitas e entregas.'},
  portfolio: {titulo:'Portfólio',icone:'🖼️',descricao:'Projetos realizados e fotos das peças.'},
  marketing: {titulo:'Marketing',icone:'📣',descricao:'Planejamento de conteúdo e mídias sociais.'},
  relatorios: {titulo:'Relatórios',icone:'📊',descricao:'Indicadores e evolução da empresa.'},
  configuracoes: {titulo:'Configurações',icone:'⚙️',descricao:'Acessos e preferências do aplicativo.'}
};

async function abrirModulo(nome) {
  moduloAtual = nome;
  const config = MODULOS[nome] || {titulo:'Módulo',icone:'🧩',descricao:''};
  $('subtitulo-modulo').textContent = config.titulo.toUpperCase();
  mostrarTela('tela-modulo');
  const area = $('modulo-conteudo');
  area.innerHTML = cabecalhoModulo(config) + '<div class="carregando">Abrindo módulo...</div>';
  try {
    if (nome === 'clientes') await renderClientes(area);
    else if (nome === 'orcamentos') await renderOrcamentos(area);
    else if (nome === 'producao') await renderProducao(area);
    else renderModuloEmPreparacao(area, nome);
  } catch (error) {
    area.innerHTML = cabecalhoModulo(config) + `<div class="erro">${esc(error.message)}</div><div class="form-acoes"><button class="botao-acao" data-voltar-inicio>Voltar ao início</button></div>`;
    area.querySelector('[data-voltar-inicio]')?.addEventListener('click', voltarInicio);
  }
}
function cabecalhoModulo(config) {
  return `<div class="cabecalho-modulo"><div class="icone-grande">${config.icone}</div><div><h2>${esc(config.titulo)}</h2><p>${esc(config.descricao)}</p></div></div>`;
}
function renderModuloEmPreparacao(area, nome) {
  const config = MODULOS[nome];
  area.innerHTML = cabecalhoModulo(config) + `
    <div class="aviso-modulo"><strong>Este módulo está na próxima etapa de integração.</strong><br>O espaço já está preparado na navegação. Vamos conectá-lo à planilha e ao Apps Script sem alterar os dados existentes.</div>
    <div class="form-acoes"><button class="botao-acao" data-voltar-inicio>Voltar ao início</button></div>`;
  area.querySelector('[data-voltar-inicio]').addEventListener('click', voltarInicio);
}

async function carregarClientesApi() {
  const result = await chamarApi({action:'listarClientes'});
  clientesCache = result.dados.clientes || [];
  return clientesCache;
}
function nomeClientePorId(id) {
  const cliente = clientesCache.find(x => String(campo(x,['id_cliente','ID Cliente','id'])) === String(id));
  return cliente ? campo(cliente,['nome','NOME'],'Cliente') : String(id || 'Cliente');
}
async function renderClientes(area) {
  const config = MODULOS.clientes;
  area.innerHTML = cabecalhoModulo(config) + `
    <div class="barra-acoes"><input id="busca-clientes" class="campo-busca" type="search" placeholder="Buscar por nome, cidade ou Instagram"><button id="novo-cliente" class="botao-acao destaque">＋ Novo</button><button id="atualizar-clientes" class="botao-acao">↻</button></div>
    <div id="status-clientes" class="status">Consultando clientes...</div><div id="lista-clientes" class="lista-registros"></div>`;
  $('novo-cliente').addEventListener('click', () => abrirFormularioCliente());
  $('atualizar-clientes').addEventListener('click', () => atualizarListaClientes());
  $('busca-clientes').addEventListener('input', filtrarListaClientes);
  await atualizarListaClientes();
}
async function atualizarListaClientes() {
  $('status-clientes').textContent = 'Consultando clientes...';
  try {
    await carregarClientesApi();
    renderListaClientes();
    $('status-clientes').className = 'status ok';
    $('status-clientes').textContent = `${clientesCache.length} cliente(s) encontrado(s).`;
  } catch (error) {
    $('status-clientes').className = 'status error';
    $('status-clientes').textContent = error.message;
  }
}
function filtrarListaClientes() { renderListaClientes(); }
function renderListaClientes() {
  const termo = String($('busca-clientes')?.value || '').toLowerCase().trim();
  const lista = clientesCache.filter(cliente => [campo(cliente,['nome']),campo(cliente,['instagram']),campo(cliente,['cidade']),campo(cliente,['telefone'])].join(' ').toLowerCase().includes(termo));
  $('lista-clientes').innerHTML = lista.length ? lista.map(cliente => {
    const id = campo(cliente,['id_cliente','ID Cliente','id']);
    const nome = campo(cliente,['nome','NOME'],'Sem nome');
    const status = campo(cliente,['status','STATUS'],'Ativo');
    const meta = [campo(cliente,['cidade']),campo(cliente,['telefone']),campo(cliente,['instagram'])].filter(Boolean).join(' • ');
    return `<article class="registro"><div class="registro-topo"><div><h3>${esc(nome)}</h3><div class="meta">${esc(meta || 'Sem informações adicionais')}</div><div class="meta">${esc(id)}</div></div>${badge(status)}</div><div class="registro-acoes"><button class="botao-acao destaque" data-cliente-editar="${esc(id)}">Editar</button><button class="botao-acao" data-cliente-ver="${esc(id)}">Detalhes</button></div></article>`;
  }).join('') : '<div class="vazio">Nenhum cliente encontrado.</div>';
  $('lista-clientes').querySelectorAll('[data-cliente-editar]').forEach(btn => btn.addEventListener('click', () => {
    const item = clientesCache.find(x => String(campo(x,['id_cliente','ID Cliente','id'])) === btn.dataset.clienteEditar);
    if (item) abrirFormularioCliente(item);
  }));
  $('lista-clientes').querySelectorAll('[data-cliente-ver]').forEach(btn => btn.addEventListener('click', () => {
    const item = clientesCache.find(x => String(campo(x,['id_cliente','ID Cliente','id'])) === btn.dataset.clienteVer);
    if (item) abrirDetalhesCliente(item);
  }));
}
function abrirFormularioCliente(cliente = null) {
  const editar = !!cliente;
  const id = campo(cliente,['id_cliente','ID Cliente','id']);
  abrirModal(editar ? 'Editar cliente' : 'Novo cliente', `
    <form id="form-cliente" class="form-grid">
      <div class="form-grupo full"><label>Nome *</label><input class="campo-form" name="nome" required value="${esc(campo(cliente,['nome']))}"></div>
      <div class="form-grupo"><label>Telefone</label><input class="campo-form" name="telefone" value="${esc(campo(cliente,['telefone']))}"></div>
      <div class="form-grupo"><label>Instagram</label><input class="campo-form" name="instagram" value="${esc(campo(cliente,['instagram']))}" placeholder="@usuario"></div>
      <div class="form-grupo full"><label>E-mail</label><input class="campo-form" name="email" type="email" value="${esc(campo(cliente,['email']))}"></div>
      <div class="form-grupo full"><label>Endereço</label><input class="campo-form" name="endereco" value="${esc(campo(cliente,['endereco']))}"></div>
      <div class="form-grupo"><label>Bairro</label><input class="campo-form" name="bairro" value="${esc(campo(cliente,['bairro']))}"></div>
      <div class="form-grupo"><label>Cidade</label><input class="campo-form" name="cidade" value="${esc(campo(cliente,['cidade']))}"></div>
      <div class="form-grupo full"><label>Observações</label><textarea class="campo-form textarea" name="observacoes">${esc(campo(cliente,['observacoes']))}</textarea></div>
      <div class="form-grupo full"><div id="erro-form-cliente" class="mensagem"></div></div>
      <div class="form-grupo full form-acoes"><button type="button" class="botao-acao" data-fechar-modal>Cancelar</button><button type="submit" class="botao-acao destaque">Salvar cliente</button></div>
    </form>`);
  $('form-cliente').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dados = Object.fromEntries(form.entries());
    if (!dados.nome.trim()) return;
    const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true; submit.textContent = 'Salvando...';
    try {
      const result = editar
        ? await chamarApi({action:'atualizarCliente',id_cliente:id,cliente:dados})
        : await chamarApi({action:'cadastrarCliente',cliente:dados});
      fecharModal(); toast(result.dados?.mensagem || 'Cliente salvo com sucesso.'); await atualizarListaClientes();
    } catch (error) {
      $('erro-form-cliente').textContent = error.message; submit.disabled = false; submit.textContent = 'Salvar cliente';
    }
  });
  $('form-cliente').querySelector('[data-fechar-modal]').addEventListener('click', fecharModal);
}
function abrirDetalhesCliente(cliente) {
  const dados = [
    ['Telefone',campo(cliente,['telefone'])],['Instagram',campo(cliente,['instagram'])],['E-mail',campo(cliente,['email'])],
    ['Endereço',campo(cliente,['endereco'])],['Bairro',campo(cliente,['bairro'])],['Cidade',campo(cliente,['cidade'])],
    ['Observações',campo(cliente,['observacoes'])]
  ].filter(x => x[1]);
  abrirModal(campo(cliente,['nome'],'Cliente'), `<div class="lista-registros">${dados.map(x => `<div class="registro"><div class="meta">${esc(x[0])}</div><strong>${esc(x[1])}</strong></div>`).join('') || '<div class="vazio">Sem detalhes adicionais.</div>'}</div><div class="form-acoes"><button class="botao-acao destaque" data-fechar-modal>Fechar</button></div>`);
  $('modal-root').querySelector('[data-fechar-modal]').addEventListener('click', fecharModal);
}

async function renderOrcamentos(area) {
  const config = MODULOS.orcamentos;
  area.innerHTML = cabecalhoModulo(config) + `
    <div class="barra-acoes"><input id="busca-orcamentos" class="campo-busca" type="search" placeholder="Buscar por cliente ou orçamento"><select id="filtro-orcamento" class="campo-filtro"><option value="Todos">Todos os status</option><option>Em elaboração</option><option>Enviado</option><option>Aprovado</option><option>Recusado</option><option>Cancelado</option></select><button id="novo-orcamento" class="botao-acao destaque">＋ Novo</button><button id="atualizar-orcamentos" class="botao-acao">↻</button></div>
    <div id="status-orcamentos" class="status">Consultando orçamentos...</div><div id="lista-orcamentos" class="lista-registros"></div>`;
  $('novo-orcamento').addEventListener('click', abrirFormularioOrcamento);
  $('atualizar-orcamentos').addEventListener('click', atualizarListaOrcamentos);
  $('busca-orcamentos').addEventListener('input', filtrarListaOrcamentos);
  $('filtro-orcamento').addEventListener('change', filtrarListaOrcamentos);
  await carregarClientesApi();
  await atualizarListaOrcamentos();
}
async function atualizarListaOrcamentos() {
  $('status-orcamentos').textContent = 'Consultando orçamentos...';
  try {
    const result = await chamarApi({action:'listarOrcamentos'});
    orcamentosCache = result.dados.orcamentos || [];
    renderListaOrcamentos();
    $('status-orcamentos').className = 'status ok';
    $('status-orcamentos').textContent = `${orcamentosCache.length} orçamento(s) encontrado(s).`;
  } catch (error) {
    $('status-orcamentos').className = 'status error'; $('status-orcamentos').textContent = error.message;
  }
}
function filtrarListaOrcamentos() { renderListaOrcamentos(); }
function renderListaOrcamentos() {
  const termo = String($('busca-orcamentos')?.value || '').toLowerCase().trim();
  const filtro = $('filtro-orcamento')?.value || 'Todos';
  const itens = orcamentosCache.filter(o => {
    const cliente = nomeClientePorId(campo(o,['id_cliente','ID Cliente']));
    const id = campo(o,['id_orcamento','ID Orçamento','id']);
    const status = campo(o,['status','Status']);
    return (!termo || `${id} ${cliente}`.toLowerCase().includes(termo)) && (filtro === 'Todos' || status === filtro);
  });
  $('lista-orcamentos').innerHTML = itens.length ? itens.map(o => {
    const id = campo(o,['id_orcamento','ID Orçamento','id']);
    const status = campo(o,['status','Status'],'Em elaboração');
    const total = campo(o,['total','valor_total','TOTAL'],0);
    const cliente = nomeClientePorId(campo(o,['id_cliente','ID Cliente']));
    const data = campo(o,['data','data_criacao','criado_em']);
    return `<article class="registro"><div class="registro-topo"><div><h3>${esc(cliente)}</h3><div class="meta">${esc(id)} • ${esc(dataBR(data))}</div></div><div class="valor">${esc(moeda(total))}</div></div><div class="registro-acoes">${badge(status)}<button class="botao-acao destaque" data-orc-ver="${esc(id)}">Visualizar</button>${status !== 'Aprovado' && status !== 'Cancelado' ? `<button class="botao-acao" data-orc-aprovar="${esc(id)}">Aprovar</button>` : ''}</div></article>`;
  }).join('') : '<div class="vazio">Nenhum orçamento encontrado.</div>';
  $('lista-orcamentos').querySelectorAll('[data-orc-ver]').forEach(btn => btn.addEventListener('click', () => visualizarOrcamento(btn.dataset.orcVer)));
  $('lista-orcamentos').querySelectorAll('[data-orc-aprovar]').forEach(btn => btn.addEventListener('click', () => aprovarOrcamentoTela(btn.dataset.orcAprovar)));
}
function novoItemOrcamento() {
  const row = document.createElement('div'); row.className = 'item-orcamento';
  row.innerHTML = `<div class="form-grupo descricao-item"><label>Descrição do produto/serviço</label><input class="campo-form item-descricao" required placeholder="Ex.: Sapateira industrial"></div><div class="form-grupo"><label>Qtd.</label><input class="campo-form item-qtd" type="number" min="0.01" step="0.01" value="1"></div><div class="form-grupo"><label>Custo un.</label><input class="campo-form item-custo" type="number" min="0" step="0.01" value="0"></div><div class="form-grupo"><label>Preço un.</label><input class="campo-form item-preco" type="number" min="0" step="0.01" value="0"></div><button type="button" class="remover-item">Remover item</button>`;
  row.querySelector('.remover-item').addEventListener('click', () => { row.remove(); atualizarResumoQuote(); });
  row.querySelectorAll('input').forEach(input => input.addEventListener('input', atualizarResumoQuote));
  return row;
}
function lerItensQuote() {
  return [...document.querySelectorAll('.item-orcamento')].map(row => ({
    descricao: row.querySelector('.item-descricao').value.trim(),
    quantidade: Number(row.querySelector('.item-qtd').value || 0),
    unidade: 'un',
    custo_unitario: Number(row.querySelector('.item-custo').value || 0),
    preco_unitario: Number(row.querySelector('.item-preco').value || 0),
    observacoes: ''
  })).filter(item => item.descricao && item.quantidade > 0);
}
function atualizarResumoQuote() {
  const itens = lerItensQuote();
  const subtotal = itens.reduce((sum,item) => sum + item.quantidade * item.preco_unitario, 0);
  const desconto = Number($('quote-desconto')?.value || 0);
  const frete = Number($('quote-frete')?.value || 0);
  const entrada = Number($('quote-entrada')?.value || 0);
  const total = subtotal - desconto + frete;
  $('quote-subtotal').textContent = moeda(subtotal);
  $('quote-total').textContent = moeda(total);
  $('quote-saldo').textContent = moeda(total - entrada);
}
async function abrirFormularioOrcamento() {
  try { if (!clientesCache.length) await carregarClientesApi(); } catch (error) { toast(error.message); return; }
  abrirModal('Novo orçamento', `
    <form id="form-orcamento">
      <div class="form-grid">
        <div class="form-grupo full"><label>Cliente *</label><select class="campo-form" name="id_cliente" required><option value="">Selecione o cliente</option>${clientesCache.map(c => `<option value="${esc(campo(c,['id_cliente','ID Cliente','id']))}">${esc(campo(c,['nome','NOME']))}</option>`).join('')}</select></div>
        <div class="form-grupo"><label>Validade</label><input class="campo-form" name="validade" type="date"></div>
        <div class="form-grupo"><label>Prazo de produção (dias)</label><input class="campo-form" name="prazo_dias" type="number" min="0" step="1"></div>
      </div>
      <div class="form-grupo full" style="margin-top:14px"><label>Itens do orçamento</label><div class="itens-orcamento" id="itens-quote"></div><button type="button" class="botao-acao" id="adicionar-item" style="margin-top:8px">＋ Adicionar item</button></div>
      <div class="form-grid" style="margin-top:13px">
        <div class="form-grupo"><label>Desconto</label><input class="campo-form" id="quote-desconto" name="desconto" type="number" min="0" step="0.01" value="0"></div>
        <div class="form-grupo"><label>Frete</label><input class="campo-form" id="quote-frete" name="frete" type="number" min="0" step="0.01" value="0"></div>
        <div class="form-grupo"><label>Entrada</label><input class="campo-form" id="quote-entrada" name="entrada" type="number" min="0" step="0.01" value="0"></div>
        <div class="form-grupo"><label>Forma de pagamento</label><input class="campo-form" name="forma_pagamento" placeholder="Pix, cartão..."></div>
        <div class="form-grupo full"><label>Observações</label><textarea class="campo-form textarea" name="observacoes"></textarea></div>
      </div>
      <div class="resumo-valores"><div><small>Subtotal</small><strong id="quote-subtotal">R$ 0,00</strong></div><div><small>Total</small><strong id="quote-total">R$ 0,00</strong></div><div><small>Saldo</small><strong id="quote-saldo">R$ 0,00</strong></div></div>
      <div id="erro-form-orcamento" class="mensagem"></div>
      <div class="form-acoes"><button type="button" class="botao-acao" data-fechar-modal>Cancelar</button><button type="submit" class="botao-acao destaque">Salvar orçamento</button></div>
    </form>`);
  $('itens-quote').appendChild(novoItemOrcamento());
  $('adicionar-item').addEventListener('click', () => $('itens-quote').appendChild(novoItemOrcamento()));
  ['quote-desconto','quote-frete','quote-entrada'].forEach(id => $(id).addEventListener('input', atualizarResumoQuote));
  $('form-orcamento').querySelector('[data-fechar-modal]').addEventListener('click', fecharModal);
  $('form-orcamento').addEventListener('submit', salvarOrcamento);
  atualizarResumoQuote();
}
async function salvarOrcamento(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const dadosForm = Object.fromEntries(new FormData(form).entries());
  const itens = lerItensQuote();
  if (!dadosForm.id_cliente) { $('erro-form-orcamento').textContent = 'Selecione o cliente.'; return; }
  if (!itens.length) { $('erro-form-orcamento').textContent = 'Adicione pelo menos um item.'; return; }
  const subtotal = itens.reduce((sum,item) => sum + item.quantidade * item.preco_unitario, 0);
  const payload = {
    id_cliente: dadosForm.id_cliente,
    validade: dadosForm.validade,
    prazo_dias: Number(dadosForm.prazo_dias || 0),
    subtotal,
    desconto: Number(dadosForm.desconto || 0),
    frete: Number(dadosForm.frete || 0),
    entrada: Number(dadosForm.entrada || 0),
    forma_pagamento: dadosForm.forma_pagamento || '',
    observacoes: dadosForm.observacoes || '',
    itens
  };
  const totalCalculado = subtotal - payload.desconto + payload.frete;
  if (payload.desconto < 0 || payload.frete < 0 || payload.entrada < 0 || totalCalculado < 0 || payload.entrada > totalCalculado) {
    $('erro-form-orcamento').textContent = 'Confira desconto, frete e entrada.'; return;
  }
  const botao = form.querySelector('[type=submit]'); botao.disabled = true; botao.textContent = 'Salvando...';
  try {
    const result = await chamarApi({action:'criarOrcamento',orcamento:payload});
    fecharModal(); toast(result.dados?.mensagem || 'Orçamento criado.'); await atualizarListaOrcamentos();
  } catch (error) {
    $('erro-form-orcamento').textContent = error.message; botao.disabled = false; botao.textContent = 'Salvar orçamento';
  }
}
async function visualizarOrcamento(id) {
  try {
    const result = await chamarApi({action:'buscarOrcamento',id_orcamento:id});
    const o = result.dados.orcamento || {}; const itens = result.dados.itens || [];
    const nome = nomeClientePorId(campo(o,['id_cliente','ID Cliente']));
    abrirModal(`Orçamento • ${nome}`, `
      <div class="lista-registros">
        <div class="registro"><div class="registro-topo"><div><h3>${esc(nome)}</h3><div class="meta">${esc(id)} • ${esc(dataBR(campo(o,['data','data_criacao'])))}</div></div><div class="valor">${esc(moeda(campo(o,['total','valor_total'],0)))}</div></div>${badge(campo(o,['status'],'Em elaboração'))}</div>
        <div class="registro"><h3>Itens</h3>${itens.map(item => `<div class="meta">${esc(campo(item,['descricao','DESCRICAO']))} • ${esc(campo(item,['quantidade'],1))} × ${esc(moeda(campo(item,['preco_unitario','preco'],0)))}</div>`).join('') || '<div class="meta">Sem itens detalhados.</div>'}</div>
        <div class="registro"><div class="meta">Validade: ${esc(dataBR(campo(o,['validade'])))}</div><div class="meta">Prazo: ${esc(campo(o,['prazo_dias'],'—'))} dias</div><div class="meta">Entrada: ${esc(moeda(campo(o,['entrada'],0)))} • Saldo: ${esc(moeda(campo(o,['saldo'],0)))}</div><div class="meta">Observações: ${esc(campo(o,['observacoes'],'—'))}</div></div>
      </div><div class="form-acoes"><button class="botao-acao" data-fechar-modal>Fechar</button></div>`);
    $('modal-root').querySelector('[data-fechar-modal]').addEventListener('click', fecharModal);
  } catch (error) { toast(error.message); }
}
async function aprovarOrcamentoTela(id) {
  if (!confirm('Aprovar este orçamento e gerar o pedido de produção?')) return;
  try {
    const result = await chamarApi({action:'aprovarOrcamento',id_orcamento:id});
    toast(result.dados?.mensagem || 'Orçamento aprovado. Pedido criado.');
    await atualizarListaOrcamentos();
  } catch (error) { toast(error.message); }
}

async function renderProducao(area) {
  const config = MODULOS.producao;
  area.innerHTML = cabecalhoModulo(config) + `
    <div class="barra-acoes"><input id="busca-producao" class="campo-busca" type="search" placeholder="Buscar por pedido ou cliente"><select id="filtro-producao" class="campo-filtro"><option value="Todos">Todos os status</option>${STATUS_PRODUCAO.map(s => `<option>${esc(s)}</option>`).join('')}</select><button id="atualizar-producao" class="botao-acao">↻</button></div>
    <div id="status-producao" class="status">Consultando pedidos...</div><div id="lista-producao" class="lista-registros"></div>`;
  $('atualizar-producao').addEventListener('click', atualizarListaProducao);
  $('busca-producao').addEventListener('input', filtrarListaProducao);
  $('filtro-producao').addEventListener('change', filtrarListaProducao);
  await carregarClientesApi();
  await atualizarListaProducao();
}
async function atualizarListaProducao() {
  $('status-producao').textContent = 'Consultando pedidos...';
  try {
    const result = await chamarApi({action:'listarPedidos'});
    pedidosCache = result.dados.pedidos || [];
    renderListaProducao();
    $('status-producao').className = 'status ok'; $('status-producao').textContent = `${pedidosCache.length} pedido(s) na produção.`;
  } catch (error) {
    $('status-producao').className = 'status error'; $('status-producao').textContent = error.message;
  }
}
function filtrarListaProducao() { renderListaProducao(); }
function renderListaProducao() {
  const termo = String($('busca-producao')?.value || '').toLowerCase().trim();
  const filtro = $('filtro-producao')?.value || 'Todos';
  const pedidos = pedidosCache.filter(p => {
    const status = campo(p,['status','Status'],'Aguardando material');
    const texto = [campo(p,['id_pedido','ID Pedido']),nomeClientePorId(campo(p,['id_cliente','ID Cliente'])),campo(p,['id_orcamento','ID Orçamento'])].join(' ').toLowerCase();
    return (!termo || texto.includes(termo)) && (filtro === 'Todos' || status === filtro);
  });
  $('lista-producao').innerHTML = pedidos.length ? pedidos.map(p => {
    const id = campo(p,['id_pedido','ID Pedido','id']);
    const status = campo(p,['status','Status'],'Aguardando material');
    const cliente = campo(p,['nome_cliente','cliente'],nomeClientePorId(campo(p,['id_cliente','ID Cliente'])));
    const total = campo(p,['total','valor_total'],0);
    return `<article class="registro"><div class="registro-topo"><div><h3>${esc(cliente)}</h3><div class="meta">Pedido ${esc(id)} • Orçamento ${esc(campo(p,['id_orcamento','ID Orçamento'],'—'))}</div><div class="meta">Data: ${esc(dataBR(campo(p,['data','data_criacao','criado_em'])))} • Prazo: ${esc(campo(p,['prazo_dias','prazo'],'—'))} dias</div></div><div class="valor">${esc(moeda(total))}</div></div><div class="registro-acoes">${badge(status)}<button class="botao-acao destaque" data-pedido-ver="${esc(id)}">Detalhes</button><select class="campo-filtro" data-pedido-status="${esc(id)}" aria-label="Alterar status">${STATUS_PRODUCAO.map(s => `<option value="${esc(s)}" ${s===status?'selected':''}>${esc(s)}</option>`).join('')}</select></div></article>`;
  }).join('') : '<div class="vazio">Nenhum pedido encontrado.</div>';
  $('lista-producao').querySelectorAll('[data-pedido-ver]').forEach(btn => btn.addEventListener('click', () => visualizarPedido(btn.dataset.pedidoVer)));
  $('lista-producao').querySelectorAll('[data-pedido-status]').forEach(select => select.addEventListener('change', () => alterarStatusPedido(select.dataset.pedidoStatus, select.value)));
}
async function alterarStatusPedido(id, status) {
  if (!confirm(`Alterar o pedido ${id} para "${status}"?`)) { await atualizarListaProducao(); return; }
  try {
    const result = await chamarApi({action:'atualizarPedidoStatus',id_pedido:id,status});
    toast(result.dados?.mensagem || 'Status atualizado.'); await atualizarListaProducao();
  } catch (error) { toast(error.message); await atualizarListaProducao(); }
}
async function visualizarPedido(id) {
  try {
    const result = await chamarApi({action:'buscarPedido',id_pedido:id});
    const p = result.dados.pedido || {};
    const cliente = campo(p,['nome_cliente','cliente'],nomeClientePorId(campo(p,['id_cliente','ID Cliente'])));
    abrirModal(`Pedido ${id}`, `
      <div class="lista-registros">
        <div class="registro"><div class="registro-topo"><h3>${esc(cliente)}</h3>${badge(campo(p,['status'],'Aguardando material'))}</div><div class="meta">Orçamento: ${esc(campo(p,['id_orcamento'],'—'))}</div><div class="meta">Criado em: ${esc(dataBR(campo(p,['data','criado_em'])))}</div><div class="meta">Prazo: ${esc(campo(p,['prazo_dias'],'—'))} dias</div></div>
        <div class="registro"><div class="meta">Total: <strong>${esc(moeda(campo(p,['total'],0)))}</strong></div><div class="meta">Entrada: ${esc(moeda(campo(p,['entrada'],0)))}</div><div class="meta">Saldo: ${esc(moeda(campo(p,['saldo'],0)))}</div><div class="meta">Observações: ${esc(campo(p,['observacoes'],'—'))}</div></div>
      </div><div class="form-acoes"><button class="botao-acao" data-fechar-modal>Fechar</button></div>`);
    $('modal-root').querySelector('[data-fechar-modal]').addEventListener('click', fecharModal);
  } catch (error) { toast(error.message); }
}

function abrirModal(titulo, html) {
  $('modal-root').innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><header class="modal-head"><h3>${esc(titulo)}</h3><button class="modal-close" id="modal-x" aria-label="Fechar">×</button></header><div class="modal-body">${html}</div></section></div>`;
  $('modal-backdrop').addEventListener('click', event => { if (event.target === $('modal-backdrop')) fecharModal(); });
  $('modal-x').addEventListener('click', fecharModal);
}
function fecharModal() { $('modal-root').innerHTML = ''; }
async function instalarApp() {
  if (!installPromptEvent) { toast('Use o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.'); return; }
  installPromptEvent.prompt();
  await installPromptEvent.userChoice;
  installPromptEvent = null;
  $('btn-instalar-home').classList.add('escondido');
}

document.addEventListener('DOMContentLoaded', iniciarApp);
