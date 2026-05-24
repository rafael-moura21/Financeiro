# 💰 Meu Financeiro

Web App de controle financeiro pessoal integrado com Google Sheets.

---

## 📁 Estrutura do projeto

```
financeiro/
├── index.html      → estrutura das telas
├── style.css       → visual do app
├── app.js          → lógica e integração com Google Sheets
├── manifest.json   → configuração PWA (instalar no celular)
└── README.md       → este arquivo
```

---

## ⚙️ Configuração (faça uma vez só)

### 1. Criar projeto no Google Cloud

1. Acesse: https://console.cloud.google.com
2. Clique em **"Novo Projeto"** → dê um nome (ex: "Meu Financeiro")
3. Com o projeto selecionado, vá em **"APIs e Serviços" → "Biblioteca"**
4. Busque e ative as APIs:
   - **Google Sheets API**
   - **Google Drive API**

### 2. Criar credenciais OAuth

1. Vá em **"APIs e Serviços" → "Credenciais"**
2. Clique em **"Criar Credenciais" → "ID do cliente OAuth 2.0"**
3. Tipo: **Aplicativo da Web**
4. Nome: "Meu Financeiro"
5. Em **"Origens JavaScript autorizadas"**, adicione:
   - `http://localhost:5500` (para desenvolvimento com Live Server)
   - Seu domínio do GitHub Pages quando publicar (ex: `https://seuuser.github.io`)
6. Clique em **Criar** e copie o **Client ID**

### 3. Criar API Key

1. Em **"Credenciais"**, clique em **"Criar Credenciais" → "Chave de API"**
2. Copie a chave gerada
3. (Recomendado) Clique na chave → **"Restringir chave"** → selecione Google Sheets API

### 4. Configurar o app.js

Abra o arquivo `app.js` e substitua nas primeiras linhas:

```javascript
const CONFIG = {
  CLIENT_ID: 'SEU_CLIENT_ID_AQUI',   // ← cole aqui o Client ID
  API_KEY: 'SUA_API_KEY_AQUI',       // ← cole aqui a API Key
  ...
}
```

### 5. Configurar tela de consentimento OAuth

1. Vá em **"APIs e Serviços" → "Tela de consentimento OAuth"**
2. Tipo de usuário: **Externo**
3. Preencha o nome do app e seu e-mail
4. Em **"Escopos"**, adicione:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.file`
5. Em **"Usuários de teste"**, adicione seu e-mail do Google

---

## 🖥️ Rodando localmente (VS Code)

1. Instale a extensão **Live Server** no VS Code
2. Abra a pasta `financeiro/` no VS Code
3. Clique com botão direito em `index.html` → **"Open with Live Server"**
4. O app abre em `http://localhost:5500`

---

## 🌐 Publicando no GitHub Pages

1. Crie uma conta em https://github.com
2. Crie um repositório chamado `financeiro`
3. Suba todos os arquivos da pasta
4. Vá em **Settings → Pages → Source: main branch**
5. Seu app estará em: `https://seuusuario.github.io/financeiro`
6. Adicione essa URL nas **Origens JavaScript autorizadas** do Google Cloud

---

## 📱 Instalando no celular como app

1. Acesse o link do GitHub Pages no celular
2. No Chrome Android: menu **⋮ → "Adicionar à tela inicial"**
3. O app aparece como ícone na sua tela!

---

## 🗂️ Como funciona a planilha

Na primeira vez que você fizer login, o app cria automaticamente uma planilha no seu Google Drive chamada **"Meu Financeiro - Controle"** com 3 abas:

| Aba | Conteúdo |
|---|---|
| Lançamentos | Data, Descrição, Valor, Tipo, Categoria, Conta |
| Categorias | Lista das categorias |
| Contas | Lista das contas |

Você pode abrir a planilha a qualquer momento para ver ou editar os dados diretamente!

---

## ➕ Adicionando novas contas ou categorias

- **Nova conta**: abra a aba `Contas` na planilha e adicione uma linha
- **Nova categoria**: abra a aba `Categorias` na planilha e adicione uma linha
- Para aparecer no app com ícone bonito, edite o array `CATEGORIAS` no `app.js`

---

## 🆘 Problemas comuns

**"Erro 401"** → Token expirou. Faça logout e login novamente.

**"Popup bloqueado"** → Permita popups para o site nas configurações do navegador.

**"redirect_uri_mismatch"** → A URL do seu app não está na lista de origens autorizadas no Google Cloud. Adicione-a.
