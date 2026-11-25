// Análise automatizada (axe-core + Playwright) do portal em versao=defeito.
// Uso: node analisar.js [versao] [carga] [atraso]
//   ex: node analisar.js defeito imediata
//       node analisar.js defeito fixa 2000
// Pré-requisito: portal rodando em BASE_URL (npm start -> http://localhost:3000).
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const versao = process.argv[2] || "defeito";
const carga = process.argv[3] || "imediata";
const atraso = process.argv[4];
const TIPOS = ["imagem", "campo", "botao", "contraste", "link"];
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

(async () => {
  const browser = await chromium.launch();
  const resultados = [];

  for (const tipo of TIPOS) {
    const params = new URLSearchParams({ tipo, versao, carga });
    if (atraso !== undefined) params.set("atraso", atraso);
    const url = `${BASE_URL}/?${params}`;

    const page = await browser.newPage();
    await page.goto(url);

    // Espera pela prontidão informada pela própria aplicação (contrato window.experimento).
    await page.waitForFunction(
      () => window.experimento && window.experimento.estado !== "carregando",
      null,
      { timeout: 20000 }
    );
    const exp = await page.evaluate(() => JSON.parse(JSON.stringify(window.experimento)));
    if (exp.estado !== "pronto") {
      console.error(`[${tipo}] estado=${exp.estado} erro=${exp.erro}`);
      await page.close();
      continue;
    }

    await page.evaluate(axeSource);
    const axe = await page.evaluate(() =>
      axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })
    );

    resultados.push({
      tipo, url,
      violacoes: axe.violations.map((v) => ({
        regra: v.id, impacto: v.impact, descricao: v.help,
        elementos: v.nodes.map((n) => n.target.join(" ")),
      })),
    });
    await page.close();
  }
  await browser.close();

  for (const r of resultados) {
    console.log(`\n== tipo=${r.tipo}  (${r.url})`);
    if (r.violacoes.length === 0) console.log("   nenhuma violação detectada");
    for (const v of r.violacoes)
      console.log(`   [${v.impacto}] ${v.regra}: ${v.descricao} -> ${v.elementos.join(", ")}`);
  }
  const saida = path.join(__dirname, `resultado-${versao}-${carga}.json`);
  fs.writeFileSync(saida, JSON.stringify(resultados, null, 2));
  console.log(`\nJSON salvo em ${saida}`);
})();
