#!/usr/bin/env node
"use strict";

/*
 * Verifica as três condições de carregamento do portal em um navegador real.
 *
 * Para cada tipo de componente, confere que:
 *  - carga=imediata insere o componente antes de DOMContentLoaded;
 *  - carga=fixa sem "atraso" usa o padrão de 2000 ms e insere nesse instante;
 *  - carga=variavel insere o componente em cada um dos quatro atrasos
 *    (500, 1500, 2500 e 3500 ms), contados a partir de DOMContentLoaded.
 * Também confere que configurações inválidas terminam em estado "erro" sem
 * inserir o componente, e que a sequência de atrasos é balanceada,
 * reprodutível e independente de estratégia e ferramenta.
 *
 * Pré-requisitos: portal em execução (npm start) e, na pasta do projeto:
 *   npm install --save-dev playwright && npx playwright install chromium
 *
 * Uso: node automacao/verificar-cargas.js
 * Variáveis opcionais: BASE_URL (padrão http://localhost:3000),
 *   TOLERANCIA_MS (padrão 100), SEMENTE (padrão 20260101).
 */

const { chromium } = require("playwright");
const { ATRASOS_MS, TIPOS, gerarSequencia, validarSequencia } = require("./sequencia-atrasos");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const TOLERANCIA_MS = Number(process.env.TOLERANCIA_MS || 100);
const SEMENTE = Number(process.env.SEMENTE || 20260101);

let falhas = 0;
function registrar(ok, descricao, detalhe) {
  if (!ok) falhas++;
  console.log(`${ok ? "OK    " : "FALHA "} ${descricao}${detalhe ? `  [${detalhe}]` : ""}`);
}

// Abre a URL, espera o estado deixar "carregando" e devolve o registro do portal.
async function observar(browser, query) {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE_URL}/?${query}`, { waitUntil: "domcontentloaded" });
  await pagina.waitForFunction(() => window.experimento && window.experimento.estado !== "carregando", null, { timeout: 20000 });
  const registro = await pagina.evaluate(() => JSON.parse(JSON.stringify(window.experimento)));
  await contexto.close();
  return registro;
}

// Atraso efetivo da inserção, em ms após DOMContentLoaded.
function deslocamento(r) {
  return r.instanteInsercao === null ? null : r.instanteInsercao - r.instanteDomContentLoaded;
}

(async () => {
  // 1. Sequência de atrasos: balanceada, reprodutível e com a semente como único fator.
  const sequencia = gerarSequencia(SEMENTE);
  const problemas = validarSequencia(sequencia);
  registrar(problemas.length === 0, "sequência: 20 repetições por bloco, 5 de cada atraso", problemas[0]);
  registrar(JSON.stringify(sequencia) === JSON.stringify(gerarSequencia(SEMENTE)), "sequência: mesma semente gera a mesma ordem");
  registrar(JSON.stringify(sequencia) !== JSON.stringify(gerarSequencia(SEMENTE + 1)), "sequência: semente diferente gera outra ordem");

  const browser = await chromium.launch();

  // 2. Condições de carga, por tipo de componente (versão com defeito).
  for (const tipo of TIPOS) {
    const base = `tipo=${tipo}&versao=defeito`;

    const imediata = await observar(browser, `${base}&carga=imediata`);
    const dImediata = deslocamento(imediata);
    registrar(
      imediata.estado === "pronto" && dImediata !== null && dImediata <= 0,
      `${tipo} imediata: inserido antes de DOMContentLoaded`,
      `estado=${imediata.estado}, inserção ${dImediata === null ? "ausente" : dImediata.toFixed(1) + " ms"} em relação a t0`
    );

    const fixa = await observar(browser, `${base}&carga=fixa`);
    const dFixa = deslocamento(fixa);
    registrar(
      fixa.estado === "pronto" && fixa.configuracao.atraso === 2000 && dFixa !== null && dFixa >= 2000 && dFixa <= 2000 + TOLERANCIA_MS,
      `${tipo} fixa: padrão de 2000 ms`,
      `atraso=${fixa.configuracao.atraso}, inserção ${dFixa === null ? "ausente" : dFixa.toFixed(1) + " ms"}`
    );

    for (const atraso of ATRASOS_MS) {
      const variavel = await observar(browser, `${base}&carga=variavel&atraso=${atraso}`);
      const d = deslocamento(variavel);
      registrar(
        variavel.estado === "pronto" && d !== null && d >= atraso && d <= atraso + TOLERANCIA_MS,
        `${tipo} variável: ${atraso} ms`,
        `inserção ${d === null ? "ausente" : d.toFixed(1) + " ms"}`
      );
    }
  }

  // 3. Configurações inválidas: estado "erro", mensagem e nenhuma inserção.
  const invalidas = [
    ["carga=variavel (sem atraso)", "tipo=imagem&versao=defeito&carga=variavel"],
    ["carga=imediata com atraso=100", "tipo=imagem&versao=defeito&carga=imediata&atraso=100"],
    ["atraso acima de 10000", "tipo=imagem&versao=defeito&carga=fixa&atraso=10001"],
    ["atraso negativo", "tipo=imagem&versao=defeito&carga=variavel&atraso=-1"],
    ["atraso não inteiro", "tipo=imagem&versao=defeito&carga=variavel&atraso=1.5"],
    ["atraso não numérico", "tipo=imagem&versao=defeito&carga=fixa&atraso=abc"],
    ["atraso repetido", "tipo=imagem&versao=defeito&carga=fixa&atraso=500&atraso=500"],
  ];
  for (const [nome, query] of invalidas) {
    const r = await observar(browser, query);
    registrar(r.estado === "erro" && !!r.erro && r.instanteInsercao === null, `inválida rejeitada: ${nome}`, `estado=${r.estado}`);
  }

  await browser.close();
  console.log(falhas === 0 ? "\nTodas as verificações passaram." : `\n${falhas} verificação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
