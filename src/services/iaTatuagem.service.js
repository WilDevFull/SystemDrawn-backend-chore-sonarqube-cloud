const dns = require('dns');


dns.setDefaultResultOrder('ipv4first');


const HUGGINGFACE_API_URL =
  'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';

async function gerarSimulacao(imagemCorpoBase64, promptText) {
  const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY?.trim();

  if (!HUGGINGFACE_API_KEY) {
    throw new Error('Chave do Hugging Face não encontrada. Verifique seu arquivo .env');
  }

  
  const promptFinal = `Realistic tattoo design applied on human skin, ${
    promptText || 'blackwork ink tattoo'
  }, high quality, detailed tattoo art, studio lighting`;

  let resposta;
  try {
    resposta = await fetch(HUGGINGFACE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: promptFinal,
      }),
    });
  } catch (err) {
    console.error('Erro de rede no fetch:', err);
    throw new Error(`Falha de conexão com o Hugging Face: ${err.message}`);
  }

  if (!resposta.ok) {
    const detalheDoErro = await resposta.text();
    console.error('Detalhe do erro vindo do Hugging Face:', detalheDoErro);
    throw new Error(`Hugging Face recusou (Status ${resposta.status}): ${detalheDoErro}`);
  }

  const imageBuffer = await resposta.arrayBuffer();
  const base64Gerado = Buffer.from(imageBuffer).toString('base64');

  return `data:image/jpeg;base64,${base64Gerado}`;
}

module.exports = {
  gerarSimulacao,
};