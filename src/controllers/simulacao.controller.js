
const iaTatuagemService = require('../services/iaTatuagem.service');

async function simularTatuagem(req, res) {
    try {
        
        const { imagemCorpoBase64, promptText } = req.body;

        
        if (!imagemCorpoBase64) {
            return res.status(400).json({ erro: "A imagem do corpo é obrigatória para a simulação." });
        }

        
        const imagemGerada = await iaTatuagemService.gerarSimulacao(imagemCorpoBase64, promptText);

        
        return res.status(200).json({
            sucesso: true,
            imagemSimulada: imagemGerada
        });

    } catch (error) {
        console.error("Erro no Controller de simulação:", error.message);
        return res.status(500).json({ erro: "Falha ao processar a simulação da tatuagem." });
    }
}


module.exports = {
    simularTatuagem
};