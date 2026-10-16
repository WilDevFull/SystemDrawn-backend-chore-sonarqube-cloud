const iaTatuagemService = require('../services/iaTatuagem.service');

// O desenho precisa ser uma imagem PNG, JPG ou WEBP em base64 de até 5 MB.
const FORMATO_IMAGEM = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/;
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

async function simularTatuagem(req, res) {
  try {
    // imagemCorpoBase64 é o nome antigo do campo; continua aceito para o frontend atual funcionar.
    const { imagemTatuagemBase64, imagemCorpoBase64, membro, promptText } = req.body;
    const imagemTatuagem = imagemTatuagemBase64 || imagemCorpoBase64;

    if (!imagemTatuagem) {
      return res
        .status(400)
        .json({ erro: 'A imagem da tatuagem (desenho do cliente) é obrigatória para a simulação.' });
    }

    if (typeof imagemTatuagem !== 'string' || !FORMATO_IMAGEM.test(imagemTatuagem)) {
      return res.status(400).json({ erro: 'Envie o desenho como imagem PNG, JPG ou WEBP.' });
    }

    if ((imagemTatuagem.length * 3) / 4 > TAMANHO_MAXIMO) {
      return res.status(400).json({ erro: 'A imagem do desenho deve ter no máximo 5 MB.' });
    }

    if (membro != null && membro !== '' && !iaTatuagemService.normalizarMembro(membro)) {
      const opcoes = Object.values(iaTatuagemService.MEMBROS).map((m) => m.nome);
      return res.status(400).json({ erro: `Membro inválido. Escolha um destes: ${opcoes.join(', ')}.` });
    }

    const imagemGerada = await iaTatuagemService.gerarSimulacao(imagemTatuagem, membro, promptText);

    return res.status(200).json({
      sucesso: true,
      imagemSimulada: imagemGerada,
    });
  } catch (error) {
    console.error('Erro no Controller de simulação:', error.message);
    return res.status(error.statusCode || 500).json({
      erro: error.statusCode ? error.message : 'Falha ao processar a simulação da tatuagem.',
    });
  }
}

module.exports = {
  simularTatuagem,
};
