# Tinhas Decorações — site e aplicativo

Este repositório contém duas frentes independentes:

- `index.html` e `style.css`: site público/portfólio da Tinhas Decorações.
- `gestao/`: aplicativo interno Tinhas Gestão, com interface mobile e instalável inspirada na experiência do LeFe Home.

## Tinhas Gestão (PWA)

O aplicativo em `gestao/` é uma PWA estática para GitHub Pages. Ele utiliza:

- `index.html`, `style.css` e `app.js`: interface e navegação;
- `manifest.json` e `service-worker.js`: instalação e cache dos arquivos estáticos;
- `assets/`: logo e personagens oficiais da Tinhas;
- `config.js`: endereço da API própria do Apps Script.

A configuração `API_URL` em `gestao/config.js` já está preenchida com a URL `/exec` fornecida para a implantação do Apps Script. A versão do PWA foi atualizada para `1.0.1` para renovar o cache nos dispositivos.

## Backend privado

O backend e o banco continuam no Google Apps Script e na planilha Google atual. O código do backend não deve ser publicado neste repositório. Ele é entregue separadamente no pacote privado de integração.

A aba `USUÁRIOS` da planilha continua determinando quem tem autorização. Cada usuário define a senha do PWA pelo menu **Tinhas Gestão → Configurar minha senha do aplicativo**, aberto na própria planilha.

## Publicação

O site público permanece na raiz. O PWA fica disponível em `/gestao/` quando o GitHub Pages estiver publicado a partir de `main` + `/(root)`.

**Não publique o conteúdo da pasta `apps_script_privado` no GitHub.**
