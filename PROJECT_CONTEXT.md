# Contexto do projeto Bolso

Este documento descreve o estado atual do repositório e serve como ponto de
partida para quem for desenvolver, revisar ou operar o projeto. Ele registra
tanto os fluxos implementados quanto as limitações e incompatibilidades que
foram identificadas no código atual; uma funcionalidade aparecer na interface
não significa necessariamente que esteja pronta de ponta a ponta.

## 1. Visão geral

O **Bolso** é uma aplicação web de gestão financeira pessoal. O usuário pode
organizar contas bancárias, lançamentos, categorias, metas, reservas e gastos
fixos. O acesso é restrito por conta e os dados financeiros principais são
persistidos em MySQL.

A aplicação segue uma arquitetura tradicional:

1. O navegador solicita páginas, estilos e scripts ao servidor Express.
2. O JavaScript do frontend envia requisições HTTP para a API do próprio
   servidor.
3. O backend autentica as requisições protegidas e usa o identificador do
   usuário autenticado para restringir as consultas e alterações.
4. O MySQL guarda os dados. O `localStorage` ainda é usado para estado auxiliar,
   cache/apresentação e informações legadas do navegador.

O projeto está em migração de uma versão mais dependente de `localStorage` para
uma aplicação com dados financeiros no servidor. Portanto, não se deve assumir
que todos os dados do navegador foram migrados ou que limpar o `localStorage`
tenha o mesmo efeito que excluir dados do banco.

## 2. Tecnologias e dependências

- **Frontend:** HTML, CSS e JavaScript sem framework.
- **Backend:** Node.js 22 e Express 5.
- **Persistência:** MySQL 8.4, usando `mysql2` (o servidor principal usa a API
  callback; algumas rotas usam o pool baseado em Promises).
- **Autenticação local:** `bcryptjs` para hashes de senha e `jsonwebtoken`
  para JWT.
- **Autenticação Google:** `google-auth-library` no servidor e Google Identity
  Services no navegador.
- **Outras dependências presentes:** `cookie-parser`, `cors`,
  `express-rate-limit`, `dotenv`, `nodemailer`, `qrcode`, `speakeasy` e
  `sql.js`. A presença de uma dependência não significa que exista um fluxo
  ativo usando-a; por exemplo, o envio de e-mail de recuperação está comentado.

O projeto usa CommonJS (`"type": "commonjs"`). O comando de inicialização é
`npm start`, que executa `node server.js`. O script `npm test` é apenas um
placeholder que termina com erro; não há uma suíte de testes configurada no
`package.json`.

## 3. Mapa dos arquivos relevantes

```text
.
├── server.js                  # Servidor Express, API principal e conexão MySQL
├── routes/
│   ├── auth.js                # Endpoint de login/cadastro por Google
│   ├── senha.js               # Solicitação e conclusão de recuperação de senha
│   └── users.js               # Endpoint de exclusão de conta
├── middleware/
│   └── auth.js                # Leitura e validação do JWT
├── db/
│   └── connections.js         # Pool MySQL usado por rotas que precisam de pool
├── public/
│   ├── index.html             # Aplicação principal, inclusive a tela de perfil
│   ├── script.js              # Estado da interface, chamadas à API e eventos
│   ├── style.css              # Estilos da aplicação
│   ├── login.html             # Login por senha e interface do Google
│   ├── cadastro.html          # Cadastro por senha e interface do Google
│   ├── recuperar-senha.html   # Solicitação de recuperação
│   ├── alterar-senha.html     # Formulário para definir uma nova senha
│   └── recuperar-senha.js     # Comportamento das páginas de recuperação
├── convites.html              # Administração de convites, fora de `public/`
├── estrutura_bolso.sql        # Esquema MySQL e categorias iniciais
├── corrigir.sql               # Ajustes pontuais de nomes por IDs específicos
├── Dockerfile                 # Imagem Node.js da aplicação
├── Dockerfile.mysql           # Imagem MySQL com script de inicialização
├── docker-compose.yml          # Serviços da aplicação e do banco
├── package.json               # Dependências e scripts
└── README.md                  # Apresentação e funcionalidades do produto
```

O Express publica o conteúdo de `public/` como arquivos estáticos. `convites.html`
fica fora dessa pasta e é disponibilizado pela rota `/convites.html`, que exige
uma sessão de administrador.

## 4. Funcionalidades atuais

### Gestão financeira

- **Lançamentos:** entradas e despesas com valor, categoria, descrição, forma de
  pagamento, data, mês e banco associado.
- **Categorias:** categorias padrão por conta e categorias personalizadas. Ao
  remover uma categoria, os lançamentos correspondentes são transferidos para
  `outros`; metas dessa categoria são removidas.
- **Metas:** limite de gastos por categoria e mês. O banco impede mais de uma
  meta para a mesma combinação de usuário, categoria e mês.
- **Bancos/contas:** múltiplas contas, saldo inicial e mês de criação. A
  exclusão de uma conta bancária também tenta remover seus lançamentos.
- **Reservas:** valores reservados com operações para adicionar ou retirar
  saldo; uma retirada não pode exceder o valor disponível na reserva.
- **Gastos fixos:** despesas acompanhadas com status `pendente` ou `pago`.
- **Resumo financeiro:** a interface calcula e apresenta informações como
  saldo, gastos mensais e valor que pode ser gasto, com base nos dados
  carregados.

Os endpoints financeiros leem o usuário de `req.usuarioId`; o identificador
enviado pelo navegador não deve ser usado como identidade do dono dos dados.

### Conta, autenticação e convites

- Cadastro por e-mail e senha, com convite obrigatório e categorias padrão
  criadas durante o cadastro.
- Login por e-mail e senha.
- Login/cadastro por Google implementado em `routes/auth.js`, condicionado à
  configuração e compatibilidade do esquema descritas nas seções seguintes.
- Convites gerados por administradores, com validade e, opcionalmente, vínculo
  com um e-mail.
- Recuperação de senha com token aleatório armazenado como hash e validade de
  15 minutos. O fluxo de entrega por e-mail ainda não está ativo.
- Tela de perfil que carrega nome, e-mail e papel a partir de `/usuario-atual`.
- Área de exclusão de conta adicionada à interface. No estado atual, o fluxo de
  exclusão não está integrado corretamente entre frontend e backend; veja
  “Pendências e incompatibilidades conhecidas”.

## 5. Persistência e modelo de dados

O esquema definido em `estrutura_bolso.sql` inclui:

| Tabela | Finalidade e relações principais |
| --- | --- |
| `usuarios` | Identidade, nome, e-mail único, hash da senha, data de criação e papel (`usuario` ou `admin`). |
| `convites` | E-mail opcional, hash único do token, expiração e indicador de uso. |
| `categorias_gasto` | Categorias por usuário; nome único dentro de cada usuário e remoção em cascata ao excluir o usuário. |
| `lancamentos` | Entradas e despesas, vinculadas a uma categoria; guarda também banco, usuário, data e mês. |
| `metas` | Limite por usuário, categoria e mês; valor precisa ser positivo e a combinação tem restrição de unicidade. |
| `bancos` | Contas com saldo inicial, mês de criação e usuário associado. |
| `reservas` | Nome, valor e usuário associado. |
| `gastos_fixos` | Nome, valor, status e usuário associado. |
| `recuperar_senha` | Hash do token de recuperação, usuário, expiração e indicador de uso. |

Algumas tabelas usam nomes de colunas em estilos diferentes, por exemplo
`usuarioId`, `usuario_id`, `bancoId` e `categoria_id`. As consultas existentes
dependem desses nomes exatos; padronizá-los exige alterar o esquema e todos os
locais que os consultam.

`estrutura_bolso.sql` também insere as categorias padrão para usuários que já
existam no momento em que o arquivo for executado. Para novos usuários, o fluxo
de cadastro da aplicação cria as categorias. Esse SQL é carregado
automaticamente pelo MySQL no primeiro início de um volume de dados vazio;
alterar o arquivo depois não reaplica as instruções a um volume já inicializado.

`corrigir.sql` não é uma migração genérica: ele atualiza nomes de categorias em
IDs fixos. Antes de executá-lo em outro banco, é preciso confirmar que esses IDs
representam os registros esperados.

## 6. Autenticação, autorização e comportamento HTTP

O middleware `middleware/auth.js` procura primeiro um cabeçalho
`Authorization: Bearer ...` e, na ausência dele, o cookie `token`. O JWT é
verificado com `JWT_SECRET`; seu campo `sub` é atribuído a `req.usuarioId`.
Cadastro, login por senha e login Google enviam o JWT em cookie `httpOnly`,
`sameSite: 'lax'`, com validade de um dia e `secure` habilitado em produção.

As operações financeiras usam esse middleware. As rotas administrativas usam
`exigirAdmin`, que consulta a coluna `role` no banco e permite apenas o papel
`admin`.

O login por senha tem duas proteções de tentativas no processo atual: o
`express-rate-limit` limita a rota `/login` a 10 solicitações por janela de 15
minutos, e um mapa em memória bloqueia temporariamente e-mails após falhas
consecutivas. O mapa é local ao processo e reinicia quando o servidor reinicia.

O servidor aplica CORS com credenciais para `FRONTEND_URL` ou,
por padrão, `http://localhost:3000`. Também define os cabeçalhos
`X-Content-Type-Options: nosniff` e `X-Frame-Options: DENY`.

## 7. Rotas HTTP

Todas as rotas abaixo são registradas pelo backend do próprio projeto. As rotas
marcadas como protegidas exigem JWT, salvo indicação de papel administrador.

### Sessão e conta

| Método e rota | Acesso | Comportamento |
| --- | --- | --- |
| `POST /cadastro` | Público, convite obrigatório | Cria usuário por senha, consome convite, cria categorias padrão e inicia sessão. |
| `POST /login` | Público, com limite de tentativas | Valida e-mail/senha e inicia sessão. |
| `POST /logout` | Público | Limpa o cookie `token`. |
| `GET /me` | Sem middleware de autenticação atualmente | Responde com `req.usuarioId`; como a rota não chama o middleware, esse valor não é preenchido por ela. |
| `GET /usuario-atual` | Protegido | Retorna ID, nome, e-mail e papel do usuário da sessão. |
| `POST /api/auth/google-login` | Público | Verifica ID token Google e autentica conta existente ou tenta criar conta mediante convite. |
| `DELETE /usuarios` | Protegido | Endpoint pretendido para exclusão da conta; integração atual está inconsistente. |

### Recuperação de senha

| Método e rota | Acesso | Comportamento |
| --- | --- | --- |
| `POST /senhas/esqueci-senha` | Público | Recebe e-mail e inicia a criação de token de recuperação. |
| `POST /senhas/alterar-senha` | Público | Valida token, expiração e senha nova; atualiza o hash e marca o token como usado. |

### Dados financeiros

Todos os endpoints desta tabela exigem autenticação e operam sobre os dados do
usuário associado ao JWT.

| Recurso | Rotas |
| --- | --- |
| Lançamentos | `GET /lancamentos`, `POST /lancamentos`, `DELETE /lancamentos/:id` |
| Categorias | `GET /categorias`, `POST /categorias`, `DELETE /categorias/:id` |
| Metas | `GET /metas`, `POST /metas`, `DELETE /metas/:id` |
| Bancos | `GET /bancos`, `POST /bancos`, `DELETE /bancos/:id` |
| Reservas | `GET /reservas`, `POST /reservas`, `PATCH /reservas/:id`, `DELETE /reservas/:id` |
| Gastos fixos | `GET /gastos-fixos`, `POST /gastos-fixos`, `PATCH /gastos-fixos/:id`, `DELETE /gastos-fixos/:id` |

### Convites

| Método e rota | Acesso | Comportamento |
| --- | --- | --- |
| `GET /convites/verificar?token=...` | Público | Informa se o convite existe, ainda não foi usado e não expirou. |
| `GET /convites` | Administrador | Lista convites. |
| `POST /convites` | Administrador | Cria convite com validade e e-mail opcional; a resposta inclui o link de cadastro. |
| `GET /convites.html` | Administrador | Serve a página administrativa de convites. |

## 8. Configuração e execução

O servidor lê configuração de variáveis de ambiente por `dotenv`:

| Variável | Uso |
| --- | --- |
| `DB_HOST` | Host MySQL; dentro do Docker Compose deve apontar para o serviço do banco, normalmente `bolso-db`. |
| `DB_USER` | Usuário usado pela aplicação para conectar ao MySQL. |
| `DB_PASSWORD` | Senha do MySQL; no Compose atual também é usada como senha root do contêiner MySQL. |
| `DB_NAME` | Banco selecionado pela aplicação e criado pelo contêiner MySQL. |
| `JWT_SECRET` | Segredo usado para assinar e verificar sessões JWT. |
| `GOOGLE_CLIENT_ID` | Audiência usada pelo backend ao validar tokens de login Google. |
| `FRONTEND_URL` | Origem permitida pelo CORS; opcional, com fallback para `http://localhost:3000`. |
| `NODE_ENV` | Em `production`, ativa o atributo `secure` do cookie. |
| `SENHA_EMAIL_BOLSO` | Ainda aparece no Compose e em código comentado de e-mail; não habilita envio de e-mail no estado atual. |

Execução local, com MySQL acessível e variáveis configuradas:

```text
npm ci
npm start
```

Execução com Docker Compose:

```text
docker compose up --build
```

O Compose sobe `bolso-db` e `bolso-app`, publica a aplicação na porta 3000,
espera o healthcheck do banco e mantém os dados MySQL no volume
`bolso-db-data`. O `Dockerfile` usa Node 22 e instala dependências com `npm ci`;
o `Dockerfile.mysql` usa MySQL 8.4 e copia `estrutura_bolso.sql` para a pasta de
inicialização do contêiner.

**Atenção à configuração atual do Compose:** ele define `MYSQL_ROOT_PASSWORD` e
`MYSQL_DATABASE`, mas não cria explicitamente um usuário MySQL não-root
(`MYSQL_USER`/`MYSQL_PASSWORD`). Assim, `DB_USER` precisa corresponder a um
usuário realmente existente no banco; no setup padrão descrito pelo Compose,
isso normalmente significa usar `root`, ou então ajustar a configuração para
criar um usuário próprio. Além disso, `DB_HOST` precisa ser o nome do serviço
MySQL quando a aplicação roda dentro da rede Docker, não `localhost`.

## 9. Estado da interface e do armazenamento no navegador

`public/script.js` mantém um objeto `appData` e salva parte dele na chave
`BolsoappData`, além de ler chaves antigas como `lancamentos`, `pendencias` e
`reservas`. Na inicialização da página principal, a aplicação carrega categorias,
lançamentos, bancos, reservas, gastos fixos e metas por meio da API e atualiza o
estado da interface.

O navegador também guarda dados auxiliares como `usuario`,
`metodoAutenticacao` e dados temporários de convites. O `localStorage` não é a
autoridade para autorização: o servidor deve continuar validando o cookie/JWT
em cada endpoint protegido. O helper `authHeaders()` pode incluir um token
`authToken` legado no cabeçalho Bearer, mas o fluxo atual de login por senha e
Google recebe a sessão por cookie.

## 10. Mudanças recentes registradas

O histórico recente inclui:

- Página de perfil e rota/fluxo de exclusão de conta adicionados.
- Integração de autenticação Google iniciada.
- Categorias padrão inseridas no fluxo de cadastro.
- Alterações recentes no esquema de banco.

Além dos commits existentes, o worktree já continha alterações locais em
`public/index.html` e `public/script.js`: a página principal carrega o script
Google Identity Services, e o JavaScript ganhou um helper associado à tentativa
de confirmação Google antes da exclusão. Essas alterações locais foram
preservadas durante a atualização deste documento.

## 11. Pendências e incompatibilidades conhecidas

Os itens desta seção refletem o código lido neste snapshot e devem ser
reavaliados quando os arquivos correspondentes forem corrigidos:

1. **Esquema incompatível com login Google.** `routes/auth.js` consulta e grava
   `usuarios.google_id`, mas a definição de `usuarios` em
   `estrutura_bolso.sql` não contém essa coluna. Em uma base criada apenas por
   esse SQL, o endpoint Google não consegue completar o fluxo sem uma migração
   compatível.
2. **Nome de coluna do token de convite no fluxo Google.** O esquema e o cadastro
   por senha usam `convites.token_hash`, enquanto o fluxo Google consulta
   `convites.token`. A consulta não corresponde ao esquema atual.
3. **Exclusão de conta não está integrada ponta a ponta.** O frontend envia
   `dadosExclusao` aninhado e uma propriedade `credential`; a rota em
   `routes/users.js` lê os campos de confirmação diretamente de `req.body` e
   referencia `credential` sem obtê-la do corpo. No frontend, o helper recém
   adicionado recebe uma resposta Google, mas o fluxo atual o chama sem essa
   resposta e não inicia uma nova autenticação. Portanto, não se deve considerar
   funcional a reautenticação nem a exclusão completa até alinhar contrato,
   validação e transação nos dois lados.
4. **Recuperação sem envio de e-mail ativo.** O transportador SMTP está
   comentado, o link de recuperação é montado com `http://localhost:3000` e o
   link é incluído na resposta apenas fora de produção. O fluxo atual é útil
   para desenvolvimento, mas não entrega uma mensagem ao usuário em produção.
5. **Rota `/me` sem autenticação.** Apesar de responder com o identificador da
   sessão, ela não aplica `authMiddleware`; o middleware não preenche
   `req.usuarioId` por conta própria.
6. **Testes automatizados não configurados.** `npm test` ainda retorna erro
   intencional de placeholder; validações de mudanças precisam usar os comandos
   ou verificações apropriados até que a suíte seja criada.

Esses pontos são descrições do estado observado, não garantias de que não haja
outras limitações. Ao corrigir qualquer um deles, atualize esta seção, a matriz
de rotas e a descrição dos fluxos para manter o contexto alinhado ao código.
