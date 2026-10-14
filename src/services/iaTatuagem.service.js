
const HUGGINGFACE_API_URL = "https://api-inference.huggingface.co/models/lllyasviel/sd-controlnet-canny";

async function gerarSimulacao(imagemCorpoBase64, promptText) {
    
    const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

    if (!HUGGINGFACE_API_KEY) {
        throw new Error("Chave do Hugging Face não encontrada. Verifique seu arquivo .env");
    }

    const base64Limpo = imagemCorpoBase64.replace(/^data:image\/\w+;base64,/, "");

    const resposta = await fetch(HUGGINGFACE_API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            inputs: promptText || "photorealistic black ink tattoo applied on human skin",
            image: base64Limpo,
            options: {
                wait_for_model: true 
            }
        }),
    });

    if (!resposta.ok) {
        const detalheDoErro = await resposta.text();
        console.error("Detalhe do erro vindo do Hugging Face:", detalheDoErro);
        throw new Error(`Erro na API do Hugging Face (Status ${resposta.status})`);
    }

    const imageBuffer = await resposta.arrayBuffer();
    const base64Gerado = Buffer.from(imageBuffer).toString('base64');
    
    return `data:image/jpeg;base64,${base64Gerado}`;
}

module.exports = {
    gerarSimulacao
};