window.ph_select = function(sel) {
    if (!window.Sizzle) {
        return Array.from(document.querySelectorAll(sel));
    }

    if (sel.includes(":contains(")) {
        if (!window.Sizzle) {
            throw new Error("Using ':contains' when window.Sizzle is not available.");
        }
        return window.Sizzle(sel);
    } else {
        return Array.from(document.querySelectorAll(sel));
    }
};

window.ph_find = function(sel) {
    const els = window.ph_select(sel);
    if (els.length === 0)
        throw new Error(sel + " not found");
    if (els.length > 1)
        throw new Error(sel + " is ambiguous");
    return els[0];
};

window.ph_text = function(sel) {
    const el = window.ph_find(sel);
    if (el.textContent === undefined)
        throw new Error(sel + " can not have text");
    // 0xa0 is a non-breakable space, which is a rendering detail of Chromium
    // and awkward to handle in tests; turn it into normal spaces
    return el.textContent.replaceAll("\xa0", " ");
};

window.ph_is_visible = function(sel) {
    const el = window.ph_find(sel);
    return el.tagName === "svg" || ((el.offsetWidth > 0 || el.offsetHeight > 0) && !(el.style.visibility === "hidden" || el.style.display === "none"));
};

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

window.ph_wait_cond = function (cond, timeout, error_description) {
    return new Promise((resolve, reject) => {
        // poll every 100 ms for now;  FIXME: poll less often and re-check on mutations using
        // https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
        let stepTimer = null;
        let last_err = null;
        const tm = window.setTimeout(() => {
            if (stepTimer)
                window.clearTimeout(stepTimer);
            reject(last_err || new PhWaitCondTimeout(error_description));
        }, timeout);
        function step() {
            try {
                if (cond()) {
                    window.clearTimeout(tm);
                    resolve();
                    return;
                }
            } catch (err) {
                last_err = err;
            }
            stepTimer = window.setTimeout(step, 100);
        }
        step();
    });
};

// we only need this for Chromium, which mis-handles pointerMove with frames
window.ph_mouse = function(sel, type, x, y, btn, ctrlKey, shiftKey, altKey, metaKey) {
    const el = window.ph_find(sel);

    /* The element has to be visible, and not collapsed */
    if (el.offsetWidth <= 0 && el.offsetHeight <= 0 && el.tagName !== 'svg')
        throw new Error(sel + " is not visible");

    /* The event has to actually work */
    let processed = false;
    function handler() {
        processed = true;
    }

    el.addEventListener(type, handler, true);

    let elp = el;
    let left = elp.offsetLeft || 0;
    let top = elp.offsetTop || 0;
    while (elp.offsetParent) {
        elp = elp.offsetParent;
        left += elp.offsetLeft;
        top += elp.offsetTop;
    }

    let detail = 0;
    if (["click", "mousedown", "mouseup"].indexOf(type) > -1)
        detail = 1;
    else if (type === "dblclick")
        detail = 2;

    const ev = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        detail,
        screenX: left + x,
        screenY: top + y,
        clientX: left + x,
        clientY: top + y,
        button: btn,
        ctrlKey: ctrlKey || false,
        shiftKey: shiftKey || false,
        altKey: altKey || false,
        metaKey: metaKey || false
    });

    el.dispatchEvent(ev);

    el.removeEventListener(type, handler, true);

    /* It really had to work */
    if (!processed)
        throw new Error(sel + " is disabled or somehow doesn't process events");
};
