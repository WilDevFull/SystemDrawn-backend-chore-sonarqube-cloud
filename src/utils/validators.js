const validarNomeCompleto = (nome) => {
  if (!nome || typeof nome !== 'string') return false;
  const partes = nome.trim().split(/\s+/);
  if (partes.length < 2) return false;
  const regexParteValida = /^[a-zA-ZÀ-ÿ]+$/;
  return partes.every(p => p.length >= 2 && regexParteValida.test(p));
};

module.exports = { validarNomeCompleto };