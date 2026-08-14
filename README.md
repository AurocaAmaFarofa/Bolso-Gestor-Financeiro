# 💰 Bolso · Gestão Financeira Pessoal

O **Bolso** é uma aplicação web de controle financeiro pessoal desenvolvida para ajudar na organização e acompanhamento das finanças de forma simples, visual e prática.

O projeto nasceu de uma dificuldade pessoal em organizar minhas próprias finanças através de planilhas. Como estudante de Engenharia de Software, decidi transformar esse problema em uma oportunidade de aprendizado e desenvolvimento, criando uma aplicação que pudesse facilitar o controle financeiro e, ao mesmo tempo, me permitir colocar em prática os conhecimentos adquiridos durante a faculdade.

O objetivo do projeto é evoluir gradualmente de uma aplicação inicialmente baseada em armazenamento local para uma aplicação web com **frontend, API, backend e banco de dados**, aplicando conceitos reais de desenvolvimento de software.

---

## Funcionalidades

### Contas e Bancos

- Cadastro de múltiplas contas/bancos.
- Definição de saldo inicial.
- Alternância entre diferentes contas através de abas.
- Vinculação dos lançamentos ao banco selecionado.

### Lançamentos

- Cadastro de ganhos e despesas.
- Categorias personalizadas.
- Descrição e forma de pagamento.
- Registro da data e mês do lançamento.
- Associação do lançamento à conta correspondente.
- Persistência dos lançamentos no banco de dados MySQL.

### Reservas Financeiras

Permite separar parte do saldo disponível para objetivos específicos ou despesas futuras.

O sistema considera o valor reservado ao calcular quanto dinheiro está efetivamente disponível para utilização.

### Gastos Fixos

Permite cadastrar e acompanhar despesas recorrentes, como:

- Aluguel
- Internet
- Assinaturas
- Contas
- Outras despesas recorrentes

Os gastos podem ser acompanhados através dos estados de **Pendente** e **Pago**.

### Indicadores Financeiros

O sistema apresenta informações como:

- **Pode Gastar:** saldo disponível após considerar valores reservados.
- **Saldo Total:** soma dos saldos das contas.
- **Gasto no Mês:** total de despesas realizadas no período selecionado.

---

# Tecnologias

## Frontend

- **HTML5**
- **CSS3**
- **JavaScript (ES6+)**

## Backend

- **Node.js**
- **Express**

## Banco de Dados

- **MySQL**
- **mysql2**

## Persistência local

O projeto originalmente utilizava `localStorage` como principal mecanismo de persistência.

Atualmente, os **lançamentos financeiros estão sendo migrados para o MySQL**, enquanto outras partes da aplicação ainda utilizam o armazenamento local.

Essa migração está sendo realizada gradualmente para manter a estrutura existente do projeto e evitar uma reescrita completa da aplicação.
