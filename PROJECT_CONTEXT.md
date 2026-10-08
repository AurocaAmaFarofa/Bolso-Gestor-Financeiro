# Contexto do projeto

Bolso é uma aplicação web de gestão financeira pessoal. O frontend tradicional é servido pelo próprio backend Express, e a persistência está em transição entre `localStorage` e MySQL.

## Estrutura principal

```text
.
├── server.js                 # Inicializa Express, configura middleware e implementa a API
├── routes/
│   └── auth.js               # Login Google em /api/auth/google-login
├── middleware/
│   └── auth.js               # Valida JWT e associa o usuário à requisição
├── db/
│   └── connections.js        # Pool de conexões MySQL usado pelas rotas de autenticação
├── public/
│   ├── index.html            # Tela principal da aplicação
│   ├── login.html            # Tela de login
│   ├── cadastro.html         # Tela de cadastro
│   ├── script.js             # Interações, chamadas à API e estado do frontend
│   └── style.css             # Estilos
├── convites.html             # Tela administrativa de convites
├── estrutura_bolso.sql       # Criação do esquema MySQL
├── corrigir.sql              # Ajustes SQL do banco
├── Dockerfile                # Imagem do backend Node.js
├── Dockerfile.mysql          # Imagem MySQL com inicialização do esquema
├── docker-compose.yml        # Serviços da aplicação e do banco
└── package.json              # Dependências e comando de inicialização
```

O Express serve os arquivos de `public/`; `convites.html` é entregue por uma rota administrativa. Existem arquivos HTML/JS/CSS adicionais na raiz, mas não fazem parte da pasta estática servida pela configuração atual.

## Tecnologias e integração

- Frontend: HTML, CSS e JavaScript no navegador.
- Backend: Node.js e Express; `mysql2` para acesso ao MySQL.
- Banco: MySQL; tabelas incluem usuários, convites e dados financeiros.
- Autenticação: senha armazenada com hash `bcryptjs`; JWT assinado com `JWT_SECRET`, enviado em cookie `httpOnly` e também aceito como Bearer token. O endpoint de login Google está em `/api/auth`.
- Docker Compose define os serviços da aplicação e do MySQL. As conexões usam variáveis de ambiente, como `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`.

O frontend faz requisições `fetch` ao Express, que valida a sessão e consulta ou atualiza o MySQL. Os dados são associados ao usuário autenticado. A migração é gradual: partes do estado do cliente ainda usam `localStorage`, enquanto os recursos financeiros também contam com endpoints persistidos no banco.

## Rotas principais da API

As rotas abaixo são implementadas em `server.js`. As rotas de dados financeiros exigem autenticação; as de administração de convites exigem perfil admin.

| Recurso       | Rotas                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Sessão        | `POST /cadastro`, `POST /login`, `POST /logout`, `GET /me`; `GET /usuario-atual` exige autenticação |
| Login Google  | `POST /api/auth/google-login`                                                                       |
| Convites      | `GET /convites/verificar` (público); `GET /convites` e `POST /convites` (admin)                     |
| Lançamentos   | `GET /lancamentos`, `POST /lancamentos`, `DELETE /lancamentos/:id`                                  |
| Categorias    | `GET /categorias`, `POST /categorias`, `DELETE /categorias/:id`                                     |
| Metas         | `GET /metas`, `POST /metas`, `DELETE /metas/:id`                                                    |
| Bancos/contas | `GET /bancos`, `POST /bancos`, `DELETE /bancos/:id`                                                 |
| Reservas      | `GET /reservas`, `POST /reservas`, `PATCH /reservas/:id`, `DELETE /reservas/:id`                    |
| Gastos fixos  | `GET /gastos-fixos`, `POST /gastos-fixos`, `PATCH /gastos-fixos/:id`, `DELETE /gastos-fixos/:id`    |

## Fluxo básico dos dados

1. O navegador carrega as páginas e scripts estáticos.
2. Login ou cadastro valida as credenciais/convite, cria um JWT e o envia em cookie.
3. Nas operações protegidas, o backend valida o JWT e identifica o usuário.
4. O backend consulta ou grava os dados financeiros no MySQL e devolve JSON ao frontend.
5. O frontend atualiza a interface; estado legado ou local ainda pode ser mantido em `localStorage`.
