console.log('Script started');

const fs = require('fs-extra')
const axios = require('axios')
const puppeteer = require('puppeteer-core')
const chromium = require('@sparticuz/chromium')

const gist = process.env.GIST_URL || 'rodgeraraujo/170ef2faf72e1a17439d8182ea3539ff';
const gistVersion = process.env.GIST_VERSION || '';

const excludeArg = process.argv.find(arg => arg.startsWith('--exclude-pdf='));
if (excludeArg) {
  const value = excludeArg.split('=')[1] || '';
  process.env.EXCLUDE_SECTIONS_PDF = process.env.EXCLUDE_SECTIONS_PDF
    ? `${process.env.EXCLUDE_SECTIONS_PDF},${value}`
    : value;
}

function getPdfExcludeSections(resume) {
  const fromEnv = (process.env.EXCLUDE_SECTIONS_PDF || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const metaValue = resume.meta && resume.meta.excludeSectionsPdf;
  const fromMeta = Array.isArray(metaValue)
    ? metaValue
    : (metaValue || '').toString().split(',').map(s => s.trim()).filter(Boolean);

  return [...new Set([...fromEnv, ...fromMeta])]
}

async function loadResume() {
  if (fs.existsSync('./resume.json')) {
    console.log(`Loading from locale "resume.json"`)
    return JSON.parse(fs.readFileSync('./resume.json', 'utf-8'))
  }

  console.log(`Downloading resume... [${gist}]`)
  const version = gistVersion ? `${gistVersion}/` : ''
  const { data } = await axios.get(
    `https://gist.githubusercontent.com/${gist}/raw/${version}resume.json`
  );
  return data
}

async function buildHTML(resume) {
  console.log('Building HTML (all sections)...');
  const resumeForHtml = JSON.parse(JSON.stringify(resume))
  const html = await require("./index.js").render(resumeForHtml)
  console.log('Saving file...')
  fs.writeFileSync('./dist/index.html', html, 'utf-8')
  console.log('HTML successfully written to ./dist/index.html')
  console.log('Done HTML')
  return html
}

async function buildPdfHtml(resume) {
  const excludeSections = getPdfExcludeSections(resume)
  if (excludeSections.length) {
    console.log(`Building HTML for PDF (excluding: ${excludeSections.join(', ')})...`);
  } else {
    console.log('Building HTML for PDF (no sections excluded)...');
  }
  const resumeForPdf = JSON.parse(JSON.stringify(resume))
  return require("./index.js").render(resumeForPdf, { excludeSections })
}

async function buildPDF(html) {
  console.log('Launching puppeteer...');
  
  let launchOptions;

  // Check if we are running on Vercel or a serverless environment
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    launchOptions = {
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    };
  } else {
    // Local development configuration (e.g., your Mac)
    launchOptions = {
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    };

    const macChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (process.platform === 'darwin' && fs.existsSync(macChromePath)) {
      launchOptions.executablePath = macChromePath;
    }
  }

  const browser = await puppeteer.launch(launchOptions);
  
  const page = await browser.newPage();
  console.log('Opening puppeteer...')
  await page.setContent(html, { waitUntil: 'networkidle2' })
  
  console.log('Generating PDF...')
  const pdf = await page.pdf({
    format: 'A4', 
    displayHeaderFooter: false, 
    printBackground: true,
    margin: {
      top: '0.25in',
      bottom: '0.25in',
      left: '0.05in',
      right: '0.05in',
    }
  })
  
  await browser.close()
  console.log('Saving file...')
  fs.writeFileSync('./dist/resume.pdf', pdf)
  console.log('Done PDF')
  return pdf
}

async function buildAll() {
  await fs.remove('./dist')
  await fs.ensureDir('./dist')

  const resume = await loadResume()

  await buildHTML(resume)          
  const pdfHtml = await buildPdfHtml(resume) 
  await buildPDF(pdfHtml)          
}

buildAll().catch(e => {
  console.error('FATAL ERROR:', e)
  process.exit(1)
})