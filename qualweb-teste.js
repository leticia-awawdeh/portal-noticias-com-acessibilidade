const { QualWeb } = require('@qualweb/core');
const { ACTRules } = require('@qualweb/act-rules');

(async () => {
  const qualweb = new QualWeb({});
await qualweb.start(
  { maxConcurrency: 1, timeout: 60 * 1000, monitor: false },
  { headless: true, executablePath: 'C:/Users/Leticia/AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe' }
);

  const url = 'http://localhost:3000/?tipo=campo&versao=defeito';
  const reports = await qualweb.evaluate({ url, modules: [new ACTRules({})] });

  const r = reports[url];
  console.log(r.metadata);                       // passed, warning, failed, inapplicable
  console.log(JSON.stringify(r.modules, null, 2).slice(0, 3000));

  await qualweb.stop();
})();