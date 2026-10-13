const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY; 

const HUGGINGFACE_API_URL = "https://api-inference.huggingface.co/models/lllyasviel/sd-controlnet-canny";

const simularTatuagem = async (req, res) => {
    try {
        
        
        const { imagemCorpoBase64 } = req.body;

        
        if (!imagemCorpoBase64) {
            return res.status(400).json({ error: "A imagem do corpo não foi enviada." });
        }

        
        const respostaIA = await fetch(HUGGINGFACE_API_URL, {
            method: "POST", // POST significa que estamos enviando dados
            headers: {
                "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`, // Mostramos nosso crachá
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                
                inputs: "photorealistic black ink tattoo applied on human skin", 
               
                image: imagemCorpoBase64 
            }),
        });

        
        if (!respostaIA.ok) {
            return res.status(500).json({ error: "O servidor da IA falhou em responder." });
        }

        
        const imageBuffer = await respostaIA.arrayBuffer();
       
        const base64Gerado = Buffer.from(imageBuffer).toString('base64');

        
        return res.status(200).json({
            sucesso: true,
            imagemSimulada: `data:image/jpeg;base64,${base64Gerado}`
        });

    } catch (error) {
        console.error("Erro no processo de IA:", error);
        return res.status(500).json({ error: "Erro interno ao tentar simular a tatuagem." });
    }
};


module.exports = {
    simularTatuagem
};