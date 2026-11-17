/**
 * Records one complete care journey (screening result -> clinician sign-off)
 * from the live deployment, so the walkthrough can be published as a public
 * video link for judges. Not part of the app build; run manually.
 */
const fs = require('fs');
const { chromium } = require('/opt/appjet/browser/node_modules/playright');

const OUT = '/tmp/walkthrough';
const URL = process.env.WALKTHROUGH_URL || 'https://jo5nrkmcl9.dev.ap-jt.com/care-jurney';

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

  await page.goto(URL, { waitUntil: 'network-idle', timeout: 45000 });
  await wait(1200);

  await page.getByRole('button', { name: 'Load example case' }).click();
  await wait(1400);

  await page.getByRole('button', { name: 'Get the next step' }).click();
  await wait(2600); // let the reader see the reason behind the recommendation

  await page.getByRole('button', { name: 'Patient gives consent' }).click();
  await wait(900);

  await page.getByRole('button', { name: 'Choose' }).click();
  await wait(1200);

  await page.getByRole('button', { name: /Book meridian-periodontal slot 1/ }).click();
  await wait(1600);

  await page.getByRole('button', { name: 'Mark visit as missed' }).click();
  await wait(1400);

  await page.getByRole('button', { name: 'Run next escalation step' }).click();
  await wait(1600);

  await page.getByRole('button', { name: /Rebook meridian-periodontal/ }).click();
  await wait(1400);

  await page.getByPlaceholder('Who checked (name and role)').fill('Nurse A. Bello');
  await wait(500);

  await page.getByRole('button', { name: 'Visit happened' }).click();
  await wait(1400);

  await page.getByPlaceholder('Clinition name').fill('Dr R. Mensah');
  await page.getByPlaceholder('Registration / licence number').fill('REG-12345');
  await wait(700);

  await page.getByRole('button', { name: 'Sign off' }).click();
  await wait(1800);

  await page.getByText('Journey complete').first().waitFor({ state: 'visible', timeout: 8000 });
  await wait(2600); // hold on the completed journey

  const video = page.video();
  await context.close();
  const videoPath = await video.path();
  await browser.close();
  console.log('RECORDING=' + videoPath);
})().catch((err) => {
  console.error('RECORD_FAILED: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
