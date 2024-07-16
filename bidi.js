import WebDriver from "webdriver";

// copied from test-functions.js

class PhWaitCondTimeout extends Error {
    constructor(description) {
        if (description && description.apply)
            description = description.apply();
        if (description)
            super(description);
        else
            super("condition did not become true");
    }
}
function wait_cond(cond, timeout, error_description) {
    return new Promise((resolve, reject) => {
        // poll every 100 ms for now;  FIXME: poll less often and re-check on mutations using
        // https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
        let stepTimer = null;
        let last_err = null;
        const tm = setTimeout(() => {
            if (stepTimer)
                clearTimeout(stepTimer);
            reject(last_err || new PhWaitCondTimeout(error_description));
        }, timeout);
        async function step() {
            try {
                if (await cond()) {
                    clearTimeout(tm);
                    resolve();
                    return;
                }
            } catch (err) {
                last_err = err;
            }
            stepTimer = setTimeout(step, 500);
        }
        step();
    });
}

// end copy

// https://w3c.github.io/webdriver/#dfn-find-elements
const EL_ID = 'element-6066-11e4-a52e-4f735466cecf';

// async function get(selector: string): Promise<string> {
async function get(selector) {
    const elements = await b.findElements('css selector', selector);
    if (elements.length === 0)
        throw new Error(selector + ' not found');
    if (elements.length > 1)
        throw new Error(selector + ' is ambiguous');
    return elements[0][EL_ID];
}

const wait = selector => wait_cond(
    () => b.findElements('css selector', selector).then(r => r.length === 1),
    15000
);

const b = await WebDriver.newSession({
    capabilities: {
        webSocketUrl: true,
        browserName: process.env.TEST_BROWSER || 'chromium',
        'moz:firefoxOptions': {
            args: ["-headless"],
        },
        'goog:chromeOptions': {
            binary: './chromium-headless-wrapper', // only with --headless!
            args: [
                "--headless", "--no-sandbox", "--disable-setuid-sandbox",
                "--disable-namespace-sandbox", "--disable-seccomp-filter-sandbox",
                "--disable-sandbox-denial-logging", "--disable-pushstate-throttle",
                "--font-render-hinting=none", "--disable-popup-blocking"],
        },
    }
});

try {
    await b.sessionSubscribe({ events: ['log.entryAdded'] });

    b.on('log.entryAdded', l => console.log('log.entryAdded:', l));

    await b.executeScript('console.log("Hello Bidi")', []);

    await b.navigateTo("http://127.0.0.2:9091");

    // const buttons = await b.findElements('css selector', 'button'); // length: 2

    await b.elementClick(await get("#login-button"));
    await b.elementSendKeys(await get("#login-user-input"), "admin");
    await b.elementSendKeys(await get("#login-password-input"), "foobar");
    await b.elementClick(await get("#login-button"));

    await wait("#super-user-indicator");
    const t = await b.getElementText(await get("#super-user-indicator"));
    if (t !== "Limited access")
        throw new Error(`Expected 'Limited access', got '${t}'`);

    // overview frame
    const f_overview = await b.findElement('css selector', "iframe[name='cockpit1:localhost/system']");
    await b.switchToFrame(f_overview); // this gets the full object, not the ID

    const cct = await b.getElementText(await get(".system-configuration"));
    if (!cct.includes("Join domain"))
        throw new Error(`Expected 'Join domain' in '${cct}'`);

    // base64 encoded PNG, works fine
    // const screenshot = await b.takeScreenshot();

    console.log("\n\nFinished. Press Control-C to exit");
    await new Promise(resolve => setTimeout(resolve, 100000));
} finally {
    await b.deleteSession();
}
