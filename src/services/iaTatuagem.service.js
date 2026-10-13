
const HUGGINGFACE_API_URL = "https://api-inference.huggingface.co/models/lllyasviel/sd-controlnet-canny";

const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

async function gerarSimulacao(imagemCorpoBase64, promptText) {
    
    if (!HUGGINGFACE_API_KEY) {
        throw new Error("Chave do Hugging Face não encontrada. Verifique seu arquivo .env");
    }

    
    const resposta = await fetch(HUGGINGFACE_API_URL, {
        method: "POST", // POST significa que estamos ENVIANDO dados
        headers: {
            "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`, // Nossa "carteirinha de acesso"
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            
            inputs: promptText || "photorealistic black ink tattoo applied on human skin",
            
            image: imagemCorpoBase64 
        }),
    });

    
    if (!resposta.ok) {
        throw new Error("Erro na comunicação com a API do Hugging Face. Tente novamente.");
    }

    
    const imageBuffer = await resposta.arrayBuffer();
    
    
    const base64Gerado = Buffer.from(imageBuffer).toString('base64');
    const imagemProntaParaOFrontend = `data:image/jpeg;base64,${base64Gerado}`;

    return imagemProntaParaOFrontend;
}


module.exports = {
    gerarSimulacao
};