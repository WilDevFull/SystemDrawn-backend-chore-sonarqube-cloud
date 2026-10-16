// Serviço de IA: o cliente envia o desenho da tatuagem e escolhe um membro do corpo.
// 1) O desenho é colado numa foto base desse membro (gerada uma vez pela IA, ver
//    scripts/gerar-bases-membros.js): sem o fundo, só na pele e curvado em volta do membro.
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
// eixo: para onde o membro se estende na foto ('x' = deitado, 'y' = em pé).
// comprimento: quanto da altura da foto o desenho pode ocupar ao longo do membro (padrão 0,6).
const MEMBROS = {
  braco: { nome: 'Braço', ingles: 'forearm', formato: [768, 512], escala: 0.25, centro: [0.72, 0.5], eixo: 'x' },
  perna: { nome: 'Perna', ingles: 'calf of a leg', formato: [512, 768], escala: 0.35, centro: [0.24, 0.3], eixo: 'y' },
  costas: { nome: 'Costas', ingles: 'upper back', formato: [512, 768], escala: 0.5, eixo: 'y' },
  peito: { nome: 'Peito', ingles: 'chest', formato: [768, 512], escala: 0.35, eixo: 'y' },
  pescoco: { nome: 'Pescoço', ingles: 'side of the neck', formato: [512, 768], escala: 0.4, centro: [0.57, 0.6], eixo: 'y', comprimento: 0.35 },
  mao: { nome: 'Mão', ingles: 'back of the hand', formato: [768, 512], escala: 0.22, centro: [0.42, 0.62], eixo: 'y' },
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

// Um pixel é pele quando é "quente" (bem mais vermelho que azul). Os fundos das fotos base
// e a sombra embaixo do braço são cinza ou azulados, então isso separa o corpo do fundo.
function ehPele(r, g, b) {
  return r - b > 25 && r >= g;
}

// Pinta (marca com 1) tudo o que dá para alcançar a partir de "inicios" andando para os
// vizinhos de cima, baixo, esquerda e direita, só por pixels em que "podeEntrar" é verdade.
function preencher(podeEntrar, marcado, inicios, largura, altura) {
  const fila = new Int32Array(largura * altura);
  let ler = 0;
  let escrever = 0;
  const tentar = (i) => {
    if (!marcado[i] && podeEntrar(i)) {
      marcado[i] = 1;
      fila[escrever++] = i;
    }
  };
  inicios.forEach(tentar);
  while (ler < escrever) {
    const i = fila[ler++];
    const x = i % largura;
    if (x > 0) tentar(i - 1);
    if (x < largura - 1) tentar(i + 1);
    if (i >= largura) tentar(i - largura);
    if (i < largura * (altura - 1)) tentar(i + largura);
  }
}

// Índices dos pixels da borda de uma imagem.
function pixelsDaBorda(largura, altura) {
  const borda = [];
  for (let x = 0; x < largura; x++) borda.push(x, (altura - 1) * largura + x);
  for (let y = 1; y < altura - 1; y++) borda.push(y * largura, y * largura + largura - 1);
  return borda;
}

// Descobre onde está o membro na foto base (1 = membro, 0 = fundo). Fica só com a pele
// ligada ao ponto "centro" (descarta sombras soltas) e tapa os buracos dentro dela.
function mascaraDoMembro(rgb, largura, altura, ancora) {
  const total = largura * altura;
  const pele = new Uint8Array(total);
  for (let i = 0; i < total; i++) pele[i] = ehPele(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) ? 1 : 0;

  // Se o "centro" caiu fora da pele, começa pelo pixel de pele mais perto dele.
  let inicio = ancora.y * largura + ancora.x;
  if (!pele[inicio]) {
    let menor = Infinity;
    for (let i = 0; i < total; i++) {
      if (!pele[i]) continue;
      const d = Math.hypot((i % largura) - ancora.x, Math.floor(i / largura) - ancora.y);
      if (d < menor) {
        menor = d;
        inicio = i;
      }
    }
    if (menor === Infinity) return null; // foto sem pele nenhuma
  }

  const membro = new Uint8Array(total);
  preencher((i) => pele[i], membro, [inicio], largura, altura);

  const fora = new Uint8Array(total);
  preencher((i) => !membro[i], fora, pixelsDaBorda(largura, altura), largura, altura);
  for (let i = 0; i < total; i++) if (!fora[i]) membro[i] = 1;
  return { membro, inicio: { x: inicio % largura, y: Math.floor(inicio / largura) } };
}

// Média móvel que ignora as fatias sem medida (NaN).
function suavizar(valores, janela) {
  const saida = new Float32Array(valores.length).fill(NaN);
  for (let i = 0; i < valores.length; i++) {
    if (Number.isNaN(valores[i])) continue;
    let soma = 0;
    let quantos = 0;
    for (let j = Math.max(0, i - janela); j <= Math.min(valores.length - 1, i + janela); j++) {
      if (!Number.isNaN(valores[j])) {
        soma += valores[j];
        quantos++;
      }
    }
    saida[i] = soma / quantos;
  }
  return saida;
}

// Mede o membro fatia por fatia, ao longo do comprimento dele: onde fica o meio e qual é a
// metade da grossura (o "raio").
// eixo 'x': o membro está deitado (fatias são colunas); eixo 'y': em pé (fatias são linhas).
function medirMembro(membro, largura, altura, eixo, ancora) {
  const fatias = eixo === 'x' ? largura : altura;
  const tamanho = eixo === 'x' ? altura : largura;
  const ehMembro = eixo === 'x' ? (f, p) => membro[p * largura + f] : (f, p) => membro[f * largura + p];
  const trecho = (f, p) => {
    if (p < 0 || p >= tamanho || !ehMembro(f, p)) return null;
    let a = p;
    let b = p;
    while (a > 0 && ehMembro(f, a - 1)) a--;
    while (b < tamanho - 1 && ehMembro(f, b + 1)) b++;
    return [a, b];
  };

  const meio = new Float32Array(fatias).fill(NaN);
  const raio = new Float32Array(fatias).fill(NaN);
  const f0 = eixo === 'x' ? ancora.x : ancora.y;
  const p0 = eixo === 'x' ? ancora.y : ancora.x;
  const primeiro = trecho(f0, p0);
  for (const passo of [-1, 1]) {
    let anterior = primeiro;
    for (let f = f0; f >= 0 && f < fatias; f += passo) {
      const atual = trecho(f, Math.round((anterior[0] + anterior[1]) / 2));
      if (!atual) break;
      meio[f] = (atual[0] + atual[1]) / 2;
      raio[f] = (atual[1] - atual[0] + 1) / 2;
      anterior = atual;
    }
  }
  return { meio: suavizar(meio, 20), raio: suavizar(raio, 20), f0, p0 };
}

// Passa por cada pedaço separado do desenho (pixels visíveis encostados uns nos outros) e
// apaga os pedaços para os quais "deveApagar(tamanho, maiorAlfa, encostaNaBorda)" diz sim.
function apagarPedacos(rgba, largura, altura, deveApagar) {
  const total = largura * altura;
  const margem = Math.max(2, Math.round(0.03 * Math.min(largura, altura))); // "perto da borda"
  const visitado = new Uint8Array(total);
  const pedaco = [];
  for (let inicio = 0; inicio < total; inicio++) {
    if (visitado[inicio] || rgba[inicio * 4 + 3] <= 24) continue;
    pedaco.length = 0;
    visitado[inicio] = 1;
    pedaco.push(inicio);
    let maiorAlfa = 0;
    let encostaNaBorda = false;
    for (let k = 0; k < pedaco.length; k++) {
      const i = pedaco[k];
      const x = i % largura;
      maiorAlfa = Math.max(maiorAlfa, rgba[i * 4 + 3]);
      const y = (i - x) / largura;
      if (x < margem || x >= largura - margem || y < margem || y >= altura - margem) encostaNaBorda = true;
      const vizinhos = [x > 0 ? i - 1 : -1, x < largura - 1 ? i + 1 : -1, i - largura, i + largura];
      for (const j of vizinhos) {
        if (j >= 0 && j < total && !visitado[j] && rgba[j * 4 + 3] > 24) {
          visitado[j] = 1;
          pedaco.push(j);
        }
      }
    }
    if (deveApagar(pedaco.length, maiorAlfa, encostaNaBorda)) for (const i of pedaco) rgba[i * 4 + 3] = 0;
  }
}

// Foto de um desenho no papel: a luz costuma ser desigual (um canto mais escuro).
// Estima a cor do papel em blocos de 8x8 e clareia a imagem para o papel ficar branco por igual.
function igualarLuzDoPapel(rgba, largura, altura) {
  const B = 8;
  const papel = [0, 1, 2].map(() => new Float32Array(B * B));
  for (let by = 0; by < B; by++) {
    for (let bx = 0; bx < B; bx++) {
      const [x0, x1] = [Math.floor((bx * largura) / B), Math.floor(((bx + 1) * largura) / B)];
      const [y0, y1] = [Math.floor((by * altura) / B), Math.floor(((by + 1) * altura) / B)];
      for (let c = 0; c < 3; c++) {
        const valores = [];
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) valores.push(rgba[(y * largura + x) * 4 + c]);
        valores.sort((a, b) => a - b);
        // O papel é a parte clara do bloco (percentil 90); o traço é a parte escura.
        papel[c][by * B + bx] = valores.length ? valores[Math.floor(valores.length * 0.9)] : 255;
      }
    }
  }
  // Bloco muito mais escuro que o papel típico é desenho cobrindo o papel (ou um canto muito
  // escuro): usa a média dos blocos vizinhos que são papel.
  const brilho = (k) => Math.min(papel[0][k], papel[1][k], papel[2][k]);
  const tipico = Array.from({ length: B * B }, (_, k) => brilho(k)).sort((a, b) => a - b)[(B * B) >> 1];
  const valido = Array.from({ length: B * B }, (_, k) => brilho(k) >= tipico * 0.7);
  for (let rodada = 0; rodada < B && valido.includes(false); rodada++) {
    const novos = [];
    for (let k = 0; k < B * B; k++) {
      if (valido[k]) continue;
      const vizinhos = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const [bx, by] = [(k % B) + dx, Math.floor(k / B) + dy];
          if (bx >= 0 && bx < B && by >= 0 && by < B && valido[by * B + bx]) vizinhos.push(by * B + bx);
        }
      }
      if (vizinhos.length) {
        for (let c = 0; c < 3; c++) papel[c][k] = vizinhos.reduce((soma, v) => soma + papel[c][v], 0) / vizinhos.length;
        novos.push(k);
      }
    }
    novos.forEach((k) => (valido[k] = true));
  }
  for (let y = 0; y < altura; y++) {
    const fy = Math.max(0, Math.min(B - 1, (y + 0.5) / (altura / B) - 0.5));
    const [ya, ty] = [Math.floor(fy), fy - Math.floor(fy)];
    const yb = Math.min(B - 1, ya + 1);
    for (let x = 0; x < largura; x++) {
      const fx = Math.max(0, Math.min(B - 1, (x + 0.5) / (largura / B) - 0.5));
      const [xa, tx] = [Math.floor(fx), fx - Math.floor(fx)];
      const xb = Math.min(B - 1, xa + 1);
      for (let c = 0; c < 3; c++) {
        const p = papel[c];
        const luz =
          (p[ya * B + xa] * (1 - tx) + p[ya * B + xb] * tx) * (1 - ty) +
          (p[yb * B + xa] * (1 - tx) + p[yb * B + xb] * tx) * ty;
        const i = (y * largura + x) * 4 + c;
        rgba[i] = Math.min(255, Math.round((rgba[i] * 255) / Math.max(1, luz)));
      }
    }
  }
}

// Cor do fundo: a cor mais comum (mediana) dos pixels opacos da borda.
function corDaBorda(rgba, borda) {
  const mediana = (canal) => {
    const valores = borda.map((i) => rgba[i * 4 + canal]).sort((a, b) => a - b);
    return valores[Math.floor(valores.length / 2)];
  };
  return [mediana(0), mediana(1), mediana(2)];
}

// Fundo claro (papel, branco): cada pixel vira "tinta" com a transparência que explica a
// diferença dele para o fundo. Mantém os cantos suaves, aquarela, cores claras e acentos.
function tirarFundoClaro(rgba, total, fundo) {
  const RUIDO = 12 / 255; // diferença tão pequena que é só ruído do JPEG
  for (let i = 0; i < total; i++) {
    let tinta = 0;
    for (let c = 0; c < 3; c++) tinta = Math.max(tinta, (fundo[c] - rgba[i * 4 + c]) / Math.max(1, fundo[c]));
    if (tinta > 0) {
      for (let c = 0; c < 3; c++) {
        const cor = fundo[c] + (rgba[i * 4 + c] - fundo[c]) / tinta;
        rgba[i * 4 + c] = Math.max(0, Math.min(255, Math.round(cor)));
      }
    }
    rgba[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * Math.max(0, (tinta - RUIDO) / (1 - RUIDO)));
  }
}

// Fundo colorido (como o azul de uma pintura): apaga a cor do fundo em todo lugar, também nos
// buracos de dentro do desenho. Cores quase iguais ficam meio transparentes (borda suave).
// Se "soEncostado" for true, apaga só o fundo que encosta na borda da imagem (uma moldura).
function tirarFundoColorido(rgba, largura, altura, fundo, borda, soEncostado) {
  const total = largura * altura;
  const TOLERANCIA = 70;
  const distancia = (i) =>
    Math.hypot(rgba[i * 4] - fundo[0], rgba[i * 4 + 1] - fundo[1], rgba[i * 4 + 2] - fundo[2]);
  const encostado = new Uint8Array(total);
  if (soEncostado) preencher((i) => distancia(i) < TOLERANCIA, encostado, borda, largura, altura);
  for (let i = 0; i < total; i++) {
    if (soEncostado && !encostado[i]) continue;
    const fator = Math.min(1, Math.max(0, (distancia(i) - TOLERANCIA) / (TOLERANCIA * 0.6)));
    rgba[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * Math.sqrt(fator));
  }
  // Sobram pontinhos soltos e fracos (restos do fundo, ruído do JPEG): apaga só os pequenos
  // E quase transparentes; ponto de tinta de verdade fica.
  const minimo = Math.max(6, Math.round(total * 0.0005));
  if (!soEncostado) apagarPedacos(rgba, largura, altura, (tamanho, maiorAlfa) => tamanho < 6 || (tamanho < minimo && maiorAlfa < 200));
}

// Brilho médio do que sobrou do desenho (0 = preto, 255 = branco), pesado pela transparência.
function brilhoDaTinta(rgba, total) {
  let soma = 0;
  let peso = 0;
  for (let i = 0; i < total; i++) {
    const a = rgba[i * 4 + 3];
    soma += a * (0.3 * rgba[i * 4] + 0.59 * rgba[i * 4 + 1] + 0.11 * rgba[i * 4 + 2]);
    peso += a;
  }
  return peso ? soma / peso : 0;
}

// Corta as sobras transparentes em volta do desenho. Devolve null se não sobrou nada.
function areaDoDesenho(rgba, largura, altura) {
  let [x0, y0, x1, y1] = [largura, altura, -1, -1];
  for (let i = 0; i < largura * altura; i++) {
    if (rgba[i * 4 + 3] > 24) {
      const x = i % largura;
      const y = Math.floor(i / largura);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

// Lê a imagem enviada como pixels RGBA (no máximo 1024 px de lado).
async function lerPixels(imagem) {
  const sharp = require('sharp');
  try {
    return await sharp(imagem, { limitInputPixels: 50e6 })
      .rotate() // foto de celular: respeita a orientação gravada na foto
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }) // imagens enormes ficam lentas
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw erroComStatus('Não foi possível ler o desenho. Envie uma imagem PNG, JPG ou WEBP válida.', 400);
  }
}

// Tira o fundo do desenho (se a borda for de uma cor só) e devolve o pedaço que sobrou.
// Se o fundo for variado (uma foto), apaga as bordas aos poucos, em oval, para não virar um quadrado.
function limparDesenho(rgba, largura, altura) {
  const total = largura * altura;
  const bordaToda = pixelsDaBorda(largura, altura);
  const borda = bordaToda.filter((i) => rgba[i * 4 + 3] > 128);
  // Borda já transparente (PNG recortado): o fundo já foi tirado.
  if (borda.length < bordaToda.length * 0.5) return areaDoDesenho(rgba, largura, altura);

  // Borda clara e sem cor forte (papel branco, cinza ou com sombra): iguala a luz antes.
  const meioDe = (valores) => valores.sort((a, b) => a - b)[valores.length >> 1];
  const claroDaBorda = meioDe(borda.map((i) => Math.min(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])));
  const corDaBordaForte = meioDe(
    borda.map((i) => Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) - Math.min(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]))
  );
  if (claroDaBorda >= 110 && corDaBordaForte <= 40) igualarLuzDoPapel(rgba, largura, altura);

  const fundo = corDaBorda(rgba, borda);
  const parecidos = borda.filter(
    (i) => Math.hypot(rgba[i * 4] - fundo[0], rgba[i * 4 + 1] - fundo[1], rgba[i * 4 + 2] - fundo[2]) < 70
  ).length;

  if (parecidos < borda.length * 0.5) {
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        const e = Math.hypot((x - largura / 2) / (largura / 2), (y - altura / 2) / (altura / 2));
        const i = y * largura + x;
        rgba[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * Math.min(1, Math.max(0, (1 - e) / 0.25)));
      }
    }
  } else if (Math.min(...fundo) >= 200) {
    tirarFundoClaro(rgba, total, fundo);
    // Sombra fraca encostada na borda (canto escuro de uma foto do papel) não é desenho.
    apagarPedacos(rgba, largura, altura, (tamanho, maiorAlfa, encostaNaBorda) => encostaNaBorda && maiorAlfa < 160);
  } else {
    const copia = Buffer.from(rgba);
    tirarFundoColorido(rgba, largura, altura, fundo, borda, false);
    // Sobrou quase só branco: a "cor do fundo" era na verdade uma moldura escura ou a tinta
    // encostada na borda. Então apaga só o que encosta na borda e limpa o papel de dentro.
    if (brilhoDaTinta(rgba, total) > 200) {
      copia.copy(rgba);
      tirarFundoColorido(rgba, largura, altura, fundo, borda, true);
      const area = areaDoDesenho(rgba, largura, altura);
      if (area) {
        const dentro = [];
        for (let y = area.top; y < area.top + area.height; y++) {
          for (let x = area.left; x < area.left + area.width; x++) dentro.push(y * largura + x);
        }
        const papelDentro = corDaBorda(rgba, dentro.filter((i) => rgba[i * 4 + 3] > 128));
        if (Math.min(...papelDentro) >= 200) {
          const pedaco = Buffer.alloc(dentro.length * 4);
          dentro.forEach((i, k) => rgba.copy(pedaco, k * 4, i * 4, i * 4 + 4));
          tirarFundoClaro(pedaco, dentro.length, papelDentro);
          dentro.forEach((i, k) => pedaco.copy(rgba, i * 4, k * 4, k * 4 + 4));
        }
      }
    }
  }
  return areaDoDesenho(rgba, largura, altura);
}

// Prepara o desenho enviado: sem fundo, sem sobras em volta, em PNG com transparência.
async function prepararDesenho(imagem) {
  const sharp = require('sharp');
  const { data, info } = await lerPixels(imagem);
  const area = limparDesenho(data, info.width, info.height);
  if (!area) throw erroComStatus('O desenho enviado parece estar vazio. Envie outra imagem.', 400);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(area)
    .png()
    .toBuffer();
}

// Cola o desenho do cliente na foto base do membro como uma tatuagem de verdade: sem o fundo,
// só dentro da pele e curvado em volta do membro, como se ele fosse um cilindro. O modo
// "multiply" deixa a pele (luz e sombra) aparecer por baixo da tinta.
async function montarImagemControle(imagemTatuagemBase64, chaveMembro) {
  const sharp = require('sharp');
  const membro = MEMBROS[chaveMembro];
  const caminhoBase = path.join(PASTA_BASES, `${chaveMembro}.png`);
  const [largura, altura] = membro.formato;
  const indisponivel = () => erroComStatus(`A simulação para "${membro.nome}" ainda não está disponível.`, 500);

  let base;
  try {
    base = await sharp(caminhoBase).resize(largura, altura, { fit: 'cover' }).removeAlpha().raw().toBuffer();
  } catch {
    console.error(
      `[IA] Foto base não encontrada em ${caminhoBase}. Rode "npm run gerar-membros" uma vez.`
    );
    throw indisponivel();
  }

  const dados = imagemTatuagemBase64.replace(/^data:[^,]+,/, '');
  const desenhoLimpo = await prepararDesenho(Buffer.from(dados, 'base64'));

  // 1) Onde está o membro na foto e qual a grossura dele perto do "centro".
  const [centroX, centroY] = membro.centro || [0.5, 0.5];
  const ancora = { x: Math.round(centroX * (largura - 1)), y: Math.round(centroY * (altura - 1)) };
  const achado = mascaraDoMembro(base, largura, altura, ancora);
  const medida = achado && medirMembro(achado.membro, largura, altura, membro.eixo, achado.inicio);
  if (!medida || !(medida.raio[medida.f0] >= 0.05 * Math.min(largura, altura))) {
    console.error(`[IA] Não achei o membro na foto base de ${chaveMembro}. Gere a foto de novo.`);
    throw indisponivel();
  }
  const { meio, raio, f0, p0 } = medida;

  // 2) Limites de tamanho do desenho: ao longo do membro e de um lado ao outro dele.
  const limiteAoLongo = Math.round(
    membro.eixo === 'x' ? largura * membro.escala : altura * (membro.comprimento || 0.6)
  );
  const limiteLado = Math.round(membro.eixo === 'x' ? altura * 0.6 : largura * membro.escala);

  // 3) Direção do membro: uma reta passando pelo meio dele, na região do desenho.
  //    Assim o desenho gira junto com o membro, sem entortar.
  let [n, sf, sm, sff, sfm] = [0, 0, 0, 0, 0];
  for (let f = Math.max(0, Math.round(f0 - limiteAoLongo / 2)); f < Math.min(meio.length, f0 + limiteAoLongo / 2); f++) {
    if (Number.isNaN(meio[f])) continue;
    [n, sf, sm, sff, sfm] = [n + 1, sf + f, sm + meio[f], sff + f * f, sfm + f * meio[f]];
  }
  const inclinacao = n > 1 ? Math.max(-0.5, Math.min(0.5, (n * sfm - sf * sm) / (n * sff - sf * sf || 1))) : 0;
  const meio0 = n > 1 ? (sm - inclinacao * sf) / n + inclinacao * f0 : meio[f0];
  const norma = Math.hypot(1, inclinacao);
  const raio0 = raio[f0] / norma; // metade da grossura, medida na perpendicular ao membro

  // 4) Tamanho final: na volta do membro, até 0,85 raio para cada lado, para a tinta não
  //    sumir de tão espremida na lateral; e no máximo 2x maior que o desenho enviado.
  const limiteVolta = Math.min(limiteLado, 1.7 * raio0);
  const { width: w0, height: h0 } = await sharp(desenhoLimpo).metadata();
  const [comprimento0, volta0] = membro.eixo === 'x' ? [w0, h0] : [h0, w0];
  const escala = Math.min(limiteAoLongo / comprimento0, limiteVolta / volta0, 2);
  const comprimento = Math.max(1, Math.round(comprimento0 * escala));
  const volta = Math.max(1, Math.round(volta0 * escala));
  const [dw, dh] = membro.eixo === 'x' ? [comprimento, volta] : [volta, comprimento];
  const desenho = await sharp(desenhoLimpo).resize(dw, dh, { fit: 'fill' }).ensureAlpha().raw().toBuffer();

  // Lê a cor do desenho num ponto quebrado (x, y), misturando os 4 pixels vizinhos.
  const amostrar = (x, y, saida) => {
    const xa = Math.max(0, Math.min(dw - 1, Math.floor(x)));
    const ya = Math.max(0, Math.min(dh - 1, Math.floor(y)));
    const xb = Math.min(dw - 1, xa + 1);
    const yb = Math.min(dh - 1, ya + 1);
    const fx = Math.max(0, Math.min(1, x - xa));
    const fy = Math.max(0, Math.min(1, y - ya));
    const pesos = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    const pontos = [ya * dw + xa, ya * dw + xb, yb * dw + xa, yb * dw + xb];
    let alfa = 0;
    saida[0] = saida[1] = saida[2] = 0;
    for (let k = 0; k < 4; k++) {
      const a = (desenho[pontos[k] * 4 + 3] / 255) * pesos[k];
      alfa += a;
      for (let c = 0; c < 3; c++) saida[c] += desenho[pontos[k] * 4 + c] * a;
    }
    if (alfa > 0) for (let c = 0; c < 3; c++) saida[c] /= alfa;
    saida[3] = alfa;
  };

  // Borda da pele um pouco suavizada, para o recorte não ficar serrilhado.
  const membroSuave = await sharp(Buffer.from(achado.membro.map((v) => v * 255)), {
    raw: { width: largura, height: altura, channels: 1 },
  })
    .blur(1.5)
    .extractChannel(0)
    .raw()
    .toBuffer();

  // 5) Para cada ponto da pele, calcula qual ponto do desenho cai ali. Na volta do membro a
  //    distância é medida pela superfície (arco), por isso o desenho se curva e encolhe nas
  //    laterais. O desenho fica em volta do "centro", mas sem passar da lateral do membro.
  const folga = Math.max(0, raio0 * (Math.PI / 2) * 0.8 - volta / 2);
  const desvio = (p0 - meio0) / norma;
  const deslocamento0 = Math.max(-folga, Math.min(folga, raio0 * Math.asin(Math.max(-1, Math.min(1, desvio / raio0)))));
  const camada = Buffer.alloc(largura * altura * 4);
  const cor = [0, 0, 0, 0];
  for (let i = 0; i < largura * altura; i++) {
    if (!membroSuave[i]) continue;
    const [x, y] = [i % largura, Math.floor(i / largura)];
    const [f, p] = membro.eixo === 'x' ? [x, y] : [y, x];
    const aoLongo = (f - f0 + inclinacao * (p - meio0)) / norma + comprimento / 2;
    const t = (p - meio0 - inclinacao * (f - f0)) / norma / raio0;
    if (Math.abs(t) >= 1) continue;
    const naVolta = raio0 * Math.asin(t) - deslocamento0 + volta / 2;
    if (naVolta < 0 || naVolta > volta - 1 || aoLongo < 0 || aoLongo > comprimento - 1) continue;
    if (membro.eixo === 'x') amostrar(aoLongo, naVolta, cor);
    else amostrar(naVolta, aoLongo, cor);
    const lateral = Math.min(1, (1 - Math.abs(t)) / 0.15); // some aos poucos na lateral
    camada[i * 4] = Math.round(cor[0]);
    camada[i * 4 + 1] = Math.round(cor[1]);
    camada[i * 4 + 2] = Math.round(cor[2]);
    camada[i * 4 + 3] = Math.round(cor[3] * lateral * membroSuave[i]);
  }

  return sharp(base, { raw: { width: largura, height: altura, channels: 3 } })
    .composite([{ input: camada, raw: { width: largura, height: altura, channels: 4 }, blend: 'multiply' }])
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
