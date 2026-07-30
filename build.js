console.log('Script started');

const fs = require('fs-extra')
const axios = require('axios')
const puppeteer = require('puppeteer')

const gist = process.env.GIST_URL || 'rodgeraraujo/170ef2faf72e1a17439d8182ea3539ff';
const gistVersion = process.env.GIST_VERSION || '';

async function buildHTML() {
  console.log('Building HTML...');
  await fs.remove('./dist')
  await fs.ensureDir('./dist')

  let resume
  if (fs.existsSync('./resume.json')) {
    console.log(`Loading from locale "resume.json"`)
    resume = JSON.parse(fs.readFileSync('./resume.json', 'utf-8'))
  } else {
    console.log(`Downloading resume... [${gist}]`)
    const version = gistVersion ? `${gistVersion}/` : ''
    const { data } = await axios.get(
      `https://gist.githubusercontent.com/${gist}/raw/${version}resume.json`
    );
    resume = data
  }
  console.log('Rendering...')
  const html = await require("./index.js").render(resume)
  console.log('Saving file...')
  fs.writeFileSync('./dist/index.html', html, 'utf-8')
  console.log('HTML successfully written to ./dist/index.html')
  console.log('Done HTML')
  return html
}

async function buildPDF(html) {
  console.log('Launching puppeteer...');
  
  const launchOptions = {
    headless: "new",
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  };

  // Only use the local macOS path if it exists on your machine (macOS)
  const macChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.platform === 'darwin' && fs.existsSync(macChromePath)) {
    launchOptions.executablePath = macChromePath;
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
      top: '0.4in',
      bottom: '0.4in',
      left: '0.4in',
      right: '0.4in',
    }
  })
  
  await browser.close()
  console.log('Saving file...')
  fs.writeFileSync('./dist/resume.pdf', pdf)
  console.log('Done PDF')
  return pdf
}

async function buildAll() {
  const html = await buildHTML()
  await buildPDF(html)
}

buildAll().catch(e => {
  console.error('FATAL ERROR:', e)
  process.exit(1)
})