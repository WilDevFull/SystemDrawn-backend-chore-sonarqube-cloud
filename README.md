````markdown
# SystemDrawn API Backend

API Backend do projeto **SystemDrawn**, desenvolvida em **Node.js + Express.js**, com banco de dados **PostgreSQL hospedado no NeonDB** e autenticação baseada em **JWT**.

## Integrantes da Equipe

| Nome | RA |
|------|----|
| Alyson Rafael Reis Arruda de Lima | 00000853753 |
| Helleson Allan Borges de Sant'Ana | 00000855659 |
| João Victor Oliveira da Silva | 00000855670 |
| Matheus Soares de Lima | 00000855273 |
| Saíra Aguiar Rocha | 00000851069 |
| Thiago Carvalho de Castro | 00000014830 |
| Wilson Pereira de Lima | 00000855225 |

> **Observação:** Alyson Rafael Reis Arruda de Lima participa apenas da disciplina de **PI4**.

---

## Tecnologias Utilizadas

- **Node.js**
- **Express.js**
- **PostgreSQL**
- **NeonDB**
- **JWT Authentication**
- **Vercel**
- **Thunder Client / Postman**

---

## Funcionalidades Implementadas

### Autenticação
- Cadastro de usuário
- Login com CPF
- Verificação de CPF
- Retorno de usuário autenticado
- Autenticação JWT

### Agendamento de Tatuagem
- Criar agendamento
- Listar agendamentos
- Buscar por ID
- Atualizar agendamento
- Excluir agendamento

### Agendamento de Piercing
- Criar agendamento
- Listar agendamentos
- Buscar por ID
- Atualizar agendamento
- Excluir agendamento
- Histórico e próximos agendamentos

### Tipos de Piercing
- Listagem dos tipos de piercing disponíveis
- Busca por ID

### Joias de Piercing
- Listagem de joias
- Busca por ID
- Relacionamento com tipos de piercing

---

## Estrutura do Projeto

```text
SYSTEMDRAWN-BACKEND
├── src
│   ├── config
│   ├── controllers
│   ├── database
│   ├── errors
│   ├── middlewares
│   ├── repositories
│   ├── routes
│   ├── services
│   ├── utils
│   ├── validations
│   ├── app.js
│   └── index.js
├── tests
├── .env.example
├── package.json
├── vercel.json
└── README.md
````

---

## Execução Local

### Instalar dependências

```bash
npm install
```

### Configurar variáveis de ambiente

Criar um arquivo `.env` com:

```env
DATABASE_URL=postgresql://usuario:senha@host/database?sslmode=require
JWT_SECRET=jwt_minimo_32_chars
JWT_EXPIRES_IN=24h
PORT=3000
NODE_ENV=development
```

### Executar projeto

```bash
npm run dev
```

Servidor local:

```text
http://localhost:3000
```

---

## Health Check

Endpoint utilizado para verificar se a API está online:

```http
GET /health
```

Resposta esperada:

```json
{
  "success": true,
  "message": "SystemDrawn API está online."
}
```

---

## Banco de Dados

Banco de dados PostgreSQL hospedado na nuvem através do **NeonDB**.

---

## Deploy

Aplicação publicada no **Vercel**.

---

## Testes da API

Os testes do backend foram realizados utilizando **Thunder Client / Postman**, incluindo autenticação, CRUD das entidades e relacionamentos entre tabelas.

```
```
