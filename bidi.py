#!/usr/bin/python3

import asyncio
import json
import logging
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass

import aiohttp

logger = logging.getLogger(__name__)

# https://w3c.github.io/webdriver/#dfn-find-elements
EL_ID = 'element-6066-11e4-a52e-4f735466cecf'

DRIVERS = {
    "chromium": "chromedriver",
    # TODO: not packaged, get from https://github.com/mozilla/geckodriver/releases
    "firefox": "/tmp/geckodriver",
}


class WebdriverError(RuntimeError):
    pass


@dataclass
class LogMessage:
    level: str  # like "info"
    type: str  # usually "console"
    timestamp: int
    args: list[object]
    text: str

    def __init__(self, message_params):
        self.level = message_params["level"]
        self.type = message_params["type"]
        self.timestamp = message_params["timestamp"]
        self.args = message_params.get("args", [])
        self.text = message_params["text"]

    def __str__(self):
        return f"LogMessage: {self.type} {self.level} @{self.timestamp}: {self.text} {self.args}"


class WebdriverBidi:
    def __init__(self, browser, headless=False) -> None:
        self.headless = headless

        # TODO: make dynamic
        self.webdriver_port = 12345
        self.webdriver_url = f"http://localhost:{self.webdriver_port}"

        chrome_binary = "/usr/lib64/chromium-browser/headless_shell" if self.headless else "/usr/bin/chromium-browser"

        session_args = {"capabilities": {
            "alwaysMatch": {
                "webSocketUrl": True,
                "goog:chromeOptions": {"binary": chrome_binary},
                "moz:firefoxOptions": {"args": ["-headless"] if self.headless else []}
            }
        }}

        try:
            self.driver = subprocess.Popen([DRIVERS[browser], "--port=" + str(self.webdriver_port)])
        except KeyError as e:
            raise ValueError(f"unknown browser {browser}") from e

        req = urllib.request.Request(
                f"{self.webdriver_url}/session",
                json.dumps(session_args).encode(),
                headers={"Content-Type": "application/json"})
        # webdriver needs some time to launch
        for retry in range(1, 10):
            try:
                with urllib.request.urlopen(req) as f:
                    resp = json.load(f)
                    break
            except urllib.error.URLError as e:
                logger.debug("waiting for webdriver: %s", e)
                time.sleep(0.1 * retry)
        else:
            raise WebdriverError("could not connect to webdriver")

        self.session_info = resp["value"]
        self.last_id = 0
        self.ws = None
        self.session = None
        self.pending_commands: dict[int, asyncio.Future] = {}
        self.logs: list[LogMessage] = []

    async def ws_reader(self) -> None:
        assert self.ws
        async for msg in self.ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                data = json.loads(msg.data)
                logger.debug("ws TEXT → %r", data)
                if "id" in data and data["id"] in self.pending_commands:
                    logger.debug("ws_reader: resolving pending command %i", data["id"])
                    if data["type"] == "success":
                        self.pending_commands[data["id"]].set_result(data["result"])
                    else:
                        self.pending_commands[data["id"]].set_exception(
                            WebdriverError(f"{data['type']}: {data['message']}"))
                    del self.pending_commands[data["id"]]
                    continue

                if data["type"] == "event":
                    if data["method"] == "log.entryAdded":
                        self.logs.append(LogMessage(data["params"]))
                        continue

                logger.warning("ws_reader: unhandled message %r", data)
            elif msg.type == aiohttp.WSMsgType.ERROR:
                logger.error("BiDi failure: %s", msg)
                break

    async def bidi(self, method, **params) -> asyncio.Future:
        """Send a Webdriver BiDI command and return the JSON response"""

        assert self.ws
        payload = json.dumps({"id": self.last_id, "method": method, "params": params})
        logger.debug("ws ← %r", payload)
        await self.ws.send_str(payload)
        future = asyncio.get_event_loop().create_future()
        self.pending_commands[self.last_id] = future
        self.last_id += 1
        return await future

    async def webdriver(self, path: str, data: dict | None = None) -> dict:
        """Send a classic Webdriver request and return the JSON response"""

        assert self.session
        # asyncio shares the connection
        url = f"{self.webdriver_url}/session/{self.session_info['sessionId']}/{path}"
        post_data = json.dumps(data).encode() if data is not None else None
        method = "POST" if post_data is not None else "GET"

        async with self.session.request(method, url, data=post_data) as resp:
            r = await resp.text()
            logger.debug("webdriver %s %s %r → %r", method, path, post_data, r)
            return json.loads(r)

    async def run(self):
        # open bidi websocket for session
        async with aiohttp.ClientSession(raise_for_status=True) as session:
            self.session = session
            async with session.ws_connect(self.session_info["capabilities"]["webSocketUrl"]) as ws:
                self.ws = ws
                self.task_reader = asyncio.create_task(self.ws_reader(), name="bidi_reader")

                # wait for browser to initialize default context
                for _ in range(10):
                    realms = (await self.bidi("script.getRealms"))["realms"]
                    if len(realms) > 0:
                        context = realms[0]["context"]
                        break
                else:
                    raise WebdriverError("timed out waiting for default realm")

                await self.bidi("session.subscribe", events=["log.entryAdded"])

                await self.bidi("script.evaluate", expression="console.log('Hello BiDi')",
                                awaitPromise=False, target={"context": context})
                await self.bidi("browsingContext.navigate", context=context,
                                url="https://piware.de", wait="complete")

                r = (await self.bidi("browsingContext.locateNodes", context=context,
                                     locator={"type": "css", "value": "#menu-content"}))["nodes"]
                assert len(r) == 1
                menu_content_id = r[0]['sharedId']

                # this doensn't yet have a BiDi command
                r = await self.webdriver(f"element/{menu_content_id}/text")
                assert 'ADDICTED TO FREE SOFTWARE DEVELOPMENT' in r['value']

                # locate first social link
                r = (await self.bidi("browsingContext.locateNodes", context=context,
                                     locator={"type": "css", "value": "a[rel='me']:first-child"}))["nodes"]
                assert len(r) == 1
                # click it (again, no BiDi command)
                await self.webdriver(f"element/{r[0]['sharedId']}/click", {})

                if not self.headless:
                    await asyncio.sleep(3)
                self.task_reader.cancel()
                del self.task_reader

    def __del__(self):
        logger.debug("cleaning up webdriver")
        urllib.request.urlopen(urllib.request.Request(
            f"{self.webdriver_url}/session/{self.session_info['sessionId']}", method="DELETE"))

        logger.info("Collected debug messages:")
        for log in self.logs:
            logger.info(log)

        self.driver.terminate()
        self.driver.wait()


logging.basicConfig(level=logging.DEBUG)
d = WebdriverBidi(sys.argv[1] if len(sys.argv) > 1 else 'chromium',
                  headless=True if len(sys.argv) > 2 and sys.argv[2] == 'headless' else False)
asyncio.run(d.run())
