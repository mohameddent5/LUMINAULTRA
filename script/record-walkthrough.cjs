/**
 * Records one complete care journey (screening result -> clinician sign-off)
 * from the live deployment, so the walkthrough can be published as a public
 * video link for judges. Not part of the app build; run manually.
 */
const fs = require('fs');
const { chromium } = require('/opt/appjet/browser/node_modules/playwright');

const OUT = '/tmp/walkthrough';
const URL = process.env.WALKTHROUGH_URL || 'https://jo5nrkmcl9.dev.ap-jt.com/care-journey';

fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/appjet/browser-binaries/chromium-1234/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm', '--auto-play-policy=no-user-gest-required'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const wait = (ms) => page.waitForTimeout(ms);

  const btn = async (name) => {
    const loc = page.getByRole('button', { name, exact: false });
    await loc.first().waitFor({ state: 'visible', timeout: 15000 });
    await loc.first().click();
  };
  const ariaBtn = async (prefix) => {
    const loc = page.locator(`button[aria-label^="${prefix}"]`);
    await loc.first().waitFor({ state: 'visible', timeout: 15000 });
    await loc.first().click();
  };

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
    await wait(1400);

    await btn('Load example case');
    await wait(1500);

    await btn('Get the next step');
    await wait(2800); // hold on the plain-language reason

    await btn('Patient gives consent');
    await wait(1000);

    await btn('Choose');
    await wait(1600);

    await ariaBtn('Book ');
    await wait(1800);

    await btn('Mark visit as missed');
    await wait(1500);

    await btn('Run next escalation step');
    await wait(1700);

    await ariaBtn('Rebook ');
    await wait(1500);

    await page.getByPlaceholder('Who checked (name and role)').fill('Nurse A. Bello');
    await wait(600);

    await btn('Visit happened');
    await wait(1500);

    await page.getByPlaceholder('Clinician name').fill('Dr R. Mensah');
    await page.getByPlaceholder('Registration / licence number').fill('REG-12345');
    await wait(800);

    await btn('Sign off');
    await wait(2000);

    await page.getByText('Journey complete').first().waitFor({ state: 'visible', timeout: 8000 });
    await wait(2800); // hold on the completed journey
  } catch (err) {
    await page.screenshot({ path: OUT + '/error.png' }).catch(() => {});
    const labels = await page
      .$$eval('button', (els) => els.map((e) => (e.getAttribute('aria-label') || e.innerText || '').trim()).filter(Boolean))
      .catch(() => []);
    console.error('FLOW_FAILED: ' + (err && err.message ? err.message : err));
    console.error('BUTTONS: ' + JSON.stringify(labels));
    await context.close();
    await browser.close();
    process.exit(1);
  }

  const video = page.video();
  await context.close();
  const videoPath = await video.path();
  await browser.close();
  console.log('RECORDING=' + videoPath);
})().catch((err) => {
  console.error('RECORD_FAILED: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
