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
- **Hugging Face** (IA com **ControlNet**, usada pelos *Spaces*)
- **@gradio/client** (conexão do backend com os Spaces do Hugging Face)
- **sharp** (tratamento das imagens)

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

### Simulação de Tatuagem com IA
- O cliente envia o desenho da tatuagem que deseja
- O cliente escolhe o membro do corpo: Braço, Perna, Costas, Peito, Pescoço ou Mão
- A IA devolve uma foto realista desse membro já com a tatuagem
- Explicação completa na seção [Simulação de Tatuagem com IA](#simulação-de-tatuagem-com-ia)

---

## Estrutura do Projeto

```text
SYSTEMDRAWN-BACKEND
├── scripts
│   └── gerar-bases-membros.js   (gera as fotos base dos membros)
├── src
│   ├── assets
│   │   └── membros              (fotos base: braco.png, perna.png...)
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
```

---

## Execução Local

### Instalar dependências

```bash
npm install
```

### Configurar variáveis de ambiente

Criar um arquivo `.env` com:

```env
HUGGINGFACE_API_KEY=seu_token_do_hugging_face
DATABASE_URL=postgresql://usuario:senha@host/database?sslmode=require
JWT_SECRET=jwt_minimo_32_chars
JWT_EXPIRES_IN=24h
PORT=3000
NODE_ENV=development
```

> O `HUGGINGFACE_API_KEY` é o token da conta do Hugging Face, criado em **huggingface.co → Settings → Access Tokens**. Ele é usado só pela simulação de tatuagem. Nunca envie esse token para o GitHub nem compartilhe com outras pessoas.

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

## Simulação de Tatuagem com IA

Funcionalidade que mostra ao cliente como a tatuagem ficaria no corpo antes de agendar. O cliente envia o desenho que quer tatuar, escolhe um membro do corpo e recebe uma foto realista desse membro já tatuado com o desenho.

A sugestão do professor foi usar o **ControlNet** do **Hugging Face**. O ControlNet é um tipo de IA que gera uma imagem nova seguindo os contornos de uma imagem de referência.

### Como funciona, passo a passo

1. **O cliente envia o desenho.** Na tela **Artes** do site, o cliente escolhe a imagem do desenho (PNG, JPG ou WEBP, até 5 MB) e um dos 6 membros do corpo.
2. **O backend confere o pedido.** Se faltar a imagem, se o formato estiver errado, se passar de 5 MB ou se o membro não existir, o backend responde com uma mensagem de erro clara.
3. **O fundo do desenho é removido.** Se o desenho tiver fundo (branco, papel ou uma cor só), esse fundo é apagado e fica só o traço da tatuagem.
4. **O desenho é colado na foto base do membro.** Cada membro tem uma foto base fixa, guardada em `src/assets/membros`. O backend acha onde está a pele nessa foto e coloca o desenho só em cima dela. O desenho é **curvado em volta do membro**, como uma tatuagem de verdade: ele fica mais estreito nas laterais e, no pescoço e na mão, também gira junto com o membro.
5. **A montagem vai para a IA.** Essa montagem é enviada para um ControlNet num *Space* do Hugging Face (uma página pública com a IA rodando). O Space tira os contornos da montagem e redesenha tudo como uma foto realista do membro tatuado.
6. **Se a IA principal falhar, o backend tenta outra.** A ordem é:
   - **1º:** `hugging-apps/qwen-image-2-1-controlnet-union-demo` (ControlNet Canny);
   - **2º:** `ByteDance/Hyper-SD15-Scribble` (ControlNet Scribble, um pouco menos realista).
7. **O resultado volta para o site.** A imagem gerada é convertida para JPEG e enviada ao site, que mostra o título "Resultado da IA em: ..." com o nome do membro.

### Membros disponíveis

| Membro | Valor aceito no campo `membro` |
|--------|--------------------------------|
| Braço | `Braço` ou `braco` |
| Perna | `Perna` ou `perna` |
| Costas | `Costas` ou `costas` |
| Peito | `Peito` ou `peito` |
| Pescoço | `Pescoço` ou `pescoco` |
| Mão | `Mão` ou `mao` |

Os nomes funcionam com ou sem acento e com letras maiúsculas ou minúsculas. Se o campo `membro` não for enviado, o backend usa **Braço**. Qualquer outro nome é recusado com a lista dos 6 membros.

### Endpoint

```http
POST /simulacao
```

Não exige login. Corpo da requisição (JSON):

```json
{
  "imagemTatuagemBase64": "data:image/png;base64,iVBORw0KGgo...",
  "membro": "Braço",
  "promptText": "black ink tattoo"
}
```

| Campo | Obrigatório | O que é |
|-------|-------------|---------|
| `imagemTatuagemBase64` | Sim | O desenho da tatuagem em base64 (PNG, JPG ou WEBP, até 5 MB) |
| `membro` | Não | Um dos 6 membros da tabela acima (padrão: Braço) |
| `promptText` | Não | O estilo da tatuagem, em inglês (é o campo **Estilo** do site). Padrão: `black ink tattoo` |

Resposta de sucesso (`200`):

```json
{
  "sucesso": true,
  "imagemSimulada": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

Respostas de erro (no formato `{ "erro": "mensagem" }`):

| Código | Quando acontece |
|--------|-----------------|
| `400` | Faltou o desenho, formato inválido, imagem acima de 5 MB, membro inválido, arquivo que não é uma imagem válida ou desenho vazio |
| `429` | O limite gratuito diário da IA acabou ("O limite gratuito da IA acabou por hoje") |
| `500` | O `HUGGINGFACE_API_KEY` não está no `.env`, ou a foto base do membro ainda não foi gerada |
| `502` | A IA não conseguiu gerar a imagem (por exemplo, os dois Spaces deram erro) |
| `503` | A IA está ocupada no momento |
| `504` | A IA demorou demais para responder |

### Fotos base dos membros

As fotos base ficam em `src/assets/membros` (`braco.png`, `perna.png`, `costas.png`, `peito.png`, `pescoco.png` e `mao.png`). Elas foram geradas uma única vez por IA com o comando:

```bash
npm run gerar-membros
```

Para gerar de novo:

```bash
npm run gerar-membros -- --refazer            # refaz todas
npm run gerar-membros -- --refazer braco mao  # refaz só as escolhidas
```

O script tenta, nesta ordem: o Space `black-forest-labs/FLUX.1-schnell`, o Space `stabilityai/stable-diffusion-3.5-large-turbo`, os servidores pagos do Hugging Face (só se a conta tiver créditos) e, por último, o **Pollinations** (grátis, fora do Hugging Face). Também é possível colocar fotos próprias nessa pasta, com os mesmos nomes.

Sem essas fotos, a simulação responde que ainda não está disponível.

### Arquivos da funcionalidade

| Arquivo | O que faz |
|---------|-----------|
| `src/routes/simulacao.routes.js` | Cria a rota `POST /simulacao` |
| `src/controllers/simulacao.controller.js` | Confere o pedido e devolve a resposta ou o erro |
| `src/services/iaTatuagem.service.js` | Remove o fundo, monta o desenho no membro e chama a IA |
| `scripts/gerar-bases-membros.js` | Gera as fotos base dos membros |
| `src/assets/membros/` | Guarda as fotos base |

### Limitações conhecidas

- **Cota gratuita:** os Spaces usam a cota diária grátis de GPU (*ZeroGPU*) da conta do Hugging Face. Cada simulação gasta cerca de 30 segundos dessa cota, o que dá aproximadamente **10 simulações por dia** numa conta gratuita.
- **Tempo:** cada simulação pode levar até **2 minutos**.
- **Cores:** a IA só enxerga os contornos do desenho, então um desenho colorido sai em tinta preta. Para pedir cores, escreva no campo **Estilo** do site (por exemplo, `colorful watercolor tattoo, red and blue`).
- **Mesma base:** todas as simulações de um membro usam a mesma foto base, então o tom de pele e a pose se repetem.

---

## Banco de Dados

Banco de dados PostgreSQL hospedado na nuvem através do **NeonDB**.

---

## Deploy

Aplicação publicada no **Vercel**.

---

## Testes da API

Os testes do backend foram realizados utilizando **Thunder Client / Postman**, incluindo autenticação, CRUD das entidades e relacionamentos entre tabelas.
