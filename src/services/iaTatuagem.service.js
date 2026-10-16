// Serviço de IA: o cliente envia o desenho da tatuagem e escolhe um membro do corpo.
// 1) O desenho é colado numa foto base desse membro (gerada uma vez pela IA, ver
//    scripts/gerar-bases-membros.js).
// 2) Essa montagem vai para o ControlNet num Space (página) do Hugging Face, que redesenha
//    tudo como uma foto realista do membro já tatuado. Se o primeiro Space da lista estiver
//    fora do ar, o backend tenta o próximo.

const path = require('path');

// O frontend desiste depois de 150s, então o backend para de tentar antes disso.
const LIMITE_TOTAL_MS = 140 * 1000;
const LIMITE_CONEXAO_MS = 30 * 1000;
const LIMITE_GERACAO_MS = 80 * 1000;
const LIMITE_DOWNLOAD_MS = 20 * 1000;
// Só vale tentar o próximo Space se ainda sobrar pelo menos esse tempo.
const TEMPO_MINIMO_TENTATIVA_MS = 40 * 1000;

const PASTA_BASES = path.join(__dirname, '..', 'assets', 'membros');

// Membros que o cliente pode escolher (os mesmos da tela de agendamento).
// ingles: como a IA entende o membro. formato: tamanho da foto base.
// escala: quanto da largura da foto o desenho ocupa.
// centro: onde fica a pele na foto base, de 0 a 1 (esquerda→direita, cima→baixo); o padrão é o meio.
const MEMBROS = {
  braco: { nome: 'Braço', ingles: 'forearm', formato: [768, 512], escala: 0.25, centro: [0.72, 0.5] },
  perna: { nome: 'Perna', ingles: 'calf of a leg', formato: [512, 768], escala: 0.35, centro: [0.28, 0.3] },
  costas: { nome: 'Costas', ingles: 'upper back', formato: [512, 768], escala: 0.5 },
  peito: { nome: 'Peito', ingles: 'chest', formato: [768, 512], escala: 0.35 },
  pescoco: { nome: 'Pescoço', ingles: 'side of the neck', formato: [512, 768], escala: 0.4 },
  mao: { nome: 'Mão', ingles: 'back of the hand', formato: [768, 512], escala: 0.22, centro: [0.42, 0.62] },
};
const MEMBRO_PADRAO = 'braco';

const PROMPT_QUALIDADE = 'best quality, extremely detailed, photorealistic';

// Spaces com ControlNet, na ordem em que são tentados. Cada Space recebe os dados do seu
// próprio jeito (parametros) e devolve a imagem do seu próprio jeito (lerUrl).
const SPACES = [
  {
    // ControlNet Canny (Qwen-Image 2.1): o próprio Space tira os contornos da montagem.
    id: 'hugging-apps/qwen-image-2-1-controlnet-union-demo',
    endpoint: '/generate',
    parametros: async (montagem, prompt, semente) => {
      const { handle_file } = require('@gradio/client');
      return [
        prompt, // o que gerar
        handle_file(new Blob([montagem], { type: 'image/png' })), // montagem: membro + desenho
        'Canny', // o Space tira os contornos da montagem
        null, // foto para retocar (não usamos)
        null, // máscara do retoque (não usamos)
        1, // força do ControlNet (0 a 1)
        1024, // resolução (1024 é a mais rápida)
        20, // passos (mais = melhor e mais lento)
        semente,
        false, // não sortear outra semente
        '', // prompt negativo (este Space só usa com o guidance acima de 1)
        1, // guidance (1 = desligado, como no exemplo do Space)
      ];
    },
    // Devolve [imagem, contornos usados, semente]: a simulação é a primeira.
    lerUrl: (dados) => dados?.[0]?.url,
  },
  {
    // ControlNet Scribble (Hyper-SD 1.5, da ByteDance): recebe um rascunho de traços pretos
    // num fundo branco, como se fosse desenhado à mão.
    id: 'ByteDance/Hyper-SD15-Scribble',
    endpoint: '/process_image',
    parametros: async (montagem, prompt, semente) => {
      const { handle_file } = require('@gradio/client');
      const rascunho = await montarRascunho(montagem);
      const arquivo = () => handle_file(new Blob([rascunho], { type: 'image/png' }));
      return [
        4, // passos (de 1 a 8; mais = mais detalhes)
        `${prompt}, ${PROMPT_QUALIDADE}`, // o que gerar
        1, // força do ControlNet
        1, // eta (1 = modo LCM, o padrão do Space)
        semente,
        { background: arquivo(), layers: [], composite: arquivo() }, // o rascunho no "quadro" do Space
        1, // quantas imagens gerar
      ];
    },
    // Devolve uma galeria; usamos a última imagem.
    lerUrl: (dados) => {
      const galeria = Array.isArray(dados?.[0]) ? dados[0] : [];
      const ultima = galeria[galeria.length - 1];
      return ultima?.image?.url || ultima?.url;
    },
  },
];

// Erro com o código HTTP que o controller deve devolver ao frontend.
function erroComStatus(mensagem, statusCode) {
  const erro = new Error(mensagem);
  erro.statusCode = statusCode;
  return erro;
}

// Aceita "Braço", "braco", "BRAÇO"... e devolve a chave do membro, ou null se não existir.
function normalizarMembro(valor) {
  if (typeof valor !== 'string') return null;
  const chave = valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira os acentos
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-'); // troca espaços por hífen
  return Object.hasOwn(MEMBROS, chave) ? chave : null;
}

// Cola o desenho do cliente no centro da foto base do membro.
// O modo "multiply" faz o branco do desenho sumir e só a tinta aparecer na pele.
async function montarImagemControle(imagemTatuagemBase64, chaveMembro) {
  const sharp = require('sharp');
  const membro = MEMBROS[chaveMembro];
  const caminhoBase = path.join(PASTA_BASES, `${chaveMembro}.png`);

  let base;
  try {
    base = await sharp(caminhoBase).resize(...membro.formato, { fit: 'cover' }).png().toBuffer();
  } catch {
    console.error(
      `[IA] Foto base não encontrada em ${caminhoBase}. Rode "npm run gerar-membros" uma vez.`
    );
    throw erroComStatus(`A simulação para "${membro.nome}" ainda não está disponível.`, 500);
  }

  const [largura, altura] = membro.formato;
  const dados = imagemTatuagemBase64.replace(/^data:[^,]+,/, '');
  const desenho = await sharp(Buffer.from(dados, 'base64'))
    .flatten({ background: '#ffffff' }) // fundo transparente vira branco
    .resize({
      width: Math.round(largura * membro.escala),
      height: Math.round(altura * 0.6),
      fit: 'inside',
    })
    .png()
    .toBuffer();

  // Coloca o desenho centralizado no ponto "centro" do membro, sem sair da foto.
  const { width: larguraDesenho, height: alturaDesenho } = await sharp(desenho).metadata();
  const [centroX, centroY] = membro.centro || [0.5, 0.5];
  const left = Math.round(Math.min(Math.max(centroX * largura - larguraDesenho / 2, 0), largura - larguraDesenho));
  const top = Math.round(Math.min(Math.max(centroY * altura - alturaDesenho / 2, 0), altura - alturaDesenho));

  return sharp(base)
    .composite([{ input: desenho, left, top, blend: 'multiply' }])
    .png()
    .toBuffer();
}

// Transforma a montagem num rascunho: traços pretos onde há contorno, o resto branco.
// É o que o ControlNet Scribble espera receber.
async function montarRascunho(montagem) {
  const sharp = require('sharp');
  const { data, info } = await sharp(montagem)
    .greyscale()
    .blur(1) // suaviza a textura da pele para não virar risco
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: largura, height: altura } = info;
  const rascunho = Buffer.alloc(largura * altura, 255);
  const pixel = (x, y) => data[y * largura + x];

  // Filtro de Sobel: mede o quanto a cor muda em volta de cada ponto.
  for (let y = 1; y < altura - 1; y++) {
    for (let x = 1; x < largura - 1; x++) {
      const gx =
        pixel(x + 1, y - 1) + 2 * pixel(x + 1, y) + pixel(x + 1, y + 1) -
        pixel(x - 1, y - 1) - 2 * pixel(x - 1, y) - pixel(x - 1, y + 1);
      const gy =
        pixel(x - 1, y + 1) + 2 * pixel(x, y + 1) + pixel(x + 1, y + 1) -
        pixel(x - 1, y - 1) - 2 * pixel(x, y - 1) - pixel(x + 1, y - 1);
      if (Math.hypot(gx, gy) > 40) rascunho[y * largura + x] = 0;
    }
  }

  return sharp(rascunho, { raw: { width: largura, height: altura, channels: 1 } }).png().toBuffer();
}

// Espera uma promessa por no máximo "ms"; se passar disso, roda "aoEstourar" e falha.
function comLimiteDeTempo(promessa, ms, mensagem, aoEstourar) {
  let relogio;
  const estouro = new Promise((_, rejeitar) => {
    relogio = setTimeout(() => {
      if (aoEstourar) aoEstourar();
      rejeitar(erroComStatus(mensagem, 504));
    }, ms);
  });
  return Promise.race([promessa, estouro]).finally(() => clearTimeout(relogio));
}

// Cada pedido abre a sua própria conexão com o Space. Se dois clientes usassem a mesma,
// cancelar o pedido de um (por demora) cancelaria também o do outro.
function conectar(space, token, limiteMs) {
  const { Client } = require('@gradio/client');
  const conexao = Client.connect(space.id, { token });
  return comLimiteDeTempo(
    conexao,
    limiteMs,
    'O serviço de IA demorou para responder. Tente novamente em instantes.',
    () => {
      // Se a conexão chegar depois do limite, fecha para não ficar aberta à toa.
      conexao.then((cliente) => cliente.close()).catch(() => {});
    }
  );
}

// Envia o pedido ao Space e espera o resultado (como o predict do Gradio, mas com limite de tempo).
async function rodarControlNet(cliente, endpoint, parametros, limiteMs) {
  const pedido = cliente.submit(endpoint, parametros, null, null, true);

  const leitura = (async () => {
    let dados;
    let terminou = false;
    for await (const mensagem of pedido) {
      if (mensagem.type === 'data') dados = mensagem.data;
      if (mensagem.type === 'status' && mensagem.stage === 'error') {
        throw new Error(mensagem.message || 'O Space do ControlNet retornou um erro.');
      }
      if (mensagem.type === 'status' && mensagem.stage === 'complete') terminou = true;
      if (dados && terminou) return dados;
    }
    return dados;
  })();
  leitura.catch(() => {}); // evita aviso se o erro chegar depois do limite de tempo

  return comLimiteDeTempo(
    leitura,
    limiteMs,
    'A IA demorou demais para gerar a simulação. Tente novamente em instantes.',
    () => {
      pedido.cancel().catch(() => {});
      pedido.return();
    }
  );
}

// Troca mensagens técnicas (em inglês) por mensagens que o cliente entende.
function traduzirErro(erro) {
  if (erro.statusCode) return erro;
  const texto = String(erro.message || '');
  if (/quota/i.test(texto)) {
    return erroComStatus('O limite gratuito da IA acabou por hoje. Tente novamente mais tarde.', 429);
  }
  if (/busy|queue|full/i.test(texto)) {
    return erroComStatus('A IA está ocupada no momento. Tente novamente em instantes.', 503);
  }
  return erroComStatus('Não foi possível gerar a simulação agora. Tente novamente.', 502);
}

// Baixa a imagem gerada e devolve em JPEG base64 (o formato que o frontend mostra).
// Cada Space devolve um formato e um tamanho, então tudo é padronizado aqui.
async function urlParaBase64(url, limiteMs) {
  const sharp = require('sharp');
  const resposta = await fetch(url, { signal: AbortSignal.timeout(limiteMs) });
  if (!resposta.ok) {
    throw new Error(`Não foi possível baixar a imagem gerada (Status ${resposta.status}).`);
  }
  const original = Buffer.from(await resposta.arrayBuffer());

  // O filtro de conteúdo de algumas IAs troca a imagem por um quadro todo preto.
  const { channels: canais } = await sharp(original).stats();
  if (canais.slice(0, 3).every((canal) => canal.max <= 8)) {
    throw erroComStatus(
      'A IA não conseguiu gerar essa simulação. Tente outro desenho ou outro membro.',
      502
    );
  }

  const imagem = await sharp(original)
    .flatten({ background: '#ffffff' })
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return `data:image/jpeg;base64,${imagem.toString('base64')}`;
}

// Tenta gerar a simulação num Space, respeitando o tempo que ainda sobra.
async function gerarNoSpace(space, montagem, prompt, token, prazo) {
  const restante = () => prazo - Date.now();

  console.log(`[IA] Conectando ao Space ${space.id}...`);
  const cliente = await conectar(space, token, Math.min(LIMITE_CONEXAO_MS, restante()));

  const semente = Math.floor(Math.random() * 100000);
  const parametros = await space.parametros(montagem, prompt, semente);
  const dados = await rodarControlNet(
    cliente,
    space.endpoint,
    parametros,
    Math.min(LIMITE_GERACAO_MS, restante())
  );

  const url = space.lerUrl(dados);
  if (!url) {
    throw new Error('O Space não retornou nenhuma imagem.');
  }

  return urlParaBase64(url, Math.min(LIMITE_DOWNLOAD_MS, Math.max(restante(), 5000)));
}

async function gerarSimulacao(imagemTatuagemBase64, membro, promptText) {
  const chaveMembro = normalizarMembro(membro) || MEMBRO_PADRAO;
  const { ingles } = MEMBROS[chaveMembro];
  const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY?.trim();

  if (!HUGGINGFACE_API_KEY) {
    console.error('[IA] HUGGINGFACE_API_KEY não encontrada. Verifique o arquivo .env');
    throw erroComStatus('O serviço de IA não está configurado.', 500);
  }

  const promptFinal = `realistic close-up photo of a human ${ingles} with a tattoo inked on the skin, ${
    promptText || 'black ink tattoo'
  }, natural skin texture, studio lighting`;

  let montagem;
  try {
    montagem = await montarImagemControle(imagemTatuagemBase64, chaveMembro);
  } catch (erro) {
    console.error('[IA] Falha ao montar a imagem:', erro.message);
    throw traduzirErro(erro);
  }

  const prazo = Date.now() + LIMITE_TOTAL_MS;
  let ultimoErro;

  for (const [posicao, space] of SPACES.entries()) {
    if (posicao > 0 && prazo - Date.now() < TEMPO_MINIMO_TENTATIVA_MS) break;

    try {
      console.log(`[IA] Gerando tatuagem no membro "${ingles}" com ${space.id}...`);
      const imagem = await gerarNoSpace(space, montagem, promptFinal, HUGGINGFACE_API_KEY, prazo);
      console.log('[IA] Simulação gerada com sucesso!');
      return imagem;
    } catch (erro) {
      console.error(`[IA] Falha no Space ${space.id}:`, erro.message);
      ultimoErro = traduzirErro(erro);
      // O limite gratuito vale para a conta inteira, então outro Space também falharia.
      if (ultimoErro.statusCode === 429) break;
    }
  }

  throw ultimoErro;
}

module.exports = {
  gerarSimulacao,
  normalizarMembro,
  MEMBROS,
};
