const dns = require('dns');


dns.setDefaultResultOrder('ipv4first');


const MODELOS_HF = [
  'stabilityai/stable-diffusion-xl-base-1.0',
  'ByteDance/SDXL-Lightning',
  'stabilityai/stable-diffusion-3.5-large',
  'Salim/Text-to-Tattoo',
];


async function buscarModelosAtivosHF() {
  try {
    const resp = await fetch(
      'https://huggingface.co/api/models?pipeline_tag=text-to-image&inference=warm&sort=downloads&direction=-1&limit=5'
    );
    if (!resp.ok) return [];
    const dados = await resp.json();
    return Array.isArray(dados) ? dados.map((m) => m.id).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function gerarSimulacao(imagemCorpoBase64, promptText) {
  const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY?.trim();

  if (!HUGGINGFACE_API_KEY) {
    throw new Error('Chave do Hugging Face não encontrada. Verifique seu arquivo .env');
  }

  const promptFinal = `Realistic tattoo design applied on human skin, ${
    promptText || 'blackwork ink tattoo'
  }, high quality, detailed tattoo art, studio photography`;

  
  const modelosDinamicos = await buscarModelosAtivosHF();
  const listaParaTestar = [...new Set([...modelosDinamicos, ...MODELOS_HF])];

 
  for (const modelo of listaParaTestar) {
    const url = `https://router.huggingface.co/hf-inference/models/${modelo}`;
    try {
      console.log(`[IA] Tentando gerar no Hugging Face com o modelo: ${modelo}...`);
      const resposta = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: promptFinal,
        }),
      });

      if (resposta.ok) {
        console.log(`[IA] Sucesso com o modelo Hugging Face: ${modelo}!`);
        const imageBuffer = await resposta.arrayBuffer();
        const base64Gerado = Buffer.from(imageBuffer).toString('base64');
        return `data:image/jpeg;base64,${base64Gerado}`;
      } else {
        const aviso = await resposta.text();
        console.warn(`[IA] Modelo ${modelo} indisponível (Status ${resposta.status}): ${aviso}`);
      }
    } catch (erroTentativa) {
      console.warn(`[IA] Falha de conexão ao testar ${modelo}:`, erroTentativa.message);
    }
  }

 
  console.log('[IA] Acionando gerador de contingência gratuito (Flux)...');
  const sementeAleatoria = Math.floor(Math.random() * 100000);
  const urlContingencia = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    promptFinal
  )}?width=768&height=768&seed=${sementeAleatoria}&nologo=true`;

  const respostaContingencia = await fetch(urlContingencia);

  if (!respostaContingencia.ok) {
    throw new Error(
      `Não foi possível gerar a simulação no momento (Status ${respostaContingencia.status}).`
    );
  }

  const imageBuffer = await respostaContingencia.arrayBuffer();
  const base64Gerado = Buffer.from(imageBuffer).toString('base64');

  return `data:image/jpeg;base64,${base64Gerado}`;
}

module.exports = {
  gerarSimulacao,
};