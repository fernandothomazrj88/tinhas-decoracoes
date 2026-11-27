'use strict';

const TINHAS_VERSION = (window.TINHAS_CONFIG && window.TINHAS_CONFIG.APP_VERSION) || '1.8.0';
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
let materiaisCache = [];
let agendaTarefasCache = [];
let portfolioCache = [];
let marketingCache = [];
let agendaMesAtual = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let agendaDiaSelecionado = null;
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
  const telaAtiva = $(id);
  if (telaAtiva) telaAtiva.scrollTop = 0;
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
  const usuario = $('usuario').value.trim();
  const senha = $('senha').value;
  const botao = $('btn-login');
  const mensagem = $('mensagem-login');
  mensagem.textContent = '';
  botao.disabled = true; botao.textContent = 'Entrando...';
  try {
    const result = await chamarApi({action:'login', usuario, senha}, false);
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

async function sair() {
  try { if (sessao.token) await chamarApi({action:'logout'}); } catch (_) {}
  limparSessao();
  moduloAtual = null;
  $('senha').value = '';
  $('usuario').value = '';
  fecharMenu();
  mostrarTela('tela-login');
}

function abrirHome() {
  moduloAtual = null;
  const user = sessao.usuario || {};
  const nome = user.nome || user.email || 'Equipe Tinhas';
  $('nome-usuario').textContent = nome;
  const identificador = normalizarTexto(`${user.nome || ''} ${user.usuario || ''} ${user.email || ''}`);
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
  producao: {titulo:'Produção',icone:'🛠️',descricao:'Acompanhe os pedidos e as etapas da fabricação.'},
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
    else if (nome === 'materiais') await renderMateriais(area);
    else if (nome === 'estoque') await renderEstoque(area);
    else if (nome === 'financeiro') await renderFinanceiro(area);
    else if (nome === 'agenda') await renderAgenda(area);
    else if (nome === 'portfolio') await renderPortfolio(area);
    else if (nome === 'marketing') await renderMarketing(area);
    else if (nome === 'configuracoes') await renderConfiguracoes(area);
    else renderModuloEmPreparacao(area, nome);
  } catch (error) {
    area.innerHTML = cabecalhoModulo(config) + `<div class="erro">${esc(error.message)}</div><div class="form-acoes"><button class="botao-acao" data-voltar-inicio>Voltar ao início</button></div>`;
    area.querySelector('[data-voltar-inicio]')?.addEventListener('click', voltarInicio);
  }
}
function cabecalhoModulo(config) {
  return `<div class="cabecalho-modulo"><div class="icone-grande">${config.icone}</div><div><h2>${esc(config.titulo)}</h2><p>${esc(config.descricao)}</p></div></div>`;
}
async function renderConfiguracoes(area) {
  const user = sessao.usuario || {};
  const ehAdmin = ['administrador','admin'].includes(normalizarTexto(user.papel || ''));
  let blocoUsuarios = '';
  if (ehAdmin) {
    try {
      const result = await chamarApi({action:'listarUsuarios'});
      const usuarios = result.dados.usuarios || [];
      blocoUsuarios = `
        <section class="cartao-configuracoes painel-usuarios">
          <h3>Gerenciar usuários</h3>
          <p class="config-ajuda">Crie acessos para a equipe usando nome de usuário e senha. E-mail não é necessário.</p>
          <div class="lista-usuarios-config">${usuarios.map(u => `
            <div class="usuario-config-item">
              <div><strong>${esc(u.nome || 'Usuário')}</strong><small>@${esc(u.usuario || 'sem-login')} · ${esc(u.papel || 'Equipe')}</small></div>
              <span class="usuario-situacao ${u.ativo ? 'ativo' : 'inativo'}">${u.ativo ? 'Ativo' : 'Inativo'}</span>
            </div>`).join('') || '<div class="vazio">Nenhum usuário cadastrado.</div>'}</div>
          <h3 class="titulo-criar-usuario">Criar novo usuário</h3>
          <form id="form-criar-usuario" class="form-grid">
            <div class="form-grupo full"><label for="novo-nome">Nome da pessoa</label><input id="novo-nome" class="campo-form" type="text" maxlength="80" placeholder="Ex.: Matheus Silva" required></div>
            <div class="form-grupo full"><label for="novo-usuario">Nome de usuário</label><input id="novo-usuario" class="campo-form" type="text" minlength="3" maxlength="32" placeholder="Ex.: matheusmarcenaria" autocapitalize="none" spellcheck="false" required></div>
            <div class="form-grupo full"><label for="nova-senha-inicial">Senha inicial</label><input id="nova-senha-inicial" class="campo-form" type="password" minlength="6" maxlength="128" autocomplete="new-password" required><small class="ajuda-campo">Mínimo de 6 caracteres. A pessoa poderá trocar depois em Configurações.</small></div>
            <div class="form-grupo full"><label for="novo-papel">Perfil de acesso</label><select id="novo-papel" class="campo-form"><option value="Equipe">Equipe</option><option value="Administrador">Administrador</option></select></div>
            <p id="mensagem-criar-usuario" class="status error" style="display:none" role="alert"></p>
            <div class="form-acoes full"><button id="btn-criar-usuario" type="submit" class="botao-acao destaque">Criar usuário</button></div>
          </form>
        </section>`;
    } catch (error) {
      blocoUsuarios = `<section class="cartao-configuracoes"><h3>Gerenciar usuários</h3><p class="status error">${esc(error.message || 'Não foi possível carregar a equipe.')}</p></section>`;
    }
  }
  area.innerHTML = cabecalhoModulo(MODULOS.configuracoes) + `
    <section class="cartao-configuracoes">
      <div class="perfil-config"><div class="icone-grande">👤</div><div><strong>${esc(user.nome || 'Usuário')}</strong><div class="perfil-login">@${esc(user.usuario || 'usuário')}</div><small>${esc(user.papel || 'Equipe Tinhas')}</small></div></div>
      <h3>Privacidade e segurança</h3>
      <p class="config-ajuda">Sua senha é individual. Você pode alterá-la sempre que quiser.</p>
      <h3 class="titulo-criar-usuario">Alterar senha</h3>
      <form id="form-alterar-senha" class="form-grid">
        <div class="form-grupo full"><label for="senha-atual">Senha atual</label><input id="senha-atual" class="campo-form" type="password" autocomplete="current-password" required></div>
        <div class="form-grupo full"><label for="senha-nova">Nova senha (mínimo de 8 caracteres)</label><input id="senha-nova" class="campo-form" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></div>
        <div class="form-grupo full"><label for="senha-confirmacao">Confirme a nova senha</label><input id="senha-confirmacao" class="campo-form" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></div>
        <p id="mensagem-alterar-senha" class="status error" style="display:none" role="alert"></p>
        <div class="form-acoes full"><button id="btn-salvar-senha" type="submit" class="botao-acao destaque">Atualizar senha</button></div>
      </form>
    </section>
    ${blocoUsuarios}
    <div class="aviso-modulo"><strong>Conta protegida</strong><br>As senhas não são exibidas nem armazenadas em texto aberto.</div>`;
  $('form-alterar-senha').addEventListener('submit', salvarAlteracaoSenha);
  $('form-criar-usuario')?.addEventListener('submit', criarNovoUsuarioConfig);
}

async function criarNovoUsuarioConfig(event) {
  event.preventDefault();
  const botao = $('btn-criar-usuario');
  const mensagem = $('mensagem-criar-usuario');
  const dados = {
    nome: $('novo-nome').value.trim(),
    usuario: $('novo-usuario').value.trim(),
    senhaInicial: $('nova-senha-inicial').value,
    papel: $('novo-papel').value
  };
  mensagem.style.display = 'none';
  botao.disabled = true; botao.textContent = 'Criando...';
  try {
    const result = await chamarApi({action:'criarUsuario', usuarioDados:dados});
    toast(result.dados.mensagem || 'Usuário criado com sucesso!');
    await renderConfiguracoes($('modulo-conteudo'));
  } catch (error) {
    mensagem.textContent = error.message || 'Não foi possível criar o usuário.';
    mensagem.style.display = 'block';
    botao.disabled = false; botao.textContent = 'Criar usuário';
  }
}

async function salvarAlteracaoSenha(event) {
  event.preventDefault();
  const atual = $('senha-atual').value;
  const nova = $('senha-nova').value;
  const confirmacao = $('senha-confirmacao').value;
  const mensagem = $('mensagem-alterar-senha');
  const botao = $('btn-salvar-senha');
  mensagem.style.display = 'none';
  if (nova.length < 8) { mensagem.textContent = 'A nova senha precisa ter pelo menos 8 caracteres.'; mensagem.style.display = 'block'; return; }
  if (nova !== confirmacao) { mensagem.textContent = 'A nova senha e a confirmação não conferem.'; mensagem.style.display = 'block'; return; }
  botao.disabled = true; botao.textContent = 'Salvando...';
  try {
    await chamarApi({action:'alterarSenha', senhaAtual:atual, novaSenha:nova, confirmacao});
    toast('Senha alterada com sucesso!');
    await renderConfiguracoes($('modulo-conteudo'));
  } catch (error) {
    mensagem.textContent = error.message || 'Não foi possível alterar a senha.';
    mensagem.style.display = 'block';
    botao.disabled = false; botao.textContent = 'Atualizar senha';
  }
}



/* =====================================================
   MATERIAIS — CATÁLOGO
===================================================== */
function materialAtivoUI(valor) {
  return valor === true || ['true','sim','1'].includes(String(valor).toLowerCase().trim());
}
function quantidadeMaterialUI(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {maximumFractionDigits:3});
}
async function renderMateriais(area) {
  const config = MODULOS.materiais;
  area.innerHTML = cabecalhoModulo(config) + `
    <div class="barra-acoes">
      <input id="busca-materiais" class="campo-busca" type="search" placeholder="Buscar por material, categoria ou fornecedor">
      <select id="filtro-materiais" class="campo-filtro" aria-label="Filtrar materiais">
        <option value="Todos">Todos</option><option value="Ativos">Ativos</option><option value="Inativos">Inativos</option><option value="Baixo">Estoque baixo</option>
      </select>
      <button id="novo-material" class="botao-acao destaque">＋ Novo</button>
      <button id="atualizar-materiais" class="botao-acao" title="Atualizar lista">↻</button>
    </div>
    <div id="status-materiais" class="status">Consultando materiais...</div>
    <div id="lista-materiais" class="lista-registros"></div>
    <div class="aviso-modulo"><strong>Como funciona:</strong> aqui você cadastra os materiais, unidades, fornecedores e custos. O saldo atual é informado no cadastro inicial; as entradas e saídas serão controladas no módulo Estoque.</div>`;
  $('novo-material').addEventListener('click', () => abrirFormularioMaterial());
  $('atualizar-materiais').addEventListener('click', atualizarListaMateriais);
  $('busca-materiais').addEventListener('input', renderListaMateriais);
  $('filtro-materiais').addEventListener('change', renderListaMateriais);
  await atualizarListaMateriais();
}
async function atualizarListaMateriais() {
  const status = $('status-materiais');
  if (!status) return;
  status.className = 'status'; status.textContent = 'Consultando materiais...';
  try {
    const result = await chamarApi({action:'listarMateriais'});
    materiaisCache = result.dados.materiais || [];
    renderListaMateriais();
    const ativos = materiaisCache.filter(m => materialAtivoUI(m.ativo)).length;
    const baixo = materiaisCache.filter(m => materialAtivoUI(m.ativo) && Number(m.estoque_minimo || 0) > 0 && Number(m.estoque_atual || 0) <= Number(m.estoque_minimo || 0)).length;
    status.className = 'status ok';
    status.textContent = `${materiaisCache.length} material(is) cadastrado(s) • ${ativos} ativo(s) • ${baixo} abaixo do mínimo.`;
  } catch (error) {
    status.className = 'status error'; status.textContent = error.message || 'Não foi possível carregar os materiais.';
  }
}
function renderListaMateriais() {
  const alvo = $('lista-materiais');
  if (!alvo) return;
  const termo = String($('busca-materiais')?.value || '').toLowerCase().trim();
  const filtro = $('filtro-materiais')?.value || 'Todos';
  const lista = materiaisCache.filter(m => {
    const texto = [m.nome,m.categoria,m.unidade,m.fornecedor,m.id_material].join(' ').toLowerCase();
    const ativo = materialAtivoUI(m.ativo);
    const baixo = Number(m.estoque_minimo || 0) > 0 && Number(m.estoque_atual || 0) <= Number(m.estoque_minimo || 0);
    return (!termo || texto.includes(termo)) &&
      (filtro === 'Todos' || (filtro === 'Ativos' && ativo) || (filtro === 'Inativos' && !ativo) || (filtro === 'Baixo' && ativo && baixo));
  });
  alvo.innerHTML = lista.length ? lista.map(m => {
    const baixo = Number(m.estoque_minimo || 0) > 0 && Number(m.estoque_atual || 0) <= Number(m.estoque_minimo || 0);
    const ativo = materialAtivoUI(m.ativo);
    const meta = [m.categoria,m.unidade,m.fornecedor].filter(Boolean).join(' • ');
    return `<article class="registro">
      <div class="registro-topo"><div><h3>${esc(m.nome || 'Material sem nome')}</h3><div class="meta">${esc(meta || 'Sem categoria ou fornecedor')}</div><div class="meta">${esc(m.id_material || '')}</div></div><div class="valor">${esc(moeda(m.custo_atual))}</div></div>
      <div class="registro-acoes"><span class="badge-status ${ativo ? 'aprovado' : 'cancelado'}">${ativo ? 'Ativo' : 'Inativo'}</span>${baixo ? '<span class="badge-status aguardando">Estoque baixo</span>' : ''}<span class="meta">Saldo: ${esc(quantidadeMaterialUI(m.estoque_atual))} ${esc(m.unidade || '')} · mínimo ${esc(quantidadeMaterialUI(m.estoque_minimo))}</span></div>
      <div class="registro-acoes"><button class="botao-acao destaque" data-material-editar="${esc(m.id_material)}">Editar</button><button class="botao-acao" data-material-detalhe="${esc(m.id_material)}">Detalhes</button><button class="botao-acao" data-material-status="${esc(m.id_material)}">${ativo ? 'Desativar' : 'Ativar'}</button></div>
    </article>`;
  }).join('') : '<div class="vazio">Nenhum material encontrado. Use “＋ Novo” para cadastrar madeira, metalon, ferragens ou insumos.</div>';
  alvo.querySelectorAll('[data-material-editar]').forEach(btn => btn.addEventListener('click', () => {
    const m = materiaisCache.find(x => String(x.id_material) === btn.dataset.materialEditar); if (m) abrirFormularioMaterial(m);
  }));
  alvo.querySelectorAll('[data-material-detalhe]').forEach(btn => btn.addEventListener('click', () => {
    const m = materiaisCache.find(x => String(x.id_material) === btn.dataset.materialDetalhe); if (m) abrirDetalhesMaterial(m);
  }));
  alvo.querySelectorAll('[data-material-status]').forEach(btn => btn.addEventListener('click', () => alterarStatusMaterialTela(btn.dataset.materialStatus)));
}
function abrirFormularioMaterial(material = null) {
  const editar = !!material;
  const id = material ? String(material.id_material || '') : '';
  const ativo = editar ? materialAtivoUI(material.ativo) : true;
  const estoqueAtual = Number(material?.estoque_atual || 0);
  abrirModal(editar ? 'Editar material' : 'Cadastrar material', `
    <form id="form-material" class="form-grid">
      <div class="form-grupo full"><label>Nome do material *</label><input class="campo-form" name="nome" required maxlength="120" placeholder="Ex.: Pinus 2,5 x 28 cm" value="${esc(material?.nome || '')}"></div>
      <div class="form-grupo"><label>Categoria *</label><input class="campo-form" name="categoria" list="lista-categorias-material" required placeholder="Ex.: Madeira" value="${esc(material?.categoria || '')}"><datalist id="lista-categorias-material"><option>Madeira</option><option>Metalon</option><option>Ferragens</option><option>Acabamentos</option><option>Insumos</option><option>Embalagens</option><option>Outros</option></datalist></div>
      <div class="form-grupo"><label>Unidade *</label><input class="campo-form" name="unidade" list="lista-unidades-material" required placeholder="Ex.: m, un, kg" value="${esc(material?.unidade || '')}"><datalist id="lista-unidades-material"><option>un</option><option>m</option><option>cm</option><option>m²</option><option>kg</option><option>L</option><option>par</option><option>pct</option><option>barra</option><option>chapa</option><option>rolo</option></datalist></div>
      <div class="form-grupo"><label>Custo atual (R$)</label><input class="campo-form" name="custo_atual" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(material?.custo_atual ?? 0)}"></div>
      <div class="form-grupo"><label>Fornecedor</label><input class="campo-form" name="fornecedor" maxlength="120" value="${esc(material?.fornecedor || '')}" placeholder="Nome da loja ou fornecedor"></div>
      <div class="form-grupo"><label>Estoque mínimo</label><input class="campo-form" name="estoque_minimo" type="number" min="0" step="0.001" inputmode="decimal" value="${esc(material?.estoque_minimo ?? 0)}"></div>
      ${editar ? `<div class="form-grupo full"><div class="aviso-modulo">Saldo atual: <strong>${esc(quantidadeMaterialUI(estoqueAtual))} ${esc(material?.unidade || '')}</strong>. Para registrar entradas e saídas, use o módulo Estoque. O saldo não será alterado nesta edição.</div></div>` : `<div class="form-grupo"><label>Saldo inicial</label><input class="campo-form" name="estoque_atual" type="number" min="0" step="0.001" inputmode="decimal" value="0"></div>`}
      <div class="form-grupo"><label>Situação</label><select class="campo-form" name="ativo"><option value="true" ${ativo ? 'selected' : ''}>Ativo</option><option value="false" ${!ativo ? 'selected' : ''}>Inativo</option></select></div>
      <div class="form-grupo full"><div id="erro-form-material" class="mensagem"></div></div>
      <div class="form-grupo full form-acoes"><button type="button" class="botao-acao" data-fechar-modal>Cancelar</button><button type="submit" class="botao-acao destaque">${editar ? 'Salvar alterações' : 'Cadastrar material'}</button></div>
    </form>`);
  $('form-material').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const dados = Object.fromEntries(new FormData(form).entries());
    dados.custo_atual = Number(dados.custo_atual || 0);
    dados.estoque_minimo = Number(dados.estoque_minimo || 0);
    dados.ativo = dados.ativo === 'true';
    if (!editar) dados.estoque_atual = Number(dados.estoque_atual || 0);
    const submit = form.querySelector('[type=submit]'); submit.disabled = true; submit.textContent = 'Salvando...';
    try {
      const result = editar
        ? await chamarApi({action:'atualizarMaterial',id_material:id,material:dados})
        : await chamarApi({action:'cadastrarMaterial',material:dados});
      fecharModal(); toast(result.dados?.mensagem || 'Material salvo com sucesso.'); await atualizarListaMateriais();
    } catch (error) {
      const msg = $('erro-form-material'); if (msg) msg.textContent = error.message || 'Não foi possível salvar o material.';
      submit.disabled = false; submit.textContent = editar ? 'Salvar alterações' : 'Cadastrar material';
    }
  });
  $('form-material').querySelector('[data-fechar-modal]').addEventListener('click', fecharModal);
}
function abrirDetalhesMaterial(material) {
  const linhas = [
    ['Categoria',material.categoria],['Unidade',material.unidade],['Custo atual',moeda(material.custo_atual)],['Fornecedor',material.fornecedor || '—'],
    ['Estoque atual',`${quantidadeMaterialUI(material.estoque_atual)} ${material.unidade || ''}`],['Estoque mínimo',`${quantidadeMaterialUI(material.estoque_minimo)} ${material.unidade || ''}`],
    ['Situação',materialAtivoUI(material.ativo) ? 'Ativo' : 'Inativo'],['Última atualização',dataBR(material.atualizado_em)]
  ];
  abrirModal(material.nome || 'Material', `<div class="lista-registros">${linhas.map(([a,b]) => `<div class="registro"><div class="meta">${esc(a)}</div><strong>${esc(b)}</strong></div>`).join('')}</div><div class="form-acoes"><button class="botao-acao destaque" data-fechar-modal>Fechar</button></div>`);
  $('modal-root').querySelector('[data-fechar-modal]').addEventListener('click', fecharModal);
}
async function alterarStatusMaterialTela(id) {
  const material = materiaisCache.find(m => String(m.id_material) === String(id));
  if (!material) return;
  const novoAtivo = !materialAtivoUI(material.ativo);
  const acao = novoAtivo ? 'reativar' : 'desativar';
  if (!confirm(`Deseja ${acao} o material “${material.nome}”?`)) return;
  try {
    const dados = {
      nome: material.nome, categoria: material.categoria, unidade: material.unidade,
      custo_atual: Number(material.custo_atual || 0), fornecedor: material.fornecedor || '',
      estoque_minimo: Number(material.estoque_minimo || 0), ativo: novoAtivo
    };
    const result = await chamarApi({action:'atualizarMaterial',id_material:id,material:dados});
    toast(result.dados?.mensagem || 'Situação atualizada.'); await atualizarListaMateriais();
  } catch (error) { toast(error.message || 'Não foi possível atualizar a situação.'); }
}



/* =====================================================
   ESTOQUE — ENTRADAS, SAÍDAS E DISPONIBILIDADE
===================================================== */
let pedidosEstoqueCache = [];
let movimentosEstoqueCache = [];
let abaEstoqueAtual = 'saldo';

async function renderEstoque(area) {
  area.innerHTML = cabecalhoModulo(MODULOS.estoque) + `
    <div class="estoque-resumo" id="resumo-estoque">
      <div class="estoque-kpi"><small>Materiais ativos</small><strong id="estoque-kpi-ativos">—</strong></div>
      <div class="estoque-kpi"><small>Estoque baixo</small><strong id="estoque-kpi-baixo">—</strong></div>
      <div class="estoque-kpi"><small>Valor estimado</small><strong id="estoque-kpi-valor">—</strong></div>
    </div>
    <div class="barra-acoes estoque-acoes">
      <button id="btn-nova-movimentacao" class="botao-acao destaque">＋ Nova movimentação</button>
      <button id="btn-atualizar-estoque" class="botao-acao">↻ Atualizar</button>
    </div>
    <div class="estoque-abas" role="tablist" aria-label="Visões do estoque">
      <button type="button" class="estoque-aba ativa" data-estoque-aba="saldo">Estoque atual</button>
      <button type="button" class="estoque-aba" data-estoque-aba="historico">Movimentações</button>
    </div>
    <section id="painel-estoque-saldo">
      <div class="barra-acoes"><input id="busca-estoque" class="campo-busca" type="search" placeholder="Buscar material, categoria ou fornecedor"><select id="filtro-estoque" class="campo-filtro"><option value="Todos">Todos os materiais</option><option value="Baixo">Abaixo do mínimo</option><option value="Zerado">Sem saldo</option></select></div>
      <div id="status-estoque" class="status">Consultando saldo dos materiais...</div>
      <div id="lista-estoque" class="lista-registros"></div>
    </section>
    <section id="painel-estoque-historico" class="escondido">
      <div class="barra-acoes"><input id="busca-mov-estoque" class="campo-busca" type="search" placeholder="Buscar material, pedido ou observação"><select id="filtro-mov-estoque" class="campo-filtro"><option value="Todos">Todos os tipos</option><option value="ENTRADA">Entradas</option><option value="SAIDA">Saídas</option><option value="AJUSTE">Ajustes</option></select></div>
      <div id="status-mov-estoque" class="status">Consultando movimentações...</div>
      <div id="lista-mov-estoque" class="lista-registros"></div>
    </section>
    <div class="aviso-modulo estoque-aviso"><strong>Integração com Produção:</strong> ao registrar uma saída, você pode vinculá-la a um pedido. O saldo do material é atualizado imediatamente e a movimentação fica registrada no histórico.</div>`;

  $('btn-nova-movimentacao').addEventListener('click', () => abrirFormularioMovimentacaoEstoque());
  $('btn-atualizar-estoque').addEventListener('click', atualizarEstoqueTela);
  $('busca-estoque').addEventListener('input', renderListaEstoque);
  $('filtro-estoque').addEventListener('change', renderListaEstoque);
  $('busca-mov-estoque').addEventListener('input', renderListaMovimentacoesEstoque);
  $('filtro-mov-estoque').addEventListener('change', renderListaMovimentacoesEstoque);
  area.querySelectorAll('[data-estoque-aba]').forEach(btn => btn.addEventListener('click', () => alternarAbaEstoque(btn.dataset.estoqueAba)));
  await atualizarEstoqueTela();
}

function alternarAbaEstoque(aba) {
  abaEstoqueAtual = aba;
  $('painel-estoque-saldo').classList.toggle('escondido', aba !== 'saldo');
  $('painel-estoque-historico').classList.toggle('escondido', aba !== 'historico');
  document.querySelectorAll('[data-estoque-aba]').forEach(btn => btn.classList.toggle('ativa', btn.dataset.estoqueAba === aba));
}

async function atualizarEstoqueTela() {
  const status = $('status-estoque');
  if (status) { status.className = 'status'; status.textContent = 'Atualizando estoque...'; }
  try {
    const [materiais, pedidos, movimentos] = await Promise.all([
      chamarApi({action:'listarMateriais'}),
      chamarApi({action:'listarPedidos'}),
      chamarApi({action:'listarMovimentacoesEstoque',limite:200})
    ]);
    materiaisCache = materiais.dados.materiais || [];
    pedidosEstoqueCache = pedidos.dados.pedidos || [];
    movimentosEstoqueCache = movimentos.dados.movimentacoes || [];
    atualizarResumoEstoque();
    renderListaEstoque();
    renderListaMovimentacoesEstoque();
    const ativos = materiaisCache.filter(m => materialAtivoUI(m.ativo));
    const baixo = ativos.filter(m => Number(m.estoque_minimo || 0) > 0 && Number(m.estoque_atual || 0) <= Number(m.estoque_minimo || 0));
    status.className = 'status ok';
    status.textContent = `${ativos.length} material(is) ativo(s) • ${baixo.length} no nível mínimo ou abaixo • ${movimentosEstoqueCache.length} movimentação(ões) recente(s).`;
    const sm = $('status-mov-estoque');
    if (sm) { sm.className = 'status ok'; sm.textContent = `${movimentosEstoqueCache.length} movimentação(ões) no histórico recente.`; }
  } catch (error) {
    if (status) { status.className = 'status error'; status.textContent = error.message || 'Não foi possível carregar o estoque.'; }
    const sm = $('status-mov-estoque'); if (sm) { sm.className = 'status error'; sm.textContent = error.message || 'Não foi possível carregar o histórico.'; }
  }
}

function atualizarResumoEstoque() {
  const ativos = materiaisCache.filter(m => materialAtivoUI(m.ativo));
  const baixo = ativos.filter(m => Number(m.estoque_minimo || 0) > 0 && Number(m.estoque_atual || 0) <= Number(m.estoque_minimo || 0));
  const valor = ativos.reduce((total, m) => total + Number(m.estoque_atual || 0) * Number(m.custo_atual || 0), 0);
  $('estoque-kpi-ativos').textContent = ativos.length;
  $('estoque-kpi-baixo').textContent = baixo.length;
  $('estoque-kpi-valor').textContent = moeda(valor);
}

function renderListaEstoque() {
  const alvo = $('lista-estoque'); if (!alvo) return;
  const termo = normalizarTexto($('busca-estoque')?.value || '');
  const filtro = $('filtro-estoque')?.value || 'Todos';
  const lista = materiaisCache.filter(m => {
    if (!materialAtivoUI(m.ativo)) return false;
    const saldo = Number(m.estoque_atual || 0), minimo = Number(m.estoque_minimo || 0);
    const baixo = minimo > 0 && saldo <= minimo;
    const texto = normalizarTexto([m.nome,m.categoria,m.fornecedor,m.id_material].join(' '));
    return (!termo || texto.includes(termo)) && (filtro === 'Todos' || (filtro === 'Baixo' && baixo) || (filtro === 'Zerado' && saldo <= 0));
  });
  alvo.innerHTML = lista.length ? lista.map(m => {
    const saldo = Number(m.estoque_atual || 0), minimo = Number(m.estoque_minimo || 0), baixo = minimo > 0 && saldo <= minimo;
    return `<article class="registro estoque-registro">
      <div class="registro-topo"><div><h3>${esc(m.nome)}</h3><div class="meta">${esc([m.categoria,m.fornecedor].filter(Boolean).join(' • ') || m.id_material)}</div><div class="meta">${esc(m.id_material)} · ${esc(m.unidade || '')}</div></div><div class="estoque-saldo ${baixo ? 'baixo' : ''}"><strong>${esc(quantidadeMaterialUI(saldo))}</strong><small>${esc(m.unidade || 'un')}</small></div></div>
      <div class="registro-acoes"><span class="badge-status ${saldo > 0 ? 'aprovado' : 'cancelado'}">${saldo > 0 ? 'Disponível' : 'Sem saldo'}</span>${baixo ? '<span class="badge-status aguardando">Abaixo do mínimo</span>' : ''}<span class="meta">Mínimo: ${esc(quantidadeMaterialUI(minimo))} ${esc(m.unidade || '')} · Custo: ${esc(moeda(m.custo_atual))}</span></div>
      <div class="registro-acoes"><button class="botao-acao destaque" data-estoque-entrada="${esc(m.id_material)}">＋ Entrada</button><button class="botao-acao" data-estoque-saida="${esc(m.id_material)}">− Saída</button><button class="botao-acao" data-estoque-ajuste="${esc(m.id_material)}">Ajustar saldo</button></div>
    </article>`;
  }).join('') : '<div class="vazio">Nenhum material corresponde a este filtro. Cadastre materiais no módulo Materiais antes de movimentar o estoque.</div>';
  alvo.querySelectorAll('[data-estoque-entrada]').forEach(btn => btn.addEventListener('click', () => abrirFormularioMovimentacaoEstoque('ENTRADA',btn.dataset.estoqueEntrada)));
  alvo.querySelectorAll('[data-estoque-saida]').forEach(btn => btn.addEventListener('click', () => abrirFormularioMovimentacaoEstoque('SAIDA',btn.dataset.estoqueSaida)));
  alvo.querySelectorAll('[data-estoque-ajuste]').forEach(btn => btn.addEventListener('click', () => abrirFormularioMovimentacaoEstoque('AJUSTE',btn.dataset.estoqueAjuste)));
}

function renderListaMovimentacoesEstoque() {
  const alvo = $('lista-mov-estoque'); if (!alvo) return;
  const termo = normalizarTexto($('busca-mov-estoque')?.value || '');
  const filtro = $('filtro-mov-estoque')?.value || 'Todos';
  const lista = movimentosEstoqueCache.filter(m => {
    const texto = normalizarTexto([m.material,m.id_material,m.id_pedido,m.fornecedor,m.observacoes,m.usuario].join(' '));
    return (!termo || texto.includes(termo)) && (filtro === 'Todos' || String(m.tipo) === filtro);
  });
  alvo.innerHTML = lista.length ? lista.map(m => {
    const tipo = String(m.tipo || '').toUpperCase();
    const sinal = tipo === 'ENTRADA' ? '+' : (tipo === 'SAIDA' ? '−' : '↔');
    const subtitulo = [dataBR(m.data_hora),m.id_material,m.id_pedido ? `Pedido ${m.id_pedido}` : '',m.fornecedor].filter(Boolean).join(' • ');
    return `<article class="registro"><div class="registro-topo"><div><h3>${esc(m.material || 'Material')}</h3><div class="meta">${esc(subtitulo)}</div></div><div class="valor">${sinal}${esc(quantidadeMaterialUI(m.quantidade))} ${esc(m.unidade || '')}</div></div><div class="registro-acoes">${badge(tipo)}<span class="meta">Saldo: ${esc(quantidadeMaterialUI(m.saldo_anterior))} → ${esc(quantidadeMaterialUI(m.saldo_posterior))} ${esc(m.unidade || '')}</span>${Number(m.valor_total || 0) ? `<span class="meta">Valor: ${esc(moeda(m.valor_total))}</span>` : ''}</div>${m.observacoes ? `<div class="meta">${esc(m.observacoes)}</div>` : ''}</article>`;
  }).join('') : '<div class="vazio">Nenhuma movimentação registrada ainda. As entradas e saídas aparecerão aqui.</div>';
}

function abrirFormularioMovimentacaoEstoque(tipoInicial = 'ENTRADA', materialInicial = '') {
  const ativos = materiaisCache.filter(m => materialAtivoUI(m.ativo));
  if (!ativos.length) { toast('Cadastre pelo menos um material ativo antes de registrar movimentações.'); return; }
  const tipo = ['ENTRADA','SAIDA','AJUSTE'].includes(tipoInicial) ? tipoInicial : 'ENTRADA';
  const pedidosAbertos = pedidosEstoqueCache.filter(p => !['Entregue','Cancelado'].includes(String(campo(p,['status','Status']))));
  abrirModal('Nova movimentação de estoque', `
    <form id="form-mov-estoque" class="form-grid">
      <div class="form-grupo full"><label for="mov-tipo">Tipo de movimentação</label><select id="mov-tipo" class="campo-form" name="tipo"><option value="ENTRADA" ${tipo==='ENTRADA'?'selected':''}>Entrada de material</option><option value="SAIDA" ${tipo==='SAIDA'?'selected':''}>Saída de material</option><option value="AJUSTE" ${tipo==='AJUSTE'?'selected':''}>Ajuste de saldo</option></select></div>
      <div class="form-grupo full"><label for="mov-material">Material *</label><select id="mov-material" class="campo-form" name="id_material" required><option value="">Selecione um material</option>${ativos.map(m => `<option value="${esc(m.id_material)}" ${String(m.id_material)===String(materialInicial)?'selected':''}>${esc(m.nome)} — ${esc(quantidadeMaterialUI(m.estoque_atual))} ${esc(m.unidade || '')}</option>`).join('')}</select></div>
      <div class="form-grupo full"><label id="mov-quantidade-label" for="mov-quantidade">Quantidade *</label><input id="mov-quantidade" class="campo-form" type="number" name="quantidade" min="0" step="0.001" inputmode="decimal" required placeholder="Ex.: 2,5"></div>
      <div class="form-grupo mov-entrada-campo"><label for="mov-custo">Custo unitário (R$)</label><input id="mov-custo" class="campo-form" type="number" name="custo_unitario" min="0" step="0.01" inputmode="decimal" placeholder="Deixe vazio para manter"></div>
      <div class="form-grupo mov-entrada-campo"><label for="mov-fornecedor">Fornecedor</label><input id="mov-fornecedor" class="campo-form" name="fornecedor" maxlength="120" placeholder="Fornecedor da compra"></div>
      <div class="form-grupo full mov-saida-campo"><label for="mov-pedido">Vincular à produção (opcional)</label><select id="mov-pedido" class="campo-form" name="id_pedido"><option value="">Sem vínculo com pedido</option>${pedidosAbertos.map(p => `<option value="${esc(campo(p,['id_pedido','id']))}">${esc(campo(p,['id_pedido','id']))} — ${esc(campo(p,['nome_cliente','cliente'],'Cliente'))} · ${esc(campo(p,['status'],'Em andamento'))}</option>`).join('')}</select><small class="ajuda-campo">A saída será associada ao pedido escolhido.</small></div>
      <div class="form-grupo full"><label for="mov-observacoes">Observações</label><textarea id="mov-observacoes" class="campo-form textarea" name="observacoes" maxlength="500" placeholder="Ex.: compra, consumo na fabricação, perda ou conferência"></textarea></div>
      <div class="form-grupo full"><div id="erro-form-mov-estoque" class="mensagem"></div></div>
      <div class="form-grupo full form-acoes"><button type="button" class="botao-acao" data-fechar-modal>Cancelar</button><button type="submit" class="botao-acao destaque">Registrar movimentação</button></div>
    </form>`);
  const form = $('form-mov-estoque');
  const atualizarCampos = () => {
    const atual = $('mov-tipo').value;
    form.querySelectorAll('.mov-entrada-campo').forEach(el => el.classList.toggle('escondido', atual !== 'ENTRADA'));
    form.querySelectorAll('.mov-saida-campo').forEach(el => el.classList.toggle('escondido', atual !== 'SAIDA'));
    $('mov-quantidade-label').textContent = atual === 'AJUSTE' ? 'Novo saldo contado *' : 'Quantidade *';
    $('mov-quantidade').placeholder = atual === 'AJUSTE' ? 'Informe o saldo físico conferido' : 'Ex.: 2,5';
  };
  $('mov-tipo').addEventListener('change', atualizarCampos); atualizarCampos();
  form.querySelector('[data-fechar-modal]').addEventListener('click', fecharModal);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const dados = Object.fromEntries(new FormData(form).entries());
    if (dados.custo_unitario === '') delete dados.custo_unitario;
    const botao = form.querySelector('[type=submit]'); botao.disabled = true; botao.textContent = 'Registrando...';
    try {
      const result = await chamarApi({action:'registrarMovimentacaoEstoque',movimento:dados});
      fecharModal(); toast(result.dados?.mensagem || 'Movimentação registrada.');
      await atualizarEstoqueTela();
    } catch (error) {
      const msg = $('erro-form-mov-estoque'); if (msg) msg.textContent = error.message || 'Não foi possível registrar a movimentação.';
      botao.disabled = false; botao.textContent = 'Registrar movimentação';
    }
  });
}



/* =====================================================
   FINANCEIRO — RECEITAS, DESPESAS E FLUXO DO PERÍODO
===================================================== */
let lancamentosFinanceirosCache = [];

function dataHojeISOFinanceiro() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}-${String(agora.getDate()).padStart(2,'0')}`;
}
function statusFinanceiroDerivado(item) {
  const status = String(item.status || '').toUpperCase();
  const pendente = ['A_PAGAR','A_RECEBER'].includes(status);
  if (!pendente || !item.data) return status;
  const hoje = dataHojeISOFinanceiro();
  return String(item.data).slice(0,10) < hoje ? 'ATRASADO' : status;
}
function statusFinanceiroLabel(status) {
  return ({A_PAGAR:'A pagar',A_RECEBER:'A receber',PAGO:'Pago',RECEBIDO:'Recebido',ATRASADO:'Atrasado'})[status] || status;
}
function valorFinanceiroNoPeriodo(item, periodo) {
  return !periodo || String(item.data || '').slice(0,7) === periodo;
}
async function renderFinanceiro(area) {
  const config = MODULOS.financeiro;
  const mesAtual = dataHojeISOFinanceiro().slice(0,7);
  area.innerHTML = cabecalhoModulo(config) + `
    <div class="financeiro-resumo">
      <div class="financeiro-kpi receita"><small>Receitas recebidas</small><strong id="fin-kpi-receitas">—</strong></div>
      <div class="financeiro-kpi despesa"><small>Despesas pagas</small><strong id="fin-kpi-despesas">—</strong></div>
      <div class="financeiro-kpi resultado"><small>Resultado do período</small><strong id="fin-kpi-resultado">—</strong></div>
    </div>
    <div class="financeiro-abertos" id="fin-abertos">A receber: — · A pagar: — · Em atraso: —</div>
    <div class="barra-acoes financeiro-acoes">
      <button id="fin-nova-receita" class="botao-acao destaque">＋ Receita</button>
      <button id="fin-nova-despesa" class="botao-acao financeiro-despesa-btn">＋ Despesa</button>
      <button id="fin-atualizar" class="botao-acao" title="Atualizar">↻</button>
    </div>
    <div class="financeiro-filtros">
      <input id="fin-busca" class="campo-busca" type="search" placeholder="Buscar descrição, categoria ou referência">
      <select id="fin-periodo" class="campo-filtro" aria-label="Período"><option value="${mesAtual}">Mês atual</option><option value="todos">Todo o período</option><option value="especifico">Escolher mês…</option></select>
      <input id="fin-mes-especifico" class="campo-form financeiro-mes escondido" type="month" value="${mesAtual}" aria-label="Escolher mês">
      <select id="fin-tipo-filtro" class="campo-filtro" aria-label="Tipo"><option value="Todos">Receitas e despesas</option><option value="RECEITA">Receitas</option><option value="DESPESA">Despesas</option></select>
      <select id="fin-status-filtro" class="campo-filtro" aria-label="Situação"><option value="Todos">Todas as situações</option><option value="ABERTOS">Em aberto</option><option value="CONCLUIDOS">Concluídos</option><option value="ATRASADOS">Atrasados</option></select>
    </div>
    <div id="fin-status-carregamento" class="status">Consultando lançamentos financeiros...</div>
    <div id="fin-lista-lancamentos" class="lista-registros"></div>
    <div class="aviso-modulo financeiro-aviso"><strong>Controle financeiro:</strong> receitas e despesas ficam registradas na aba FINANCEIRO. Use “Dar baixa” quando o valor for efetivamente recebido ou pago. O campo referência pode guardar o número de um pedido ou cliente, sem criar lançamentos duplicados automaticamente.</div>`;
  $('fin-nova-receita').addEventListener('click', () => abrirFormularioLancamentoFinanceiro(null,'RECEITA'));
  $('fin-nova-despesa').addEventListener('click', () => abrirFormularioLancamentoFinanceiro(null,'DESPESA'));
  $('fin-atualizar').addEventListener('click', atualizarFinanceiroTela);
  $('fin-busca').addEventListener('input', renderListaFinanceiro);
  $('fin-periodo').addEventListener('change', () => {
    $('fin-mes-especifico').classList.toggle('escondido', $('fin-periodo').value !== 'especifico');
    atualizarResumoFinanceiro(); renderListaFinanceiro();
  });
  $('fin-mes-especifico').addEventListener('change', () => { atualizarResumoFinanceiro(); renderListaFinanceiro(); });
  $('fin-tipo-filtro').addEventListener('change', renderListaFinanceiro);
  $('fin-status-filtro').addEventListener('change', renderListaFinanceiro);
  await atualizarFinanceiroTela();
}

function periodoFinanceiroSelecionado() {
  const modo = $('fin-periodo')?.value || 'todos';
  if (modo === 'todos') return '';
  if (modo === 'especifico') return $('fin-mes-especifico')?.value || dataHojeISOFinanceiro().slice(0,7);
  return modo;
}

async function atualizarFinanceiroTela() {
  const status = $('fin-status-carregamento');
  if (status) { status.className = 'status'; status.textContent = 'Atualizando lançamentos...'; }
  try {
    const result = await chamarApi({action:'listarLancamentosFinanceiros'});
    lancamentosFinanceirosCache = result.dados.lancamentos || [];
    atualizarResumoFinanceiro();
    renderListaFinanceiro();
    if (status) { status.className = 'status ok'; status.textContent = `${lancamentosFinanceirosCache.length} lançamento(s) financeiro(s) registrado(s).`; }
  } catch (error) {
    if (status) { status.className = 'status error'; status.textContent = error.message || 'Não foi possível carregar o financeiro.'; }
    ['fin-kpi-receitas','fin-kpi-despesas','fin-kpi-resultado'].forEach(id => { if ($(id)) $(id).textContent = '—'; });
    if ($('fin-lista-lancamentos')) $('fin-lista-lancamentos').innerHTML = '<div class="vazio">Não foi possível consultar os lançamentos. Verifique a conexão e tente atualizar.</div>';
  }
}

function atualizarResumoFinanceiro() {
  const periodo = periodoFinanceiroSelecionado();
  const dados = lancamentosFinanceirosCache.filter(item => valorFinanceiroNoPeriodo(item, periodo));
  const receitas = dados.filter(x => x.tipo === 'RECEITA' && x.status === 'RECEBIDO').reduce((s,x) => s + Number(x.valor || 0),0);
  const despesas = dados.filter(x => x.tipo === 'DESPESA' && x.status === 'PAGO').reduce((s,x) => s + Number(x.valor || 0),0);
  const aReceber = dados.filter(x => x.tipo === 'RECEITA' && x.status === 'A_RECEBER').reduce((s,x) => s + Number(x.valor || 0),0);
  const aPagar = dados.filter(x => x.tipo === 'DESPESA' && x.status === 'A_PAGAR').reduce((s,x) => s + Number(x.valor || 0),0);
  const atrasados = dados.filter(x => statusFinanceiroDerivado(x) === 'ATRASADO').length;
  $('fin-kpi-receitas').textContent = moeda(receitas);
  $('fin-kpi-despesas').textContent = moeda(despesas);
  $('fin-kpi-resultado').textContent = moeda(receitas - despesas);
  $('fin-kpi-resultado').classList.toggle('negativo', receitas - despesas < 0);
  $('fin-abertos').textContent = `A receber: ${moeda(aReceber)} · A pagar: ${moeda(aPagar)} · Em atraso: ${atrasados}`;
}

function renderListaFinanceiro() {
  const alvo = $('fin-lista-lancamentos'); if (!alvo) return;
  const termo = normalizarTexto($('fin-busca')?.value || '');
  const periodo = periodoFinanceiroSelecionado();
  const tipoFiltro = $('fin-tipo-filtro')?.value || 'Todos';
  const statusFiltro = $('fin-status-filtro')?.value || 'Todos';
  const lista = lancamentosFinanceirosCache.filter(item => {
    const status = statusFinanceiroDerivado(item);
    const texto = normalizarTexto([item.descricao,item.categoria,item.referencia_id,item.forma_pagamento,item.observacoes].join(' '));
    const statusOk = statusFiltro === 'Todos' || (statusFiltro === 'ABERTOS' && ['A_PAGAR','A_RECEBER','ATRASADO'].includes(status)) || (statusFiltro === 'CONCLUIDOS' && ['PAGO','RECEBIDO'].includes(status)) || (statusFiltro === 'ATRASADOS' && status === 'ATRASADO');
    return (!termo || texto.includes(termo)) && (!periodo || valorFinanceiroNoPeriodo(item, periodo)) && (tipoFiltro === 'Todos' || item.tipo === tipoFiltro) && statusOk;
  });
  alvo.innerHTML = lista.length ? lista.map(item => {
    const receita = item.tipo === 'RECEITA';
    const status = statusFinanceiroDerivado(item);
    const valor = `${receita ? '+' : '−'} ${moeda(item.valor)}`;
    const badgeClasse = status === 'ATRASADO' ? 'atrasado' : (status === 'PAGO' || status === 'RECEBIDO' ? 'aprovado' : 'aguardando');
    const podeDarBaixa = receita ? status === 'A_RECEBER' || status === 'ATRASADO' : status === 'A_PAGAR' || status === 'ATRASADO';
    const subtitulo = [item.categoria,dataBR(item.data),item.referencia_id ? `Ref. ${item.referencia_id}` : ''].filter(Boolean).join(' · ');
    return `<article class="registro financeiro-registro ${receita ? 'fin-receita' : 'fin-despesa'}">
      <div class="registro-topo"><div><h3>${esc(item.descricao)}</h3><div class="meta">${esc(subtitulo)}</div><div class="meta">${esc(receita ? 'Receita' : 'Despesa')} · ${esc(item.forma_pagamento || 'Forma de pagamento não informada')}</div></div><div class="financeiro-valor ${receita ? 'positivo' : 'negativo'}">${esc(valor)}</div></div>
      <div class="registro-acoes"><span class="badge-status ${badgeClasse}">${esc(statusFinanceiroLabel(status))}</span><span class="meta">${esc(item.id_lancamento)}</span></div>
      ${item.observacoes ? `<div class="meta financeiro-observacoes">${esc(item.observacoes)}</div>` : ''}
      <div class="registro-acoes"><button class="botao-acao" data-fin-editar="${esc(item.id_lancamento)}">Editar</button>${podeDarBaixa ? `<button class="botao-acao destaque" data-fin-baixa="${esc(item.id_lancamento)}">${receita ? 'Confirmar recebimento' : 'Marcar como pago'}</button>` : ''}</div>
    </article>`;
  }).join('') : '<div class="vazio">Nenhum lançamento encontrado neste filtro. Use “＋ Receita” ou “＋ Despesa” para registrar o primeiro movimento.</div>';
  alvo.querySelectorAll('[data-fin-editar]').forEach(btn => btn.addEventListener('click', () => {
    const item = lancamentosFinanceirosCache.find(x => String(x.id_lancamento) === btn.dataset.finEditar);
    if (item) abrirFormularioLancamentoFinanceiro(item);
  }));
  alvo.querySelectorAll('[data-fin-baixa]').forEach(btn => btn.addEventListener('click', () => darBaixaFinanceiro(btn.dataset.finBaixa)));
}

function abrirFormularioLancamentoFinanceiro(item = null, tipoInicial = 'RECEITA') {
  const editar = !!item;
  const tipo = item ? item.tipo : tipoInicial;
  const statusPadrao = tipo === 'RECEITA' ? 'A_RECEBER' : 'A_PAGAR';
  const statusAtual = item?.status || statusPadrao;
  const categoriasReceita = ['Venda de produto','Sinal de cliente','Recebimento de pedido','Serviço','Outras receitas'];
  const categoriasDespesa = ['Compra de materiais','Ferramentas e equipamentos','Frete e entrega','Manutenção','Energia e água','Internet e telefone','Aluguel','Taxas e tarifas','Marketing','Embalagens','Outras despesas'];
  abrirModal(editar ? 'Editar lançamento financeiro' : (tipo === 'RECEITA' ? 'Nova receita' : 'Nova despesa'), `
    <form id="form-lancamento-financeiro" class="form-grid">
      <div class="form-grupo"><label for="fin-form-tipo">Tipo *</label><select id="fin-form-tipo" class="campo-form" name="tipo"><option value="RECEITA" ${tipo==='RECEITA'?'selected':''}>Receita</option><option value="DESPESA" ${tipo==='DESPESA'?'selected':''}>Despesa</option></select></div>
      <div class="form-grupo"><label for="fin-form-data">Data / vencimento *</label><input id="fin-form-data" class="campo-form" type="date" name="data" required value="${esc(item?.data || dataHojeISOFinanceiro())}"></div>
      <div class="form-grupo full"><label for="fin-form-descricao">Descrição *</label><input id="fin-form-descricao" class="campo-form" name="descricao" maxlength="180" required placeholder="Ex.: Compra de madeira para pedido" value="${esc(item?.descricao || '')}"></div>
      <div class="form-grupo"><label for="fin-form-categoria">Categoria *</label><input id="fin-form-categoria" class="campo-form" name="categoria" list="fin-categorias" maxlength="80" required placeholder="Selecione ou digite" value="${esc(item?.categoria || '')}"><datalist id="fin-categorias">${[...categoriasReceita,...categoriasDespesa].map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
      <div class="form-grupo"><label for="fin-form-valor">Valor (R$) *</label><input id="fin-form-valor" class="campo-form" type="number" name="valor" min="0.01" step="0.01" inputmode="decimal" required placeholder="0,00" value="${esc(item?.valor ?? '')}"></div>
      <div class="form-grupo"><label for="fin-form-pagamento">Forma de pagamento</label><select id="fin-form-pagamento" class="campo-form" name="forma_pagamento"><option value="">Não informada</option>${['PIX','Dinheiro','Transferência bancária','Cartão de débito','Cartão de crédito','Boleto','Outro'].map(f => `<option value="${esc(f)}" ${item?.forma_pagamento===f?'selected':''}>${esc(f)}</option>`).join('')}</select></div>
      <div class="form-grupo"><label for="fin-form-status">Situação *</label><select id="fin-form-status" class="campo-form" name="status"></select></div>
      <div class="form-grupo full"><label for="fin-form-referencia">Referência (opcional)</label><input id="fin-form-referencia" class="campo-form" name="referencia_id" maxlength="80" placeholder="Ex.: número do pedido ou cliente" value="${esc(item?.referencia_id || '')}"></div>
      <div class="form-grupo full"><label for="fin-form-observacoes">Observações</label><textarea id="fin-form-observacoes" class="campo-form textarea" name="observacoes" maxlength="500" placeholder="Detalhes adicionais">${esc(item?.observacoes || '')}</textarea></div>
      <div class="form-grupo full"><div id="erro-fin-form" class="mensagem"></div></div>
      <div class="form-grupo full form-acoes"><button type="button" class="botao-acao" data-fechar-modal>Cancelar</button><button type="submit" class="botao-acao destaque">${editar ? 'Salvar alterações' : 'Cadastrar lançamento'}</button></div>
    </form>`);
  const form = $('form-lancamento-financeiro');
  const selectTipo = $('fin-form-tipo');
  const selectStatus = $('fin-form-status');
  function atualizarStatusFinanceiro(selecionado) {
    const isReceita = selectTipo.value === 'RECEITA';
    const opcoes = isReceita ? [['A_RECEBER','A receber'],['RECEBIDO','Recebido']] : [['A_PAGAR','A pagar'],['PAGO','Pago']];
    selectStatus.innerHTML = opcoes.map(([v,l]) => `<option value="${v}" ${v===selecionado?'selected':''}>${l}</option>`).join('');
  }
  atualizarStatusFinanceiro(statusAtual);
  selectTipo.addEventListener('change', () => atualizarStatusFinanceiro(selectTipo.value === 'RECEITA' ? 'A_RECEBER' : 'A_PAGAR'));
  form.querySelector('[data-fechar-modal]').addEventListener('click', fecharModal);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const dados = Object.fromEntries(new FormData(form).entries());
    dados.valor = Number(dados.valor);
    const botao = form.querySelector('[type=submit]');
    const erro = $('erro-fin-form');
    erro.textContent = '';
    botao.disabled = true; botao.textContent = 'Salvando...';
    try {
      const result = editar
        ? await chamarApi({action:'atualizarLancamentoFinanceiro',id_lancamento:item.id_lancamento,lancamento:dados})
        : await chamarApi({action:'cadastrarLancamentoFinanceiro',lancamento:dados});
      fecharModal(); toast(result.dados?.mensagem || 'Lançamento salvo.'); await atualizarFinanceiroTela();
    } catch (error) {
      erro.textContent = error.message || 'Não foi possível salvar o lançamento.';
      botao.disabled = false; botao.textContent = editar ? 'Salvar alterações' : 'Cadastrar lançamento';
    }
  });
}

async function darBaixaFinanceiro(id) {
  const item = lancamentosFinanceirosCache.find(x => String(x.id_lancamento) === String(id));
  if (!item) return;
  const status = item.tipo === 'RECEITA' ? 'RECEBIDO' : 'PAGO';
  const confirmacao = item.tipo === 'RECEITA'
    ? `Confirmar que a receita “${item.descricao}” foi recebida?`
    : `Confirmar que a despesa “${item.descricao}” foi paga?`;
  if (!confirm(confirmacao)) return;
  try {
    const result = await chamarApi({action:'alterarStatusLancamentoFinanceiro',id_lancamento:id,status});
    toast(result.dados?.mensagem || 'Situação atualizada.');
    await atualizarFinanceiroTela();
  } catch (error) { toast(error.message || 'Não foi possível atualizar a situação.'); }
}


/* =====================================================
   PORTFÓLIO — PROJETOS REALIZADOS E VITRINE INTERNA
   Usa a aba PORTFÓLIO existente; não publica automaticamente no site.
===================================================== */
function publicadoPortfolioUI(item) {
  const valor = item?.publicado;
  return valor === true || ['true','sim','1','publicado'].includes(String(valor || '').toLowerCase().trim());
}
function statusPortfolioUI(item) {
  const status = String(item?.status || (publicadoPortfolioUI(item) ? 'PUBLICADO' : 'RASCUNHO')).trim().toUpperCase();
  if (['PUBLICADO','PUBLICADA','PUBLICADO NO SITE'].includes(status) || publicadoPortfolioUI(item)) return 'PUBLICADO';
  if (['ARQUIVADO','ARQUIVADA','ARQUIVO'].includes(status)) return 'ARQUIVADO';
  return 'RASCUNHO';
}
function imagemPortfolioUI(url) {
  const valor = String(url || '').trim();
  if (!/^https?:\/\//i.test(valor)) return '';
  const drive = valor.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([a-zA-Z0-9_-]+)/i);
  return drive ? `https://drive.google.com/uc?export=view&id=${drive[1]}` : valor;
}
async function renderPortfolio(area) {
  const config = MODULOS.portfolio;
  area.innerHTML = cabecalhoModulo(config) + `
    <section class="portfolio-resumo">
      <div class="portfolio-kpi"><small>Projetos cadastrados</small><strong id="portfolio-kpi-total">—</strong></div>
      <div class="portfolio-kpi publicado"><small>Marcados como publicados</small><strong id="portfolio-kpi-publicados">—</strong></div>
      <div class="portfolio-kpi rascunho"><small>Em preparação</small><strong id="portfolio-kpi-rascunhos">—</strong></div>
    </section>
    <div class="barra-acoes portfolio-acoes">
      <button type="button" id="portfolio-novo" class="botao-acao destaque">＋ Novo projeto</button>
      <button type="button" id="portfolio-atualizar" class="botao-acao" title="Atualizar portfólio">↻ Atualizar</button>
    </div>
    <div class="portfolio-filtros">
      <input id="portfolio-busca" class="campo-busca" type="search" placeholder="Buscar título, categoria, ambiente ou descrição">
      <select id="portfolio-filtro-status" class="campo-filtro" aria-label="Filtrar portfólio">
        <option value="TODOS">Todos os projetos</option><option value="PUBLICADO">Marcados como publicados</option><option value="RASCUNHO">Rascunhos</option><option value="ARQUIVADO">Arquivados</option>
      </select>
      <select id="portfolio-filtro-categoria" class="campo-filtro" aria-label="Filtrar categoria"><option value="TODAS">Todas as categorias</option></select>
    </div>
    <div id="portfolio-status-carregamento" class="status">Carregando portfólio...</div>
    <div id="portfolio-lista" class="portfolio-grid"></div>
    <div class="aviso-modulo portfolio-aviso"><strong>Organização do portfólio:</strong> cadastre aqui projetos realizados, imagens e informações das peças. “Marcado como publicado” atualiza o campo de publicação na planilha, mas não envia imagens automaticamente ao site público. Para exibir uma foto, use um link de imagem ou um link público do Google Drive.</div>`;
  $('portfolio-novo').addEventListener('click', () => abrirFormularioPortfolio());
  $('portfolio-atualizar').addEventListener('click', atualizarPortfolioTela);
  $('portfolio-busca').addEventListener('input', renderListaPortfolio);
  $('portfolio-filtro-status').addEventListener('change', renderListaPortfolio);
  $('portfolio-filtro-categoria').addEventListener('change', renderListaPortfolio);
  await atualizarPortfolioTela();
}
async function atualizarPortfolioTela() {
  const status = $('portfolio-status-carregamento');
  if (!status) return;
  status.className = 'status'; status.textContent = 'Consultando projetos...';
  try {
    const result = await chamarApi({action:'listarPortfolio'});
    portfolioCache = result.dados.portfolio || [];
    const categorias = [...new Set(portfolioCache.map(p => String(p.categoria || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
    const filtro = $('portfolio-filtro-categoria');
    const anterior = filtro.value || 'TODAS';
    filtro.innerHTML = '<option value="TODAS">Todas as categorias</option>' + categorias.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    filtro.value = categorias.includes(anterior) ? anterior : 'TODAS';
    const publicados = portfolioCache.filter(p => statusPortfolioUI(p) === 'PUBLICADO').length;
    const rascunhos = portfolioCache.filter(p => statusPortfolioUI(p) === 'RASCUNHO').length;
    $('portfolio-kpi-total').textContent = portfolioCache.length;
    $('portfolio-kpi-publicados').textContent = publicados;
    $('portfolio-kpi-rascunhos').textContent = rascunhos;
    status.className = 'status ok'; status.textContent = `${portfolioCache.length} projeto(s) cadastrado(s) na aba PORTFÓLIO.`;
    renderListaPortfolio();
  } catch (error) {
    status.className = 'status error'; status.textContent = error.message || 'Não foi possível carregar o portfólio.';
    $('portfolio-lista').innerHTML = '<div class="vazio">Não foi possível consultar os projetos. Verifique a conexão e tente atualizar.</div>';
  }
}
function renderListaPortfolio() {
  const alvo = $('portfolio-lista'); if (!alvo) return;
  const termo = normalizarTexto($('portfolio-busca')?.value || '');
  const statusFiltro = $('portfolio-filtro-status')?.value || 'TODOS';
  const categoriaFiltro = $('portfolio-filtro-categoria')?.value || 'TODAS';
  const lista = portfolioCache.filter(p => {
    const texto = normalizarTexto([p.titulo,p.categoria,p.ambiente,p.descricao,p.id_projeto,p.id_portfolio].join(' '));
    const status = statusPortfolioUI(p);
    return (!termo || texto.includes(termo)) && (statusFiltro === 'TODOS' || status === statusFiltro) && (categoriaFiltro === 'TODAS' || String(p.categoria || '') === categoriaFiltro);
  }).sort((a,b) => Number(a.ordem || 0) - Number(b.ordem || 0) || String(b.atualizado_em || b.criado_em || '').localeCompare(String(a.atualizado_em || a.criado_em || '')));
  alvo.innerHTML = lista.length ? lista.map(p => {
    const status = statusPortfolioUI(p);
    const foto = imagemPortfolioUI(p.foto_capa);
    const meta = [p.categoria,p.ambiente].filter(Boolean).join(' • ');
    const galeria = String(p.galeria_url || '').split(/[\n;,]+/).map(x => x.trim()).filter(Boolean).length;
    return `<article class="portfolio-card">
      <div class="portfolio-capa ${foto ? '' : 'sem-imagem'}"><span>🖼️</span>${foto ? `<img src="${esc(foto)}" alt="Capa de ${esc(p.titulo || 'projeto')}" loading="lazy">` : ''}<span class="portfolio-selo">${status === 'PUBLICADO' ? 'Publicado' : (status === 'ARQUIVADO' ? 'Arquivado' : 'Rascunho')}</span></div>
      <div class="portfolio-card-corpo"><div class="portfolio-card-topo"><h3>${esc(p.titulo || 'Projeto sem título')}</h3>${badge(status === 'PUBLICADO' ? 'Publicado' : (status === 'ARQUIVADO' ? 'Arquivado' : 'Rascunho'))}</div>
        <div class="meta">${esc(meta || 'Categoria/ambiente não informado')}</div>
        ${p.id_projeto ? `<div class="meta">Projeto vinculado: ${esc(p.id_projeto)}</div>` : ''}
        ${p.descricao ? `<p class="portfolio-descricao">${esc(p.descricao)}</p>` : ''}
        <div class="portfolio-card-info"><span>${galeria} foto(s) na galeria</span><span>Ordem ${Number(p.ordem || 0)}</span></div>
        <div class="registro-acoes"><button type="button" class="botao-acao" data-portfolio-galeria="${esc(p.id_portfolio)}">Ver fotos (${galeria + (foto ? 1 : 0)})</button><button type="button" class="botao-acao destaque" data-portfolio-editar="${esc(p.id_portfolio)}">Editar</button>${status === 'PUBLICADO' ? `<button type="button" class="botao-acao" data-portfolio-status="${esc(p.id_portfolio)}" data-status="RASCUNHO">Retirar publicação</button>` : (status === 'ARQUIVADO' ? `<button type="button" class="botao-acao" data-portfolio-status="${esc(p.id_portfolio)}" data-status="RASCUNHO">Reativar</button>` : `<button type="button" class="botao-acao" data-portfolio-status="${esc(p.id_portfolio)}" data-status="PUBLICADO">Marcar publicado</button>`)}${status !== 'ARQUIVADO' ? `<button type="button" class="botao-acao" data-portfolio-status="${esc(p.id_portfolio)}" data-status="ARQUIVADO">Arquivar</button>` : ''}</div>
      </div></article>`;
  }).join('') : '<div class="vazio portfolio-vazio">Nenhum projeto encontrado. Use “＋ Novo projeto” para cadastrar o primeiro trabalho da Tinhas.</div>';
  alvo.querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.remove(); img.parentElement.classList.add('sem-imagem'); }));
  alvo.querySelectorAll('[data-portfolio-editar]').forEach(btn => btn.addEventListener('click', () => {
    const item = portfolioCache.find(p => String(p.id_portfolio) === btn.dataset.portfolioEditar); if (item) abrirFormularioPortfolio(item);
  }));
  alvo.querySelectorAll('[data-portfolio-status]').forEach(btn => btn.addEventListener('click', () => alterarStatusPortfolioTela(btn.dataset.portfolioStatus, btn.dataset.status)));
  alvo.querySelectorAll('[data-portfolio-galeria]').forEach(btn => btn.addEventListener('click', () => {
    const item = portfolioCache.find(p => String(p.id_portfolio) === btn.dataset.portfolioGaleria); if (item) abrirGaleriaPortfolio(item);
  }));
}
function abrirGaleriaPortfolio(item) {
  const urls = [item.foto_capa, ...String(item.galeria_url || '').split(/[\n;,]+/)].map(x => imagemPortfolioUI(x)).filter(Boolean);
  abrirModal(`Fotos — ${item.titulo || 'Projeto'}`, urls.length ? `<div class="portfolio-galeria-modal">${urls.map((url,i) => `<figure><img src="${esc(url)}" alt="Foto ${i+1} de ${esc(item.titulo || 'projeto')}" loading="lazy"><figcaption>${i === 0 && item.foto_capa ? 'Foto de capa' : `Foto ${i+1}`}</figcaption></figure>`).join('')}</div><div class="form-acoes"><button type="button" class="botao-acao" data-fechar-modal>Fechar</button></div>` : '<div class="vazio">Este projeto ainda não tem fotos cadastradas.</div>');
  $('modal-root').querySelector('[data-fechar-modal]')?.addEventListener('click', fecharModal);
  $('modal-root').querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.parentElement.classList.add('imagem-indisponivel'); img.alt = 'Imagem indisponível — confira o compartilhamento do link'; }));
}
function abrirFormularioPortfolio(item = null) {
  const editar = !!item;
  const categorias = ['Móveis','Decoração','Home office','Sala','Quarto','Cozinha','Quadros decorativos','Floreiras','Bancos e mesas','Outros'];
  const ambientes = ['Sala','Quarto','Cozinha','Home office','Varanda','Área externa','Comercial','Outro'];
  const statusAtual = statusPortfolioUI(item || {});
  const opcoes = (valores, atual) => valores.map(v => `<option value="${esc(v)}" ${String(v).toUpperCase() === String(atual || '').toUpperCase() ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const url = imagemPortfolioUI(item?.foto_capa || '');
  abrirModal(editar ? 'Editar projeto do portfólio' : 'Cadastrar projeto no portfólio', `
    <form id="form-portfolio" class="form-grid">
      <div class="form-grupo full"><label for="portfolio-titulo">Título do projeto *</label><input id="portfolio-titulo" class="campo-form" name="titulo" maxlength="140" required placeholder="Ex.: Aparador industrial em Pinus" value="${esc(item?.titulo || '')}"></div>
      <div class="form-grupo"><label for="portfolio-categoria">Categoria *</label><input id="portfolio-categoria" class="campo-form" name="categoria" list="portfolio-categorias" required maxlength="80" placeholder="Ex.: Móveis" value="${esc(item?.categoria || '')}"><datalist id="portfolio-categorias">${categorias.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
      <div class="form-grupo"><label for="portfolio-ambiente">Ambiente</label><input id="portfolio-ambiente" class="campo-form" name="ambiente" list="portfolio-ambientes" maxlength="80" placeholder="Ex.: Home office" value="${esc(item?.ambiente || '')}"><datalist id="portfolio-ambientes">${ambientes.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
      <div class="form-grupo full"><label for="portfolio-descricao">Descrição</label><textarea id="portfolio-descricao" class="campo-form textarea" name="descricao" maxlength="2000" placeholder="Conte sobre a peça, acabamento, dimensões e detalhes do projeto...">${esc(item?.descricao || '')}</textarea></div>
      <div class="form-grupo full"><label for="portfolio-id-projeto">ID do projeto relacionado (opcional)</label><input id="portfolio-id-projeto" class="campo-form" name="id_projeto" maxlength="60" value="${esc(item?.id_projeto || '')}" placeholder="Ex.: PRO-0001"><small class="ajuda-campo">Use o código da aba PROJETOS quando quiser relacionar este registro a um projeto existente.</small></div>
      <div class="form-grupo full"><label for="portfolio-foto-capa">Link da foto de capa</label><input id="portfolio-foto-capa" class="campo-form" type="url" name="foto_capa" maxlength="1000" value="${esc(item?.foto_capa || '')}" placeholder="https://..."><small class="ajuda-campo">Aceita link direto de imagem ou link público do Google Drive. No Drive, permita acesso a qualquer pessoa com o link.</small><div id="portfolio-preview-capa" class="portfolio-preview ${url ? '' : 'escondido'}">${url ? `<img src="${esc(url)}" alt="Prévia da capa">` : ''}</div></div>
      <div class="form-grupo full"><label for="portfolio-galeria">Links da galeria (um por linha)</label><textarea id="portfolio-galeria" class="campo-form textarea" name="galeria_url" maxlength="6000" placeholder="https://imagem1.jpg&#10;https://imagem2.jpg">${esc(item?.galeria_url || '')}</textarea><small class="ajuda-campo">Informe até 12 links de imagens, um por linha. O aplicativo salva os links na coluna galeria_url.</small></div>
      <div class="form-grupo"><label for="portfolio-status">Situação</label><select id="portfolio-status" class="campo-form" name="status">${opcoes(['RASCUNHO','PUBLICADO','ARQUIVADO'],statusAtual)}</select></div>
      <div class="form-grupo"><label for="portfolio-ordem">Ordem de exibição</label><input id="portfolio-ordem" class="campo-form" type="number" name="ordem" min="0" max="9999" step="1" value="${esc(item?.ordem ?? 0)}"></div>
      <p id="portfolio-erro-form" class="mensagem full" role="alert"></p>
      <div class="form-acoes full"><button type="button" class="botao-acao" data-fechar-modal>Cancelar</button><button type="submit" class="botao-acao destaque">${editar ? 'Salvar alterações' : 'Cadastrar projeto'}</button></div>
    </form>`);
  $('form-portfolio').querySelector('[data-fechar-modal]').addEventListener('click', fecharModal);
  const capaInput = $('portfolio-foto-capa');
  capaInput.addEventListener('input', () => {
    const preview = $('portfolio-preview-capa'); const src = imagemPortfolioUI(capaInput.value);
    preview.classList.toggle('escondido', !src);
    preview.innerHTML = src ? `<img src="${esc(src)}" alt="Prévia da capa">` : '';
    preview.querySelector('img')?.addEventListener('error', () => { preview.innerHTML = '<span>Não foi possível carregar esta imagem. Confira o link e a permissão de compartilhamento.</span>'; });
  });
  $('form-portfolio').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const dados = Object.fromEntries(new FormData(form).entries());
    dados.ordem = Number(dados.ordem || 0);
    dados.galeria_url = String(dados.galeria_url || '').split(/[\n;,]+/).map(x => x.trim()).filter(Boolean).join('\n');
    const urls = [dados.foto_capa, ...dados.galeria_url.split('\n').filter(Boolean)].filter(Boolean);
    if (urls.length > 13) { $('portfolio-erro-form').textContent = 'Use no máximo uma foto de capa e 12 fotos na galeria.'; return; }
    if (urls.some(u => !/^https?:\/\//i.test(u))) { $('portfolio-erro-form').textContent = 'Cada imagem precisa ter um link iniciado por http:// ou https://.'; return; }
    const botao = form.querySelector('[type="submit"]'); botao.disabled = true; botao.textContent = 'Salvando...';
    try {
      const result = editar
        ? await chamarApi({action:'atualizarPortfolio',id_portfolio:item.id_portfolio,portfolio:dados})
        : await chamarApi({action:'cadastrarPortfolio',portfolio:dados});
      fecharModal(); toast(result.dados?.mensagem || 'Projeto salvo no portfólio.'); await atualizarPortfolioTela();
    } catch (error) {
      $('portfolio-erro-form').textContent = error.message || 'Não foi possível salvar o projeto.';
      botao.disabled = false; botao.textContent = editar ? 'Salvar alterações' : 'Cadastrar projeto';
    }
  });
}
async function alterarStatusPortfolioTela(id, status) {
  const item = portfolioCache.find(p => String(p.id_portfolio) === String(id)); if (!item) return;
  const mensagens = {PUBLICADO:'Marcar este projeto como publicado no portfólio?',RASCUNHO:'Retirar este projeto da situação publicado e voltar para rascunho?',ARQUIVADO:'Arquivar este projeto? Ele continuará salvo na planilha.'};
  if (!confirm(mensagens[status] || 'Alterar situação do projeto?')) return;
  try {
    const result = await chamarApi({action:'alterarStatusPortfolio',id_portfolio:id,status});
    toast(result.dados?.mensagem || 'Situação do projeto atualizada.'); await atualizarPortfolioTela();
  } catch (error) { toast(error.message || 'Não foi possível atualizar a situação.'); }
}

/* =====================================================
   AGENDA — CALENDÁRIO E TAREFAS
   Os eventos são alimentados pela aba TAREFAS existente.
===================================================== */
function dataLocalISOAgenda(data) {
  const d = data instanceof Date ? data : new Date(data);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function dataAgendaBR(iso) {
  if (!iso) return 'Sem prazo definido';
  const p = String(iso).slice(0,10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
}
function statusTarefaAgenda(item) {
  const status = String(item.status || 'PENDENTE').toUpperCase();
  const hoje = dataLocalISOAgenda(new Date());
  if (['PENDENTE','EM_ANDAMENTO'].includes(status) && item.data_limite && String(item.data_limite).slice(0,10) < hoje) return 'ATRASADA';
  return status;
}
function statusTarefaLabelAgenda(status) {
  return ({PENDENTE:'Pendente',EM_ANDAMENTO:'Em andamento',CONCLUIDA:'Concluída',CANCELADA:'Cancelada',ATRASADA:'Atrasada'})[status] || status;
}
function nomeMesAgenda(data) {
  return data.toLocaleDateString('pt-BR', {month:'long', year:'numeric'}).replace(/^./, c => c.toUpperCase());
}
async function renderAgenda(area) {
  const config = MODULOS.agenda;
  const mesISO = dataLocalISOAgenda(agendaMesAtual).slice(0,7);
  area.innerHTML = cabecalhoModulo(config) + `
    <section class="agenda-resumo">
      <div class="agenda-kpi"><small>Tarefas no mês</small><strong id="agenda-kpi-mes">—</strong></div>
      <div class="agenda-kpi"><small>Atrasadas</small><strong id="agenda-kpi-atrasadas">—</strong></div>
      <div class="agenda-kpi"><small>Concluídas</small><strong id="agenda-kpi-concluidas">—</strong></div>
    </section>
    <section class="agenda-calendario">
      <div class="agenda-cal-topo">
        <button type="button" id="agenda-anterior" aria-label="Mês anterior">‹</button>
        <strong id="agenda-mes-titulo">${esc(nomeMesAgenda(agendaMesAtual))}</strong>
        <button type="button" id="agenda-proximo" aria-label="Próximo mês">›</button>
      </div>
      <div class="agenda-semana"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div>
      <div class="agenda-dias" id="agenda-dias"></div>
      <div class="agenda-legenda"><span><i class="agenda-ponto"></i>Tem tarefa</span><span><i class="agenda-ponto atrasado"></i>Prazo atrasado</span><button type="button" id="agenda-hoje">Hoje</button></div>
    </section>
    <section class="agenda-lista-area">
      <div class="agenda-lista-titulo"><div><small id="agenda-subtitulo-lista">Compromissos</small><h3 id="agenda-data-lista">Tarefas do dia</h3></div><button type="button" class="botao-acao destaque" id="agenda-nova-tarefa">＋ Nova tarefa</button></div>
      <div class="agenda-filtros">
        <input id="agenda-busca" class="campo-busca" type="search" placeholder="Buscar tarefa, responsável ou vínculo">
        <select id="agenda-filtro-status" class="campo-filtro"><option value="TODOS">Todos os status</option><option value="PENDENTE">Pendentes</option><option value="EM_ANDAMENTO">Em andamento</option><option value="CONCLUIDA">Concluídas</option><option value="CANCELADA">Canceladas</option><option value="ATRASADA">Atrasadas</option></select>
        <select id="agenda-filtro-responsavel" class="campo-filtro"><option value="TODOS">Toda a equipe</option></select>
      </div>
      <div id="agenda-status-carregamento" class="status">Carregando tarefas...</div>
      <div id="agenda-lista" class="lista-registros"></div>
      <div class="aviso-modulo agenda-aviso"><strong>Agenda conectada às Tarefas:</strong> cada compromisso é registrado uma única vez na aba TAREFAS. O calendário usa a data-limite, o responsável, a prioridade e o status cadastrados.</div>
    </section>`;
  $('agenda-anterior').addEventListener('click', () => mudarMesAgenda(-1));
  $('agenda-proximo').addEventListener('click', () => mudarMesAgenda(1));
  $('agenda-hoje').addEventListener('click', () => {
    const hoje = new Date(); agendaMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1); agendaDiaSelecionado = dataLocalISOAgenda(hoje); renderCalendarioAgenda(); renderListaAgenda();
  });
  $('agenda-nova-tarefa').addEventListener('click', () => abrirFormularioTarefaAgenda());
  $('agenda-busca').addEventListener('input', renderListaAgenda);
  $('agenda-filtro-status').addEventListener('change', renderListaAgenda);
  $('agenda-filtro-responsavel').addEventListener('change', renderListaAgenda);
  await atualizarAgenda();
}
function mudarMesAgenda(delta) {
  agendaMesAtual = new Date(agendaMesAtual.getFullYear(), agendaMesAtual.getMonth() + delta, 1);
  agendaDiaSelecionado = null;
  renderCalendarioAgenda();
  renderListaAgenda();
}
async function atualizarAgenda() {
  const status = $('agenda-status-carregamento');
  if (!status) return;
  status.className = 'status'; status.textContent = 'Carregando tarefas...';
  try {
    const result = await chamarApi({action:'listarTarefas'});
    agendaTarefasCache = result.dados.tarefas || [];
    const responsaveis = [...new Set(agendaTarefasCache.map(t => String(t.responsavel || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
    const filtro = $('agenda-filtro-responsavel');
    const anterior = filtro.value || 'TODOS';
    filtro.innerHTML = '<option value="TODOS">Toda a equipe</option>' + responsaveis.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
    filtro.value = responsaveis.includes(anterior) ? anterior : 'TODOS';
    status.className = 'status ok'; status.textContent = `${agendaTarefasCache.length} tarefa(s) cadastrada(s).`;
    renderCalendarioAgenda(); renderListaAgenda();
  } catch (error) {
    status.className = 'status error'; status.textContent = error.message || 'Não foi possível carregar a Agenda.';
    $('agenda-dias').innerHTML = '<div class="vazio">Não foi possível carregar o calendário.</div>';
    $('agenda-lista').innerHTML = '';
  }
}
function renderCalendarioAgenda() {
  const grid = $('agenda-dias'); if (!grid) return;
  const ano = agendaMesAtual.getFullYear(), mes = agendaMesAtual.getMonth();
  $('agenda-mes-titulo').textContent = nomeMesAgenda(agendaMesAtual);
  const primeiroDia = new Date(ano, mes, 1).getDay();
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const hoje = dataLocalISOAgenda(new Date());
  const tarefasMes = agendaTarefasCache.filter(t => String(t.data_limite || '').slice(0,7) === `${ano}-${String(mes+1).padStart(2,'0')}`);
  const atrasadas = agendaTarefasCache.filter(t => statusTarefaAgenda(t) === 'ATRASADA');
  $('agenda-kpi-mes').textContent = tarefasMes.length;
  $('agenda-kpi-atrasadas').textContent = atrasadas.length;
  $('agenda-kpi-concluidas').textContent = tarefasMes.filter(t => String(t.status).toUpperCase() === 'CONCLUIDA').length;
  let html = '';
  for (let i=0;i<primeiroDia;i++) html += '<span class="agenda-dia vazio-dia" aria-hidden="true"></span>';
  for (let dia=1;dia<=totalDias;dia++) {
    const iso = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    const doDia = agendaTarefasCache.filter(t => String(t.data_limite || '').slice(0,10) === iso);
    const temAtrasada = doDia.some(t => statusTarefaAgenda(t) === 'ATRASADA');
    const classes = ['agenda-dia', iso === hoje ? 'hoje' : '', iso === agendaDiaSelecionado ? 'selecionado' : '', doDia.length ? 'com-tarefa' : ''].filter(Boolean).join(' ');
    html += `<button type="button" class="${classes}" data-agenda-dia="${iso}" aria-label="${dia} de ${nomeMesAgenda(agendaMesAtual)}${doDia.length ? `, ${doDia.length} tarefa(s)` : ''}"><span>${dia}</span>${doDia.length ? `<i class="agenda-ponto ${temAtrasada ? 'atrasado' : ''}"></i><small>${doDia.length}</small>` : ''}</button>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('[data-agenda-dia]').forEach(btn => btn.addEventListener('click', () => { agendaDiaSelecionado = btn.dataset.agendaDia; renderCalendarioAgenda(); renderListaAgenda(); }));
}
function renderListaAgenda() {
  const alvo = $('agenda-lista'); if (!alvo) return;
  const termo = normalizarTexto($('agenda-busca')?.value || '');
  const filtroStatus = $('agenda-filtro-status')?.value || 'TODOS';
  const filtroResponsavel = $('agenda-filtro-responsavel')?.value || 'TODOS';
  const anoMes = dataLocalISOAgenda(agendaMesAtual).slice(0,7);
  let titulo = 'Tarefas do mês';
  let lista = agendaTarefasCache.slice();
  if (agendaDiaSelecionado) {
    titulo = `Tarefas de ${dataAgendaBR(agendaDiaSelecionado)}`;
    lista = lista.filter(t => String(t.data_limite || '').slice(0,10) === agendaDiaSelecionado);
  } else {
    lista = lista.filter(t => !t.data_limite || String(t.data_limite).slice(0,7) === anoMes);
  }
  lista = lista.filter(t => {
    const statusReal = String(t.status || 'PENDENTE').toUpperCase();
    const statusTela = statusTarefaAgenda(t);
    const texto = normalizarTexto([t.titulo,t.descricao,t.responsavel,t.vinculo_tipo,t.vinculo_id].join(' '));
    return (!termo || texto.includes(termo)) && (filtroStatus === 'TODOS' || (filtroStatus === 'ATRASADA' ? statusTela === 'ATRASADA' : statusReal === filtroStatus)) && (filtroResponsavel === 'TODOS' || String(t.responsavel || '') === filtroResponsavel);
  });
  lista.sort((a,b) => String(a.data_limite || '9999-99-99').localeCompare(String(b.data_limite || '9999-99-99')) || String(a.titulo || '').localeCompare(String(b.titulo || ''),'pt-BR'));
  $('agenda-data-lista').textContent = titulo;
  $('agenda-subtitulo-lista').textContent = `${lista.length} tarefa(s)`;
  alvo.innerHTML = lista.length ? lista.map(t => {
    const status = statusTarefaAgenda(t);
    const prioridade = String(t.prioridade || 'MEDIA').toUpperCase();
    const vinculo = t.vinculo_tipo && t.vinculo_id ? `${t.vinculo_tipo}: ${t.vinculo_id}` : '';
    const concluida = String(t.status).toUpperCase() === 'CONCLUIDA';
    return `<article class="registro agenda-registro ${concluida ? 'agenda-concluida' : ''}">
      <div class="registro-topo"><div><h3>${esc(t.titulo || 'Tarefa sem título')}</h3><div class="meta">${esc(t.responsavel || 'Sem responsável')} · ${esc(t.data_limite ? dataAgendaBR(t.data_limite) : 'Sem prazo')}</div>${vinculo ? `<div class="meta">Vínculo: ${esc(vinculo)}</div>` : ''}</div>${badge(statusTarefaLabelAgenda(status))}</div>
      ${t.descricao ? `<p class="agenda-descricao">${esc(t.descricao)}</p>` : ''}
      <div class="agenda-registro-rodape"><span class="agenda-prioridade ${esc(normalizarStatus(prioridade))}">Prioridade ${esc(({BAIXA:'baixa',MEDIA:'média',ALTA:'alta',URGENTE:'urgente'})[prioridade] || prioridade.toLowerCase())}</span><div class="registro-acoes"><button type="button" class="botao-acao" data-agenda-editar="${esc(t.id_tarefa)}">Editar</button>${!concluida && status !== 'CANCELADA' ? `<button type="button" class="botao-acao destaque" data-agenda-status="${esc(t.id_tarefa)}" data-status="CONCLUIDA">Concluir</button>` : (concluida ? `<button type="button" class="botao-acao" data-agenda-status="${esc(t.id_tarefa)}" data-status="PENDENTE">Reabrir</button>` : '')}</div></div>
    </article>`;
  }).join('') : '<div class="vazio">Nenhuma tarefa para este período. Use “＋ Nova tarefa” para incluir um compromisso ou prazo.</div>';
  alvo.querySelectorAll('[data-agenda-editar]').forEach(btn => btn.addEventListener('click', () => { const item = agendaTarefasCache.find(t => String(t.id_tarefa) === btn.dataset.agendaEditar); if (item) abrirFormularioTarefaAgenda(item); }));
  alvo.querySelectorAll('[data-agenda-status]').forEach(btn => btn.addEventListener('click', () => alterarStatusTarefaAgenda(btn.dataset.agendaStatus, btn.dataset.status)));
}
function abrirFormularioTarefaAgenda(tarefa = null) {
  const editar = !!tarefa;
  const opcoesPrioridade = [['BAIXA','Baixa'],['MEDIA','Média'],['ALTA','Alta'],['URGENTE','Urgente']];
  const opcoesStatus = [['PENDENTE','Pendente'],['EM_ANDAMENTO','Em andamento'],['CONCLUIDA','Concluída'],['CANCELADA','Cancelada']];
  const select = (lista, atual) => lista.map(([v,l]) => `<option value="${v}" ${String(atual || '') === v ? 'selected' : ''}>${l}</option>`).join('');
  abrirModal(editar ? 'Editar tarefa da Agenda' : 'Nova tarefa na Agenda', `
    <form id="form-tarefa-agenda" class="form-grid">
      <div class="form-grupo full"><label for="agenda-titulo">Título *</label><input id="agenda-titulo" class="campo-form" name="titulo" maxlength="120" required value="${esc(tarefa?.titulo || '')}" placeholder="Ex.: Entregar sapateira ao cliente"></div>
      <div class="form-grupo full"><label for="agenda-descricao">Descrição</label><textarea id="agenda-descricao" class="campo-form textarea" name="descricao" maxlength="1200" placeholder="Detalhes do compromisso, visita ou etapa de produção">${esc(tarefa?.descricao || '')}</textarea></div>
      <div class="form-grupo"><label for="agenda-responsavel">Responsável</label><input id="agenda-responsavel" class="campo-form" name="responsavel" maxlength="80" value="${esc(tarefa?.responsavel || (sessao.usuario?.nome || ''))}" placeholder="Fernando ou Letícia"></div>
      <div class="form-grupo"><label for="agenda-data-limite">Data / prazo</label><input id="agenda-data-limite" class="campo-form" type="date" name="data_limite" value="${esc(String(tarefa?.data_limite || (agendaDiaSelecionado || '')).slice(0,10))}"></div>
      <div class="form-grupo"><label for="agenda-prioridade">Prioridade</label><select id="agenda-prioridade" class="campo-form" name="prioridade">${select(opcoesPrioridade,tarefa?.prioridade || 'MEDIA')}</select></div>
      <div class="form-grupo"><label for="agenda-status">Situação</label><select id="agenda-status" class="campo-form" name="status">${select(opcoesStatus,tarefa?.status || 'PENDENTE')}</select></div>
      <div class="form-grupo"><label for="agenda-vinculo-tipo">Vincular a</label><select id="agenda-vinculo-tipo" class="campo-form" name="vinculo_tipo"><option value="">Nenhum</option><option value="PEDIDO" ${tarefa?.vinculo_tipo === 'PEDIDO' ? 'selected' : ''}>Pedido</option><option value="CLIENTE" ${tarefa?.vinculo_tipo === 'CLIENTE' ? 'selected' : ''}>Cliente</option></select></div>
      <div class="form-grupo"><label for="agenda-vinculo-id">Código do vínculo</label><input id="agenda-vinculo-id" class="campo-form" name="vinculo_id" maxlength="60" value="${esc(tarefa?.vinculo_id || '')}" placeholder="Ex.: PED-001"></div>
      <div class="form-grupo full"><small class="ajuda-campo">A Agenda utiliza a aba TAREFAS existente. A data informada é a data-limite; horários específicos não fazem parte das colunas atuais.</small><div id="erro-form-tarefa-agenda" class="mensagem"></div></div>
      <div class="form-acoes full"><button type="button" class="botao-acao" data-fechar-modal>Cancelar</button><button type="submit" class="botao-acao destaque">${editar ? 'Salvar alterações' : 'Criar tarefa'}</button></div>
    </form>`);
  $('form-tarefa-agenda').querySelector('[data-fechar-modal]').addEventListener('click', fecharModal);
  $('form-tarefa-agenda').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const dados = Object.fromEntries(new FormData(form).entries());
    const tipo = String(dados.vinculo_tipo || '').trim();
    const vinculoId = String(dados.vinculo_id || '').trim();
    if (tipo && !vinculoId) { $('erro-form-tarefa-agenda').textContent = 'Informe o código do pedido ou cliente vinculado.'; return; }
    if (!tipo && vinculoId) { $('erro-form-tarefa-agenda').textContent = 'Escolha o tipo de vínculo para esse código.'; return; }
    const botao = form.querySelector('[type="submit"]'); botao.disabled = true; botao.textContent = 'Salvando...';
    try {
      const result = editar
        ? await chamarApi({action:'atualizarTarefa',id_tarefa:tarefa.id_tarefa,tarefa:dados})
        : await chamarApi({action:'cadastrarTarefa',tarefa:dados});
      fecharModal(); toast(result.dados?.mensagem || 'Tarefa salva com sucesso.'); await atualizarAgenda();
    } catch (error) {
      $('erro-form-tarefa-agenda').textContent = error.message || 'Não foi possível salvar a tarefa.';
      botao.disabled = false; botao.textContent = editar ? 'Salvar alterações' : 'Criar tarefa';
    }
  });
}
async function alterarStatusTarefaAgenda(id, status) {
  const tarefa = agendaTarefasCache.find(t => String(t.id_tarefa) === String(id));
  if (!tarefa) return;
  const pergunta = status === 'CONCLUIDA' ? `Marcar “${tarefa.titulo}” como concluída?` : `Reabrir “${tarefa.titulo}”?`;
  if (!confirm(pergunta)) return;
  try {
    const result = await chamarApi({action:'alterarStatusTarefa',id_tarefa:id,status});
    toast(result.dados?.mensagem || 'Situação atualizada.');
    await atualizarAgenda();
  } catch (error) { toast(error.message || 'Não foi possível atualizar a tarefa.'); }
}



/* =====================================================
   MARKETING — CALENDÁRIO EDITORIAL
===================================================== */
const STATUS_MARKETING_UI = [
  ['IDEIA','Ideia'],['EM_PRODUCAO','Em produção'],['PRONTO','Pronto para publicar'],
  ['AGENDADO','Agendado'],['PUBLICADO','Publicado'],['PAUSADO','Pausado']
];
function statusMarketingCanonicoUI(status) {
  const n = normalizarTexto(status).replace(/[^a-z0-9]+/g,' ').trim();
  const mapa = {
    'ideia':'IDEIA','ideias':'IDEIA','pauta':'IDEIA','rascunho':'IDEIA','backlog':'IDEIA',
    'em producao':'EM_PRODUCAO','em criacao':'EM_PRODUCAO','em andamento':'EM_PRODUCAO','producao':'EM_PRODUCAO','em edicao':'EM_PRODUCAO','edicao':'EM_PRODUCAO',
    'pronto':'PRONTO','pronta':'PRONTO','revisao':'PRONTO','em revisao':'PRONTO','aprovado':'PRONTO','aprovada':'PRONTO','pronto para publicar':'PRONTO',
    'agendado':'AGENDADO','agendada':'AGENDADO','programado':'AGENDADO','programada':'AGENDADO',
    'publicado':'PUBLICADO','publicada':'PUBLICADO','no ar':'PUBLICADO','postado':'PUBLICADO','postada':'PUBLICADO',
    'pausado':'PAUSADO','pausada':'PAUSADO','cancelado':'PAUSADO','cancelada':'PAUSADO','arquivado':'PAUSADO','arquivada':'PAUSADO'
  };
  return mapa[n] || String(status || 'IDEIA').toUpperCase();
}
function statusMarketingLabelUI(status) {
  const canonico = statusMarketingCanonicoUI(status);
  return (STATUS_MARKETING_UI.find(x => x[0] === canonico) || [canonico,canonico])[1];
}
function dataMarketingBRUI(iso) {
  if (!iso) return 'Sem data';
  const p = String(iso).slice(0,10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
}
async function renderMarketing(area) {
  area.innerHTML = cabecalhoModulo(MODULOS.marketing) + `
    <section class="marketing-resumo">
      <div class="marketing-kpi"><small>Conteúdos cadastrados</small><strong id="marketing-kpi-total">—</strong></div>
      <div class="marketing-kpi producao"><small>Em produção</small><strong id="marketing-kpi-producao">—</strong></div>
      <div class="marketing-kpi publicado"><small>Publicados</small><strong id="marketing-kpi-publicados">—</strong></div>
    </section>
    <div class="barra-acoes marketing-acoes">
      <button type="button" id="marketing-novo" class="botao-acao destaque">＋ Novo conteúdo</button>
      <button type="button" id="marketing-atualizar" class="botao-acao">↻ Atualizar</button>
    </div>
    <div class="marketing-filtros">
      <input id="marketing-busca" class="campo-busca" type="search" placeholder="Buscar título, ideia, legenda ou projeto">
      <select id="marketing-filtro-status" class="campo-filtro"><option value="TODOS">Todos os status</option>${STATUS_MARKETING_UI.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('')}</select>
      <select id="marketing-filtro-canal" class="campo-filtro"><option value="TODOS">Todos os canais</option></select>
      <select id="marketing-filtro-tipo" class="campo-filtro"><option value="TODOS">Todos os formatos</option></select>
    </div>
    <div class="marketing-fluxo" id="marketing-fluxo"></div>
    <div id="marketing-status-carregamento" class="status">Carregando planejamento de conteúdo...</div>
    <div id="marketing-lista" class="marketing-lista"></div>
    <div class="aviso-modulo marketing-aviso"><strong>Planejamento editorial:</strong> este módulo organiza ideias, produção, agendamento e registro de publicação na aba MARKETING. Ele não publica automaticamente no Instagram. O campo Projeto permite relacionar o conteúdo a um trabalho do Portfólio.</div>`;
  $('marketing-novo').addEventListener('click', () => abrirFormularioMarketing());
  $('marketing-atualizar').addEventListener('click', atualizarMarketingTela);
  ['marketing-busca','marketing-filtro-status','marketing-filtro-canal','marketing-filtro-tipo'].forEach(id => $(id).addEventListener(id === 'marketing-busca' ? 'input' : 'change', renderListaMarketing));
  await atualizarMarketingTela();
}
async function atualizarMarketingTela() {
  const status = $('marketing-status-carregamento'); if (!status) return;
  status.className = 'status'; status.textContent = 'Consultando conteúdos...';
  try {
    const result = await chamarApi({action:'listarMarketing'});
    marketingCache = result.dados.conteudos || [];
    const canais = [...new Set(marketingCache.map(x=>String(x.canal||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const tipos = [...new Set(marketingCache.map(x=>String(x.tipo||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const canalFiltro = $('marketing-filtro-canal'), tipoFiltro = $('marketing-filtro-tipo');
    const canalAnterior = canalFiltro.value || 'TODOS', tipoAnterior = tipoFiltro.value || 'TODOS';
    canalFiltro.innerHTML = '<option value="TODOS">Todos os canais</option>'+canais.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    tipoFiltro.innerHTML = '<option value="TODOS">Todos os formatos</option>'+tipos.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    canalFiltro.value = canais.includes(canalAnterior) ? canalAnterior : 'TODOS';
    tipoFiltro.value = tipos.includes(tipoAnterior) ? tipoAnterior : 'TODOS';
    const contar = status => marketingCache.filter(x=>statusMarketingCanonicoUI(x.status)===status).length;
    $('marketing-kpi-total').textContent = marketingCache.length;
    $('marketing-kpi-producao').textContent = contar('EM_PRODUCAO');
    $('marketing-kpi-publicados').textContent = contar('PUBLICADO');
    $('marketing-fluxo').innerHTML = STATUS_MARKETING_UI.map(([s,l])=>`<button type="button" class="marketing-etapa ${contar(s)?'tem-itens':''}" data-marketing-etapa="${s}"><strong>${contar(s)}</strong><span>${l}</span></button>`).join('');
    $('marketing-fluxo').querySelectorAll('[data-marketing-etapa]').forEach(btn=>btn.addEventListener('click',()=>{ $('marketing-filtro-status').value=btn.dataset.marketingEtapa; renderListaMarketing(); }));
    status.className = 'status ok'; status.textContent = `${marketingCache.length} conteúdo(s) encontrado(s) na aba MARKETING.`;
    renderListaMarketing();
  } catch(error) {
    status.className = 'status error'; status.textContent = error.message || 'Não foi possível carregar o Marketing.';
    $('marketing-lista').innerHTML = '<div class="vazio">Não foi possível consultar o planejamento. Verifique a conexão e tente atualizar.</div>';
  }
}
function renderListaMarketing() {
  const alvo = $('marketing-lista'); if (!alvo) return;
  const termo = normalizarTexto($('marketing-busca')?.value || '');
  const filtroStatus = $('marketing-filtro-status')?.value || 'TODOS';
  const filtroCanal = $('marketing-filtro-canal')?.value || 'TODOS';
  const filtroTipo = $('marketing-filtro-tipo')?.value || 'TODOS';
  const lista = marketingCache.filter(x => {
    const status = statusMarketingCanonicoUI(x.status);
    const texto = normalizarTexto([x.titulo,x.tipo,x.canal,x.projeto_id,x.ideia,x.legenda,x.responsavel,x.observacoes].join(' '));
    return (!termo || texto.includes(termo)) && (filtroStatus==='TODOS'||status===filtroStatus) && (filtroCanal==='TODOS'||String(x.canal||'')===filtroCanal) && (filtroTipo==='TODOS'||String(x.tipo||'')===filtroTipo);
  }).sort((a,b)=>String(a.data_prevista||'9999-99-99').localeCompare(String(b.data_prevista||'9999-99-99'))||String(a.titulo||'').localeCompare(String(b.titulo||''),'pt-BR'));
  alvo.innerHTML = lista.length ? lista.map(x=>{
    const status = statusMarketingCanonicoUI(x.status);
    const proximo = ({IDEIA:'EM_PRODUCAO',EM_PRODUCAO:'PRONTO',PRONTO:'AGENDADO',AGENDADO:'PUBLICADO',PUBLICADO:'PAUSADO',PAUSADO:'IDEIA'})[status] || 'EM_PRODUCAO';
    const rotulo = status === 'PUBLICADO' ? 'Pausar' : `Avançar: ${statusMarketingLabelUI(proximo)}`;
    return `<article class="marketing-card">
      <div class="marketing-card-topo"><div><span class="marketing-tipo">${esc(x.tipo || 'Conteúdo')}</span><span class="marketing-canal">${esc(x.canal || 'Canal não definido')}</span></div>${badge(statusMarketingLabelUI(status))}</div>
      <h3>${esc(x.titulo || 'Conteúdo sem título')}</h3>
      <div class="marketing-metadados"><span>📅 ${esc(dataMarketingBRUI(x.data_prevista))}</span><span>👤 ${esc(x.responsavel || 'Sem responsável')}</span>${x.projeto_id?`<span>🔗 ${esc(x.projeto_id)}</span>`:''}</div>
      ${x.ideia ? `<p class="marketing-ideia"><strong>Ideia:</strong> ${esc(x.ideia)}</p>` : ''}
      ${x.legenda ? `<div class="marketing-legenda"><strong>Legenda</strong><p>${esc(x.legenda)}</p><button type="button" class="botao-acao" data-marketing-copiar="${esc(x.id_conteudo)}">Copiar legenda</button></div>` : ''}
      ${x.data_publicado ? `<div class="marketing-publicacao">Publicado em ${esc(dataMarketingBRUI(x.data_publicado))}</div>` : ''}
      <div class="registro-acoes"><button type="button" class="botao-acao destaque" data-marketing-editar="${esc(x.id_conteudo)}">Editar</button><button type="button" class="botao-acao" data-marketing-status="${esc(x.id_conteudo)}" data-status="${proximo}">${rotulo}</button></div>
    </article>`;
  }).join('') : '<div class="vazio marketing-vazio">Nenhum conteúdo encontrado. Clique em “＋ Novo conteúdo” para começar seu planejamento.</div>';
  alvo.querySelectorAll('[data-marketing-editar]').forEach(btn=>btn.addEventListener('click',()=>{const item=marketingCache.find(x=>String(x.id_conteudo)===btn.dataset.marketingEditar);if(item)abrirFormularioMarketing(item);}));
  alvo.querySelectorAll('[data-marketing-status]').forEach(btn=>btn.addEventListener('click',()=>alterarStatusMarketingTela(btn.dataset.marketingStatus,btn.dataset.status)));
  alvo.querySelectorAll('[data-marketing-copiar]').forEach(btn=>btn.addEventListener('click',async()=>{
    const item=marketingCache.find(x=>String(x.id_conteudo)===btn.dataset.marketingCopiar); if(!item?.legenda)return;
    try { await navigator.clipboard.writeText(item.legenda); toast('Legenda copiada.'); }
    catch(_) { window.prompt('Copie a legenda abaixo:',item.legenda); }
  }));
}
async function abrirFormularioMarketing(item=null) {
  const editar = !!item;
  let portfolio = [];
  try { const r = await chamarApi({action:'listarPortfolio'}); portfolio = r.dados.portfolio || []; }
  catch(_) { portfolio = []; }
  const projetos = portfolio.map(p=>({id:String(p.id_projeto||p.id_portfolio||''),titulo:p.titulo||'Projeto'})).filter(p=>p.id);
  const opcoes = (lista, atual) => lista.map(v=>`<option value="${esc(v[0])}" ${String(v[0])===String(atual||'')?'selected':''}>${esc(v[1])}</option>`).join('');
  const canais = ['Instagram','Facebook','TikTok','WhatsApp','Site','Pinterest','Outro'];
  const tipos = ['Post','Carrossel','Reels','Stories','Vídeo','Bastidores','Depoimento','Outro'];
  const statusAtual = statusMarketingCanonicoUI(item?.status || 'IDEIA');
  abrirModal(editar?'Editar conteúdo de Marketing':'Planejar novo conteúdo',`
    <form id="form-marketing" class="form-grid">
      <div class="form-grupo full"><label for="mkt-titulo">Título do conteúdo *</label><input id="mkt-titulo" class="campo-form" name="titulo" maxlength="140" required placeholder="Ex.: Bastidores da fabricação do aparador" value="${esc(item?.titulo||'')}"></div>
      <div class="form-grupo"><label for="mkt-tipo">Formato *</label><select id="mkt-tipo" class="campo-form" name="tipo" required>${opcoes(tipos.map(x=>[x,x]),item?.tipo||'Reels')}</select></div>
      <div class="form-grupo"><label for="mkt-canal">Canal *</label><select id="mkt-canal" class="campo-form" name="canal" required>${opcoes(canais.map(x=>[x,x]),item?.canal||'Instagram')}</select></div>
      <div class="form-grupo full"><label for="mkt-projeto">Projeto relacionado (opcional)</label><input id="mkt-projeto" class="campo-form" name="projeto_id" list="mkt-projetos" maxlength="80" value="${esc(item?.projeto_id||'')}" placeholder="Selecione ou digite o ID do projeto"><datalist id="mkt-projetos">${projetos.map(p=>`<option value="${esc(p.id)}">${esc(p.titulo)}</option>`).join('')}</datalist><small class="ajuda-campo">Use o ID de um projeto do Portfólio quando o conteúdo divulgar um trabalho específico.</small></div>
      <div class="form-grupo full"><label for="mkt-ideia">Ideia / roteiro</label><textarea id="mkt-ideia" class="campo-form textarea" name="ideia" maxlength="3000" placeholder="Objetivo do conteúdo, cenas, roteiro ou pontos que precisam aparecer...">${esc(item?.ideia||'')}</textarea></div>
      <div class="form-grupo full"><label for="mkt-legenda">Legenda / texto da publicação</label><textarea id="mkt-legenda" class="campo-form textarea" name="legenda" maxlength="5000" placeholder="Escreva a legenda, chamada, hashtags e CTA...">${esc(item?.legenda||'')}</textarea></div>
      <div class="form-grupo"><label for="mkt-status">Etapa</label><select id="mkt-status" class="campo-form" name="status">${opcoes(STATUS_MARKETING_UI,statusAtual)}</select></div>
      <div class="form-grupo"><label for="mkt-responsavel">Responsável</label><input id="mkt-responsavel" class="campo-form" name="responsavel" maxlength="80" value="${esc(item?.responsavel||sessao.usuario?.nome||'')}" placeholder="Letícia ou Fernando"></div>
      <div class="form-grupo"><label for="mkt-data-prevista">Data prevista</label><input id="mkt-data-prevista" class="campo-form" type="date" name="data_prevista" value="${esc(String(item?.data_prevista||'').slice(0,10))}"></div>
      <div class="form-grupo"><label for="mkt-data-publicado">Data de publicação</label><input id="mkt-data-publicado" class="campo-form" type="date" name="data_publicado" value="${esc(String(item?.data_publicado||'').slice(0,10))}"></div>
      <div class="form-grupo full"><label for="mkt-observacoes">Observações</label><textarea id="mkt-observacoes" class="campo-form textarea" name="observacoes" maxlength="2000">${esc(item?.observacoes||'')}</textarea></div>
      <div class="form-grupo full"><div id="mkt-erro-form" class="mensagem"></div></div>
      <div class="form-acoes full"><button type="button" class="botao-acao" data-fechar-modal>Cancelar</button><button type="submit" class="botao-acao destaque">${editar?'Salvar alterações':'Salvar conteúdo'}</button></div>
    </form>`);
  $('form-marketing').querySelector('[data-fechar-modal]').addEventListener('click',fecharModal);
  $('form-marketing').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget, dados=Object.fromEntries(new FormData(form).entries());
    const btn=form.querySelector('[type="submit"]'); btn.disabled=true; btn.textContent='Salvando...';
    try {
      const result=editar
        ? await chamarApi({action:'atualizarMarketing',id_conteudo:item.id_conteudo,conteudo:dados})
        : await chamarApi({action:'cadastrarMarketing',conteudo:dados});
      fecharModal(); toast(result.dados?.mensagem||'Conteúdo salvo.'); await atualizarMarketingTela();
    } catch(error) { $('mkt-erro-form').textContent=error.message||'Não foi possível salvar o conteúdo.'; btn.disabled=false; btn.textContent=editar?'Salvar alterações':'Salvar conteúdo'; }
  });
}
async function alterarStatusMarketingTela(id,status) {
  const item=marketingCache.find(x=>String(x.id_conteudo)===String(id)); if(!item)return;
  const label=statusMarketingLabelUI(status);
  if(!confirm(`Alterar “${item.titulo}” para “${label}”?`))return;
  try { const r=await chamarApi({action:'alterarStatusMarketing',id_conteudo:id,status}); toast(r.dados?.mensagem||'Etapa atualizada.'); await atualizarMarketingTela(); }
  catch(error) { toast(error.message||'Não foi possível alterar a etapa.'); }
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
