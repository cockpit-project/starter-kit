#!/usr/bin/python3

import asyncio
import json
import logging
import subprocess
import sys
import time
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


@dataclass
class Session:
    http: aiohttp.client.ClientSession
    ws: aiohttp.client.ClientWebSocketResponse
    session_url: str
    task_reader: asyncio.Task


class WebdriverBidi:
    def __init__(self, browser, headless=False) -> None:
        self.headless = headless
        self.last_id = 0
        self.pending_commands: dict[int, asyncio.Future] = {}
        self.logs: list[LogMessage] = []
        self.session: Session | None = None

        # TODO: make dynamic
        self.webdriver_port = 12345

        chrome_binary = "/usr/lib64/chromium-browser/headless_shell" if self.headless else "/usr/bin/chromium-browser"

        self.session_args = {"capabilities": {
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

    async def ensure_session(self) -> None:
        if self.session is not None:
            return

        aiohttp_session = aiohttp.ClientSession(raise_for_status=True)
        wd_url = f"http://localhost:{self.webdriver_port}"

        # webdriver needs some time to launch
        for retry in range(1, 10):
            try:
                async with aiohttp_session.post(f"{wd_url}/session",
                                                data=json.dumps(self.session_args).encode()) as resp:
                    session_info = json.loads(await resp.text())["value"]
                    logger.debug("webdriver session request: %r %r", resp, session_info)
                    break
            except (IOError, aiohttp.client.ClientResponseError) as e:
                logger.debug("waiting for webdriver: %s", e)
                time.sleep(0.1 * retry)
        else:
            raise WebdriverError("could not connect to webdriver")

        ws = await aiohttp_session.ws_connect(session_info["capabilities"]["webSocketUrl"])

        self.session = Session(
            http=aiohttp_session,
            ws=ws,
            session_url=f"{wd_url}/session/{session_info['sessionId']}",
            task_reader=asyncio.create_task(self.ws_reader(ws), name="bidi_reader")
        )

        logger.debug("Established session %r", self.session)

    async def ws_reader(self, ws: aiohttp.client.ClientWebSocketResponse) -> None:
        async for msg in ws:
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

        assert self.session

        payload = json.dumps({"id": self.last_id, "method": method, "params": params})
        logger.debug("ws ← %r", payload)
        await self.session.ws.send_str(payload)
        future = asyncio.get_event_loop().create_future()
        self.pending_commands[self.last_id] = future
        self.last_id += 1
        return await future

    async def webdriver(self, path: str, data: dict | None = None, method: str | None = None) -> dict:
        """Send a classic Webdriver request and return the JSON response"""

        assert self.session

        # asyncio shares the connection
        post_data = json.dumps(data).encode() if data is not None else None
        method = method if method else ("POST" if post_data is not None else "GET")

        async with self.session.http.request(method, f"{self.session.session_url}{path}", data=post_data) as resp:
            r = await resp.text()
            logger.debug("webdriver %s %s %r → %r", method, path, post_data, r)
            return json.loads(r)

    async def run(self):
        await self.ensure_session()

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
        r = await self.webdriver(f"/element/{menu_content_id}/text")
        assert 'ADDICTED TO FREE SOFTWARE DEVELOPMENT' in r['value']

        # locate first social link
        r = (await self.bidi("browsingContext.locateNodes", context=context,
                             locator={"type": "css", "value": "a[rel='me']:first-child"}))["nodes"]
        assert len(r) == 1
        # click it (again, no BiDi command)
        await self.webdriver(f"/element/{r[0]['sharedId']}/click", {})

        if not self.headless:
            await asyncio.sleep(3)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_excinfo):
        if self.session is not None:
            logger.debug("cleaning up webdriver")

            self.session.task_reader.cancel()
            del self.session.task_reader

            await self.webdriver("", method="DELETE")
            await self.session.ws.close()
            await self.session.http.close()

            self.session = None

        logger.info("Collected debug messages:")
        for log in self.logs:
            logger.info(log)

        self.driver.terminate()
        self.driver.wait()


async def main():
    logging.basicConfig(level=logging.DEBUG)
    async with WebdriverBidi(sys.argv[1] if len(sys.argv) > 1 else 'chromium',
                             headless=True if len(sys.argv) > 2 and sys.argv[2] == 'headless' else False) as d:
        await d.run()

asyncio.run(main())
