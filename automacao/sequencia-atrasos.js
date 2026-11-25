#!/usr/bin/env node
"use strict";

/*
 * Sequência externa de atrasos da condição de carga "variavel".
 *
 * O portal não sorteia atrasos (SPEC §4.1): quem define a sequência é a
 * automação. Este módulo implementa o planejamento do projeto (§3.3 e §3.8):
 *
 *  - atrasos de 500, 1500, 2500 e 3500 ms, contados a partir de DOMContentLoaded;
 *  - 20 repetições por combinação, distribuídas igualmente: 5 por atraso;
 *  - ordem aleatorizada com semente registrada (reprodutível);
 *  - cada valor é compartilhado entre estratégias e ferramentas: o atraso
 *    depende só de (tipo, versao, repeticao, semente), nunca da estratégia
 *    nem da ferramenta, para que as comparações usem as mesmas condições.
 *
 * Uso como biblioteca:
 *   const { atrasoVariavel } = require("./sequencia-atrasos");
 *   atrasoVariavel("campo", "defeito", 7, 20260101); // -> um de 500|1500|2500|3500
 *
 * Uso na linha de comando:
 *   node automacao/sequencia-atrasos.js --semente 20260101 [--saida pasta]
 *   gera sequencia-atrasos.json e sequencia-atrasos.csv e valida o balanceamento.
 */

const fs = require("fs");
const path = require("path");

const ATRASOS_MS = [500, 1500, 2500, 3500];
const REPETICOES_POR_ATRASO = 5;
const REPETICOES = ATRASOS_MS.length * REPETICOES_POR_ATRASO; // 20
const TIPOS = ["imagem", "campo", "botao", "contraste", "link"];
const VERSOES = ["defeito", "corrigida"];

// Hash FNV-1a de 32 bits: transforma "semente|tipo|versao" em semente numérica.
function hash32(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// PRNG mulberry32: determinístico, sem dependências.
function criarPrng(semente) {
  let a = semente >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Embaralhamento de Fisher-Yates sobre uma cópia.
function embaralhar(lista, prng) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function validarEntrada(tipo, versao, semente) {
  if (!TIPOS.includes(tipo)) throw new Error(`tipo inválido: ${tipo}`);
  if (!VERSOES.includes(versao)) throw new Error(`versao inválida: ${versao}`);
  if (!Number.isInteger(semente)) throw new Error("a semente deve ser um inteiro");
}

// Sequência de 20 atrasos de um bloco (tipo, versao). Cada bloco usa uma
// semente derivada própria, então acrescentar tipos não altera os demais.
function sequenciaDoBloco(tipo, versao, semente) {
  validarEntrada(tipo, versao, semente);
  const base = [];
  for (const atraso of ATRASOS_MS) {
    for (let i = 0; i < REPETICOES_POR_ATRASO; i++) base.push(atraso);
  }
  return embaralhar(base, criarPrng(hash32(`${semente}|${tipo}|${versao}`)));
}

// Atraso da repetição r (de 1 a 20) do bloco (tipo, versao).
function atrasoVariavel(tipo, versao, repeticao, semente) {
  if (!Number.isInteger(repeticao) || repeticao < 1 || repeticao > REPETICOES) {
    throw new Error(`repeticao deve ser um inteiro de 1 a ${REPETICOES}`);
  }
  return sequenciaDoBloco(tipo, versao, semente)[repeticao - 1];
}

// Todas as linhas do planejamento: tipo, versao, repeticao, atraso.
function gerarSequencia(semente) {
  const linhas = [];
  for (const tipo of TIPOS) {
    for (const versao of VERSOES) {
      sequenciaDoBloco(tipo, versao, semente).forEach((atraso, i) => {
        linhas.push({ tipo, versao, repeticao: i + 1, atraso });
      });
    }
  }
  return linhas;
}

// Confere o balanceamento: 20 repetições por bloco, 5 por atraso.
function validarSequencia(linhas) {
  const problemas = [];
  for (const tipo of TIPOS) {
    for (const versao of VERSOES) {
      const bloco = linhas.filter((l) => l.tipo === tipo && l.versao === versao);
      if (bloco.length !== REPETICOES) {
        problemas.push(`${tipo}/${versao}: ${bloco.length} repetições (esperado ${REPETICOES})`);
      }
      for (const atraso of ATRASOS_MS) {
        const n = bloco.filter((l) => l.atraso === atraso).length;
        if (n !== REPETICOES_POR_ATRASO) {
          problemas.push(`${tipo}/${versao}: atraso ${atraso} ms usado ${n} vezes (esperado ${REPETICOES_POR_ATRASO})`);
        }
      }
    }
  }
  return problemas;
}

function lerArgumentos(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--semente") args.semente = argv[++i];
    else if (argv[i] === "--saida") args.saida = argv[++i];
  }
  return args;
}

function principal() {
  const args = lerArgumentos(process.argv.slice(2));
  if (args.semente === undefined || !/^-?\d+$/.test(args.semente)) {
    console.error("Informe a semente (inteiro), que deve ser registrada junto aos dados: --semente 20260101");
    process.exit(1);
  }
  const semente = Number(args.semente);
  const linhas = gerarSequencia(semente);
  const problemas = validarSequencia(linhas);
  if (problemas.length > 0) {
    console.error("Sequência inválida:\n" + problemas.join("\n"));
    process.exit(1);
  }

  const pasta = path.resolve(args.saida || process.cwd());
  fs.mkdirSync(pasta, { recursive: true });
  const json = { semente, atrasosMs: ATRASOS_MS, repeticoesPorBloco: REPETICOES, linhas };
  fs.writeFileSync(path.join(pasta, "sequencia-atrasos.json"), JSON.stringify(json, null, 2) + "\n");
  const csv = ["tipo,versao,repeticao,atraso_ms", ...linhas.map((l) => `${l.tipo},${l.versao},${l.repeticao},${l.atraso}`)];
  fs.writeFileSync(path.join(pasta, "sequencia-atrasos.csv"), csv.join("\n") + "\n");

  console.log(`Semente ${semente}: ${linhas.length} linhas (${TIPOS.length} tipos x ${VERSOES.length} versões x ${REPETICOES} repetições).`);
  console.log(`Balanceamento válido: ${REPETICOES_POR_ATRASO} repetições de cada atraso (${ATRASOS_MS.join(", ")} ms) por bloco.`);
  console.log(`Arquivos gravados em ${pasta}`);
}

if (require.main === module) principal();

module.exports = { ATRASOS_MS, REPETICOES, TIPOS, VERSOES, atrasoVariavel, gerarSequencia, validarSequencia };
