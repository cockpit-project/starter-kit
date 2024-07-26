#!/usr/bin/python3
import asyncio
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

import bidi


def jsquote(js: object) -> str:
    return json.dumps(js)

JsonObject = dict[str, Any]

# https://w3c.github.io/webdriver/#keyboard-actions for encoding key names
KEY_BACKSPACE = "\uE003"
KEY_TAB = "\uE004"
KEY_RETURN = "\uE006"
KEY_ENTER = "\uE007"
KEY_SHIFT = "\uE008"
KEY_CONTROL = "\uE009"
KEY_ALT = "\uE00A"
KEY_ESCAPE = "\uE00C"
KEY_ARROW_LEFT = "\uE012"
KEY_ARROW_UP = "\uE013"
KEY_ARROW_RIGHT = "\uE014"
KEY_ARROW_DOWN = "\uE015"
KEY_INSERT = "\uE016"
KEY_DELETE = "\uE017"


# shape of our testlib.Browser, all sync
class Browser:
    driver: bidi.WebdriverBidi

    @staticmethod
    def asyncio_loop_thread(loop: asyncio.AbstractEventLoop) -> None:
        asyncio.set_event_loop(loop)
        loop.run_forever()

    def __init__(self) -> None:
        # FIXME: raise to our standard 15
        self.timeout = 5
        headless = not bool(os.environ.get("TEST_SHOW_BROWSER", ""))
        browser = os.environ.get("TEST_BROWSER", "chromium")
        if browser == "chromium":
            self.driver = bidi.ChromiumBidi(headless=headless)
        elif browser == "firefox":
            self.driver = bidi.FirefoxBidi(headless=headless)
        else:
            raise ValueError(f"unknown browser {browser}")
        self.loop = asyncio.new_event_loop()
        self.bidi_thread = threading.Thread(target=self.asyncio_loop_thread, args=(self.loop,))
        self.bidi_thread.start()

        asyncio.run_coroutine_threadsafe(self.driver.start_session(), self.loop).result()

        test_functions = Path("test-functions.js").read_text()
        self.bidi("script.addPreloadScript", functionDeclaration=f"() => {{ {test_functions} }}")

        try:
            sizzle_js = (Path(__file__).parent / "node_modules/sizzle/dist/sizzle.js").read_text()
            # HACK: sizzle tracks document and when we switch frames, it sees the old document
            # although we execute it in different context.
            sizzle_js = sizzle_js.replace('context = context || document;', 'context = context || window.document;')
            self.bidi("script.addPreloadScript", functionDeclaration=f"() => {{ {sizzle_js} }}")
        except FileNotFoundError:
            pass

    def close(self):
        asyncio.run_coroutine_threadsafe(self.driver.close(), self.loop).result()
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.bidi_thread.join()

    def bidi(self, method, **params) -> JsonObject:
        """Send a Webdriver BiDi command and return the JSON response"""

        return asyncio.run_coroutine_threadsafe(self.driver.bidi(method, **params), self.loop).result()

    def wait_js_cond(self, cond: str, error_description: str = "null") -> None:
        for _retry in range(5):
            try:
                self.bidi("script.evaluate",
                        expression=f"window.ph_wait_cond(() => {cond}, {self.timeout * 1000}, {error_description})",
                        awaitPromise=True, target={"context": self.driver.context})
                return
            except bidi.WebdriverError as e:
                # can happen when waiting across page reloads
                if (
                    # chromium
                    "Execution context was destroyed" in str(e) or
                    "Cannot find context" in str(e) or
                    # firefox
                    "MessageHandlerFrame' destroyed" in str(e)
                   ):
                    time.sleep(1)
                else:
                    raise

    def _wait_present(self, selector: str) -> None:
        self.wait_js_cond(f"window.ph_find({jsquote(selector)})")

    def wait_visible(self, selector: str) -> None:
        self._wait_present(selector)
        self.wait_js_cond(f"window.ph_is_visible({jsquote(selector)})")

    def open(self, href: str) -> None:
        self.bidi("browsingContext.navigate", context=self.driver.context, url=href, wait="complete")

    def focus(self, selector: str) -> None:
        self.wait_visible(selector)
        self.bidi("script.evaluate", expression=f"document.querySelector('{selector}').focus()",
                  awaitPromise=False, target={"context": self.driver.context})

    # see https://w3c.github.io/webdriver/#keyboard-actions for encoding key names
    # and the KEY_* constants for common ones
    def key(self, value: str) -> None:
        self.bidi("input.performActions", context=self.driver.context, actions=[
            {"type": "key", "id": "key-0", "actions": [
                {"type": "keyDown", "value": value},
                {"type": "keyUp", "value": value},
            ]}])

    def input_text(self, text: str) -> None:
        actions = []
        for c in text:
            actions.append({"type": "keyDown", "value": c})
            actions.append({"type": "keyUp", "value": c})
        self.bidi("input.performActions", context=self.driver.context, actions=[
            {"type": "key", "id": "key-0", "actions": actions}])

    def set_input_text(self, selector: str, val: str) -> None:
        self.focus(selector)
        self.input_text(val)
        # TODO: wait for value
        time.sleep(0.2)

    def click(self, selector: str, button: int = 0, click_count: int = 1) -> None:
        self.wait_visible(selector)
        self.bidi("script.evaluate", expression=f"window.ph_find({jsquote(selector)}).scrollIntoView()",
                            awaitPromise=False, target={"context": self.driver.context})

        # HACK: Chromium mis-clicks to wrong position with iframes; use our old "synthesize MouseEvent" approach
        # TODO: file/find bug
        if isinstance(self.driver, bidi.ChromiumBidi):
            if click_count == 1:
                _type = "click"
            elif click_count == 2:
                _type = "dblclick"
            else:
                raise bidi.Error("only click_count=1 or 2 are supported with Chromium")
            self.bidi("script.evaluate",
                      expression=f"window.ph_mouse({jsquote(selector)}, '{_type}', 0, 0, {button})",
                      awaitPromise=False, target={"context": self.driver.context})
            return

        element = self.bidi("script.evaluate", expression=f"window.ph_find({jsquote(selector)})",
                            awaitPromise=False, target={"context": self.driver.context})["result"]

        actions = [{"type": "pointerMove", "x": 0, "y": 0, "origin": {"type": "element", "element": element}}]
        for _ in range(click_count):
            actions.append({"type": "pointerDown", "button": button})
            actions.append({"type": "pointerUp", "button": button})

        self.bidi("input.performActions", context=self.driver.context, actions=[
            {
                "id": f"pointer-{self.driver.last_id}",
                "type": "pointer",
                "parameters": {"pointerType": "mouse"},
                "actions": actions,
            }
        ])

    def wait_text(self, selector: str, text: str) -> None:
        self.wait_visible(selector)
        self.wait_js_cond(f"window.ph_text({jsquote(selector)}) == {jsquote(text)}",
                          error_description=f"() => 'actual text: ' + window.ph_text({jsquote(selector)})")

    def wait_in_text(self, selector: str, text: str) -> None:
        self.wait_visible(selector)
        self.wait_js_cond(f"window.ph_text({jsquote(selector)}).includes({jsquote(text)})",
                          error_description=f"() => 'actual text: ' + window.ph_text({jsquote(selector)})")

    def switch_to_frame(self, name: str | None) -> None:
        if name is None:
            self.switch_to_top()
        else:
            asyncio.run_coroutine_threadsafe(self.driver.switch_to_frame(name), self.loop).result()

    def switch_to_top(self) -> None:
        self.driver.switch_to_top()


# sync code, like our tests
logging.basicConfig(level=logging.DEBUG)
b = Browser()
try:
    b.open("http://127.0.0.2:9091")

    b.set_input_text("#login-user-input", "admin")
    b.set_input_text("#login-password-input", "foobar")
    # either works
    b.click("#login-button")
    # b.key(KEY_ENTER)
    b.wait_text("#super-user-indicator", "Limited access")

    b.switch_to_frame("cockpit1:localhost/system")
    b.wait_visible(".pf-v5-c-alert:contains('Web console is running in limited access mode.')")
    b.wait_in_text(".system-configuration", "Join domain")

    b.switch_to_top()
    b.click("#host-apps a[href='/system/services']")
    b.switch_to_frame("cockpit1:localhost/system/services")
    b.click("tr[data-goto-unit='virtqemud.service'] a")
    b.wait_in_text("#service-details-unit", "Automatically starts")
finally:
    b.close()
