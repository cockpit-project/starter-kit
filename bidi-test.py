#!/usr/bin/python3
import asyncio
import json
import logging
import os
import threading
import time
from typing import Any

import bidi


def jsquote(js: object) -> str:
    return json.dumps(js)

JsonObject = dict[str, Any]


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

    def mouse(self, selector: str, button: int = 0, click_count: int = 1) -> None:
        self.wait_visible(selector)
        element = self.bidi("script.evaluate", expression=f"window.ph_find({jsquote(selector)})",
                            awaitPromise=False, target={"context": self.driver.context})["result"]

        actions = [{"type": "pointerMove", "x": 0, "y": 0, "origin": {"type": "element", "element": element}}]
        for _ in range(click_count):
            actions.append({"type": "pointerDown", "button": button})
            actions.append({"type": "pointerUp", "button": button})

        self.bidi("input.performActions", context=self.driver.context, actions=[
            {
                "id": "pointer-0",
                "type": "pointer",
                "parameters": {"pointerType": "mouse"},
                "actions": actions,
            }
        ])

    def click(self, selector: str) -> None:
        return self.mouse(selector)

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
    b.click("#login-button")
    b.wait_text("#super-user-indicator", "Limited access")

    b.switch_to_frame("cockpit1:localhost/system")
    b.wait_in_text(".system-configuration", "Join domain")
finally:
    b.close()
