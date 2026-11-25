"use strict";
// Interações dos itens extras: salvar notícia e atualizar lista.
const salvar = document.getElementById("extra-salvar");
salvar.addEventListener("click", () => {
  const ativo = salvar.classList.toggle("extra-botao--ativo");
  salvar.textContent = ativo ? "Notícia salva" : "Salvar notícia";
});
const status = document.getElementById("extra-status");
document.getElementById("extra-atualizar").addEventListener("click", () => {
  status.textContent = `Lista atualizada às ${new Date().toLocaleTimeString("pt-BR")}.`;
});
